import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { fn } from 'storybook/test';
import ChatRoom, { type ChatRoomProps } from './index';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

function ChatRoomContainer({
  windowRows: initialWindowRows = 30,
  onExit,
  onSend,
  onReload,
  onShowRanking,
}: Partial<ChatRoomProps>) {
  const [windowRows, setWindowRows] = useState(initialWindowRows);

  // Storybook controls で initial 値が変わったら state を巻き戻す
  // (useResetOnChange = effect 内 setState を避ける公式推奨「前回値検知」パターン)
  useResetOnChange(initialWindowRows, setWindowRows);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <ChatRoom
        windowRows={windowRows}
        setWindowRows={setWindowRows}
        onExit={onExit ?? fn()}
        onShowRanking={onShowRanking ?? fn()}
        onReload={() => onReload?.()}
        onSend={async (value) => {
          await (onSend?.(value) ?? Promise.resolve());
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

const noopNumberDispatch = (() => undefined) as Dispatch<SetStateAction<number>>;

export const Default: Story = {
  args: {
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
    windowRows: 100,
    setWindowRows: noopNumberDispatch,
    onExit: fn(),
    onSend: fn(async () => {}),
    onReload: fn(),
    onShowRanking: fn(),
  } satisfies Partial<ChatRoomProps>,
  render: (args) => <ChatRoomContainer {...(args as Partial<ChatRoomProps>)} />,
};
