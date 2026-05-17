import type { Meta, StoryObj } from '@storybook/react-vite';
import { GuideIcon, TsBadge, WingIcon, type GuideIconKind } from './icons';
import './headerTheme.css';

function IconGallery() {
  const kinds: GuideIconKind[] = ['faq', 'tutorial', 'heart', 'profile', 'mail'];

  return (
    <div className="ochat-header bg-white p-4">
      <div className="flex items-center gap-4">
        <WingIcon size={56} />
        <TsBadge className="h-8 w-8" />
        {kinds.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1 text-[12px]">
            <GuideIcon kind={kind} />
            {kind}
          </span>
        ))}
      </div>
    </div>
  );
}

const meta = {
  component: IconGallery,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};
