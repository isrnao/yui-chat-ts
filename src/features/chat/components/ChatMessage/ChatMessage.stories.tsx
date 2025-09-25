import type { Meta, StoryObj } from '@storybook/react';
import ChatMessage from './index';
import { optimisticChat, sampleChatLog } from '../../../../storybook/mocks/chatSamples';

const meta = {
  component: ChatMessage,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    chat: { ...sampleChatLog[0] },
  },
  argTypes: {
    chat: {
      description: '表示するチャットメッセージ',
    },
  },
} satisfies Meta<typeof ChatMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutEmail: Story = {
  args: {
    chat: { ...sampleChatLog[2] },
  },
};

export const Optimistic: Story = {
  args: {
    chat: { ...optimisticChat },
  },
};
