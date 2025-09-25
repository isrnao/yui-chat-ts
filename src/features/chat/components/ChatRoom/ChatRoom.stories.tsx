import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { fn } from 'storybook/test';
import ChatRoom, { type ChatRoomProps } from './index';
import { sampleChatLog } from '../../../../storybook/mocks/chatSamples';

function ChatRoomContainer({
  chatLog: initialChatLog = sampleChatLog,
  windowRows: initialWindowRows = 30,
  onExit,
  onSend,
  onReload,
  onShowRanking,
}: Partial<ChatRoomProps>) {
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState(initialChatLog);
  const [windowRows, setWindowRows] = useState(initialWindowRows);

  useEffect(() => setChatLog(initialChatLog), [initialChatLog]);
  useEffect(() => setWindowRows(initialWindowRows), [initialWindowRows]);

  return (
    <div className="max-w-3xl mx-auto p-4 bg-white border border-gray-200">
      <ChatRoom
        message={message}
        setMessage={setMessage}
        chatLog={chatLog}
        windowRows={windowRows}
        setWindowRows={setWindowRows}
        onExit={onExit ?? fn()}
        onShowRanking={onShowRanking ?? fn()}
        onReload={() => {
          onReload?.();
          setChatLog(sampleChatLog);
        }}
        onSend={async (value) => {
          await (onSend?.(value) ?? Promise.resolve());
          setChatLog((prev) => [
            {
              uuid: `local-${Date.now()}`,
              name: 'あなた',
              color: '#f97316',
              message: value,
              time: Date.now(),
              client_time: Date.now(),
              optimistic: false,
              system: false,
              email: '',
              ip: '127.0.0.1',
              ua: 'Storybook',
            },
            ...prev,
          ]);
        }}
      />
    </div>
  );
}

const meta = {
  component: ChatRoom,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    windowRows: {
      control: { type: 'number' },
      description: '表示行数の初期値',
    },
  },
} satisfies Meta<typeof ChatRoom>;

export default meta;
type Story = StoryObj<typeof meta>;

const noopStringDispatch = (() => undefined) as Dispatch<SetStateAction<string>>;
const noopNumberDispatch = (() => undefined) as Dispatch<SetStateAction<number>>;

export const Default: Story = {
  args: {
    message: '',
    setMessage: noopStringDispatch,
    chatLog: sampleChatLog,
    windowRows: 30,
    setWindowRows: noopNumberDispatch,
    onExit: fn(),
    onSend: fn(async () => {}),
    onReload: fn(),
    onShowRanking: fn(),
  } satisfies Partial<ChatRoomProps>,
  render: (args) => <ChatRoomContainer {...(args as Partial<ChatRoomProps>)} />,
};

export const LongerWindow: Story = {
  args: {
    message: '',
    setMessage: noopStringDispatch,
    chatLog: sampleChatLog,
    windowRows: 100,
    setWindowRows: noopNumberDispatch,
    onExit: fn(),
    onSend: fn(async () => {}),
    onReload: fn(),
    onShowRanking: fn(),
  } satisfies Partial<ChatRoomProps>,
  render: (args) => <ChatRoomContainer {...(args as Partial<ChatRoomProps>)} />,
};
