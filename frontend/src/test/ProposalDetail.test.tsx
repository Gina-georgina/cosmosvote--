import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProposalDetail } from '../components/ProposalDetail';
import type { Proposal } from '../types';

vi.mock('../api', () => ({
  fetchHasVoted: vi.fn().mockResolvedValue(false),
  fetchVoteRecord: vi.fn().mockResolvedValue(null),
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

  it('renders formatted vote weights with raw value in title', () => {
    render(<ProposalDetail proposal={mockProposal} decimals={2} walletAddress={null} onClose={vi.fn()} />);
    expect(screen.getByText('3.00 CVT')).toBeInTheDocument();
    expect(screen.getByText('1.00 CVT')).toBeInTheDocument();
    expect(screen.getByText('0.50 CVT')).toBeInTheDocument();
    expect(screen.getByTitle('300')).toBeInTheDocument();
    expect(screen.getByTitle('100')).toBeInTheDocument();
    expect(screen.getByTitle('50')).toBeInTheDocument();
  });

  it('sets title and aria-label to full proposer address', () => {
    render(<ProposalDetail proposal={mockProposal} decimals={0} walletAddress={null} onClose={vi.fn()} />);
    const addressEl = screen.getByLabelText(mockProposal.proposer);
    expect(addressEl).toHaveAttribute('title', mockProposal.proposer);
    expect(addressEl).toHaveAttribute('aria-label', mockProposal.proposer);
  });

  it('renders a copy-to-clipboard button next to the address', () => {
    render(<ProposalDetail proposal={mockProposal} decimals={0} walletAddress={null} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });
});
