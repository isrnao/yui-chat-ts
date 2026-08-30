import { memo } from 'react';
import { formatLegacyDateTime } from '@shared/utils/format';
import { parseMessageSegments } from '@features/chat/utils/urlLinker';
import { FONT_SIZE_CSS, FONT_COLOR_CSS } from '@features/chat/types';
import type { Chat } from '@features/chat/types';
import { isRoomId, getRoomMeta, type RoomId } from '@features/chat/rooms';

type Props = {
  chat: Chat;
  showRoomName?: boolean;
  onRoomClick?: (roomId: RoomId) => void;
};

/** レガシー互換の時刻表示: "01/02(Wed) 20:10 219.107.106.*"（IP はサーバー側でマスク済み） */
function getTimeDisplay(chat: Chat): string {
  if (chat.optimistic) return '送信中...';
  const stamp = formatLegacyDateTime(chat.time);
  return chat.ip_masked ? `${stamp} ${chat.ip_masked}` : stamp;
}

function resolveRoomTitle(chat: Chat): string {
  const roomId = chat.room_id;
  if (!roomId) return '不明な部屋';
  try {
    if (!isRoomId(roomId)) return roomId;
    return getRoomMeta(roomId).title;
  } catch {
    return roomId;
  }
}

function RoomNameLabel({
  chat,
  onRoomClick,
}: {
  chat: Chat;
  onRoomClick?: (roomId: RoomId) => void;
}) {
  const title = resolveRoomTitle(chat);
  const roomId = chat.room_id;

  if (!onRoomClick || !roomId) {
    return <span className="ml-1 text-xs text-gray-500">{title}</span>;
  }

  return (
    <button
      type="button"
      className="ml-1 text-xs text-blue-600 underline cursor-pointer"
      onClick={() => onRoomClick(roomId)}
      aria-label={`${title}に返信`}
    >
      {title}
    </button>
  );
}

/** 発言末尾の "(01/02(Wed) 20:10 219.107.106.*)" 表示 */
function TimeStamp({
  chat,
  showRoomName,
  onRoomClick,
}: {
  chat: Chat;
  showRoomName?: boolean;
  onRoomClick?: (roomId: RoomId) => void;
}) {
  return (
    <span className={`ml-2 text-xs text-gray-400 ${chat.optimistic ? 'animate-pulse' : ''}`}>
      ({getTimeDisplay(chat)}
      {showRoomName && (
        <>
          {' / '}
          <RoomNameLabel chat={chat} onRoomClick={onRoomClick} />
        </>
      )}
      )
    </span>
  );
}

/** メッセージ本文をセグメント分割してレンダリング（URL自動リンク化） */
function MessageBody({ message, chat }: { message: string; chat: Chat }) {
  const segments = parseMessageSegments(message);
  const fontStyle = chat.metadata?.fontStyle;

  // フォントスタイルが指定されている場合、inline style で適用
  const style: React.CSSProperties | undefined = fontStyle
    ? {
        fontSize: fontStyle.fontSize ? FONT_SIZE_CSS[fontStyle.fontSize] : undefined,
        color: fontStyle.fontColor ? FONT_COLOR_CSS[fontStyle.fontColor] : undefined,
        fontWeight: fontStyle.bold ? 700 : undefined,
      }
    : undefined;

  return (
    <span className="ml-1 text-gray-700" style={style}>
      {segments.map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline break-all"
          >
            {seg.href}
          </a>
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </span>
  );
}

/**
 * レガシーの管理人メッセージから「ユーザー名」部分を抽出する。
 * 例: "薄ら紅 さん、Welcome to お気楽チャット☆" → { userName: '薄ら紅', rest: 'さん、Welcome to...' }
 * 例: "薄ら紅さん、またきておくれやすぅ。" → { userName: '薄ら紅', rest: 'さん、...' }
 */
function splitAdminMessage(message: string): { userName: string; rest: string } | null {
  const match = message.match(/^(.+?)\s?(さん[、,].+)$/);
  if (!match) return null;
  return { userName: match[1].trim(), rest: match[2] };
}

const WELCOME_PATTERN = /さん[、,]\s*Welcome to/;
/** レガシーの look コマンド。発言の右にきらめきを出す */
const LOOK_PATTERN = /^look$/i;
const PROFILE_SUFFIX = ' プロフィールも作ってみてね';

/**
 * レガシーの入室メッセージ2行目（ブラウザ行）を組み立てる。
 * 例: "Mozilla/5.0 (Nintendo 3DS; U; ; ja) Version/1.7498.JP49回目:LAST LOGIN:01/02(Wed) 16:55"
 */
function buildBrowserLine(chat: Chat): string {
  // ua はサーバー観測値。保存前（楽観的更新中）のみ自分の UA で代用する。
  const ua =
    chat.ua || (chat.optimistic && typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const visitCount = chat.metadata?.visitCount;
  const lastLogin = chat.metadata?.lastLogin;

  let line = ua;
  if (visitCount) line += `${visitCount}回目`;
  if (lastLogin) line += `${visitCount ? ':' : ''}LAST LOGIN:${formatLegacyDateTime(lastLogin)}`;
  return line;
}

/** 管理人メッセージ専用のレンダリング（レガシー風） */
function AdminMessage({
  chat,
  showRoomName,
  onRoomClick,
}: {
  chat: Chat;
  showRoomName?: boolean;
  onRoomClick?: (roomId: RoomId) => void;
}) {
  const avatar = chat.metadata?.avatar;
  const userColor = chat.metadata?.userColor ?? '#ff69b4';
  const split = splitAdminMessage(chat.message);
  const isWelcome = WELCOME_PATTERN.test(chat.message);
  const browserLine = isWelcome ? buildBrowserLine(chat) : '';

  return (
    <div className="mb-1">
      {avatar && (
        <img
          src={`${import.meta.env.BASE_URL}avatars/${avatar}.gif`}
          alt={avatar}
          className="inline-block w-5 h-5 mr-1 align-middle"
          loading="lazy"
        />
      )}
      <span className="font-bold" style={{ color: chat.color }}>
        {chat.name}
      </span>
      <span className="font-bold text-gray-400 px-1">|&gt;</span>
      {split ? (
        <>
          <b className="font-bold" style={{ color: userColor, fontSize: '1.3em' }}>
            {split.userName}
          </b>
          <span className="font-bold" style={{ color: 'red' }}>
            {isWelcome ? `${split.rest}${PROFILE_SUFFIX}` : split.rest}
          </span>
        </>
      ) : (
        <span className="font-bold" style={{ color: 'red' }}>
          {isWelcome ? `${chat.message}${PROFILE_SUFFIX}` : chat.message}
        </span>
      )}
      {browserLine && (
        <>
          <br />
          <span className="text-[0.7em] text-gray-500 break-all">{browserLine}</span>
        </>
      )}
      <TimeStamp chat={chat} showRoomName={showRoomName} onRoomClick={onRoomClick} />
    </div>
  );
}

function ChatMessage({ chat, showRoomName, onRoomClick }: Props) {
  if (chat.metadata?.kind === 'admin') {
    return <AdminMessage chat={chat} showRoomName={showRoomName} onRoomClick={onRoomClick} />;
  }

  const avatar = chat.metadata?.avatar;

  return (
    <div className="mb-1">
      {avatar && (
        <img
          src={`${import.meta.env.BASE_URL}avatars/${avatar}.gif`}
          alt={avatar}
          className="inline-block w-5 h-5 mr-1 align-middle"
          loading="lazy"
        />
      )}
      <span className="font-bold" style={{ color: chat.color, fontSize: '1.08em' }}>
        {chat.name}
      </span>
      {chat.email ? (
        <a
          className="font-bold text-gray-400 underline text-blue-600 px-1"
          href={
            chat.email.startsWith('http://') || chat.email.startsWith('https://')
              ? chat.email
              : `mailto:${chat.email}`
          }
          title={chat.email}
          target="_blank"
          rel="noopener noreferrer"
        >
          {'>'}
        </a>
      ) : (
        <span className="font-bold text-gray-400 px-1">{'>'}</span>
      )}
      <MessageBody message={chat.message} chat={chat} />
      {LOOK_PATTERN.test(chat.message.trim()) && (
        // レガシーの rin.swf（18x18・12fps）を GIF に移植したもの
        <img
          src={`${import.meta.env.BASE_URL}rin.gif`}
          alt=""
          aria-hidden="true"
          width={18}
          height={18}
          className="inline-block ml-1 align-middle [image-rendering:pixelated]"
        />
      )}
      <TimeStamp chat={chat} showRoomName={showRoomName} onRoomClick={onRoomClick} />
    </div>
  );
}

export default memo(ChatMessage);
