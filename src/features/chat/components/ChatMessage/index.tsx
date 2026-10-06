import { memo } from 'react';
import type { HTMLAttributes } from 'react';
import { formatLegacyDateTime } from '@shared/utils/format';
import { parseMessageSegments } from '@features/chat/utils/urlLinker';
import { FONT_SIZE_CSS, FONT_COLOR_CSS } from '@features/chat/types';
import type { Chat } from '@features/chat/types';
import { isRoomId, getRoomMeta, type RoomId } from '@features/chat/rooms';
import { useDoubleTap } from '@features/chat/hooks/useDoubleTap';
import { ROW_UUID_ATTR } from '@features/chat/utils/filterTransition';
import { readAdminEvent, splitAdminMessage } from '@features/chat/utils/adminMessage';
import {
  FILTER_NAME_ATTR,
  FILTER_TARGET_ATTR,
  resolveFilterRequest,
  type FilterRequest,
} from '@features/chat/utils/filterRequest';

type Props = {
  chat: Chat;
  showRoomName?: boolean;
  onRoomClick?: (roomId: RoomId) => void;
  /** 画面外にある間は描画を省く（ログが長いときに ChatLogList が付ける） */
  deferOffscreen?: boolean;
  /**
   * 行のダブルタップ（ダブルクリック）でフィルタの確認を開く（.kiro/specs/chat-ip-mute）。名前を押せば名前、本文を
   * 押せば言葉、それ以外は伏せ字の IP のフィルタになる。ChatLogList がフィルタの起点にできる行（Mutable_Row）にだけ
   * 渡す。全行で同じ関数なので memo は崩れない
   */
  onFilterRequest?: (request: FilterRequest) => void;
};

/**
 * 発言 1 行の外枠のクラス。deferOffscreen のときは content-visibility: auto で画面外の行の
 * レイアウトと描画を省き、高さは一度描いた実寸（初回は 1 行ぶん）で見積もる
 * （.kiro/specs/react-2026-refactoring Requirement 17）
 */
function rowClassName(deferOffscreen?: boolean): string {
  return deferOffscreen
    ? 'mb-1 [content-visibility:auto] [contain-intrinsic-size:auto_1.5em]'
    : 'mb-1';
}

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
function MessageBody({
  message,
  chat,
  filterable,
}: {
  message: string;
  chat: Chat;
  /** ダブルタップで言葉のフィルタを開く本文か */
  filterable?: boolean;
}) {
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
    <span
      className="ml-1 text-gray-700"
      style={style}
      {...(filterable ? { [FILTER_TARGET_ATTR]: 'message' } : undefined)}
    >
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

const WELCOME_PATTERN = /さん[、,]\s*Welcome to/;
/** レガシーの look コマンド。発言の右にきらめきを出す */
const LOOK_PATTERN = /^look$/i;
const PROFILE_SUFFIX = ' プロフィールも作ってみてね';
/** save-chat の機能要求受付返信「…（Issue #112）」の Issue 番号部分 */
const ISSUE_REF_PATTERN = /(Issue #(\d+))/;
const ISSUE_BASE_URL = 'https://github.com/isrnao/yui-chat-ts/issues/';

/**
 * 管理人メッセージ中の "Issue #N" を GitHub Issue へのリンクにする。
 * リンク先は自リポジトリに固定し、番号だけを本文から取る（任意 URL に飛ばせないように）。
 */
function AdminText({ message }: { message: string }) {
  const [before, label, number, after] = message.split(ISSUE_REF_PATTERN);
  if (label === undefined) return <>{message}</>;
  return (
    <>
      {before}
      <a
        href={`${ISSUE_BASE_URL}${number}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline"
      >
        {label}
      </a>
      {after}
    </>
  );
}

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

/** 行の外枠に付ける属性（クラスと、ダブルタップでフィルタできる行の handlers） */
type RowProps = HTMLAttributes<HTMLDivElement>;

/** 管理人メッセージ専用のレンダリング（レガシー風） */
function AdminMessage({
  chat,
  showRoomName,
  onRoomClick,
  rowProps,
  filterable,
}: Pick<Props, 'chat' | 'showRoomName' | 'onRoomClick'> & {
  rowProps: RowProps;
  /** 入室者の名前をダブルタップで名前のフィルタにするか */
  filterable?: boolean;
}) {
  const avatar = chat.metadata?.avatar;
  const userColor = chat.metadata?.userColor ?? '#ff69b4';
  // 誰が入った・出たかは metadata の構造で読み、構造の無い古い行だけ本文で読む（Issue #183）
  // （入退室と読めない管理人の発言は、以前と同じく本文で分ける）
  const admin = readAdminEvent(chat);
  const split = admin
    ? { userName: admin.name, rest: admin.rest }
    : splitAdminMessage(chat.message);
  const isWelcome = admin ? admin.event === 'enter' : WELCOME_PATTERN.test(chat.message);
  const browserLine = isWelcome ? buildBrowserLine(chat) : '';

  return (
    <div {...rowProps}>
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
          <b
            className="font-bold"
            style={{ color: userColor, fontSize: '1.3em' }}
            {...(filterable
              ? { [FILTER_TARGET_ATTR]: 'name', [FILTER_NAME_ATTR]: split.userName }
              : undefined)}
          >
            {split.userName}
          </b>
          <span className="font-bold" style={{ color: 'red' }}>
            {isWelcome ? `${split.rest}${PROFILE_SUFFIX}` : split.rest}
          </span>
        </>
      ) : (
        <span className="font-bold" style={{ color: 'red' }}>
          {isWelcome ? `${chat.message}${PROFILE_SUFFIX}` : <AdminText message={chat.message} />}
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

function ChatMessage({ chat, showRoomName, onRoomClick, deferOffscreen, onFilterRequest }: Props) {
  const filterable = onFilterRequest !== undefined;
  const doubleTap = useDoubleTap({
    enabled: filterable,
    onDoubleTap: (row, target) => {
      const request = resolveFilterRequest(chat, row, target);
      if (request) onFilterRequest?.(request);
    },
    // 本文の上ではダブルクリックで選ばれた単語を、言葉のフィルタの最初の値に使う
    keepSelectionIn: `[${FILTER_TARGET_ATTR}="message"]`,
  });

  // ダブルタップできる行だけに handlers とクラスを付ける（クラスはダブルタップでの拡大を止める CSS）。
  // 管理人の入退室メッセージも、入室した本人の IP を持つのでフィルタできる
  // data-chat-uuid は、フィルタの View Transition で見えている行に名前を付けるときの目印（filterTransition.ts）
  const rowProps: RowProps & { [ROW_UUID_ATTR]: string } = filterable
    ? {
        className: `${rowClassName(deferOffscreen)} chat-row-filterable`,
        [ROW_UUID_ATTR]: chat.uuid,
        ...doubleTap,
      }
    : { className: rowClassName(deferOffscreen), [ROW_UUID_ATTR]: chat.uuid };

  if (chat.metadata?.kind === 'admin') {
    return (
      <AdminMessage
        chat={chat}
        showRoomName={showRoomName}
        onRoomClick={onRoomClick}
        rowProps={rowProps}
        filterable={filterable}
      />
    );
  }

  const avatar = chat.metadata?.avatar;

  return (
    <div {...rowProps}>
      {avatar && (
        <img
          src={`${import.meta.env.BASE_URL}avatars/${avatar}.gif`}
          alt={avatar}
          className="inline-block w-5 h-5 mr-1 align-middle"
          loading="lazy"
        />
      )}
      <span
        className="font-bold"
        style={{ color: chat.color, fontSize: '1.08em' }}
        // 巫女の名前はおみくじを呼んだ人の名前ではないので、名前のフィルタにしない（IP のフィルタになる）
        {...(filterable && chat.metadata?.kind !== 'fortune'
          ? { [FILTER_TARGET_ATTR]: 'name' }
          : undefined)}
      >
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
      <MessageBody message={chat.message} chat={chat} filterable={filterable} />
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
