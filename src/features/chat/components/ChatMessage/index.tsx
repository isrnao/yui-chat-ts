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

export default function ChatMessage({ chat }: Props) {
  const avatar = chat.metadata?.avatar;

  return (
    <>
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
            href={`mailto:${chat.email}`}
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
    </>
  );
}
