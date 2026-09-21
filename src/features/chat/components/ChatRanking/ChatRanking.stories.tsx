import type { Meta, StoryObj } from '@storybook/react-vite';
import ChatRanking from './index';
import { aggregateChatRanking } from '@features/chat/utils/chatRanking';
import { sampleChatLog } from '../../../../storybook/mocks/chatSamples';

const meta = {
  component: ChatRanking,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    ranking: aggregateChatRanking(sampleChatLog),
    roomTitle: '超初心者チャット',
  },
  argTypes: {
    ranking: {
      description: '集計済みのランキング（本番は chat_ranking ビューの全期間集計）',
    },
    isLoading: {
      description: '取得中',
    },
    hasError: {
      description: '取得失敗',
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
    ranking: [],
  },
};

export const Loading: Story = {
  args: {
    ranking: [],
    isLoading: true,
  },
};

export const LoadError: Story = {
  args: {
    ranking: [],
    hasError: true,
  },
};

export const WithBackLink: Story = {
  args: {
    onBackToChat: () => {},
  },
};
