import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TopPage from './TopPage';

describe('<TopPage />', () => {
  it('renders the legacy top page and superbeginner link', () => {
    render(<TopPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'お気楽チャット' })).toBeInTheDocument();
    expect(screen.getByText('注目のチャット ピックアップ')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '超初心者チャット' })[0]).toHaveAttribute(
      'href',
      '/yui-chat-ts/chat/superbeginner'
    );
  });
});
