import type { Meta, StoryObj } from '@storybook/react-vite';
import ChatRanking from './index';
import { sampleChatLog } from '../../../../storybook/mocks/chatSamples';

const meta = {
  component: ChatRanking,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    chatLog: sampleChatLog,
    roomTitle: '超初心者チャット',
  },
  argTypes: {
    chatLog: {
      description: 'ランキング計算に利用するチャットログ',
    },
    roomTitle: {
      description: '見出しに出す部屋名（「〇〇の発言ランキング」）',
    },
  },
} satisfies Meta<typeof ChatRanking>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    chatLog: [],
  },
};

export const WithBackLink: Story = {
  args: {
    onBackToChat: () => {},
  },
};
