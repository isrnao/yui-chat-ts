import React, {
  Suspense,
  useEffect,
  useState,
  useTransition,
  useCallback,
  useMemo,
} from "react";
import { useBroadcastChannel } from "./useBroadcastChannel";

const EntryForm = React.lazy(() => import("./EntryForm"));
const ChatRoom = React.lazy(() => import("./ChatRoom"));

export type Chat = {
  id: string;
  name: string;
  color: string;
  message: string;
  time: number;
};

const STORAGE_KEY = "yui_chat_dat";
const BC_NAME = "yui_chat_room";
const MAX_CHAT_LOG = 2000;

// localStorage utility
const loadChatLog = (): Chat[] => {
  const dat = localStorage.getItem(STORAGE_KEY);
  if (!dat) return [];
  try {
    return JSON.parse(dat) as Chat[];
  } catch {
    return [];
  }
};
const saveChatLog = (log: Chat[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(0, MAX_CHAT_LOG)));

export default function YuiChat() {
  // state
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ff69b4");
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [windowRows, setWindowRows] = useState(30);

  // 非同期UI更新 (React 18/19)
  const [isPending, startTransition] = useTransition();

  // BroadcastChannel（依存を useCallback で管理）
  const onBroadcast = useCallback(
    (data: { type: string; chat: Chat }) => {
      if (data?.type === "chat" && data.chat) {
        startTransition(() => {
          setChatLog((prev) => {
            const log = [data.chat, ...prev];
            saveChatLog(log);
            return log;
          });
        });
      }
    },
    []
  );
  const channelRef = useBroadcastChannel<{ type: string; chat: Chat }>(
    BC_NAME,
    onBroadcast
  );

  // 入室
  const handleEnter = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name) return;
      setEntered(true);
      setChatLog(loadChatLog());
    },
    [name]
  );

  // メッセージ送信
  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim()) return;
      startTransition(() => {
        const chat: Chat = {
          id: Math.random().toString(36).slice(2),
          name,
          color,
          message,
          time: Date.now(),
        };
        const log = [chat, ...chatLog];
        setChatLog(log);
        saveChatLog(log);
        channelRef.current?.postMessage({ type: "chat", chat });
        setMessage("");
      });
    },
    [name, color, message, chatLog, channelRef]
  );

  // ログの初期化（入室 or 行数変更時のみ）
  useEffect(() => {
    startTransition(() => {
      setChatLog(loadChatLog());
    });
  }, [entered, windowRows]);


  // 退室
  const handleExit = useCallback(() => {
    setEntered(false);
    setChatLog([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // fallbackは画面維持（ローディング等は不要・UI最小化）
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "#A1FE9F" }} />
      }
    >
      {entered ? (
        <ChatRoom
          name={name}
          color={color}
          windowRows={windowRows}
          chatLog={chatLog}
          setChatLog={setChatLog}
          message={message}
          setMessage={setMessage}
          onExit={handleExit}
          onSend={handleSend}
          isPending={isPending}
        />
      ) : (
        <EntryForm
          name={name}
          setName={setName}
          color={color}
          setColor={setColor}
          windowRows={windowRows}
          setWindowRows={setWindowRows}
          onEnter={handleEnter}
          chatLog={chatLog}
        />
      )}
    </Suspense>
  );
}
