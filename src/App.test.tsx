import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// モック: localStorageをリセット
beforeEach(() => {
  localStorage.clear();
});

describe('<App />', () => {
  it('初回表示で利用規約モーダルが開く', () => {
    render(<App />);
    // 利用規約のキーワードを確認（タイトルなど）
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('利用規約「同意」でEntryFormが出る', async () => {
    render(<App />);
    // 「同意」ボタンをクリック
    const agreeBtn = screen.getByRole('button', { name: /同意|agree/i });
    await userEvent.click(agreeBtn);
    // EntryFormの名前欄を探す
    expect(screen.getByLabelText(/おなまえ/)).toBeInTheDocument();
  });

  it('EntryFormに入力し入室→ChatRoomに遷移', async () => {
    render(<App />);
    // 利用規約同意
    const agreeBtn = screen.getByRole('button', { name: /同意|agree/i });
    await userEvent.click(agreeBtn);

    // EntryForm入力
    const nameInput = screen.getByLabelText(/おなまえ/);
    await userEvent.type(nameInput, 'midori');
    // 必要なら色やemailもセット

    // 「入室」ボタン
    const enterBtn = screen.getByRole('button', { name: /チャットに参加/i });
    await userEvent.click(enterBtn);

    // ChatRoomが表示される
    expect(screen.getByPlaceholderText(/発言/)).toBeInTheDocument();
  });

  it('チャットログ下部が表示される', async () => {
    render(<App />);
    // 利用規約同意・入室
    await userEvent.click(screen.getByRole('button', { name: /同意|agree/i }));
    await userEvent.type(screen.getByLabelText(/おなまえ/), 'midori');
    await userEvent.click(screen.getByRole('button', { name: /チャットに参加/i }));

    // 「チャットログを読み込み中...」かログ本体が出る（Suspense）
    await waitFor(() => {
      expect(screen.getByText(/管理人/)).toBeInTheDocument();
    });
  });

  it('ランキング表示とチャットログ表示の切り替えが正しく動作する', async () => {
    render(<App />);
    // 利用規約同意・入室
    await userEvent.click(screen.getByRole('button', { name: /同意|agree/i }));
    await userEvent.type(screen.getByLabelText(/おなまえ/), 'midori');
    await userEvent.click(screen.getByRole('button', { name: /チャットに参加/i }));

    // ChatRoomが表示されるまで待機
    expect(screen.getByPlaceholderText(/発言/)).toBeInTheDocument();

    // ランキング表示リンクをクリック
    const rankingLink = screen.getByText('[発言ランキング]');
    await userEvent.click(rankingLink);

    // ランキング表示エリアの「戻る」ボタンが表示されることを確認
    expect(screen.getByRole('button', { name: /戻る/i })).toBeInTheDocument();

    // ランキングコンポーネントが表示されることを確認
    expect(screen.getByText('発言らんきんぐ')).toBeInTheDocument();

    // 「戻る」ボタンをクリック
    const backBtn = screen.getByRole('button', { name: /戻る/i });
    await userEvent.click(backBtn);

    // チャットログが再表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/管理人/)).toBeInTheDocument();
    });
  });
});
