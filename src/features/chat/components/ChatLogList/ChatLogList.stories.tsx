import type { Meta, StoryObj } from '@storybook/react';
import ChatLogList from './index';
import {
  optimisticChat,
  sampleChatLog,
  sampleParticipants,
} from '../../../../storybook/mocks/chatSamples';

const meta = {
  component: ChatLogList,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    chatLog: [...sampleChatLog],
    participants: sampleParticipants,
    windowRows: 50,
    isLoading: false,
  },
  argTypes: {
    isLoading: {
      control: 'boolean',
      description: '読み込み状態',
    },
    windowRows: {
      control: { type: 'number' },
      description: '表示する最大行数',
    },
  },
} satisfies Meta<typeof ChatLogList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    chatLog: [],
  },
};

export const WithOptimisticMessage: Story = {
  args: {
    chatLog: [optimisticChat, ...sampleChatLog],
  },
};
