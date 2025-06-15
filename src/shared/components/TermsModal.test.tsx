import { render, screen } from '@testing-library/react';
import TermsModal from './TermsModal';

describe('TermsModal', () => {
  it('規約本文とボタンが表示される', () => {
    render(<TermsModal open={true} onAgree={() => {}} />);
    expect(screen.getByText('利用規約')).toBeInTheDocument();
    expect(screen.getByText('同意して開始')).toBeInTheDocument();
  });
});
