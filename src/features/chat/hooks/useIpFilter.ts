import { useSyncExternalStore } from 'react';
import * as ipFilterStore from '@features/chat/utils/ipFilterStore';
import type { FilterEntry } from '@features/chat/utils/ipFilterStore';

export type IpFilter = {
  /** フィルタの一覧（IP・名前・言葉）。追加した順 */
  entries?: readonly FilterEntry[];
  /** フィルタした伏せ字の IP。追加した順 */
  ips: readonly string[];
  set: ReadonlySet<string>;
  /** フィルタした名前 */
  names?: ReadonlySet<string>;
  /** フィルタした言葉 */
  words?: readonly string[];
  /** フィルタした時点で保存した「おなまえ」（IP ごと、新しい順） */
  savedNames?: ReadonlyMap<string, readonly string[]>;
};

/**
 * フィルタの一覧を読む。SSG と hydration の間は空で、その後 localStorage の値に切り替わる
 * （.kiro/specs/chat-ip-mute Requirement 6.6）。
 */
export function useIpFilter(): IpFilter {
  const entries = useSyncExternalStore(
    ipFilterStore.subscribe,
    ipFilterStore.getSnapshot,
    ipFilterStore.getServerSnapshot
  );
  const ips: string[] = [];
  const names: string[] = [];
  const words: string[] = [];
  const savedNames = new Map<string, readonly string[]>();
  for (const entry of entries) {
    if (entry.kind === 'ip') {
      ips.push(entry.ip);
      savedNames.set(entry.ip, entry.names);
    } else if (entry.kind === 'name') {
      names.push(entry.name);
    } else {
      words.push(entry.word);
    }
  }
  return { entries, ips, set: new Set(ips), names: new Set(names), words, savedNames };
}
