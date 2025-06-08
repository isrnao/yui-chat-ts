import { Suspense, useCallback, useEffect, useMemo, useState, useTransition, lazy } from "react";
import { useBroadcastChannel } from "./useBroadcastChannel";

const EntryForm = lazy(() => import("./EntryForm"));
const ChatRoom = lazy(() => import("./ChatRoom"));

export type Chat = {
  id: string;
  name: string;
  color: string;
  message: string;
  time: number;
  email?: string;
  system?: boolean;
};

export type Participant = {
  id: string;
  name: string;
  color: string;
};

const STORAGE_KEY = "yui_chat_dat";
const BC_NAME = "yui_chat_room";
const MAX_CHAT_LOG = 2000;

type BroadcastMsg =
  | { type: "chat"; chat: Chat }
  | { type: "join"; user: Participant }
  | { type: "leave"; user: Participant }
  | { type: "req-presence" }
  | { type: "clear" };

const loadChatLog = (): Chat[] => {
  try {
    const dat = localStorage.getItem(STORAGE_KEY);
    return dat ? (JSON.parse(dat) as Chat[]) : [];
  } catch {
    return [];
  }
};
const saveChatLog = (log: Chat[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(0, MAX_CHAT_LOG)));

export default function YuiChat() {
  const myId = useMemo(() => Math.random().toString(36).slice(2), []);
  // state
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ff69b4");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [autoClear, setAutoClear] = useState(true);
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [windowRows, setWindowRows] = useState(30);

  // 参加者管理
  const [participants, setParticipants] = useState<Participant[]>([]);
  // 発言ランキング
  const [ranking, setRanking] = useState<Map<string, number>>(new Map());

  // 非同期UI更新
  const [isPending, startTransition] = useTransition();

  // BroadcastChannel
  const onBroadcast = useCallback(
    (data: BroadcastMsg) => {
      if (data.type === "chat") {
        startTransition(() => {
          setChatLog((prev) => {
            const log = [data.chat, ...prev];
            saveChatLog(log);
            return log;
          });
          if (!data.chat.system && data.chat.name) {
            setRanking((prev) => {
              const next = new Map(prev);
              next.set(data.chat.name, (next.get(data.chat.name) ?? 0) + 1);
              return next;
            });
          }
        });
      } else if (data.type === "join") {
        setParticipants((prev) => {
          // すでにいる場合は色だけ更新
          const others = prev.filter((p) => p.id !== data.user.id);
          return [...others, data.user];
        });
      } else if (data.type === "leave") {
        setParticipants((prev) =>
          prev.filter((p) => p.id !== data.user.id)
        );
      } else if (data.type === "req-presence") {
        // 自分が入室中なら返答
        if (entered) {
          channelRef.current?.postMessage({
            type: "join",
            user: { id: myId, name, color },
          });
        }
      } else if (data.type === "clear") {
        setChatLog([]);
        saveChatLog([]);
      }
    },
    [entered, myId, name, color]
  );

  const channelRef = useBroadcastChannel<BroadcastMsg>(BC_NAME, onBroadcast);

  // 入室
  const [pendingJoinMsg, setPendingJoinMsg] = useState<Chat | null>(null);
  const handleEnter = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      // 参加メッセージ（管理人による「入室」案内）
      const joinMsg: Chat = {
        id: "sys-" + Math.random().toString(36).slice(2),
        name: "管理人",
        color: "#0000ff",
        message: `${name}さん、おいでやすぅ。`,
        time: Date.now(),
        system: true,
      };
      setPendingJoinMsg(joinMsg); // useEffectで処理
      setEntered(true);
      // 参加ブロードキャスト
      setTimeout(() => {
        channelRef.current?.postMessage({
          type: "join",
          user: { id: myId, name, color },
        });
      }, 10);
      setTimeout(() => {
        // 既存参加者に問合せ
        channelRef.current?.postMessage({ type: "req-presence" });
      }, 30);
      // 他の参加者にも通知
      channelRef.current?.postMessage({ type: "chat", chat: joinMsg });
    },
    [name, color, myId, channelRef]
  );

  // 退室
  const handleExit = useCallback(() => {
    // システムメッセージ追加
    const sysMsg: Chat = {
      id: "sys-" + Math.random().toString(36).slice(2),
      name: "管理人",
      color: "#0000ff",
      message: `${name}さん、またきておくれやすぅ。`,
      time: Date.now(),
      system: true,
    };
    channelRef.current?.postMessage({ type: "chat", chat: sysMsg });
    channelRef.current?.postMessage({
      type: "leave",
      user: { id: myId, name, color },
    });
    setEntered(false);
    setChatLog([]);
    setRanking(new Map());
    localStorage.removeItem(STORAGE_KEY);
  }, [name, color, myId, channelRef]);

  // ログの初期化
  useEffect(() => {
    if (entered) {
      if (pendingJoinMsg) {
        const loaded = loadChatLog();
        setChatLog([pendingJoinMsg, ...loaded]);
        setPendingJoinMsg(null);
      } else {
        setChatLog(loadChatLog());
      }
    }
  }, [entered, windowRows]);

  // 参加者を入室時にリセット
  useEffect(() => {
    if (!entered) setParticipants([]);
  }, [entered]);

  // メッセージ送信（コマンド対応）
  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim()) return;
      // コマンド：cut
      if (message.trim() === "cut") {
        startTransition(() => {
          setChatLog((prev) => {
            const log = prev.filter((c) => !c.message.match(/img/i));
            saveChatLog(log);
            return log;
          });
        });
        setMessage("");
        return;
      }
      // コマンド：clear
      if (message.trim() === "clear") {
        startTransition(() => {
          setChatLog([]);
          saveChatLog([]);
        });
        channelRef.current?.postMessage({ type: "clear" });
        setMessage("");
        return;
      }
      // 発言
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
        setRanking((prev) => {
          const next = new Map(prev);
          next.set(name, (next.get(name) ?? 0) + 1);
          return next;
        });
        if (autoClear) setMessage("");
      });
    },
    [name, color, message, email, chatLog, channelRef, autoClear]
  );

  // リロードボタン用
  const handleReload = useCallback(() => {
    setChatLog(loadChatLog());
  }, []);

  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#A1FE9F" }} />}>
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
    </Suspense>
  );
}
