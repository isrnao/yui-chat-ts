import {
  useId,
  useState,
  useTransition,
  useDeferredValue,
  useEffect,
} from "react";
import { useBroadcastChannel } from "./hooks/useBroadcastChannel";
import type { Chat, Participant, BroadcastMsg } from "./types";
import EntryForm from "./EntryForm";
import ChatRoom from "./ChatRoom";
import { lazy, Suspense } from "react";

const ChatLogList = lazy(() => import("./ChatLogList"));

const STORAGE_KEY = "yui_chat_dat";
const BC_NAME = "yui_chat_room";
const MAX_CHAT_LOG = 2000;

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

export default function YuiChat() {
  const myId = useId();

  // ローカル状態
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ff69b4");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [autoClear, setAutoClear] = useState(true);
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [windowRows, setWindowRows] = useState(30);
  const [ranking, setRanking] = useState<Map<string, number>>(new Map());
  const [isPending, startTransition] = useTransition();

  // 直近5分参加者
  const now = Date.now();
  const participants = useDeferredValue(
    Array.from(
      chatLog
        .filter(c => c.name && c.color && !c.system && now - c.time <= 5 * 60 * 1000)
        .reduce((map, c) => {
          map.set(c.name, { id: c.name, name: c.name, color: c.color });
          return map;
        }, new Map<string, Participant>())
        .values()
    )
  );

  // BroadcastChannel
  const channelRef = useBroadcastChannel<BroadcastMsg>(BC_NAME, (data) => {
    switch (data.type) {
      case "chat":
        startTransition(() => {
          setChatLog(prev => {
            const log = [data.chat, ...prev];
            saveChatLog(log);
            return log;
          });
          if (!data.chat.system && data.chat.name) {
            setRanking(prev => {
              const next = new Map(prev);
              next.set(data.chat.name, (next.get(data.chat.name) ?? 0) + 1);
              return next;
            });
          }
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
  });

  // 入室
  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setEntered(true);
    const joinMsg: Chat = {
      id: "sys-" + Math.random().toString(36).slice(2),
      name: "管理人",
      color: "#0000ff",
      message: `${name}さん、おいでやすぅ。`,
      time: Date.now(),
      system: true,
    };
    setChatLog([joinMsg, ...loadChatLog()]);

    setTimeout(() => {
      channelRef.current?.postMessage({
        type: "join",
        user: { id: myId, name, color },
      });
    }, 10);
    setTimeout(() => {
      channelRef.current?.postMessage({ type: "req-presence" });
    }, 30);
    channelRef.current?.postMessage({ type: "chat", chat: joinMsg });
  };

  // 退室
  const handleExit = () => {
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
    setRanking(new Map());
    localStorage.removeItem(STORAGE_KEY);
  };

  // メッセージ送信
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    // コマンド処理
    if (message.trim() === "cut") {
      startTransition(() => {
        setChatLog(prev => {
          const log = prev.filter(c => !c.message.match(/img/i));
          saveChatLog(log);
          return log;
        });
      });
      setMessage("");
      return;
    }
    if (message.trim() === "clear") {
      startTransition(() => {
        setChatLog([]);
        saveChatLog([]);
      });
      channelRef.current?.postMessage({ type: "clear" });
      setMessage("");
      return;
    }

    // 通常
    startTransition(() => {
      const chat: Chat = {
        id: Math.random().toString(36).slice(2),
        name,
        color,
        message,
        time: Date.now(),
        email: email.trim() || undefined,
      };
      const log = [chat, ...chatLog];
      setChatLog(log);
      saveChatLog(log);
      channelRef.current?.postMessage({ type: "chat", chat });
      setRanking(prev => {
        const next = new Map(prev);
        next.set(name, (next.get(name) ?? 0) + 1);
        return next;
      });
      if (autoClear) setMessage("");
    });
  };

  // ログ再読込
  const handleReload = () => setChatLog(loadChatLog());

  // EntryForm表示時はlocalStorageから最新チャットログ
  useEffect(() => {
    if (!entered) setChatLog(loadChatLog());
  }, [entered]);

  return (
    <div
      className="flex flex-col"
    >
      <header className="mb-1 text-2xl font-bold text-yui-pink"
        style={{ fontFamily: "var(--tw-font-yui, sans-serif)" }}>
        ゆいちゃっと
      </header>
      {entered ? (
        <ChatRoom
          name={name}
          color={color}
          email={email}
          message={message}
          setMessage={setMessage}
          chatLog={chatLog}
          setChatLog={setChatLog}
          windowRows={windowRows}
          onExit={handleExit}
          onSend={handleSend}
          isPending={isPending}
          participants={participants}
          ranking={ranking}
          onReload={handleReload}
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
          chatLog={chatLog}
          autoClear={autoClear}
          setAutoClear={setAutoClear}
        />
      )}
      <hr className="ie-hr" />
      <Suspense fallback={<div className="text-gray-400 mt-8">チャットログを読み込み中...</div>}>
        <ChatLogList chatLog={chatLog} windowRows={windowRows} participants={participants} />
      </Suspense>
    </div>
  );
}
