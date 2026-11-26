import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProposalCard } from '../components/ProposalCard';
import type { Proposal } from '../types';

const mockProposal: Proposal = {
  id: 1n,
  proposer: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  title: 'Test Proposal',
  description: 'A test proposal description',
  votes_yes: 500n,
  votes_no: 200n,
  votes_abstain: 100n,
  quorum: 1000n,
  start_time: 1700000000n,
  end_time: 1700086400n,
  state: 'Active',
};

describe('ProposalCard', () => {
  it('renders proposal title and state', () => {
    render(<ProposalCard proposal={mockProposal} decimals={0} onClick={vi.fn()} />);
    expect(screen.getByText(/#1 — Test Proposal/)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<ProposalCard proposal={mockProposal} decimals={0} onClick={vi.fn()} />);
    expect(screen.getByText('A test proposal description')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ProposalCard proposal={mockProposal} decimals={0} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on Enter key', () => {
    const onClick = vi.fn();
    render(<ProposalCard proposal={mockProposal} decimals={0} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows quorum progress', () => {
    render(<ProposalCard proposal={mockProposal} decimals={0} onClick={vi.fn()} />);
    expect(screen.getByText(/% of quorum/)).toBeInTheDocument();
  });

  it('renders Rejected state with correct label', () => {
    render(<ProposalCard proposal={{ ...mockProposal, state: 'Rejected' }} decimals={0} onClick={vi.fn()} />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('shows full proposer address in title and aria-label with copy button', () => {
    render(<ProposalCard proposal={mockProposal} decimals={0} onClick={vi.fn()} />);
    const addressEl = screen.getByTitle(mockProposal.proposer);
    expect(addressEl).toHaveAttribute('title', mockProposal.proposer);
    expect(addressEl).toHaveAttribute('aria-label', mockProposal.proposer);
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });
});
