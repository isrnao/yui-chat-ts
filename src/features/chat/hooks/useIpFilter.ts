import { useSyncExternalStore } from 'react';
import * as ipFilterStore from '@features/chat/utils/ipFilterStore';

export type IpFilter = {
  /** フィルタした伏せ字の IP。追加した順 */
  ips: readonly string[];
  set: ReadonlySet<string>;
};

/**
 * フィルタした伏せ字の IP の一覧を読む。SSG と hydration の間は空で、その後 localStorage の値に切り替わる
 * （.kiro/specs/chat-ip-mute Requirement 6.6）。
 */
export function useIpFilter(): IpFilter {
  const ips = useSyncExternalStore(
    ipFilterStore.subscribe,
    ipFilterStore.getSnapshot,
    ipFilterStore.getServerSnapshot
  );
  return { ips, set: new Set(ips) };
}
