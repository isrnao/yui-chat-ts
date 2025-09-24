import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, type ComponentProps } from 'react';
import { fn } from 'storybook/test';
import TermsModal from './TermsModal';

function DisableWebGPU(props: ComponentProps<typeof TermsModal>) {
  useEffect(() => {
    const originalGpu = (navigator as any).gpu;
    const hadGpu = 'gpu' in navigator;

    try {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    } catch {
      (navigator as any).gpu = undefined;
    }

    return () => {
      if (hadGpu) {
        try {
          Object.defineProperty(navigator, 'gpu', { value: originalGpu, configurable: true });
        } catch {
          (navigator as any).gpu = originalGpu;
        }
      } else {
        delete (navigator as any).gpu;
      }
    };
  }, []);

  return <TermsModal {...props} />;
}

const meta = {
  component: TermsModal,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onAgree: fn(),
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'モーダルの表示/非表示',
    },
    onAgree: {
      description: '同意ボタン押下時に呼ばれるハンドラー',
    },
  },
} satisfies Meta<typeof TermsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <DisableWebGPU {...args} />,
};
