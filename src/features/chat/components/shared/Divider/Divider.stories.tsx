import type { Meta, StoryObj } from '@storybook/react';
import Divider from './index';

const meta = {
  component: Divider,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-80 text-sm space-y-2 font-yui">
      <p>上側のコンテンツ</p>
      <Divider />
      <p>下側のコンテンツ</p>
    </div>
  ),
};
