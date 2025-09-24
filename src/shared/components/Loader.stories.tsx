import type { Meta, StoryObj } from '@storybook/react';
import Loader from './Loader';

const meta = {
  component: Loader,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    children: '読み込み中...',
  },
  argTypes: {
    children: {
      control: 'text',
      description: 'ローディング時に表示する文言',
    },
  },
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomMessage: Story = {
  args: {
    children: '過去ログを読み込んでいます...',
  },
};
