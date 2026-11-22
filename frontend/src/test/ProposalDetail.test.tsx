import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProposalDetail } from '../components/ProposalDetail';
import { useProposalStore } from '../store/proposalStore';
import type { Proposal } from '../types';

vi.mock('../api', () => ({
  fetchHasVoted: vi.fn().mockResolvedValue(false),
  fetchVoteRecord: vi.fn().mockResolvedValue(null),
  fetchProposal: vi.fn(),
}));

vi.mock('../store/walletStore', () => ({
  useWalletStore: Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const state = {
        address: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
        signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        address: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
        signTransaction: vi.fn().mockResolvedValue('signed-xdr'),
      }),
    },
  ),
}));

const mockProposal: Proposal = {
  id: 2n,
  proposer: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  title: 'Detail Proposal',
  description: 'Detail description',
  votes_yes: 300n,
  votes_no: 100n,
  votes_abstain: 50n,
  quorum: 500n,
  start_time: 1700000000n,
  end_time: 1700086400n,
  state: 'Active',
};

describe('ProposalDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders proposal title and id', () => {
    render(<ProposalDetail proposal={mockProposal} decimals={0} walletAddress={null} onClose={vi.fn()} />);
    expect(screen.getByText('Proposal #2')).toBeInTheDocument();
    expect(screen.getByText('Detail Proposal')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<ProposalDetail proposal={mockProposal} decimals={0} walletAddress={null} onClose={vi.fn()} />);
    expect(screen.getByText('Detail description')).toBeInTheDocument();
  });

  it('renders vote counts', () => {
    render(<ProposalDetail proposal={mockProposal} decimals={0} walletAddress={null} onClose={vi.fn()} />);
    expect(screen.getByText('✅ Yes')).toBeInTheDocument();
    expect(screen.getByText('❌ No')).toBeInTheDocument();
    expect(screen.getByText('⬜ Abstain')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ProposalDetail proposal={mockProposal} decimals={0} walletAddress={null} onClose={onClose} />);
    screen.getByRole('button').click();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows vote status check when wallet connected', () => {
    render(<ProposalDetail proposal={mockProposal} decimals={0} walletAddress="GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN" onClose={vi.fn()} />);
    expect(screen.getByText('Checking vote status...')).toBeInTheDocument();
  });

  describe('optimistic vote flow', () => {
    const wallet = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

    beforeEach(() => {
      useProposalStore.setState({
        proposals: [mockProposal],
        optimisticVotes: {},
        votedMap: {},
      } as never);
    });

    it('increments tally and sets hasVoted immediately after a confirmed vote', () => {
      const store = useProposalStore.getState() as unknown as {
        applyOptimisticVote: (id: bigint, choice: 'yes' | 'no' | 'abstain', addr: string) => void;
      };

      act(() => {
        store.applyOptimisticVote(2n, 'yes', wallet);
      });

      const state = useProposalStore.getState() as unknown as {
        proposals: Proposal[];
        optimisticVotes: Record<string, unknown>;
        votedMap: Record<string, boolean>;
      };

      const updated = state.proposals.find((p) => p.id === 2n);
      expect(updated?.votes_yes).toBe(301n);
      expect(state.votedMap[`2:${wallet}`]).toBe(true);
      expect(state.optimisticVotes['2']).toBeDefined();
    });

    it('rolls back to server values when a poll conflicts with the optimistic tally', () => {
      const store = useProposalStore.getState() as unknown as {
        applyOptimisticVote: (id: bigint, choice: 'yes' | 'no' | 'abstain', addr: string) => void;
        reconcileProposal: (proposal: Proposal) => void;
      };

      act(() => {
        store.applyOptimisticVote(2n, 'yes', wallet);
      });

      // Server poll returns a tally that does not include the optimistic vote.
      const serverProposal: Proposal = { ...mockProposal, votes_yes: 300n };

      act(() => {
        store.reconcileProposal(serverProposal);
      });

      const state = useProposalStore.getState() as unknown as {
        proposals: Proposal[];
        optimisticVotes: Record<string, unknown>;
      };

      const reconciled = state.proposals.find((p) => p.id === 2n);
      expect(reconciled?.votes_yes).toBe(300n);
      expect(state.optimisticVotes['2']).toBeUndefined();
    });

    it('keeps the optimistic tally when the poll agrees with it', () => {
      const store = useProposalStore.getState() as unknown as {
        applyOptimisticVote: (id: bigint, choice: 'yes' | 'no' | 'abstain', addr: string) => void;
        reconcileProposal: (proposal: Proposal) => void;
      };

      act(() => {
        store.applyOptimisticVote(2n, 'yes', wallet);
      });

      const serverProposal: Proposal = { ...mockProposal, votes_yes: 301n };

      act(() => {
        store.reconcileProposal(serverProposal);
      });

      const state = useProposalStore.getState() as unknown as {
        proposals: Proposal[];
        optimisticVotes: Record<string, unknown>;
      };

      const reconciled = state.proposals.find((p) => p.id === 2n);
      expect(reconciled?.votes_yes).toBe(301n);
      expect(state.optimisticVotes['2']).toBeUndefined();
    });
  });
});
