import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { fn } from 'storybook/test';
import ChanariChatRoom from './index';
import '../../styles/chanari.css';

type ChanariChatRoomProps = ComponentProps<typeof ChanariChatRoom>;

type ChanariChatRoomStoryArgs = Partial<
  Pick<
    ChanariChatRoomProps,
    | 'message'
    | 'nameColor'
    | 'speechColor'
    | 'reloadSeconds'
    | 'sid'
    | 'error'
    | 'isPending'
    | 'onSend'
    | 'onReload'
    | 'onExit'
    | 'onClearMyLogs'
    | 'onRestoreDraft'
  >
>;

function ChanariChatRoomContainer({
  message: initialMessage = 'こんにちは',
  nameColor: initialNameColor = '#ff69b4',
  speechColor: initialSpeechColor = '#333333',
  reloadSeconds: initialReloadSeconds = 15,
  sid = 'storybook-session',
  error,
  isPending,
  onSend,
  onReload,
  onExit,
  onClearMyLogs,
  onRestoreDraft,
}: ChanariChatRoomStoryArgs = {}) {
  const [message, setMessage] = useState(initialMessage);
  const [nameColor, setNameColor] = useState(initialNameColor);
  const [speechColor, setSpeechColor] = useState(initialSpeechColor);
  const [reloadSeconds, setReloadSeconds] = useState(initialReloadSeconds);

  return (
    <ChanariChatRoom
      message={message}
      setMessage={setMessage}
      nameColor={nameColor}
      setNameColor={setNameColor}
      speechColor={speechColor}
      setSpeechColor={setSpeechColor}
      reloadSeconds={reloadSeconds}
      setReloadSeconds={setReloadSeconds}
      sid={sid}
      error={error}
      isPending={isPending}
      onSend={onSend ?? fn()}
      onReload={onReload ?? fn()}
      onExit={onExit ?? fn()}
      onClearMyLogs={onClearMyLogs ?? fn()}
      onRestoreDraft={onRestoreDraft ?? fn()}
    />
  );
}

const meta = {
  component: ChanariChatRoom,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="chanari-scope min-w-[720px]">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    message: {
      control: 'text',
      description: '発言入力欄の初期値',
    },
    reloadSeconds: {
      control: { type: 'number' },
      description: 'リロード秒の初期値',
    },
    error: {
      control: 'text',
      description: '送信エラーの文言',
    },
    isPending: {
      control: 'boolean',
      description: '送信中かどうか',
    },
  },
} satisfies Meta<typeof ChanariChatRoom>;

export default meta;
type Story = StoryObj<typeof meta>;

const noopStringSetter = () => undefined;
const noopNumberSetter = () => undefined;

export const Default: Story = {
  args: {
    message: 'こんにちは',
    nameColor: '#ff69b4',
    speechColor: '#333333',
    reloadSeconds: 15,
    sid: 'storybook-session',
    setMessage: noopStringSetter,
    setNameColor: noopStringSetter,
    setSpeechColor: noopStringSetter,
    setReloadSeconds: noopNumberSetter,
    onSend: fn(),
    onReload: fn(),
    onExit: fn(),
    onClearMyLogs: fn(),
    onRestoreDraft: fn(),
  },
  render: (args) => <ChanariChatRoomContainer {...(args as ChanariChatRoomStoryArgs)} />,
};

export const OverLimit: Story = {
  args: {
    ...Default.args,
    message: 'あ'.repeat(121),
  },
  render: Default.render,
};

export const Pending: Story = {
  args: {
    ...Default.args,
    isPending: true,
  },
  render: Default.render,
};

export const WithError: Story = {
  args: {
    ...Default.args,
    error: '送信に失敗しました',
  },
  render: Default.render,
};
