import { useSyncExternalStore } from 'react';
import * as ipFilterStore from '@features/chat/utils/ipFilterStore';

export type IpFilter = {
  /** フィルタした伏せ字の IP。追加した順 */
  ips: readonly string[];
  set: ReadonlySet<string>;
  /** フィルタした時点で保存した「おなまえ」（IP ごと、新しい順） */
  savedNames?: ReadonlyMap<string, readonly string[]>;
};

/**
 * フィルタした伏せ字の IP の一覧を読む。SSG と hydration の間は空で、その後 localStorage の値に切り替わる
 * （.kiro/specs/chat-ip-mute Requirement 6.6）。
 */
export function useIpFilter(): IpFilter {
  const entries = useSyncExternalStore(
    ipFilterStore.subscribe,
    ipFilterStore.getSnapshot,
    ipFilterStore.getServerSnapshot
  );
  const ips = entries.map(({ ip }) => ip);
  return {
    ips,
    set: new Set(ips),
    savedNames: new Map(entries.map(({ ip, names }) => [ip, names])),
  };
}
