import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DelegationPanel } from './DelegationPanel';

// Mock the api module
vi.mock('../api', () => ({
  fetchDelegation: vi.fn(() => Promise.resolve(null)),
}));

describe('DelegationPanel snapshots', () => {
  it('matches snapshot with wallet address', () => {
    const { container } = render(
      <DelegationPanel walletAddress="GABC1234567890ABCDEF1234567890ABCDEF" />
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot while loading', async () => {
    const { container } = render(
      <DelegationPanel walletAddress="GTEST123456789ABCDEF1234567890ABCDEF" />
    );
    // Capture loading state immediately
    expect(container).toMatchSnapshot();
  });
});
