import { useId, useState, useEffect, useRef } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import Button from '@shared/components/Button';
import Input from '@shared/components/Input';
import { useSettings } from '@features/chat/hooks/useSettings';
import { AVATAR_IDS } from '@features/chat/types';
import type { AvatarId } from '@features/chat/types';
import { prefetchClientIP } from '@shared/utils/clientInfo';

type EntryFormProps = {
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

  const { settings, updateSettings } = useSettings();
  const [silent, setSilent] = useState(false);
  const [avatar, setAvatar] = useState<AvatarId>(settings.avatar);
  const prefetchedRef = useRef(false);

  // 入室フォームへの最初のユーザーインタラクションでクライアントIPを先行取得
  function triggerPrefetch() {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    prefetchClientIP();
  }

  // localStorage から設定値を復元して親の state を初期化（マウント時1回のみ）
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized) {
      if (settings.name) setName(settings.name);
      if (settings.color) setColor(settings.color);
      if (settings.email) setEmail(settings.email);
      setAvatar(settings.avatar);
      setInitialized(true);
    }
  }, [initialized, settings, setName, setColor, setEmail]);

  return (
    <div className="flex flex-col">
      <header className="mb-1 text-2xl font-bold text-yui-pink font-yui">ゆいちゃっと</header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onEnter({ name, color, email, silent, avatar });
          // 入室成功後に localStorage を更新（バリデーション失敗時は保存しない）
          updateSettings({ name, color, email, avatar });
        }}
        autoComplete="off"
      >
        {/* 名前（ピンク背景・横幅いっぱい、入力欄は固定幅） */}
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
              triggerPrefetch();
              setName(e.target.value);
            }}
            onFocus={triggerPrefetch}
            required
            autoFocus
            aria-label="おなまえ"
            autoComplete="nickname"
            disabled={isPending}
            className="ml-2"
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
        {/* メール */}
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
            className="ml-2"
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
        {error && <div className="text-xs text-red-500 text-left mb-1">{error}</div>}
        <div className="text-xs text-gray-500 text-right mt-1">
          <a href="http://www.cup.com/yui/" target="_blank" rel="noreferrer">
            ゆいちゃっと Pro(Free)
          </a>
        </div>
      </form>
    </div>
  );
}
