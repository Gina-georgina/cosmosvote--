import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

describe('Header snapshots', () => {
  const defaultProps = {
    walletAddress: null,
    tokenBalance: null,
    decimals: 7,
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    theme: 'dark' as const,
    onToggleTheme: vi.fn(),
  };

  it('matches snapshot when not connected', () => {
    const { container } = render(<Header {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when connected with balance', () => {
    const { container } = render(<Header
      {...defaultProps}
      walletAddress="GABC1234567890ABCDEF1234567890ABCDEF"
      tokenBalance={1000000n}
    />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with light theme', () => {
    const { container } = render(<Header
      {...defaultProps}
      theme="light"
    />);
    expect(container).toMatchSnapshot();
  });
});
