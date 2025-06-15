import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TermsModal from './TermsModal';
import { vi } from 'vitest';

vi.mock('../../content/terms.mdx', () => ({
  default: () => <div>Mocked TermsContent</div>,
}));

function setNavigatorGpu(value: any) {
  Object.defineProperty(global.navigator, 'gpu', {
    value,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  // requestAnimationFrame即時化
  vi.stubGlobal('requestAnimationFrame', (cb: any) => setTimeout(() => cb(performance.now()), 1));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<TermsModal />', () => {
  it('WebGPU未対応時はcanvasが表示されず、同意ボタンでonAgreeが即時呼ばれる', async () => {
    setNavigatorGpu(undefined);
    const onAgree = vi.fn();

    render(<TermsModal open={true} onAgree={onAgree} />);
    // canvasが出てはいけない
    expect(document.querySelector('canvas')).toBeNull();

    // モーダル表示時点ではonAgreeはまだ呼ばれていない
    expect(onAgree).not.toHaveBeenCalled();

    // 同意ボタン押す
    await userEvent.click(screen.getByRole('button', { name: /同意して開始/ }));

    // ボタン押下ですぐ呼ばれる（これがポイント！）
    expect(onAgree).toHaveBeenCalled();
  });

  it('モーダルが閉じている場合は何も表示しない', () => {
    const onAgree = vi.fn();
    render(<TermsModal open={false} onAgree={onAgree} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
