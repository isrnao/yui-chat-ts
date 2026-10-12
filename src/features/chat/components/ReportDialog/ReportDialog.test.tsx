import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportDialog from './index';
import { CHAT_TEXTS } from '@features/chat/chatTexts';

describe('ReportDialog', () => {
  it('理由を選ぶまで送れず、送ると受け付けたことを示す', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue('ok');
    render(<ReportDialog chatUuid="c-1" onClose={() => {}} send={send} />);
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
    render(<ReportDialog chatUuid="c-1" onClose={() => {}} send={vi.fn()} />);
    await user.click(screen.getByLabelText(CHAT_TEXTS.reportReasons.child_safety));
    expect(screen.getByRole('link', { name: CHAT_TEXTS.report.childSafetyLinkLabel })).toHaveAttribute(
      'href',
      CHAT_TEXTS.report.childSafetyLinkUrl
    );
  });

  it('多すぎる通報と失敗は文言で知らせる', async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValueOnce('rate_limited').mockResolvedValueOnce('failed');
    render(<ReportDialog chatUuid="c-1" onClose={() => {}} send={send} />);
    await user.click(screen.getByLabelText(CHAT_TEXTS.reportReasons.spam));
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(CHAT_TEXTS.report.rateLimited);
    await user.click(screen.getByRole('button', { name: CHAT_TEXTS.report.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(CHAT_TEXTS.report.failed);
  });
});
