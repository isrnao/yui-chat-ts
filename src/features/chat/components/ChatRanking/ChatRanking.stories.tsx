import type { Meta, StoryObj } from '@storybook/react';
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
  },
  argTypes: {
    chatLog: {
      description: 'ランキング計算に利用するチャットログ',
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
