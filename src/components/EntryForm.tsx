import { useId } from "react";

type EntryFormProps = {
  name: string;
  setName: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  windowRows: number;
  setWindowRows: (v: number) => void;
  onEnter: (form: {
    name: string;
    color: string;
    email: string;
  }) => void | Promise<void>;
  error?: string;
  isPending?: boolean;
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
  error,
  isPending,
}: EntryFormProps) {
  const nameId = useId();
  const colorId = useId();
  const emailId = useId();
  const rowsId = useId();

  return (
    <div className="flex flex-col">
      <header
        className="mb-1 text-2xl font-bold text-[var(--yui-pink)]"
        style={{ fontFamily: "var(--font-yui)" }}
      >
        ゆいちゃっと
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onEnter({ name, color, email });
        }}
        autoComplete="off"
      >
        {/* 名前 */}
        <div className="mb-2 flex items-center">
          <label className="font-bold" htmlFor={nameId}>
            おなまえ:
          </label>
          <input
            className="ml-2 border-2 border-[var(--ie-gray)] [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none transition-colors outline-none [font-family:var(--font-yui)] focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]"
            type="text"
            id={nameId}
            name="name"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            aria-label="おなまえ"
            autoComplete="nickname"
            disabled={isPending}
          />
        </div>
        {/* 色 */}
        <div className="mb-2 flex items-center">
          <label htmlFor={colorId}>名前の色:</label>
          <input
            className="ml-2 border-2 border-[var(--ie-gray)] [border-style:inset] bg-white px-1 py-0.5 text-base rounded-none shadow-none transition-colors outline-none align-middle w-10 h-7 [font-family:var(--font-yui)] focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]"
            type="color"
            id={colorId}
            name="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="名前の色"
            disabled={isPending}
          />
          <span className="ml-2" style={{ color }} aria-hidden>
            ■
          </span>
        </div>
        {/* メール */}
        <div className="mb-2 flex items-center">
          <label htmlFor={emailId}>E-Mail:</label>
          <input
            className="ml-2 border-2 border-[var(--ie-gray)] [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none transition-colors outline-none [font-family:var(--font-yui)] focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]"
            type="email"
            id={emailId}
            name="email"
            value={email}
            maxLength={64}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="任意"
            aria-label="E-Mail"
            disabled={isPending}
          />
        </div>
        {/* ログ行数 */}
        <div className="mb-2 flex items-center">
          <label htmlFor={rowsId}>ログ行数:</label>
          <select
            className="ml-2 border-2 border-[var(--ie-gray)] [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none outline-none [font-family:var(--font-yui)] focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]"
            id={rowsId}
            name="windowRows"
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
        </div>
        {/* エラー表示 */}
        {error && (
          <div className="text-xs text-red-500 text-left mb-2">{error}</div>
        )}
        {/* ボタン群 */}
        <div className="flex mt-4 gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="border-2 border-[var(--ie-gray)] [border-style:outset] bg-gradient-to-b from-[var(--ie-bg)] to-[#e4e4e4] text-[#222] px-5 py-0.5 text-sm cursor-pointer rounded-none shadow-none mr-2 transition [font-family:var(--font-yui)] active:[border-style:inset] active:border-[var(--ie-gray)] active:bg-gradient-to-b active:from-[#e1e1e1] active:to-[var(--ie-bg)] disabled:text-[#a9a9a9] disabled:border-[#e2e2e2] disabled:bg-[#f6f6f6] disabled:cursor-not-allowed"
          >
            {isPending ? "参加中..." : "チャットに参加する"}
          </button>
        </div>
        <div className="text-xs text-gray-500 text-right mt-2">
          <a href="http://www.cup.com/yui/" target="_blank" rel="noreferrer">
            ゆいちゃっと Pro(Free)
          </a>
        </div>
      </form>
    </div>
  );
}
