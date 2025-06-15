import { useId, useRef, useEffect, useActionState, startTransition, type ChangeEvent } from 'react';
import type { Chat } from '@features/chat/types';
import Button from '@shared/components/Button';
import Input from '@shared/components/Input';

export type ChatRoomProps = {
  message: string;
  setMessage: () => void;
  chatLog: Chat[];
  windowRows: number;
  setWindowRows: () => void;
  onExit: () => void;
  onSend: () => Promise<void>;
  onReload: () => void;
  onShowRanking: () => void;
};

export default function ChatRoom({
  message,
  setMessage,
  chatLog,
  windowRows,
  setWindowRows,
  onExit,
  onSend,
  onReload,
  onShowRanking,
}: ChatRoomProps) {
  const messageId = useId();
  const rowsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // useActionState for message sending
  const [error, dispatch, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const msg = formData.get('message')?.toString() ?? '';
      if (!msg.trim()) return;
      try {
        await onSend(msg);
        setMessage('');
        return '';
      } catch (err) {
        return (err as Error)?.message || '送信エラー';
      }
    },
    ''
  );

  // オートフォーカス
  useEffect(() => {
    if (!isPending && inputRef.current) inputRef.current.focus();
  }, [chatLog, isPending]);

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex gap-2">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onExit();
          }}
          className="underline text-blue-700"
        >
          [退室]
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onShowRanking();
          }}
          className="underline text-blue-700"
        >
          [発言ランキング]
        </a>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(() => {
            dispatch(formData);
          });
        }}
        className="flex gap-2 mt-2 mb-3 w-full max-w-2xl px-4 [font-family:var(--font-yui)] flex-wrap"
        autoComplete="off"
      >
        <div className="flex flex-nowrap gap-2">
          <Button type="submit" disabled={isPending}>
            {'発言'}
          </Button>
          <Button type="button" onClick={onReload} tabIndex={-1} disabled={isPending}>
            リロード
          </Button>
        </div>
        <div className="w-full">
          <Input
            type="text"
            placeholder="発言"
            id={messageId}
            name="message"
            value={message}
            maxLength={120}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
            disabled={isPending}
            ref={inputRef}
            autoFocus
            aria-label="発言"
            className="w-full flex-1"
          />
        </div>
        <label htmlFor={rowsId} className="ml-2">
          ログ行数
        </label>
        <select
          className="ml-2 border-2 border-[var(--ie-gray)] [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none outline-none [font-family:var(--font-yui)] focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]"
          id={rowsId}
          value={windowRows}
          onChange={(e) => setWindowRows(Number(e.target.value))}
          aria-label="ログ行数"
          disabled={isPending}
        >
          {[30, 50, 40, 20, 10, 100, 1000].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {/* エラー表示 */}
        {error && <div className="w-full text-xs text-red-500 mt-1">{error}</div>}
      </form>
    </div>
  );
}
