import { useId, useCallback } from "react";
import type { ChangeEvent, FormEvent } from "react";
import ChatLogList from "./ChatLogList";
import type { Chat } from "./YuiChat";

export type EntryFormProps = {
  name: string;
  setName: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  windowRows: number;
  setWindowRows: (v: number) => void;
  onEnter: (e: FormEvent) => void;
  chatLog: Chat[];
  autoClear: boolean;
  setAutoClear: (v: boolean) => void;
};

export default function EntryForm({
  name,
  setName,
  color,
  setColor,
  email,
  setEmail,
  windowRows,
  setWindowRows,
  onEnter,
  chatLog,
  autoClear,
  setAutoClear,
}: EntryFormProps) {
  const nameId = useId();
  const colorId = useId();
  const emailId = useId();
  const rowsId = useId();

  const handleName = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setName(e.target.value),
    [setName]
  );
  const handleColor = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setColor(e.target.value),
    [setColor]
  );
  const handleEmail = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
    [setEmail]
  );
  const handleRows = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => setWindowRows(Number(e.target.value)),
    [setWindowRows]
  );
  const handleReset = useCallback(() => {
    setName("");
    setColor("#ff69b4");
    setWindowRows(30);
    setEmail("");
    setAutoClear(true);
  }, [setName, setColor, setWindowRows, setEmail, setAutoClear]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "var(--tw-color-yui-green, #A1FE9F)" }}
    >
      <form
        onSubmit={onEnter}
        className="bg-white rounded-2xl shadow-2xl p-8 border-4 border-yui-pink"
        style={{ minWidth: 340, fontFamily: "var(--tw-font-yui, sans-serif)" }}
      >
        <div className="text-2xl font-bold mb-2" style={{ color: "#ff69b4" }}>
          ゆいちゃっと
        </div>
        <div className="mb-2">
          <label className="font-bold" htmlFor={nameId}>
            おなまえ:
          </label>
          <input
            className="ml-2 border px-2 py-1 rounded"
            type="text"
            id={nameId}
            value={name}
            maxLength={24}
            onChange={handleName}
            required
            autoFocus
          />
        </div>
        <div className="mb-2">
          <label htmlFor={colorId}>名前の色:</label>
          <input
            className="ml-2 border px-2 py-1 rounded"
            type="color"
            id={colorId}
            value={color}
            onChange={handleColor}
            style={{ width: 40, height: 28, verticalAlign: "middle" }}
          />
          <span className="ml-2" style={{ color }}>
            ■
          </span>
          <a
            className="ml-3 text-xs underline text-yui-pink"
            href="http://www.cup.com/yui/color.html"
            target="_blank"
            rel="noreferrer"
          >
            色見本
          </a>
        </div>
        <div className="mb-2">
          <label htmlFor={emailId}>メールアドレス:</label>
          <input
            className="ml-2 border px-2 py-1 rounded"
            type="email"
            id={emailId}
            value={email}
            maxLength={64}
            onChange={handleEmail}
            autoComplete="email"
            placeholder="任意"
          />
        </div>
        <div className="mb-2">
          <label htmlFor={rowsId}>ログ行数：</label>
          <select
            className="ml-2 border rounded"
            id={rowsId}
            value={windowRows}
            onChange={handleRows}
          >
            {[30, 50, 40, 20, 10, 100, 1000].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex mt-4 gap-2">
          <button
            type="submit"
            className="bg-yui-pink text-white px-4 py-2 rounded-xl font-bold shadow"
          >
            チャットに参加する
          </button>
          <button
            type="reset"
            className="bg-gray-200 px-4 py-2 rounded-xl font-bold shadow"
            onClick={handleReset}
          >
            リセット
          </button>
        </div>
        <hr className="my-4 border-yui-pink" />
        <div className="text-xs text-gray-500 text-right">
          <a href="http://www.cup.com/yui/" target="_blank" rel="noreferrer">
            ゆいちゃっと Pro(Free)
          </a>
        </div>
      </form>
      <ChatLogList chatLog={chatLog} windowRows={windowRows} />
    </div>
  );
}
