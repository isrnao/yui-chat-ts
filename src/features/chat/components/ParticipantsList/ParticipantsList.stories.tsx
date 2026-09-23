import type { Meta, StoryObj } from '@storybook/react-vite';
import ParticipantsList from './index';
import type { Chat } from '@features/chat/types';
import { sampleParticipants } from '../../../../storybook/mocks/chatSamples';

// 参加者は「直近 5 分の発言」から導出されるので、表示時点からの相対時刻で発言を作る
const recentChatLog: Chat[] = sampleParticipants.map((p, i) => ({
  uuid: p.uuid,
  name: p.name,
  color: p.color,
  message: 'こんにちは',
  time: Date.now() - (i + 1) * 1000,
  ip_masked: '',
  ua: '',
}));

const meta = {
  component: ParticipantsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    chatLog: recentChatLog,
  },
  argTypes: {
    chatLog: {
      description: '参加者を導出する元のログ（直近 5 分の発言と入退室メッセージ）',
    },
  },
} satisfies Meta<typeof ParticipantsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    chatLog: [],
  },
};
