import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Divider from './index';

describe('Divider', () => {
  it('renders horizontal rule with correct classes', () => {
    const { container } = render(<Divider />);

    const hr = container.querySelector('hr');
    expect(hr).toBeInTheDocument();
    expect(hr).toHaveClass(
      'bleed-x',
      'border-0',
      'border-t-2',
      'border-b',
      'border-t-ie-gray',
      'border-b-white',
      'h-0',
      'my-2'
    );
    expect(hr).not.toHaveAttribute('style');
  });
});
