import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent } from 'react';
import type { RoomId } from '../rooms';
import { searchChats, type ChatSearchItem } from './api';
import { trackEvent } from '@shared/utils/analytics';

type Criteria = { q: string; rangeDays: 30 | 90 };

export default function ChatSearchPanel({
  roomId,
  onBack,
}: {
  roomId: RoomId;
  onBack: () => void;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [rangeDays, setRangeDays] = useState<30 | 90>(30);
  const [items, setItems] = useState<ChatSearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [context, setContext] = useState<ChatSearchItem[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const submitted = useRef<Criteria | null>(null);
  const composing = useRef(false);
  const request = useRef<{ id: number; controller: AbortController | null }>({
    id: 0,
    controller: null,
  });

  function cancel() {
    request.current.controller?.abort();
    request.current.id += 1;
  }
  function begin() {
    cancel();
    const controller = new AbortController();
    request.current.controller = controller;
    setError('');
    setLoading(true);
    return { id: request.current.id, signal: controller.signal };
  }
  async function run(criteria: Criteria, cursor: string | null = null) {
    const current = begin();
    submitted.current = criteria;
    setContext(null);
    setTarget(null);
    if (!cursor) {
      setItems([]);
      setNextCursor(null);
    }
    trackEvent('search_submitted', { room_id: roomId, range_days: criteria.rangeDays });
    try {
      const result = await searchChats(
        { mode: 'search', roomId, ...criteria, cursor },
        current.signal
      );
      if (request.current.id !== current.id) return;
      setItems((prev) =>
        cursor
          ? [...new Map([...prev, ...result.items].map((item) => [item.uuid, item])).values()]
          : result.items
      );
      setNextCursor(result.nextCursor);
      setSearched(true);
      trackEvent('search_results', {
        room_id: roomId,
        result_count_bucket:
          result.items.length === 0 ? '0' : result.items.length < 20 ? '1-19' : '20+',
        latency_bucket: result.elapsedMs < 800 ? 'under_800ms' : '800ms_or_more',
      });
    } catch (e) {
      if (request.current.id === current.id) {
        setError((e as Error).message);
        setNextCursor(null);
      }
    } finally {
      if (request.current.id === current.id) setLoading(false);
    }
  }
  async function openContext(uuid: string) {
    const current = begin();
    setContext(null);
    setTarget(uuid);
    try {
      const result = await searchChats(
        { mode: 'context', roomId, targetUuid: uuid },
        current.signal
      );
      if (request.current.id !== current.id) return;
      setContext(result.items);
      trackEvent('search_result_opened', { room_id: roomId });
    } catch (e) {
      if (request.current.id === current.id) {
        setItems([]);
        setNextCursor(null);
        setError((e as Error).message);
      }
    } finally {
      if (request.current.id === current.id) setLoading(false);
    }
  }
  // Revalidate after leaving the page; do not revive cached deleted excerpts.
  const revalidate = useEffectEvent(() => {
    if (submitted.current) void run(submitted.current);
  });
  useEffect(() => {
    const state = request.current;
    const onFocus = () => revalidate();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      state.controller?.abort();
      state.id += 1;
    };
  }, []);

  function changeCriteria() {
    cancel();
    setLoading(false);
    setItems([]);
    setNextCursor(null);
    setContext(null);
    setTarget(null);
    setError('');
    setSearched(false);
    submitted.current = null;
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (composing.current) return;
    void run({ q, rangeDays });
  }
  const displayed = context ?? items;
  return (
    <section aria-label="この部屋の過去の会話を検索" className="px-[var(--page-gap)] pb-4 text-sm">
      <button type="button" className="underline text-green-800 mb-2" onClick={onBack}>
        現在の会話へ戻る
      </button>
      <form onSubmit={submit} autoComplete="off" className="flex flex-wrap items-end gap-2 mb-2">
        <label htmlFor={id}>
          検索語（空白で区切るとすべて含む）
          <input
            id={id}
            type="text"
            value={q}
            className="block border bg-white p-1"
            autoFocus
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.nativeEvent.isComposing || composing.current))
                event.preventDefault();
            }}
            onChange={(event) => {
              changeCriteria();
              setQ(event.target.value);
            }}
          />
        </label>
        <label>
          期間
          <select
            aria-label="検索期間"
            value={rangeDays}
            className="block border bg-white p-1"
            onChange={(event) => {
              changeCriteria();
              setRangeDays(Number(event.target.value) as 30 | 90);
            }}
          >
            <option value={30}>直近30日</option>
            <option value={90}>直近90日</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="border bg-white px-2 py-1 disabled:opacity-50"
        >
          検索
        </button>
      </form>
      <p className="mb-2">
        本文を新しい順に検索します。日時は日本時間です。各語2文字以上、合計80文字以内・5語まで。
      </p>
      {loading && <p role="status">検索中...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && searched && displayed.length === 0 && (
        <p role="status">該当する発言はありません。</p>
      )}
      {context && (
        <>
          <h2 className="font-bold">発言の前後</h2>
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (submitted.current) void run(submitted.current);
            }}
          >
            検索結果を更新して戻る
          </button>
        </>
      )}
      <ul aria-label={context ? '前後の発言' : '検索結果'}>
        {displayed.map((item) => (
          <li
            key={item.uuid}
            className="border-b py-2"
            aria-current={item.uuid === target ? 'true' : undefined}
          >
            <p className="break-words whitespace-pre-wrap">{item.excerpt}</p>
            <p>
              {item.name} ·{' '}
              <time dateTime={new Date(item.time).toISOString()}>
                {new Date(item.time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
              </time>
            </p>
            {!context && (
              <button
                type="button"
                className="underline text-green-800"
                disabled={loading}
                onClick={() => void openContext(item.uuid)}
              >
                前後の発言を見る
              </button>
            )}
          </li>
        ))}
      </ul>
      {!context && nextCursor && (
        <button
          type="button"
          disabled={loading}
          className="border bg-white px-2 py-1"
          onClick={() => {
            if (submitted.current) void run(submitted.current, nextCursor);
          }}
        >
          さらに表示
        </button>
      )}
    </section>
  );
}
