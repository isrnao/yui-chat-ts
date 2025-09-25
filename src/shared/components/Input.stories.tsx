import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import Input from './Input';

const meta = {
  component: Input,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    placeholder: 'おなまえを入力',
    defaultValue: 'ゆい',
    onChange: fn(),
  },
  argTypes: {
    type: {
      control: 'text',
      description: 'input要素のtype属性',
    },
    disabled: {
      control: 'boolean',
      description: '入力可否',
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {};

export const Disabled: Story = {
  args: {
    defaultValue: '読み取り専用です',
    disabled: true,
  },
};

export const ColorPicker: Story = {
  args: {
    type: 'color',
    defaultValue: '#ff69b4',
    'aria-label': '色を選択',
    className: 'w-16 h-10',
  },
};
