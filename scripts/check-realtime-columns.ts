/* global Deno -- Deno で動かすスクリプト（deno run） */
// anon の Realtime 購読（postgres_changes の INSERT）に、anon が読めない列が届かないことを確かめる（Issue #186）。
//
// chats.ip（生の IP）は列の権限で anon から外している（20260830000000_mask_ip_for_anon.sql）。
// Realtime は購読したロールの列の権限でペイロードを絞るので ip は届かない。Realtime の版や
// publication の設定が変わってこれが崩れたら、ここで落とす。
//
// 使い方: supabase start の後で
//   deno run --no-lock --allow-net --allow-env scripts/check-realtime-columns.ts
// 環境変数 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY（無ければ supabase status から渡す）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!anonKey || !serviceRoleKey) {
  console.error('SUPABASE_ANON_KEY と SUPABASE_SERVICE_ROLE_KEY が要る');
  Deno.exit(2);
}

// anon が SELECT できない列。届いたら失敗にする
const HIDDEN = ['ip'];
const room = `rt_probe_${crypto.randomUUID().slice(0, 8)}`;

const anon = createClient(url, anonKey);
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

// chats.room_id は rooms の外部キーなので、確認用の部屋を作ってから書く（最後に消す）
{
  const { error } = await admin
    .from('rooms')
    .insert({ id: room, category: 'beginner', enabled: true });
  if (error) {
    console.error(`✖ rooms insert: ${error.message}`);
    Deno.exit(1);
  }
}

let resolveRow: (row: Record<string, unknown>) => void;
const received = new Promise<Record<string, unknown>>((resolve) => (resolveRow = resolve));
let subscribed = false;

anon
  .channel(`check-${room}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'chats', filter: `room_id=eq.${room}` },
    (payload) => resolveRow(payload.new as Record<string, unknown>)
  )
  // 最初の join はトークンの用意より先に走って CHANNEL_ERROR になることがあり、realtime-js が
  // 自動で join し直す。ここでは SUBSCRIBED だけを待ち、来なければ下の期限で落とす
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') subscribed = true;
  });

// 購読の登録が Realtime の中で行き渡るまでに書いた行は届かないことがあるので、届くまで数秒おきに書き直す
async function insertUntilReceived(): Promise<void> {
  let done = false;
  void received.then(() => (done = true));
  while (!done) {
    if (subscribed) {
      const { error } = await admin.from('chats').insert({
        room_id: room,
        name: 'probe',
        color: '#ff69b4',
        message: 'probe',
        ip: '203.0.113.77',
        ua: 'probe-ua',
      });
      if (error) throw new Error(`insert: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, subscribed ? 3000 : 500));
  }
}

let exitCode = 0;
try {
  const row = await Promise.race([
    received,
    insertUntilReceived().then(() => received),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
  ]);
  const leaked = HIDDEN.filter((column) => column in row);
  console.log(`届いた列: ${Object.keys(row).sort().join(', ')}`);
  if (leaked.length > 0) {
    console.error(`✖ anon の Realtime に読めないはずの列が届いた: ${leaked.join(', ')}`);
    exitCode = 1;
  } else if (row.ip_masked !== '203.*.*.77') {
    console.error(`✖ ip_masked が想定外: ${String(row.ip_masked)}`);
    exitCode = 1;
  } else {
    console.log(`✔ ${HIDDEN.join(', ')} は届かない`);
  }
} catch (err) {
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  exitCode = 1;
} finally {
  await admin.from('chats').delete().eq('room_id', room);
  await admin.from('rooms').delete().eq('id', room);
}
Deno.exit(exitCode);
