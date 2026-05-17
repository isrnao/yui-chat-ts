import type { Meta, StoryObj } from '@storybook/react-vite';
import ChanariCharCounter from './index';
import '../../styles/chanari.css';

const meta = {
  component: ChanariCharCounter,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="chanari-scope">
        <Story />
      </div>
    ),
  ],
  args: {
    value: 'こんにちは',
    maxLength: 120,
  },
  argTypes: {
    value: {
      control: 'text',
      description: 'カウント対象の文字列',
    },
    maxLength: {
      control: { type: 'number' },
      description: '上限文字数',
    },
  },
} satisfies Meta<typeof ChanariCharCounter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OverLimit: Story = {
  args: {
    value: 'あ'.repeat(121),
  },
};
