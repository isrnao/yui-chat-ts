/**
 * localStorage を裏に持つ外部ストア（Persistent_Store、.kiro/specs/react-2026-refactoring Requirement 9）。
 * useSyncExternalStore の subscribe / getSnapshot / getServerSnapshot をそのまま渡せる形で公開する。
 *
 * - getSnapshot は、localStorage の生の文字列が変わらない限り同じ参照を返す
 *   （毎回 parse し直すと useSyncExternalStore が無限に再レンダーする）
 * - getServerSnapshot は常に既定値。SSG と hydration 中は既定値で描画し、その後ストアの値に追随する
 * - 同じタブの変更は独自イベント、別タブの変更は storage イベントで通知する
 * - localStorage が使えない環境（プライベートモード・容量超過など）では、メモリ上の値で動き続ける
 * - `storage: 'session'` で sessionStorage を使う（タブごとの値。ツーショットチャットの Session_Token）
 */
export interface PersistentStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
  getServerSnapshot(): T;
  /** 次の値を保存して購読者へ通知する */
  update(next: T | ((previous: T) => T)): void;
}

export function createPersistentStore<T>({
  key,
  parse,
  defaults,
  storage = 'local',
}: {
  key: string;
  /** JSON.parse した値を T に整える。形が不正な値は既定値に寄せる */
  parse: (value: unknown) => T;
  defaults: T;
  /** 保存先。既定は localStorage */
  storage?: 'local' | 'session';
}): PersistentStore<T> {
  // SSG（Node）では参照した時点で ReferenceError になるので、使うたびに try の中で取り出す
  const area = (): Storage => (storage === 'session' ? sessionStorage : localStorage);
  const changeEvent = `persistent-store:${key}`;
  // 直近に読んだ生の文字列と、その parse 結果
  let cache: { raw: string | null; value: T } | null = null;

  const readRaw = (): string | null | undefined => {
    try {
      return area().getItem(key);
    } catch {
      return undefined; // localStorage が使えない
    }
  };

  const parseRaw = (raw: string | null): T => {
    if (raw == null) return defaults;
    try {
      return parse(JSON.parse(raw));
    } catch {
      return defaults; // 壊れた JSON
    }
  };

  const getSnapshot = (): T => {
    const raw = readRaw();
    // 使えないときは、直前に書いた（または読んだ）値をそのまま使う
    if (raw === undefined) return cache?.value ?? defaults;
    if (cache && cache.raw === raw) return cache.value;
    cache = { raw, value: parseRaw(raw) };
    return cache.value;
  };

  return {
    subscribe(listener) {
      const onChange = () => listener();
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) listener();
      };
      window.addEventListener(changeEvent, onChange);
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener(changeEvent, onChange);
        window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot,
    getServerSnapshot: () => defaults,
    update(next) {
      const value = typeof next === 'function' ? (next as (previous: T) => T)(getSnapshot()) : next;
      const raw = JSON.stringify(value);
      let stored = false;
      try {
        area().setItem(key, raw);
        stored = true;
      } catch {
        // 容量超過・無効化 → メモリ上の値だけ更新して動き続ける
      }
      // 保存できなかったときは、今の生の文字列（古い値）に新しい値を結び付けておく。
      // こうしておけば、次に別の値が書かれるまで getSnapshot は新しい値を返す
      cache = { raw: stored ? raw : (readRaw() ?? null), value };
      window.dispatchEvent(new Event(changeEvent));
    },
  };
}
