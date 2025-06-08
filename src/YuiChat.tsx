import {
  useId,
  useState,
  useTransition,
  useDeferredValue,
  useEffect,
  lazy,
  Suspense,
  useCallback,
} from "react";
import { useBroadcastChannel } from "./hooks/useBroadcastChannel";
import type { Chat, Participant, BroadcastMsg } from "./types";
import EntryForm from "./EntryForm";
import ChatRoom from "./ChatRoom";
import ChatRanking from "./ChatRanking";
import RetroSplitter from "./RetroSplitter";

const ChatLogList = lazy(() => import("./ChatLogList"));

const STORAGE_KEY = "yui_chat_dat";
const BC_NAME = "yui_chat_room";
const MAX_CHAT_LOG = 2000;
const DEFAULT_ROWS = 30;

// ---- ストレージ操作を関数化
function loadChatLog(): Chat[] {
  try {
    const dat = localStorage.getItem(STORAGE_KEY);
    return dat ? JSON.parse(dat) : [];
  } catch {
    return [];
  }
}
function saveChatLog(log: Chat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(0, MAX_CHAT_LOG)));
}
function clearChatLog() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---- 参加者計算を関数化
function getRecentParticipants(chatLog: Chat[]): Participant[] {
  const now = Date.now();
  return Array.from(
    chatLog
      .filter(
        (c) => c.name && c.color && !c.system && now - c.time <= 5 * 60 * 1000,
      )
      .reduce((map, c) => {
        map.set(c.name, { id: c.name, name: c.name, color: c.color });
        return map;
      }, new Map<string, Participant>())
      .values(),
  );
}

// ---- YuiChat本体
export default function YuiChat() {
  const myId = useId();

  // --- 状態（まとめて初期化しやすいよう構造化も可）
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ff69b4");
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [windowRows, setWindowRows] = useState(DEFAULT_ROWS);
  const [showRanking, setShowRanking] = useState(false);
  const [email, setEmail] = useState("");

  // --- 高速・緊急度低いUI用
  const [, startTransition] = useTransition();

  // ---- 参加者リスト(応答性UP: useDeferredValue)
  const participants = useDeferredValue(getRecentParticipants(chatLog));

  // ---- BroadcastChannelのrefを1つだけ持つ
  const channelRef = useBroadcastChannel<BroadcastMsg>(
    BC_NAME,
    useCallback(
      (data: BroadcastMsg) => {
        switch (data.type) {
          case "chat":
            startTransition(() => {
              setChatLog((prev) => {
                const log = [data.chat, ...prev];
                saveChatLog(log);
                return log;
              });
            });
            break;
          case "req-presence":
            if (entered) {
              channelRef.current?.postMessage({
                type: "join",
                user: { id: myId, name, color },
              });
            }
            break;
          case "clear":
            setChatLog([]);
            saveChatLog([]);
            break;
        }
      },
      // channelRefはuseCallback外で宣言されているため依存配列に含めない
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [entered, myId, name, color],
    ),
  );

  // ---- 入室ロジック
  const handleEnter = async ({
    name: entryName,
    color: entryColor,
  }: {
    name: string;
    color: string;
    email: string;
  }) => {
    if (!entryName.trim()) throw new Error("おなまえ必須");
    setEntered(true);

    const joinMsg: Chat = {
      id: "sys-" + Math.random().toString(36).slice(2),
      name: "管理人",
      color: "#0000ff",
      message: `${entryName}さん、おいでやすぅ。`,
      time: Date.now(),
      system: true,
    };

    setChatLog([joinMsg, ...loadChatLog()]);
    setTimeout(() => {
      channelRef.current?.postMessage({
        type: "join",
        user: { id: myId, name: entryName, color: entryColor },
      });
    }, 10);
    setTimeout(() => {
      channelRef.current?.postMessage({ type: "req-presence" });
    }, 30);
    channelRef.current?.postMessage({ type: "chat", chat: joinMsg });
  };

  // ---- 退室ロジック
  const handleExit = useCallback(() => {
    channelRef.current?.postMessage({
      type: "chat",
      chat: {
        id: "sys-" + Math.random().toString(36).slice(2),
        name: "管理人",
        color: "#0000ff",
        message: `${name}さん、またきておくれやすぅ。`,
        time: Date.now(),
        system: true,
      },
    });
    channelRef.current?.postMessage({
      type: "leave",
      user: { id: myId, name, color },
    });
    setEntered(false);
    setChatLog([]);
    clearChatLog();
    setShowRanking(false);
    setName("");
    setMessage("");
    setColor("#ff69b4");
  }, [myId, name, color, channelRef]);

  // ---- メッセージ送信ロジック
  const handleSend = useCallback(
    async (msg: string) => {
      if (!msg.trim()) return;

      // コマンド
      if (msg.trim() === "cut") {
        startTransition(() => {
          setChatLog((prev) => {
            const log = prev.filter((c) => !c.message.match(/img/i));
            saveChatLog(log);
            return log;
          });
        });
        setMessage("");
        setShowRanking(false);
        return;
      }
      if (msg.trim() === "clear") {
        startTransition(() => {
          setChatLog([]);
          saveChatLog([]);
        });
        channelRef.current?.postMessage({ type: "clear" });
        setMessage("");
        setShowRanking(false);
        return;
      }

      // 通常メッセージ
      startTransition(() => {
        const chat: Chat = {
          id: Math.random().toString(36).slice(2),
          name,
          color,
          message: msg,
          time: Date.now(),
          email,
        };
        const log = [chat, ...chatLog];
        setChatLog(log);
        saveChatLog(log);
        channelRef.current?.postMessage({ type: "chat", chat });
        setMessage("");
        setShowRanking(false);
      });
    },
    [name, color, chatLog, channelRef, windowRows],
  );

  // ---- チャット履歴再読み込み
  const handleReload = useCallback(() => setChatLog(loadChatLog()), []);

  // ---- 入室前だけストレージから再読込
  useEffect(() => {
    if (!entered) setChatLog(loadChatLog());
  }, [entered]);

  // ---- UI
  return (
    <div className="flex flex-col min-h-screen bg-[var(--yui-green)]">
      <RetroSplitter
        minTop={100}
        minBottom={100}
        top={
          entered ? (
            <ChatRoom
              message={message}
              setMessage={setMessage}
              chatLog={chatLog}
              windowRows={windowRows}
              setWindowRows={setWindowRows}
              onExit={handleExit}
              onSend={handleSend}
              onReload={handleReload}
              onShowRanking={() => setShowRanking(true)}
            />
          ) : (
            <EntryForm
              name={name}
              setName={setName}
              color={color}
              setColor={setColor}
              email={email}
              setEmail={setEmail}
              windowRows={windowRows}
              setWindowRows={setWindowRows}
              onEnter={handleEnter}
            />
          )
        }
        bottom={
          !showRanking ? (
            <Suspense
              fallback={
                <div className="text-gray-400 mt-8 animate-pulse">
                  チャットログを読み込み中...
                </div>
              }
            >
              <ChatLogList
                chatLog={chatLog}
                windowRows={windowRows}
                participants={participants}
              />
            </Suspense>
          ) : (
            <div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setShowRanking(false);
                }}
                className="text-xs text-blue-700 underline cursor-pointer mb-2 block"
                style={{ marginLeft: 2 }}
              >
                [チャットへ戻る]
              </a>
              <ChatRanking chatLog={chatLog} />
            </div>
          )
        }
      />
    </div>
  );
}
