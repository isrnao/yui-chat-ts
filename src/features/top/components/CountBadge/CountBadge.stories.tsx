import type { Meta, StoryObj } from '@storybook/react-vite';
import { CountBadge } from './index';

const meta = {
  component: CountBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    count: 2,
  },
  argTypes: {
    count: {
      control: { type: 'number' },
      description: '表示する入室人数',
    },
  },
} satisfies Meta<typeof CountBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const Empty: Story = {
  args: {
    count: 0,
  },
};

export const Busy: Story = {
  args: {
    count: 4,
  },
};
