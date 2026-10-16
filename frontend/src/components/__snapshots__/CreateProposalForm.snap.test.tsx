import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateProposalForm } from './CreateProposalForm';

describe('CreateProposalForm snapshots', () => {
  const defaultProps = {
    walletAddress: 'GABC1234567890ABCDEF1234567890ABCDEF',
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  it('matches snapshot with initial form state', () => {
    const { container } = render(<CreateProposalForm {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with different wallet address', () => {
    const { container } = render(<CreateProposalForm
      {...defaultProps}
      walletAddress="GTEST123456789ABCDEF1234567890ABCDEF"
    />);
    expect(container).toMatchSnapshot();
  });
});
