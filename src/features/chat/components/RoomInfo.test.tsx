import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoomInfo from './RoomInfo';
import { getRoomMeta } from '../rooms';

describe('<RoomInfo />', () => {
  it('部屋の紹介文を表示する', () => {
    render(<RoomInfo roomId="anime" />);

    expect(screen.getByText(getRoomMeta('anime').description)).toBeInTheDocument();
  });

  it('カテゴリ名と同カテゴリの関連部屋への <a href> リンクを表示する', () => {
    render(<RoomInfo roomId="anime" />);

    expect(screen.getByText('アニメチャット')).toBeInTheDocument();
    // anime カテゴリ: reborn / monhan / rozen が関連部屋
    const link = screen.getByRole('link', { name: 'リボーンチャット' });
    expect(link).toHaveAttribute('href', '/chat/reborn');
    // 自分自身へのリンクは出さない
    expect(screen.queryByRole('link', { name: 'アニメチャット' })).toBeNull();
  });

  it('トップページへのリンクを表示する', () => {
    render(<RoomInfo roomId="anime" />);

    expect(screen.getByRole('link', { name: '部屋一覧（トップページ）へ' })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('同カテゴリの部屋が無い場合もカテゴリ名は表示し、関連部屋リンクだけ出さない', () => {
    render(<RoomInfo roomId="com_sb" />);

    expect(screen.getByText(getRoomMeta('com_sb').description)).toBeInTheDocument();
    expect(screen.getByText('管理者チャット')).toBeInTheDocument();
    expect(screen.queryByText(/他の部屋/)).toBeNull();
    expect(screen.queryAllByRole('link', { name: /チャット/ })).toHaveLength(0);
  });
});
