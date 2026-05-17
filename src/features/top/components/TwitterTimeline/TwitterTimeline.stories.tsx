import type { Meta, StoryObj } from '@storybook/react-vite';
import { TwitterTimeline } from './index';

const meta = {
  component: TwitterTimeline,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    screenName: 'chat_a',
  },
  argTypes: {
    screenName: {
      control: 'text',
      description: '表示する X / Twitter のスクリーンネーム',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[320px] bg-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TwitterTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SanitizedScreenName: Story = {
  args: {
    screenName: 'chat_a<script>',
  },
};
