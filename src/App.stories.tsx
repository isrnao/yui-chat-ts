import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useRef } from 'react';
import App from './App';
import { sampleChatLog } from './storybook/mocks/chatSamples';
import { setupSupabaseStoryMocks } from './storybook/mocks/supabaseMock';

function AppWithMocks() {
  const cleanupRef = useRef<(() => void) | null>(null);
  const fetchRestoreRef = useRef<(() => void) | null>(null);

  if (!cleanupRef.current) {
    cleanupRef.current = setupSupabaseStoryMocks(sampleChatLog);
  }

  useEffect(() => {
    const originalFetch = globalThis.fetch;
    if (!originalFetch) {
      return () => cleanupRef.current?.();
    }

    globalThis.fetch = async (...args) => {
      const url = args[0]?.toString() ?? '';
      if (url.includes('ipify') || url.includes('httpbin') || url.includes('jsonip')) {
        return new Response(JSON.stringify({ ip: '127.0.0.1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetch(...args);
    };

    fetchRestoreRef.current = () => {
      globalThis.fetch = originalFetch;
    };

    return () => {
      fetchRestoreRef.current?.();
      cleanupRef.current?.();
      cleanupRef.current = null;
      fetchRestoreRef.current = null;
    };
  }, []);

  return <App />;
}

const meta = {
  component: App,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <AppWithMocks />,
};
