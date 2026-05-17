import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoomAnchor } from './index';

const meta = {
  component: RoomAnchor,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    item: {
      label: '超初心者チャット',
      href: '/chat/superbeginner',
      external: false,
    },
    className: 'font-bold text-blue-600 hover:underline',
  },
  argTypes: {
    className: {
      control: 'text',
      description: 'リンクに付与する className',
    },
  },
} satisfies Meta<typeof RoomAnchor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Internal: Story = {};

export const External: Story = {
  args: {
    item: {
      label: '外部リンク',
      href: 'https://example.com/',
    },
  },
};
