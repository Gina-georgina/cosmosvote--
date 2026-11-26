import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProposalDetail } from '../components/ProposalDetail';
import { useProposalStore } from '../store/proposalStore';
import type { Proposal } from '../types';

const mockCastVote = vi.fn().mockResolvedValue(undefined);

vi.mock('../api', () => ({
  fetchHasVoted: vi.fn().mockResolvedValue(false),
  fetchVoteRecord: vi.fn().mockResolvedValue(null),
  castVote: (...args: unknown[]) => mockCastVote(...args),
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

  describe('multi-choice proposals', () => {
    const multiChoiceProposal: Proposal = {
      ...mockProposal,
      choices: ['Option A', 'Option B', 'Option C'],
    };

    const wallet = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

    it('renders a radio-button list of choices instead of yes/no/abstain', () => {
      render(<ProposalDetail proposal={multiChoiceProposal} decimals={0} walletAddress={wallet} onClose={vi.fn()} />);
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(3);
      expect(screen.getByText('Option A')).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
      expect(screen.getByText('Option C')).toBeInTheDocument();
      expect(screen.queryByText('✅ Yes')).not.toBeInTheDocument();
      expect(screen.queryByText('❌ No')).not.toBeInTheDocument();
      expect(screen.queryByText('⬜ Abstain')).not.toBeInTheDocument();
    });

    it('highlights the selected choice with aria-pressed', () => {
      render(<ProposalDetail proposal={multiChoiceProposal} decimals={0} walletAddress={wallet} onClose={vi.fn()} />);
      const radios = screen.getAllByRole('radio');
      expect(radios[0]).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(radios[1]);
      expect(radios[1]).toHaveAttribute('aria-pressed', 'true');
      expect(radios[0]).toHaveAttribute('aria-pressed', 'false');
    });

    it('submits Vote::Choice(index) to the contract', async () => {
      render(<ProposalDetail proposal={multiChoiceProposal} decimals={0} walletAddress={wallet} onClose={vi.fn()} />);
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[2]);
      fireEvent.click(screen.getByRole('button', { name: /vote/i }));
      await waitFor(() => {
        expect(mockCastVote).toHaveBeenCalledWith(
          expect.anything(),
          wallet,
          multiChoiceProposal.id,
          { Choice: 2 },
        );
      });
    });

    it('displays the winning choice after finalisation', () => {
      const finalisedProposal: Proposal = {
        ...multiChoiceProposal,
        state: 'Succeeded',
        winning_choice: 1,
      };
      render(<ProposalDetail proposal={finalisedProposal} decimals={0} walletAddress={wallet} onClose={vi.fn()} />);
      expect(screen.getByText(/winning choice/i)).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
    });
  });
});
