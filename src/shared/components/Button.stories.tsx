import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test'; // 推奨の actions スパイ
import Button from './Button';

const meta = {
  // title: 'Shared/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'], // main.tsでautodocs: trueなら省略可
  argTypes: {
    children: {
      control: 'text',
      description: 'ボタンの内容',
    },
    disabled: {
      control: 'boolean',
      description: 'ボタンを無効にする',
    },
  },
  // onClick は argTypes ではなく args でスパイを渡す
  args: {
    onClick: fn(), // actions パネルに表示され、play関数でも検証可能
    children: 'ボタン',
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {}; // meta.args がそのまま使われる

export const Disabled: Story = {
  args: { children: '無効なボタン', disabled: true },
};

export const LongText: Story = {
  args: { children: '長いテキストのボタン' },
};
