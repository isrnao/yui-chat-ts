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
    <div className="flex flex-col items-center">
      <form
        onSubmit={onEnter}
        className="ie-form"
        style={{ minWidth: 340 }}
      >
        <div className="mb-2">
          <label className="font-bold" htmlFor={nameId}>
            おなまえ:
          </label>
          <input
            className="ml-2 ie-input"
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
            className="ml-2 ie-input"
            type="color"
            id={colorId}
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{ width: 40, height: 28, verticalAlign: "middle" }}
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
          <label htmlFor={emailId}>メールアドレス:</label>
          <input
            className="ml-2 ie-input"
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
          <label htmlFor={rowsId}>ログ行数：</label>
          <select
            className="ml-2 ie-select"
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
            className="ie-btn"
          >
            チャットに参加する
          </button>
          <button
            type="reset"
            className="ie-btn"
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
