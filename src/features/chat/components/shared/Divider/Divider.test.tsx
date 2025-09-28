import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Divider from './index';

describe('Divider', () => {
  it('renders horizontal rule with correct classes', () => {
    const { container } = render(<Divider />);

    const hr = container.querySelector('hr');
    expect(hr).toBeInTheDocument();
    expect(hr).toHaveClass(
      'border-0',
      'border-t-2',
      'border-b',
      'border-t-[var(--ie-gray)]',
      'border-b-white',
      'h-0',
      'my-2'
    );
    expect(hr).toHaveStyle({
      width: 'calc(100% + (var(--page-gap, 0px) * 2))',
      marginInline: 'calc(var(--page-gap, 0px) * -1)',
    });
  });
});
