import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/App.css';
import ChatLogList from '../../../src/features/chat/components/ChatLogList';
import { useIpFilter } from '../../../src/features/chat/hooks/useIpFilter';
import type { Chat } from '../../../src/features/chat/types';
import EntryForm from '../../../src/features/chat/components/EntryForm';
import ChatRoom from '../../../src/features/chat/components/ChatRoom';
import FilterConfirmDialog from '../../../src/features/chat/components/FilterConfirmDialog';
import FilterListDialog from '../../../src/features/chat/components/FilterListDialog';
import { hasInvokerCommands, rememberDialogInvoker } from '../../../src/shared/utils/dialogControl';
import RetroSplitter from '../../../src/features/chat/components/RetroSplitter';

const fixtureChats: Chat[] = Array.from({ length: 1000 }, (_, i) => ({
  uuid: `fixture-${i}`,
  name: `利用者${i}`,
  message: 'こんにちは https://example.com',
  color: '#000000',
  time: Date.now(),
  ip_masked: '10.*.*.1',
  ua: '',
}));
export function Components() {
  const filter = useIpFilter();
  const [confirm, setConfirm] = useState(false);
  const [request, setRequest] = useState(0);
  const [applied, setApplied] = useState(0);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ff69b4');
  const [email, setEmail] = useState('');
  const [entered, setEntered] = useState(false);
  const [rows, setRows] = useState(30);
  const [sent, setSent] = useState('');
  return (
    <main className="h-dvh flex flex-col">
      <button
        type="button"
        onClick={(e) => {
          rememberDialogInvoker('fixture-confirm', e.currentTarget);
          setConfirm(true);
        }}
      >
        確認を開く
      </button>
      <output aria-label="確定回数">{applied}</output>
      <FilterConfirmDialog
        dialogId="fixture-confirm"
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
        {...{ commandfor: 'fixture-list', command: 'show-modal' }}
        onClick={(e) => {
          rememberDialogInvoker('fixture-list', e.currentTarget);
          if (!hasInvokerCommands()) setRequest(request + 1);
        }}
      >
        一覧を開く
      </button>
      <FilterListDialog
        dialogId="fixture-list"
        request={request}
        entries={[]}
        hiddenCounts={new Map()}
        onClose={() => {}}
      />
      <RetroSplitter
        topKind={entered ? 'chat' : 'entry'}
        minTop={100}
        minBottom={100}
        top={
          entered ? (
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
