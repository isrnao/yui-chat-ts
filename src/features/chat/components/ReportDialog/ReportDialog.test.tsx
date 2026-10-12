import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportDialog from './index';
import { CHAT_TEXTS } from '@features/chat/chatTexts';

describe('ReportDialog', () => {
  it('理由を選ぶまで送れず、送ると受け付けたことを示す', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue('ok');
    render(<ReportDialog open chatUuid="c-1" onClose={() => {}} send={send} />);
    const submit = screen.getByRole('button', { name: CHAT_TEXTS.report.send });
    expect(submit).toBeDisabled();
    await user.click(screen.getByLabelText(CHAT_TEXTS.reportReasons.harassment));
    await user.type(screen.getByLabelText(CHAT_TEXTS.report.detailLabel), 'ひどい');
    await user.click(submit);
    expect(send).toHaveBeenCalledWith('c-1', 'harassment', 'ひどい');
    expect(await screen.findByText(CHAT_TEXTS.report.accepted)).toBeInTheDocument();
  });

  it('児童の安全に関わる理由では相談先を出す', async () => {
    const user = userEvent.setup();
    render(<ReportDialog open chatUuid="c-1" onClose={() => {}} send={vi.fn()} />);
    await user.click(screen.getByLabelText(CHAT_TEXTS.reportReasons.child_safety));
    expect(
      screen.getByRole('link', { name: CHAT_TEXTS.report.childSafetyLinkLabel })
    ).toHaveAttribute('href', CHAT_TEXTS.report.childSafetyLinkUrl);
  });

  it('多すぎる通報と失敗は文言で知らせる', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValueOnce('rate_limited').mockResolvedValueOnce('failed');
    render(<ReportDialog open chatUuid="c-1" onClose={() => {}} send={send} />);
    await user.click(screen.getByLabelText(CHAT_TEXTS.reportReasons.spam));
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(CHAT_TEXTS.report.rateLimited);
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(CHAT_TEXTS.report.failed);
  });
  it('例外でも内容を保持して手動で再送できる', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
    render(<ReportDialog open chatUuid="c-1" send={send} onClose={() => {}} />);
    await user.click(screen.getByLabelText(CHAT_TEXTS.reportReasons.spam));
    await user.type(screen.getByLabelText(CHAT_TEXTS.report.detailLabel), '保存する説明');
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(CHAT_TEXTS.report.failed);
    expect(screen.getByLabelText(CHAT_TEXTS.report.detailLabel)).toHaveValue('保存する説明');
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.send }));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('対象変更後に旧応答を適用せず、理由を新しく選ぶ', async () => {
    const user = userEvent.setup();
    let finish!: (value: 'ok') => void;
    const send = vi.fn(
      () =>
        new Promise<'ok'>((resolve) => {
          finish = resolve;
        })
    );
    const { rerender } = render(
      <ReportDialog open chatUuid="c-1" send={send} onClose={() => {}} />
    );
    await user.click(screen.getByLabelText(CHAT_TEXTS.reportReasons.spam));
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.send }));
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.sending }));
    expect(send).toHaveBeenCalledTimes(1);
    rerender(<ReportDialog open chatUuid="c-2" send={send} onClose={() => {}} />);
    await act(async () => finish('ok'));
    expect(screen.queryByText(CHAT_TEXTS.report.accepted)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: CHAT_TEXTS.report.send })).toBeDisabled();
  });

  it('同じ発言の通報を開き直すと、前回の結果ではなく入力から始める', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue('ok');
    const { rerender } = render(
      <ReportDialog open chatUuid="c-1" send={send} onClose={() => {}} />
    );
    await user.click(screen.getByLabelText(CHAT_TEXTS.reportReasons.spam));
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.send }));
    expect(await screen.findByText(CHAT_TEXTS.report.accepted)).toBeInTheDocument();
    rerender(<ReportDialog open={false} chatUuid="c-1" send={send} onClose={() => {}} />);
    rerender(<ReportDialog open chatUuid="c-1" send={send} onClose={() => {}} />);
    expect(screen.queryByText(CHAT_TEXTS.report.accepted)).not.toBeInTheDocument();
    expect(screen.getByLabelText(CHAT_TEXTS.reportReasons.spam)).not.toBeChecked();
  });
});
