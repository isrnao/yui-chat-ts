import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeftColumn } from './index';

const sampleLiveCounts = {
  superbeginner: 2,
  hajime: 0,
  elementary: 4,
  highschool: 1,
  rozen: 5,
};

const meta = {
  component: LeftColumn,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    liveCounts: sampleLiveCounts,
  },
  decorators: [
    (Story) => (
      <div className="w-[260px] bg-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LeftColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoLiveCounts: Story = {
  args: {
    liveCounts: {},
  },
};
