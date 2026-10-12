import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/App.css';
import TwoShotForm from '../../../src/features/two-shot-chat/components/ChatForm';
import TwoShotFrame from '../../../src/features/two-shot-chat/components/FrameLayout';
import type { AutoSeconds } from '../../../src/features/two-shot-chat/config';
import TopPage from '../../../src/features/top/TopPage';
import ChanariChatRoom from '../../../src/features/chanari-chat/components/ChanariChatRoom';
import '../../../src/features/chanari-chat/styles/chanari.css';
import ChatLogList from '../../../src/features/chat/components/ChatLogList';
import { useIpFilter } from '../../../src/features/chat/hooks/useIpFilter';
import type { Chat } from '../../../src/features/chat/types';
import EntryForm from '../../../src/features/chat/components/EntryForm';
import ChatRoom from '../../../src/features/chat/components/ChatRoom';
import FilterConfirmDialog from '../../../src/features/chat/components/FilterConfirmDialog';
import FilterListDialog from '../../../src/features/chat/components/FilterListDialog';
import RetroSplitter from '../../../src/features/chat/components/RetroSplitter';

const fixtureChats: Chat[] = Array.from({ length: 1000 }, (_, i) => ({
  uuid: `fixture-${i}`,
  name: `利用者${i}`,
  message: i === 0 ? 'look' : 'こんにちは https://example.com',
  ...(i === 0 ? { metadata: { version: 1, avatar: 'hoshi1' } } : {}),
  color: '#000000',
  time: Date.now(),
  ip_masked: '10.*.*.1',
  ua: '',
}));
function TwoShotFixture() {
  const [value, setValue] = useState('');
  const [auto, setAuto] = useState<AutoSeconds>(0);
  const [commands, setCommands] = useState(0);
  const [radioChanges, setRadioChanges] = useState(0);
  return (
    <TwoShotFrame
      initialTopPercent={20}
      topLabel="入力画面"
      bottomLabel="ログ"
      top={
        <TwoShotForm
          roomName="検証室"
          me={{ name: '検証', sex: 'M' }}
          seat={0}
          value={value}
          onValueChange={setValue}
          auto={auto}
          onSay={() => {}}
          onReload={() => {}}
          onSetAuto={(next) => {
            setAuto(next);
            setRadioChanges((count) => count + 1);
          }}
          onClose={() => setCommands((count) => count + 1)}
          onKick={() => setCommands((count) => count + 1)}
          onLeave={() => setCommands((count) => count + 1)}
        />
      }
      bottom={
        <>
          <output aria-label="専用操作回数">{commands}</output>
          <output aria-label="radio変更回数">{radioChanges}</output>
        </>
      }
    />
  );
}
export function Components() {
  const filter = useIpFilter();
  const chanari = new URLSearchParams(location.search).has('chanari');
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [list, setList] = useState(false);
  const [applied, setApplied] = useState(0);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ff69b4');
  const [email, setEmail] = useState('');
  const [entered, setEntered] = useState(false);
  const [rows, setRows] = useState(30);
  const [sent, setSent] = useState('');
  if (new URLSearchParams(location.search).has('two-shot')) return <TwoShotFixture />;
  if (new URLSearchParams(location.search).has('top')) return <TopPage />;
  return (
    <main className="h-dvh flex flex-col">
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.focus();
          setConfirm(true);
        }}
      >
        確認を開く
      </button>
      <output aria-label="確定回数">{applied}</output>
      <FilterConfirmDialog
        open={confirm}
        title="確認"
        description="対象"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setApplied(applied + 1);
          setConfirm(false);
        }}
      />
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.focus();
          setList(true);
        }}
      >
        一覧を開く
      </button>
      <FilterListDialog
        open={list}
        entries={[]}
        hiddenCounts={new Map()}
        onClose={() => setList(false)}
      />
      <RetroSplitter
        topKind={entered ? 'chat' : 'entry'}
        minTop={100}
        minBottom={100}
        top={
          chanari ? (
            <div className="chanari-container">
              <div className="chanari-scope">
                <ChanariChatRoom
                  initialMessage=""
                  onSaveDraft={setDraft}
                  onSend={async (body) => {
                    setSent(body);
                  }}
                  onReload={() => {}}
                  onExit={() => {}}
                  onClearMyLogs={() => {}}
                  nameColor={color}
                  setNameColor={setColor}
                  speechColor="#000000"
                  setSpeechColor={() => {}}
                  reloadSeconds={7}
                  setReloadSeconds={() => {}}
                  onRestoreDraft={() => draft}
                  sid=""
                />
              </div>
            </div>
          ) : entered ? (
            <ChatRoom
              userName={name}
              windowRows={rows}
              setWindowRows={setRows}
              onExit={() => setEntered(false)}
              onReload={() => {}}
              onShowRanking={() => {}}
              onSend={async (message) => {
                setSent(message);
              }}
            />
          ) : (
            <EntryForm
              name={name}
              setName={setName}
              color={color}
              setColor={setColor}
              email={email}
              setEmail={setEmail}
              onEnter={() => setEntered(true)}
            />
          )
        }
        bottom={
          <section aria-label="過去ログ">
            <p>過去ログ</p>
            <ChatLogList
              chatLog={fixtureChats}
              windowRows={1000}
              ipFilter={filter}
              hideParticipants
            />
            <output aria-label="送信結果">{sent}</output>
          </section>
        }
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Components />);
