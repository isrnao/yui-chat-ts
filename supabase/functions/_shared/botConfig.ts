export type BotConfig = {
  targetRoom: string;
  greetings: string[];
  cooldownMinMs: number;
  cooldownMaxMs: number;
  responseDelayMinMs: number;
  responseDelayMaxMs: number;
  historyMessageCap: number;
  botName: string;
  botColor: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  webhookSecret: string | null;
  openaiApiKey: string;
};

function parsePositiveInt(value: string | undefined, defaultVal: number): number {
  if (value === undefined) return defaultVal;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}

function parseFloatParam(value: string | undefined, defaultVal: number): number {
  if (value === undefined) return defaultVal;
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}

function parseGreetings(value: string | undefined): string[] {
  if (!value) return ['こんにちは'];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed.length > 0 ? parsed : ['こんにちは'];
    }
  } catch {
    // JSON でなければ改行区切りとして扱う
  }
  const lines = value.split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.length > 0 ? lines : ['こんにちは'];
}

export function loadBotConfig(): BotConfig {
  const env = (key: string) =>
    typeof Deno !== 'undefined' ? Deno.env.get(key) : process.env[key];

  return {
    targetRoom: env('BOT_TARGET_ROOM') ?? 'superbeginner',
    greetings: parseGreetings(env('BOT_GREETINGS')),
    cooldownMinMs: parsePositiveInt(env('BOT_COOLDOWN_MIN_MS'), 8000),
    cooldownMaxMs: parsePositiveInt(env('BOT_COOLDOWN_MAX_MS'), 15000),
    responseDelayMinMs: parsePositiveInt(env('BOT_RESPONSE_DELAY_MIN_MS'), 2000),
    responseDelayMaxMs: parsePositiveInt(env('BOT_RESPONSE_DELAY_MAX_MS'), 6000),
    historyMessageCap: parsePositiveInt(env('BOT_HISTORY_MESSAGE_CAP'), 20),
    botName: env('BOT_NAME') ?? 'ゆいボット',
    botColor: env('BOT_COLOR') ?? '#9b59b6',
    model: env('BOT_MODEL') ?? 'gpt-4o-mini',
    temperature: parseFloatParam(env('BOT_TEMPERATURE'), 0.7),
    systemPrompt:
      env('BOT_SYSTEM_PROMPT') ??
      'あなたはゆいちゃっとのアシスタントボットです。丁寧な日本語で短く返答してください。',
    webhookSecret: env('BOT_WEBHOOK_SECRET') ?? null,
    openaiApiKey: env('OPENAI_API_KEY') ?? '',
  };
}
