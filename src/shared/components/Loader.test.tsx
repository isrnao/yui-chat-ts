import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Loader from './Loader';

describe('Loader', () => {
  test('デフォルトで「読み込み中...」が表示される', () => {
    render(<Loader />);
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  test('childrenを渡すとchildrenが表示される', () => {
    render(<Loader>ロード中です…</Loader>);
    expect(screen.getByText('ロード中です…')).toBeInTheDocument();
    // デフォルト文言は表示されない
    expect(screen.queryByText('読み込み中...')).toBeNull();
  });
});
