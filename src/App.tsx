import { useState, lazy, Suspense, useId } from 'react';
import { useChatLog } from '@features/chat/hooks/useChatLog';
import { useParticipants } from '@features/chat/hooks/useParticipants';
import { useChatHandlers } from '@features/chat/hooks/useChatHandlers';
import { useSEO, usePageView } from '@shared/hooks/useSEO';
import ChatRoom from '@features/chat/components/ChatRoom';
import EntryForm from '@features/chat/components/EntryForm';
import RetroSplitter from '@features/chat/components/RetroSplitter';
import ChatRanking from '@features/chat/components/ChatRanking';
import { TermsModal } from '@shared/components';
const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'));

export default function App() {
  // SEO対策
  useSEO({
    title: 'ゆいちゃっとTS - 無料お気楽チャット',
    description:
      'ゆいちゃっとTSは放課後学生タウンの雰囲気を楽しめる無料のお気楽チャットです。リアルタイムでみんなとおしゃべりを楽しもう！ブラウザですぐに使える簡単チャット。',
    keywords: [
      'ゆいちゃっとTS',
      '放課後学生タウン',
      'お気楽チャット',
      '無料チャット',
      'ブラウザチャット',
      'リアルタイムチャット',
      '学生チャット',
      'オンラインチャット',
    ],
    canonical: 'https://isrnao.github.io/yui-chat-ts/',
  });

  usePageView('ホーム - ゆいちゃっとTS');
  const { chatLog, setChatLog, addOptimistic, mergeChat } = useChatLog();
  const participants = useParticipants(chatLog);
  const [entered, setEntered] = useState(false);
  const [showTerms, setShowTerms] = useState(() => localStorage.getItem('agreed-terms') !== 'true');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ff69b4');
  const [message, setMessage] = useState('');
  const [windowRows, setWindowRows] = useState(30);
  const [showRanking, setShowRanking] = useState(false);
  const [email, setEmail] = useState('');
  const myId = useId();

  const { handleEnter, handleExit, handleSend, handleReload } = useChatHandlers({
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
    addOptimistic,
    mergeChat,
  });

  return (
    <>
      <TermsModal
        open={showTerms}
        onAgree={() => {
          localStorage.setItem('agreed-terms', 'true');
          setShowTerms(false);
        }}
      />
      <main className="flex flex-col min-h-screen bg-[var(--yui-green)]" role="main">
        <header className="sr-only">
          <h1>ゆいちゃっとTS - 無料お気楽チャット</h1>
          <p>リアルタイムでみんなとおしゃべりを楽しめる無料のブラウザチャットです。</p>
        </header>
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
                onSend={(msg) => handleSend(msg)}
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
      </main>
    </>
  );
}
