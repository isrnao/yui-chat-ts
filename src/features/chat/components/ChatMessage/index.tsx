import { memo } from 'react';
import { formatTime } from '@shared/utils/format';
import { parseMessageSegments } from '@features/chat/utils/urlLinker';
import { FONT_SIZE_CSS, FONT_COLOR_CSS } from '@features/chat/types';
import type { Chat } from '@features/chat/types';

type Props = {
  chat: Chat;
};

// 楽観的更新時の時刻表示を生成
function getTimeDisplay(chat: Chat): string {
  if (chat.optimistic) {
    return '送信中...';
  }
  return formatTime(chat.time);
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
function AdminMessage({ chat }: { chat: Chat }) {
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
      <span className={`ml-2 text-xs text-gray-400 ${chat.optimistic ? 'animate-pulse' : ''}`}>
        ({getTimeDisplay(chat)})
      </span>
    </div>
  );
}

function ChatMessage({ chat }: Props) {
  // 管理人メッセージは専用レンダリング
  if (chat.metadata?.kind === 'admin') {
    return <AdminMessage chat={chat} />;
  }

  const avatar = chat.metadata?.avatar;

  return (
    <div className="mb-1">
      {/* アバター画像（metadata.avatar が存在する場合のみ表示） */}
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
      <span className={`ml-2 text-xs text-gray-400 ${chat.optimistic ? 'animate-pulse' : ''}`}>
        ({getTimeDisplay(chat)})
      </span>
    </div>
  );
}

export default memo(ChatMessage);
