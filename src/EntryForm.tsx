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
  onEnter: (e: React.FormEvent) => void;
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
}: EntryFormProps) {
  const nameId = useId();
  const colorId = useId();
  const emailId = useId();
  const rowsId = useId();

  const handleReset = () => {
    setName("");
    setColor("#ff69b4");
    setWindowRows(30);
    setEmail("");
  };

  return (
    <div className="flex flex-col">
      <header className="mb-1 text-2xl font-bold text-yui-pink"
        style={{ fontFamily: "var(--tw-font-yui, sans-serif)" }}>
        ゆいちゃっと
      </header>
      <form
        onSubmit={onEnter}
      >
        <div className="mb-2">
          <label className="font-bold" htmlFor={nameId}>おなまえ:</label>
          <input
            className="
              ml-2 border-2 border-[var(--ie-gray)] [border-style:inset]
              bg-white px-2 py-0.5 text-sm rounded-none
              shadow-none transition-colors outline-none
              [font-family:var(--font-yui)]
              focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]
            "
            type="text"
            id={nameId}
            value={name}
            maxLength={24}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="mb-2">
          <label htmlFor={colorId}>名前の色:</label>
          <input
            className="
              ml-2 border-2 border-[var(--ie-gray)] [border-style:inset]
              bg-white px-1 py-0.5 text-base rounded-none
              shadow-none transition-colors outline-none
              align-middle w-10 h-7
              [font-family:var(--font-yui)]
              focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]
            "
            type="color"
            id={colorId}
            value={color}
            onChange={e => setColor(e.target.value)}
          />
          <span className="ml-2" style={{ color }}>■</span>
          <a
            className="ml-3 text-xs underline"
            style={{ color: "#cc3e97" }}
            href="http://www.cup.com/yui/color.html"
            target="_blank"
            rel="noreferrer"
          >
            色見本
          </a>
        </div>
        <div className="mb-2">
          <label htmlFor={emailId}>E-Mail:</label>
          <input
            className="
              ml-2 border-2 border-[var(--ie-gray)] [border-style:inset]
              bg-white px-2 py-0.5 text-sm rounded-none
              shadow-none transition-colors outline-none
              [font-family:var(--font-yui)]
              focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]
            "
            type="email"
            id={emailId}
            value={email}
            maxLength={64}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="任意"
          />
        </div>
        <div className="mb-2">
          <label htmlFor={rowsId}>ログ行数:</label>
          <select
            className="
              ml-2 border-2 border-[var(--ie-gray)] [border-style:inset]
              bg-white px-2 py-0.5 text-sm rounded-none
              shadow-none outline-none
              [font-family:var(--font-yui)]
              focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]
            "
            id={rowsId}
            value={windowRows}
            onChange={e => setWindowRows(Number(e.target.value))}
          >
            {[30, 50, 40, 20, 10, 100, 1000].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="flex mt-4 gap-2">
          <button
            type="submit"
            className="
              border-2 border-[var(--ie-gray)] [border-style:outset]
              bg-gradient-to-b from-[var(--ie-bg)] to-[#e4e4e4]
              text-[#222] px-5 py-0.5 text-sm cursor-pointer rounded-none shadow-none mr-2 transition
              [font-family:var(--font-yui)]
              active:[border-style:inset] active:border-[var(--ie-gray)]
              active:bg-gradient-to-b active:from-[#e1e1e1] active:to-[var(--ie-bg)]
              disabled:text-[#a9a9a9] disabled:border-[#e2e2e2]
              disabled:bg-[#f6f6f6] disabled:cursor-not-allowed
            "
          >
            チャットに参加する
          </button>
          <button
            type="reset"
            className="
              border-2 border-[var(--ie-gray)] [border-style:outset]
              bg-gradient-to-b from-[var(--ie-bg)] to-[#e4e4e4]
              text-[#222] px-5 py-0.5 text-sm cursor-pointer rounded-none shadow-none mr-2 transition
              [font-family:var(--font-yui)]
              active:[border-style:inset] active:border-[var(--ie-gray)]
              active:bg-gradient-to-b active:from-[#e1e1e1] active:to-[var(--ie-bg)]
              disabled:text-[#a9a9a9] disabled:border-[#e2e2e2]
              disabled:bg-[#f6f6f6] disabled:cursor-not-allowed
            "
            onClick={handleReset}
          >
            リセット
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
