import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserDashboard } from './UserDashboard';
import type { Proposal, VoteRecord } from '../types';

// Mock the api module
vi.mock('../api', () => ({
  fetchDelegation: vi.fn(() => Promise.resolve(null)),
}));

describe('UserDashboard snapshots', () => {
  const mockProposals: Proposal[] = [
    {
      id: 1n,
      proposer: 'GABC1234567890ABCDEF1234567890ABCDEF',
      title: 'Active Proposal',
      description: 'Test proposal description',
      votes_yes: 100n,
      votes_no: 50n,
      votes_abstain: 10n,
      quorum: 200n,
      start_time: 1700000000n,
      end_time: 1700100000n,
      state: 'Active',
    },
    {
      id: 2n,
      proposer: 'GDEF1234567890ABCDEF1234567890ABCDEF',
      title: 'Passed Proposal',
      description: 'Another test proposal',
      votes_yes: 300n,
      votes_no: 50n,
      votes_abstain: 20n,
      quorum: 200n,
      start_time: 1699900000n,
      end_time: 1700000000n,
      state: 'Passed',
    },
  ];

  const mockVotedMap = new Map<bigint, VoteRecord>([
    [1n, { vote: 'Yes', weight: 100n }],
  ]);

  const defaultProps = {
    walletAddress: 'GABC1234567890ABCDEF1234567890ABCDEF',
    tokenBalance: 1000000n,
    decimals: 7,
    proposals: mockProposals,
    votedMap: mockVotedMap,
    onCreateProposal: vi.fn(),
    onDisconnect: vi.fn(),
  };

  it('matches snapshot with proposals and votes', () => {
    const { container } = render(<UserDashboard {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with no token balance', () => {
    const { container } = render(<UserDashboard
      {...defaultProps}
      tokenBalance={null}
    />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with no proposals', () => {
    const { container } = render(<UserDashboard
      {...defaultProps}
      proposals={[]}
      votedMap={new Map()}
    />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with no votes cast', () => {
    const { container } = render(<UserDashboard
      {...defaultProps}
      votedMap={new Map()}
    />);
    expect(container).toMatchSnapshot();
  });
});
