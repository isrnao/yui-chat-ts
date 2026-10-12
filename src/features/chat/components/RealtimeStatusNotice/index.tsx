import type { RealtimeStatus } from '@features/chat/api/realtime';

/**
 * Realtime が切れたときの知らせ（通常部屋・全部屋まとめ・Chanari で共有する）。
 * 出すのは切れたときだけ。最初の接続待ち（connecting）は SSG の HTML にも入り、つながった瞬間に消えて
 * 入室フォームを押し上げるので出さない。切れている間に届かなかった発言は [更新] で取れる
 */
export default function RealtimeStatusNotice({ status }: { status: RealtimeStatus }) {
  if (status !== 'disconnected') return null;
  return (
    <div className="px-[var(--page-gap)] text-xs" role="status">
      接続が切れています。更新でログを取得できます。
    </div>
  );
}
