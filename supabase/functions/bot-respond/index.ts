// Edge Function: bot-respond
//
// Supabase Database Webhook (pg_net) が chats テーブルへの INSERT を検知し、
// このエンドポイントを非同期で HTTP 起動する。
// Bot の発火判定・参加者判定・OpenAI 呼び出し・INSERT をすべてサーバー側で完結させる。
// クライアントはこの関数を直接呼び出さない (R7.3)。
//
// デプロイ: supabase functions deploy bot-respond
// 設定: config.toml で verify_jwt = false (Webhook はブラウザ経由でない)

import { createClient } from '@supabase/supabase-js';
import { decideBotAction, type TriggerRecord } from '../_shared/decideBotAction.ts';
import { loadBotConfig, type BotConfig } from '../_shared/botConfig.ts';
import type { OpenAIMessage } from '../_shared/buildHistory.ts';

function verifyWebhookSecret(req: Request, secret: string | null): boolean {
  if (!secret) return false; // secret 未設定は安全側に倒す
  return req.headers.get('x-bot-webhook-secret') === secret;
}

async function callOpenAI(
  config: BotConfig,
  history: OpenAIMessage[],
): Promise<string> {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: config.systemPrompt },
    ...history,
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));

  if (!res.ok) {
    throw new Error(`OpenAI error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text) {
    throw new Error('OpenAI: 空または不正な応答');
  }
  return text.trim();
}

async function insertBotMessages(
  supabase: ReturnType<typeof createClient>,
  config: BotConfig,
  messages: string[],
): Promise<void> {
  for (const message of messages) {
    const { error } = await supabase.from('chats').insert({
      room_id: config.targetRoom,
      name: config.botName,
      color: config.botColor,
      message,
      system: false,
      email: null,
      metadata: { version: 1, kind: 'bot' },
      ip: '',
      ua: 'bot-respond',
    });
    if (error) console.error('bot-respond: INSERT failed:', error.message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const config = loadBotConfig();

  if (!verifyWebhookSecret(req, config.webhookSecret)) {
    console.error('bot-respond: webhook secret missing or mismatch');
    return new Response('ok', { status: 200 });
  }

  if (!config.openaiApiKey) {
    console.error('bot-respond: OPENAI_API_KEY is not set');
    return new Response('ok', { status: 200 });
  }

  try {
    const payload = await req.json();
    if (payload?.type !== 'INSERT' || payload?.table !== 'chats') {
      return new Response('ok', { status: 200 });
    }
    const record: TriggerRecord | undefined = payload?.record;
    if (!record) return new Response('ok', { status: 200 });

    // ①②をDBアクセス前に短絡(コスト最適化)
    if (record.metadata?.kind === 'bot') return new Response('ok', { status: 200 });
    if (record.room_id !== config.targetRoom) return new Response('ok', { status: 200 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const now = Date.now();
    const since = now - 5 * 60 * 1000;
    const { data: recentLogs } = await supabase
      .from('chats')
      .select('uuid,room_id,name,color,message,time,system,metadata')
      .eq('room_id', config.targetRoom)
      .eq('deleted', false)
      .gte('time', since)
      .order('time', { ascending: true });

    const action = decideBotAction(record, recentLogs ?? [], config, now);

    if (action.type === 'ignore') return new Response('ok', { status: 200 });

    if (action.type === 'greet') {
      await insertBotMessages(supabase, config, action.messages);
      return new Response('ok', { status: 200 });
    }

    // action.type === 'respond'
    await sleep(action.responseDelayMs);
    const text = await callOpenAI(config, action.history);
    await insertBotMessages(supabase, config, [text]);
    return new Response('ok', { status: 200 });
  } catch (err) {
    // R9: 例外は握りつぶす。エラーメッセージは INSERT しない。常に 200。
    console.error('bot-respond error (swallowed):', err);
    return new Response('ok', { status: 200 });
  }
});
