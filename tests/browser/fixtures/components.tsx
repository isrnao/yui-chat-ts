import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/App.css';
import EntryForm from '../../../src/features/chat/components/EntryForm';
import ChatRoom from '../../../src/features/chat/components/ChatRoom';
import RetroSplitter from '../../../src/features/chat/components/RetroSplitter';

export function Components() {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ff69b4');
  const [email, setEmail] = useState('');
  const [entered, setEntered] = useState(false);
  const [rows, setRows] = useState(30);
  const [sent, setSent] = useState('');
  return (
    <main className="h-dvh flex flex-col">
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
            <output aria-label="送信結果">{sent}</output>
          </section>
        }
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Components />);
