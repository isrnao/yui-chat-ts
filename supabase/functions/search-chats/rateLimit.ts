import { SearchError } from './protocol.ts';

// Redis TIME and EVAL make both buckets atomic across Edge instances.
const SCRIPT = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + tonumber(clock[2]) / 1000
local tokens = {}
for i = 1, 2 do
  local cap = tonumber(ARGV[(i-1)*2+1])
  local refill = tonumber(ARGV[(i-1)*2+2])
  local state = redis.call('HMGET', KEYS[i], 'tokens', 'at')
  tokens[i] = math.min(cap, tonumber(state[1] or cap) + math.max(0, now-tonumber(state[2] or now))*refill/1000)
  if tokens[i] < 1 then return 0 end
end
for i = 1, 2 do
  redis.call('HSET', KEYS[i], 'tokens', tokens[i]-1, 'at', now)
  redis.call('PEXPIRE', KEYS[i], 120000)
end
return 1`;
export async function checkRateLimit(
  url: string,
  token: string,
  clientKey: string,
  fetcher = fetch
) {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      'EVAL',
      SCRIPT,
      '2',
      `chat-search:${clientKey}`,
      'chat-search:global',
      '5',
      '0.5',
      '20',
      '20',
    ]),
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) throw new SearchError(503, '検索を一時停止しています。');
  const result = await response.json();
  if (result.error || (result.result !== 0 && result.result !== 1))
    throw new SearchError(503, '検索を一時停止しています。');
  if (result.result === 0) throw new SearchError(429, '少し待ってから検索してください。');
}
