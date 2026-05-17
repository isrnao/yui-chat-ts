import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  GuideMenu,
  Header,
  LogoBlock,
  PrimaryTabs,
  SecondaryTabs,
  type GuideMenuItem,
  type SecondaryTabItem,
} from './index';

const sampleGuideItems: GuideMenuItem[] = [
  { label: 'チャットの使い方', iconKind: 'tutorial', href: '#chat-howto' },
  { label: 'ルール・マナー', iconKind: 'heart', href: '#chat-rules' },
  { label: 'コンタクト', iconKind: 'mail', href: '/chat/com_sb' },
];

const sampleSecondaryItems: SecondaryTabItem[] = [
  { label: 'チャット', href: '/' },
  { label: '中学生チャット', href: '/chat/juniorhighschool' },
  { label: 'なりきりチャット', href: '#pickup-narikiri' },
];

const meta = {
  component: Header,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Logo: Story = {
  render: () => (
    <div className="bg-white p-4">
      <LogoBlock />
    </div>
  ),
};

export const Guides: Story = {
  render: () => (
    <div className="bg-white p-4">
      <GuideMenu items={sampleGuideItems} />
    </div>
  ),
};

export const PrimaryNavigation: Story = {
  render: () => (
    <div className="bg-white p-4">
      <PrimaryTabs items={['チャット', 'ランキング', 'プロフィール']} activeIndex={0} />
    </div>
  ),
};

export const SecondaryNavigation: Story = {
  render: () => (
    <div className="bg-white p-4">
      <SecondaryTabs items={sampleSecondaryItems} activeIndex={0} />
    </div>
  ),
};
