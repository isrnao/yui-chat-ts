import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import Modal from './Modal';

const meta = {
  component: Modal,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    open: true,
    ariaLabel: 'モーダルのデモ',
    onClose: fn(),
    children: (
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-bold">モーダルの見出し</h2>
        <p>レトロなUIにマッチするシンプルなモーダルです。</p>
        <p className="text-sm text-gray-500">
          閉じるボタンを押すとactionsにイベントが表示されます。
        </p>
      </div>
    ),
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'モーダルを表示するかどうか',
    },
    onClose: {
      description: '閉じるボタンまたはオーバーレイクリックで発火するコールバック',
    },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCloseButton: Story = {};

export const WithoutCloseButton: Story = {
  args: {
    onClose: undefined,
    children: (
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-bold">インフォメーション</h2>
        <p>閉じるボタンを表示したくない場合はonCloseを省略します。</p>
      </div>
    ),
  },
};
