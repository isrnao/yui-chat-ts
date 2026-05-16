import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NotFoundPage from './NotFoundPage';

describe('<NotFoundPage />', () => {
  it('renders the legacy 404 message and return link', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { level: 1, name: '４０４ＥＲＲＯＲ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '⌒⊂´∀｀)つ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'お気楽チャットにもどる' })).toHaveAttribute(
      'href',
      '/yui-chat-ts/'
    );
    expect(screen.getByText(/The file you just requested wasn’t found/)).toBeInTheDocument();
  });
});
