import type { Meta, StoryObj } from '@storybook/react-vite';
import ChanariTopHeader from './index';
import '../../styles/chanari.css';

const meta = {
  component: ChanariTopHeader,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="chanari-scope min-w-[640px]">
        <Story />
      </div>
    ),
  ],
  args: {
    backHref: '/',
    helpHref: '#help',
    title: 'デュラララ チャット',
    description: 'なりきりチャットで楽しく会話しましょう。',
    sloganLabel: '無料チャット',
  },
  argTypes: {
    backHref: {
      control: 'text',
      description: '戻るリンク URL',
    },
    helpHref: {
      control: 'text',
      description: 'ヘルプリンク URL',
    },
  },
} satisfies Meta<typeof ChanariTopHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ExternalBack: Story = {
  args: {
    backHref: 'https://example.com/chanari',
  },
};

export const WithoutHelp: Story = {
  args: {
    helpHref: undefined,
  },
};
