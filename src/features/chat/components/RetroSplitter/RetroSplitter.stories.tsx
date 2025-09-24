import type { Meta, StoryObj } from '@storybook/react';
import RetroSplitter from './index';
import ChatLogList from '../ChatLogList';
import { sampleChatLog, sampleParticipants } from '../../../../storybook/mocks/chatSamples';

function TopPlaceholder() {
  return (
    <div className="h-full w-full bg-white/70 p-6" style={{ fontFamily: 'var(--font-yui)' }}>
      <h2 className="text-xl font-bold text-[var(--yui-pink)] mb-2">上側の領域</h2>
      <p className="text-sm text-gray-600">ドラッグまたは矢印キーで高さを調整できます。</p>
    </div>
  );
}

function BottomPreview() {
  return (
    <div className="h-full bg-white/90 p-4">
      <ChatLogList chatLog={sampleChatLog} participants={sampleParticipants} windowRows={50} />
    </div>
  );
}

const meta = {
  component: RetroSplitter,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    minTop: 120,
    minBottom: 140,
    top: <TopPlaceholder />,
    bottom: <BottomPreview />,
  },
  argTypes: {
    minTop: {
      control: { type: 'number' },
      description: '上側領域の最小高さ(px)',
    },
    minBottom: {
      control: { type: 'number' },
      description: '下側領域の最小高さ(px)',
    },
  },
} satisfies Meta<typeof RetroSplitter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    minTop: 80,
    minBottom: 100,
  },
};
