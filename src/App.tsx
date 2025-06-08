import { useState, lazy, Suspense, useId } from "react";
import { useChatLog } from "./hooks/useChatLog";
import { useParticipants } from "./hooks/useParticipants";
import { useChatHandlers } from "./hooks/useChatHandlers";
import { saveChatLog } from "./utils/storage";
import ChatRoom from "./components/ChatRoom";
import EntryForm from "./components/EntryForm";
import RetroSplitter from "./components/RetroSplitter";
import ChatRanking from "./components/ChatRanking";
const ChatLogList = lazy(() => import("./components/ChatLogList.lazy"));

export default function App() {
  const { chatLog, clear, setChatLog } = useChatLog();
  const participants = useParticipants(chatLog);
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ff69b4");
  const [message, setMessage] = useState("");
  const [windowRows, setWindowRows] = useState(30);
  const [showRanking, setShowRanking] = useState(false);
  const [email, setEmail] = useState("");
  const myId = useId();

  // useChatHandlersでロジックを集約
  const {
    handleEnter,
    handleExit,
    handleSend,
    handleReload,
  } = useChatHandlers({
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
    save: saveChatLog,
    clear,
    load: () => chatLog,
  });

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
              onSend={(msg) => handleSend(msg, chatLog)}
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
            <div className="relative">
              <button
                className="absolute right-0 top-0 text-xs underline text-blue-700 px-2 py-1"
                onClick={() => setShowRanking(false)}
              >
                戻る
              </button>
              <ChatRanking chatLog={chatLog} />
            </div>
          )
        }
      />
    </div>
  );
}
