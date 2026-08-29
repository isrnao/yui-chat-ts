import { memo } from 'react';
import { formatLegacyDateTime, maskIpAddress } from '@shared/utils/format';
import { parseMessageSegments } from '@features/chat/utils/urlLinker';
import { FONT_SIZE_CSS, FONT_COLOR_CSS } from '@features/chat/types';
import type { Chat } from '@features/chat/types';
import { isRoomId, getRoomMeta, type RoomId } from '@features/chat/rooms';

type Props = {
  chat: Chat;
  showRoomName?: boolean;
  onRoomClick?: (roomId: RoomId) => void;
};

/** レガシー互換の時刻表示: "01/02(Wed) 20:10 219.107.106.*"（IP は末尾を伏せる） */
function getTimeDisplay(chat: Chat): string {
  if (chat.optimistic) return '送信中...';
  const stamp = formatLegacyDateTime(chat.time);
  const ip = maskIpAddress(chat.ip);
  return ip ? `${stamp} ${ip}` : stamp;
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

/** 発言末尾の "(01/02(Wed) 20:10 219.107.106.253)" 表示 */
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
            {split.rest}
          </span>
        </>
      ) : (
        <span className="font-bold" style={{ color: 'red' }}>
          {chat.message}
        </span>
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
      <TimeStamp chat={chat} showRoomName={showRoomName} onRoomClick={onRoomClick} />
    </div>
  );
}

export default memo(ChatMessage);
