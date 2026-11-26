import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProposalDetail } from '../components/ProposalDetail';
import type { Proposal } from '../types';

vi.mock('../api', () => ({
  fetchHasVoted: vi.fn().mockResolvedValue(false),
  fetchVoteRecord: vi.fn().mockResolvedValue(null),
  castVote: vi.fn().mockResolvedValue('mock-tx-hash'),
}));

vi.mock('../WalletContext', () => ({
  useWallet: () => ({
    walletAddress: null,
    tokenBalance: null,
    signTransaction: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    showModal: false,
    walletName: null,
    refreshBalance: vi.fn(),
  }),
}));

const mockProposal: Proposal = {
  id: 2n,
  proposer: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  title: 'Detail Proposal',
  description: 'Detail description',
  votes_yes: 10000000n,
  votes_no: 2500000n,
  votes_abstain: 500000n,
  quorum: 50000000n,
  start_time: 1700000000n,
  end_time: 1700086400n,
  state: 'Active',
};

const mockMultiChoiceProposal: Proposal = {
  ...mockProposal,
  id: 5n,
  title: 'Multi-Choice Proposal',
  choices: ['Option Alpha', 'Option Beta', 'Option Gamma'],
};

describe('ProposalDetail snapshots', () => {
  it('matches snapshot without wallet', () => {
    const { container } = render(
      <ProposalDetail proposal={mockProposal} decimals={7} walletAddress={null} onClose={vi.fn()} />
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with wallet connected', () => {
    const { container } = render(
      <ProposalDetail
        proposal={mockProposal}
        decimals={7}
        walletAddress="GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        onClose={vi.fn()}
      />
    );
    expect(container).toMatchSnapshot();
  });

  it('renders multi-choice proposal — choice list is visible', () => {
    const { container } = render(
      <ProposalDetail
        proposal={mockMultiChoiceProposal}
        decimals={7}
        walletAddress="GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        onClose={vi.fn()}
      />
    );
    expect(container).toMatchSnapshot();
  });

  it('renders vote weights formatted with token symbol and raw value tooltip', () => {
    const { getByText, getAllByTitle } = render(
      <ProposalDetail
        proposal={mockProposal}
        decimals={7}
        walletAddress="GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        onClose={vi.fn()}
      />
    );

    expect(getByText('1.0000000 VOTE')).toBeTruthy();
    expect(getByText('0.2500000 VOTE')).toBeTruthy();
    expect(getByText('0.0500000 VOTE')).toBeTruthy();

    const titled = getAllByTitle('10000000');
    expect(titled.length).toBeGreaterThan(0);
  });
});
