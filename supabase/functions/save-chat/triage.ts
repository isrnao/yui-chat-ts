// 管理者チャット（com_sb）の問い合わせ振り分け。
//
// save-chat が発言を保存したあと、バックグラウンド（EdgeRuntime.waitUntil）で呼ばれる。
// JEV（okiraku-api の choice-v1 プリセット）で発言を bug / question / cr / chat に分類し、
// switch で分岐する。現状は cr（機能要求）のときだけ次を行う:
//   1. GitHub（isrnao/yui-chat-ts）に Issue を立てる
//   2. 管理人名義で「機能要求を受け付けました」と返信する（Realtime で全員に配信される）
//
// API キー類はすべて Supabase Secrets から読む（クライアントには一切出さない）:
//   JEV_API_TOKEN  … okiraku-api の Bearer トークン
//   GITHUB_TOKEN   … 対象リポジトリの Issues: Read and write を持つ fine-grained PAT
// どちらかが未設定なら振り分け自体をスキップする（発言の保存には影響しない）。
//
// トレース: 各処理は triage スパン（TriageTrace.span）の子として記録する。JEV への送信には
// traceparent を付け、okiraku-api のトレースとつなげる。GitHub には付けない。
// スパンにはエラーコード・ステータス・例外の種類だけを載せ、例外文や応答本文は載せない。

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatTraceparent, SpanKind, type Span, type Tracer } from './telemetry.ts';

export const TRIAGE_ROOM_ID = 'com_sb';

const JEV_ENDPOINT = 'https://api.okiraku.chat/api/v1/evaluate';
const GITHUB_REPO = 'isrnao/yui-chat-ts';

/** cr の確率がこれ未満なら発火しない（誤検知で Issue を量産しないため） */
const CR_THRESHOLD = 0.5;
/** 直近 1 時間に受け付ける機能要求の上限（スパム対策） */
const MAX_REQUESTS_PER_HOUR = 3;
/** 判定・Issue 化する発言の最大長。これを超える発言は振り分けない */
const MAX_MESSAGE_LENGTH = 1000;

export const CR_REPLY_MESSAGE = '機能要求を受け付けました';

type Category = 'bug' | 'question' | 'cr' | 'chat';

interface ChoiceResult {
  choice: Category;
  probabilities: Partial<Record<Category, number>>;
}

export interface TriageTarget {
  uuid: string;
  room_id: string;
  name: string;
  color: string;
  message: string;
}

/** triage の親スパンと、期限（runTriage）で中断するためのシグナル */
export interface TriageTrace {
  tracer: Tracer;
  span: Span;
  signal: AbortSignal;
}

function withTimeout(trace: TriageTrace, ms: number): AbortSignal {
  return AbortSignal.any([trace.signal, AbortSignal.timeout(ms)]);
}

export async function classifyMessage(
  message: string,
  token: string,
  trace: TriageTrace
): Promise<ChoiceResult> {
  const span = trace.tracer.startSpan(
    'POST /api/v1/evaluate',
    trace.span.context,
    SpanKind.CLIENT,
    {
      'http.request.method': 'POST',
      'server.address': new URL(JEV_ENDPOINT).host,
      'evaluation.preset': 'choice-v1',
    }
  );
  try {
    const res = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        // okiraku-api のサーバースパンがこのスパンの子になる
        traceparent: formatTraceparent(span.context),
      },
      body: JSON.stringify({
        preset: 'choice-v1',
        input: {
          state: 'ユーザーから管理者への連絡',
          question: message,
          options: {
            bug: '動作の不具合',
            question: '使い方 howto',
            cr: '機能要求',
            chat: null,
          },
        },
      }),
      signal: withTimeout(trace, 15_000),
    });
    span.setAttribute('http.response.status_code', res.status);
    if (!res.ok) {
      span.fail('jev_http_error');
      throw new Error(`JEV responded ${res.status}`);
    }

    const body = await res.json();
    const result = body?.checks?.choice;
    if (body?.status !== 'completed' || typeof result?.choice !== 'string') {
      span.fail('jev_unexpected_payload');
      throw new Error(`JEV returned unexpected payload: ${JSON.stringify(body)}`);
    }
    span.setAttribute('triage.choice', result.choice);
    return result as ChoiceResult;
  } catch (err) {
    if (!span.failed) span.failException('jev_request_failed', err);
    throw err;
  } finally {
    span.end();
  }
}

// Issue 本文にユーザー入力をそのまま埋めると @mention で第三者に通知が飛ぶため、
// ゼロ幅スペースを挟んで無効化し、引用ブロックに収める。
function quoteUserText(text: string): string {
  return text
    .replaceAll('@', '@​')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function buildIssueTitle(message: string): string {
  const firstLine = message.trim().split('\n')[0] ?? '';
  const short = firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine;
  return `[機能要求] ${short.replaceAll('@', '@​')}`;
}

async function createGithubIssue(
  target: TriageTarget,
  result: ChoiceResult,
  token: string,
  trace: TriageTrace
): Promise<{ number: number; html_url: string }> {
  const probability = result.probabilities.cr ?? 0;
  const body = [
    '管理者チャット（com_sb）に届いた発言を JEV が機能要求（cr）と判定したため、自動で起票しました。',
    '',
    quoteUserText(target.message),
    '',
    `- 投稿者: ${target.name.replaceAll('@', '@​')}`,
    `- 発言 UUID: \`${target.uuid}\``,
    `- 判定確率: cr=${probability}`,
  ].join('\n');

  const span = trace.tracer.startSpan('github.issue.create', trace.span.context, SpanKind.CLIENT, {
    'http.request.method': 'POST',
    'server.address': 'api.github.com',
  });
  try {
    // 外部サービスなので traceparent は付けない（spec R3.4）
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'okiraku-chat-triage',
      },
      body: JSON.stringify({ title: buildIssueTitle(target.message), body }),
      signal: withTimeout(trace, 15_000),
    });
    span.setAttribute('http.response.status_code', res.status);
    if (!res.ok) {
      span.fail('github_http_error');
      throw new Error(`GitHub responded ${res.status}: ${await res.text()}`);
    }
    const issue = await res.json();
    span.setAttribute('github.issue.number', issue.number);
    return issue;
  } catch (err) {
    if (!span.failed) span.failException('github_request_failed', err);
    throw err;
  } finally {
    span.end();
  }
}

function dbSpan(trace: TriageTrace, name: string, operation: string): Span {
  return trace.tracer.startSpan(name, trace.span.context, SpanKind.CLIENT, {
    'db.system.name': 'postgresql',
    'db.operation.name': operation,
    'db.collection.name': 'chats',
  });
}

// 直近 1 時間に Bot が返した受付メッセージ数で上限判定する（別テーブルを持たないため）。
async function isRateLimited(supabase: SupabaseClient, trace: TriageTrace): Promise<boolean> {
  const span = dbSpan(trace, 'db select chats', 'select');
  try {
    const { count, error } = await supabase
      .from('chats')
      .select('uuid', { count: 'exact', head: true })
      .eq('room_id', TRIAGE_ROOM_ID)
      .eq('system', true)
      .like('message', `${CR_REPLY_MESSAGE}%`)
      .gte('time', Date.now() - 60 * 60 * 1000);
    if (error) {
      span.failDb('db_select_failed', error);
      throw new Error(`Failed to count recent requests: ${error.message}`);
    }
    return (count ?? 0) >= MAX_REQUESTS_PER_HOUR;
  } catch (err) {
    if (!span.failed) span.failException('db_select_failed', err);
    throw err;
  } finally {
    span.end();
  }
}

async function replyAsAdmin(
  supabase: SupabaseClient,
  target: TriageTarget,
  message: string,
  trace: TriageTrace
) {
  // 名前を発言の保存（db insert chats）と分け、C1（保存失敗）の件数に混ぜない
  const span = dbSpan(trace, 'db insert chats (admin reply)', 'insert');
  try {
    const { error } = await supabase.from('chats').insert({
      room_id: target.room_id,
      name: '管理人',
      color: '#ffffff',
      message,
      system: true,
      email: null,
      metadata: {
        version: 1,
        avatar: 'hoshi1',
        kind: 'admin',
        userColor: target.color || undefined,
        fontStyle: { bold: true },
      },
      ip: '',
      ua: '',
    });
    if (error) {
      span.failDb('db_insert_failed', error);
      throw new Error(`Failed to insert reply: ${error.message}`);
    }
  } catch (err) {
    if (!span.failed) span.failException('db_insert_failed', err);
    throw err;
  } finally {
    span.end();
  }
}

async function handleFeatureRequest(
  supabase: SupabaseClient,
  target: TriageTarget,
  result: ChoiceResult,
  githubToken: string,
  trace: TriageTrace
) {
  if ((result.probabilities.cr ?? 0) < CR_THRESHOLD) {
    trace.span.setAttribute('triage.outcome', 'below_threshold');
    return;
  }
  if (await isRateLimited(supabase, trace)) {
    trace.span.setAttribute('triage.outcome', 'rate_limited');
    console.warn('[triage] rate limited; skipped issue creation for', target.uuid);
    return;
  }
  const issue = await createGithubIssue(target, result, githubToken, trace);
  await replyAsAdmin(supabase, target, `${CR_REPLY_MESSAGE}（Issue #${issue.number}）`, trace);
  trace.span.setAttribute('triage.outcome', 'issue_created');
}

export function shouldTriage(row: { room_id: string; system: boolean; message: string }): boolean {
  return (
    row.room_id === TRIAGE_ROOM_ID && !row.system && row.message.trim().length <= MAX_MESSAGE_LENGTH
  );
}

/** 失敗しても発言の保存には影響させない（ログとスパンにだけ残す） */
export async function triageAdminChat(
  supabase: SupabaseClient,
  target: TriageTarget,
  trace: TriageTrace
) {
  const jevToken = Deno.env.get('JEV_API_TOKEN');
  const githubToken = Deno.env.get('GITHUB_TOKEN');
  if (!jevToken || !githubToken) {
    trace.span.setAttribute('triage.outcome', 'skipped_not_configured');
    console.warn('[triage] JEV_API_TOKEN / GITHUB_TOKEN not set; skipped');
    return;
  }

  try {
    const result = await classifyMessage(target.message, jevToken, trace);
    switch (result.choice) {
      case 'cr':
        await handleFeatureRequest(supabase, target, result, githubToken, trace);
        break;
      case 'bug':
      case 'question':
      case 'chat':
      default:
        // 現状は機能要求のみ自動対応する。必要になったらここに分岐を足す。
        trace.span.setAttribute('triage.outcome', 'no_action');
        break;
    }
  } catch (err) {
    trace.span.failException('triage_failed', err);
    console.error('[triage] failed for', target.uuid, err);
  }
}
