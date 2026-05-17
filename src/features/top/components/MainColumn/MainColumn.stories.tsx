import type { Meta, StoryObj } from '@storybook/react-vite';
import { MainColumn } from './index';

const sampleLiveCounts = {
  com_sb: 1,
  durara: 0,
  durarara: 3,
  vocaloid: 4,
  gintama: 2,
};

const meta = {
  component: MainColumn,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    liveCounts: sampleLiveCounts,
  },
  decorators: [
    (Story) => (
      <div className="w-[520px] bg-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MainColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoLiveCounts: Story = {
  args: {
    liveCounts: {},
  },
};
