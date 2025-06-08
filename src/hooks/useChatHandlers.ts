import { useCallback, useTransition } from "react";
import type { Chat, BroadcastMsg } from "../types";
import { useBroadcastChannel } from "./useBroadcastChannel";

export function useChatHandlers({
  name,
  color,
  email,
  myId,
  entered,
  setEntered,
  setChatLog,
  setShowRanking,
  setName,
  setMessage,
  save,
  clear,
  load,
}: {
  name: string;
  color: string;
  email: string;
  myId: string;
  entered: boolean;
  setEntered: (b: boolean) => void;
  setChatLog: (fn: (prev: Chat[]) => Chat[]) => void;
  setShowRanking: (b: boolean) => void;
  setName: (s: string) => void;
  setMessage: (s: string) => void;
  save: (log: Chat[]) => void;
  clear: () => void;
  load: () => Chat[];
}) {
  const [, startTransition] = useTransition();

  const channelRef = useBroadcastChannel<BroadcastMsg>(
    "yui_chat_room",
    useCallback(
      (data: BroadcastMsg) => {
        switch (data.type) {
          case "chat":
            startTransition(() => {
              setChatLog((prev) => {
                const log = [data.chat, ...prev];
                save(log);
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
            setChatLog(() => []);
            save([]);
            break;
        }
      },
      [entered, myId, name, color, save, setChatLog]
    )
  );

  // 入室
  const handleEnter = useCallback(
    async ({
      name: entryName,
      color: entryColor,
      email: entryEmail,
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

      setChatLog(() => [joinMsg, ...load()]);
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
    },
    [setEntered, setChatLog, load, myId, channelRef]
  );

  // 退室
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
    setShowRanking(false);
    setName("");
    setMessage("");
  }, [
    channelRef,
    myId,
    name,
    color,
    setEntered,
    setShowRanking,
    setName,
    setMessage,
  ]);

  // メッセージ送信
  const handleSend = useCallback(
    async (msg: string, chatLog: Chat[]) => {
      if (!msg.trim()) return;

      if (msg.trim() === "cut") {
        startTransition(() => {
          setChatLog((prev) => {
            const log = prev.filter((c) => !c.message.match(/img/i));
            save(log);
            return log;
          });
        });
        setMessage("");
        setShowRanking(false);
        return;
      }
      if (msg.trim() === "clear") {
        startTransition(() => {
          setChatLog(() => []);
          save([]);
        });
        channelRef.current?.postMessage({ type: "clear" });
        setMessage("");
        setShowRanking(false);
        return;
      }

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
        setChatLog(() => log);
        save(log);
        channelRef.current?.postMessage({ type: "chat", chat });
        setMessage("");
        setShowRanking(false);
      });
    },
    [name, color, email, setChatLog, save, channelRef, setMessage, setShowRanking]
  );

  // チャット履歴再読み込み
  const handleReload = useCallback(() => setChatLog(() => load()), [setChatLog, load]);

  return {
    channelRef,
    handleEnter,
    handleExit,
    handleSend,
    handleReload,
  };
}
