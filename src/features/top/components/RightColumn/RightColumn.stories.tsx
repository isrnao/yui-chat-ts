import type { Meta, StoryObj } from '@storybook/react-vite';
import { RightColumn } from './index';

const meta = {
  component: RightColumn,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[340px] bg-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RightColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
