import type { Meta, StoryObj } from '@storybook/react-vite';
import { SectionTitle } from './index';

const meta = {
  component: SectionTitle,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    children: '注目のチャット ピックアップ',
  },
  argTypes: {
    children: {
      control: 'text',
      description: '見出しテキスト',
    },
  },
} satisfies Meta<typeof SectionTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
};
