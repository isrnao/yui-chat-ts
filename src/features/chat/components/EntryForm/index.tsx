import { useId, useState } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import Button from '@shared/components/Button';
import Input from '@shared/components/Input';
import { useSettings } from '@features/chat/hooks/useSettings';
import { useStoreBackedState } from '@shared/hooks/useStoreBackedState';
import { AVATAR_IDS } from '@features/chat/types';
import type { AvatarId } from '@features/chat/types';

type EntryFormProps = {
  roomTitle?: string;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  color: string;
  setColor: Dispatch<SetStateAction<string>>;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  onEnter: (args: {
    name: string;
    color: string;
    email: string;
    silent: boolean;
    avatar: AvatarId;
  }) => void | Promise<void>;
  error?: string;
  isPending?: boolean;
};

export default function EntryForm({
  roomTitle = 'ゆいちゃっと',
  name,
  setName,
  color,
  setColor,
  email,
  setEmail,
  onEnter,
  error,
  isPending,
}: EntryFormProps) {
  const nameId = useId();
  const colorId = useId();
  const colorPickerId = useId();
  const emailId = useId();
  const silentId = useId();
  const avatarGroupName = useId();

  // name/color/email の localStorage 由来の初期値は親 (ChatRoute) で useState の lazy init として読み込み済み。
  // 本コンポーネントでは avatar 初期値 (内部 state のため) と updateSettings のみ参照する。
  const { settings, updateSettings } = useSettings();
  const [silent, setSilent] = useState(false);
  // SSG/hydration 中は既定値、hydration 後は localStorage 由来の値に追随する。
  // useState でコピーすると SSG 時の 'none' を握ったままになり、
  // 保存済みアバターが復元されない。
  const [avatar, setAvatar] = useStoreBackedState<AvatarId>(settings.avatar);

  return (
    <div className="flex flex-col">
      <header className="mb-1 text-2xl font-bold text-yui-pink font-yui">{roomTitle}</header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // 入室の失敗は呼び出し元が error prop で表示する。入室中はこのフォーム自体が
          // アンマウントされる（チャット画面へ即座に切り替える）ため、ここでは状態を持てない。
          // Promise を捨てると未処理の rejection になるので、失敗も必ず受け取る。
          Promise.resolve(onEnter({ name, color, email, silent, avatar })).then(
            // 入室成功後に localStorage を更新（失敗時は保存しない）
            () => updateSettings({ name, color, email, avatar }),
            () => {}
          );
        }}
        autoComplete="off"
      >
        {/* 名前（ピンク背景・横幅いっぱい、入力欄は size=20 の固有幅）。
            入力欄は flex アイテムなので min-width:auto のままだと固有幅を下回れず、
            SP では行ごと画面外にはみ出す (main が overflow-hidden なので横スクロールも
            できない)。min-w-0 で縮小を許可し、幅が足りないときだけ縮むようにする。 */}
        <div className="mb-1 flex items-center bg-[#feb6c1] px-2 py-1">
          <label className="font-bold whitespace-nowrap" htmlFor={nameId}>
            おなまえ
          </label>
          <Input
            type="text"
            id={nameId}
            name="name"
            value={name}
            maxLength={24}
            size={20}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setName(e.target.value);
            }}
            required
            autoFocus
            aria-label="おなまえ"
            autoComplete="nickname"
            disabled={isPending}
            className="ml-2 min-w-0"
          />
          <span className="ml-2 text-sm whitespace-nowrap">記入してね！</span>
        </div>
        {/* ボタン群（名前の直下） */}
        <div className="mb-1 flex gap-1">
          <Button type="submit" disabled={isPending}>
            {isPending ? '参加中...' : 'チャットに参加する'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setName('');
              setColor('#ff69b4');
              setEmail('');
              setSilent(false);
              setAvatar('none');
              updateSettings({ name: '', color: '#ff69b4', email: '', avatar: 'none' });
            }}
          >
            リセット
          </Button>
        </div>
        {/* 色（テキスト入力 + カラーパレットボタン + こっそり） */}
        <div className="mb-1 flex items-center flex-wrap gap-x-2">
          <label htmlFor={colorId} className="whitespace-nowrap">
            名前の色
          </label>
          <Input
            type="text"
            id={colorId}
            name="color"
            value={color}
            maxLength={12}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setColor(e.target.value)}
            aria-label="名前の色"
            disabled={isPending}
            className="w-20"
          />
          {/* カラーナビ（カラーピッカーをラベルで開く） */}
          <label
            htmlFor={colorPickerId}
            className="text-green-700 underline cursor-pointer text-sm"
          >
            カラーナビ
          </label>
          <input
            type="color"
            id={colorPickerId}
            value={color.startsWith('#') ? color : '#ff69b4'}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setColor(e.target.value)}
            className="w-0 h-0 opacity-0 absolute"
            tabIndex={-1}
          />
          {/* こっそり */}
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              id={silentId}
              checked={silent}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSilent(e.target.checked)}
              aria-label="こっそり"
              disabled={isPending}
              className="w-3.5 h-3.5"
            />
            <span className="text-sm">こっそり</span>
          </label>
        </div>
        {/* メール（おなまえ欄と同じ理由で入力欄に min-w-0） */}
        <div className="mb-1 flex items-center">
          <label htmlFor={emailId} className="whitespace-nowrap">
            E-Mail/URL:
          </label>
          <Input
            type="text"
            id={emailId}
            name="email"
            value={email}
            maxLength={64}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="任意"
            aria-label="E-Mail/URL"
            disabled={isPending}
            className="ml-2 min-w-0"
          />
        </div>
        {/* アバター選択（ラジオボタン丸見え + 横一列） */}
        <div className="mb-1 flex items-center flex-wrap gap-0">
          {AVATAR_IDS.map((id) => (
            <label key={id} className="inline-flex items-center cursor-pointer mr-0.5">
              <input
                type="radio"
                name={avatarGroupName}
                value={id}
                checked={avatar === id}
                onChange={() => setAvatar(id)}
                disabled={isPending}
                aria-label={id === 'none' ? 'アバターなし' : `アバター ${id}`}
              />
              {id === 'none' ? (
                <span className="text-xs text-gray-500 ml-0.5">なし</span>
              ) : (
                <img
                  src={`${import.meta.env.BASE_URL}avatars/${id}.gif`}
                  alt={id}
                  className="w-6 h-6 ml-0.5"
                  loading="lazy"
                />
              )}
            </label>
          ))}
        </div>
        {/* エラー表示 */}
        {error && (
          <div role="alert" className="text-xs text-red-500 text-left mb-1">
            {error}
          </div>
        )}
        <div className="text-xs text-gray-500 text-right mt-1">
          <a href="https://www.cup.com/yui/" target="_blank" rel="noreferrer">
            ゆいちゃっと Pro(Free)
          </a>
        </div>
      </form>
    </div>
  );
}
