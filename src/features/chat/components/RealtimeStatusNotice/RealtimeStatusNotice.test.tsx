import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RealtimeStatusNotice from './index';

it('切れたときだけ知らせ、接続待ちと接続中は何も出さない', () => {
  const { rerender } = render(<RealtimeStatusNotice status="connecting" />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(<RealtimeStatusNotice status="connected" />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(<RealtimeStatusNotice status="disconnected" />);
  expect(screen.getByRole('status')).toHaveTextContent(
    '接続が切れています。更新でログを取得できます。'
  );
});
