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

import type { SupabaseClient } from '@supabase/supabase-js';

export const TRIAGE_ROOM_ID = 'com_sb';

const JEV_ENDPOINT = 'https://okiraku-api.vercel.app/api/v1/evaluate';
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

export async function classifyMessage(message: string, token: string): Promise<ChoiceResult> {
  const res = await fetch(JEV_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`JEV responded ${res.status}`);

  const body = await res.json();
  const result = body?.checks?.choice;
  if (body?.status !== 'completed' || typeof result?.choice !== 'string') {
    throw new Error(`JEV returned unexpected payload: ${JSON.stringify(body)}`);
  }
  return result as ChoiceResult;
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
  token: string
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
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub responded ${res.status}: ${await res.text()}`);
  return await res.json();
}

// 直近 1 時間に Bot が返した受付メッセージ数で上限判定する（別テーブルを持たないため）。
async function isRateLimited(supabase: SupabaseClient): Promise<boolean> {
  const { count, error } = await supabase
    .from('chats')
    .select('uuid', { count: 'exact', head: true })
    .eq('room_id', TRIAGE_ROOM_ID)
    .eq('system', true)
    .like('message', `${CR_REPLY_MESSAGE}%`)
    .gte('time', Date.now() - 60 * 60 * 1000);
  if (error) throw new Error(`Failed to count recent requests: ${error.message}`);
  return (count ?? 0) >= MAX_REQUESTS_PER_HOUR;
}

async function replyAsAdmin(supabase: SupabaseClient, target: TriageTarget, message: string) {
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
  if (error) throw new Error(`Failed to insert reply: ${error.message}`);
}

async function handleFeatureRequest(
  supabase: SupabaseClient,
  target: TriageTarget,
  result: ChoiceResult,
  githubToken: string
) {
  if ((result.probabilities.cr ?? 0) < CR_THRESHOLD) return;
  if (await isRateLimited(supabase)) {
    console.warn('[triage] rate limited; skipped issue creation for', target.uuid);
    return;
  }
  const issue = await createGithubIssue(target, result, githubToken);
  await replyAsAdmin(supabase, target, `${CR_REPLY_MESSAGE}（Issue #${issue.number}）`);
}

export function shouldTriage(row: { room_id: string; system: boolean; message: string }): boolean {
  return (
    row.room_id === TRIAGE_ROOM_ID && !row.system && row.message.trim().length <= MAX_MESSAGE_LENGTH
  );
}

/** 失敗しても発言の保存には影響させない（ログだけ残す） */
export async function triageAdminChat(supabase: SupabaseClient, target: TriageTarget) {
  const jevToken = Deno.env.get('JEV_API_TOKEN');
  const githubToken = Deno.env.get('GITHUB_TOKEN');
  if (!jevToken || !githubToken) {
    console.warn('[triage] JEV_API_TOKEN / GITHUB_TOKEN not set; skipped');
    return;
  }

  try {
    const result = await classifyMessage(target.message, jevToken);
    switch (result.choice) {
      case 'cr':
        await handleFeatureRequest(supabase, target, result, githubToken);
        break;
      case 'bug':
      case 'question':
      case 'chat':
      default:
        // 現状は機能要求のみ自動対応する。必要になったらここに分岐を足す。
        break;
    }
  } catch (err) {
    console.error('[triage] failed for', target.uuid, err);
  }
}
