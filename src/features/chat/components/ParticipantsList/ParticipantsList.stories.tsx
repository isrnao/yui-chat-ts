import type { Meta, StoryObj } from '@storybook/react';
import ParticipantsList from './index';
import { sampleParticipants } from '../../../../storybook/mocks/chatSamples';

const meta = {
  component: ParticipantsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    participants: sampleParticipants,
    currentTime: Date.parse('2024-01-01T12:00:00Z'),
  },
  argTypes: {
    participants: {
      description: '参加者の一覧',
    },
    currentTime: {
      control: { type: 'number' },
      description: '表示する現在時刻（ミリ秒）',
    },
  },
} satisfies Meta<typeof ParticipantsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    participants: [],
  },
};
