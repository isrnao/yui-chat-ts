import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useRef } from 'react';
import ChatLogPage from './ChatLogPage';
import { sampleChatLog } from '../storybook/mocks/chatSamples';
import { setupSupabaseStoryMocks } from '../storybook/mocks/supabaseMock';

function WithSupabaseMocks() {
  const cleanupRef = useRef<(() => void) | null>(null);

  if (!cleanupRef.current) {
    cleanupRef.current = setupSupabaseStoryMocks(sampleChatLog);
  }

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    []
  );

  return <ChatLogPage />;
}

const meta = {
  component: ChatLogPage,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {},
} satisfies Meta<typeof ChatLogPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <WithSupabaseMocks />,
};
