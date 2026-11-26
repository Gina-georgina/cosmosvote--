import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProposalCard } from '../components/ProposalCard';
import type { Proposal } from '../types';

const base: Proposal = {
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

describe('ProposalCard snapshots', () => {
  it('matches snapshot for Active state', () => {
    const { container } = render(<ProposalCard proposal={base} decimals={0} onClick={vi.fn()} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for Passed state', () => {
    const { container } = render(<ProposalCard proposal={{ ...base, state: 'Passed' }} decimals={0} onClick={vi.fn()} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for Rejected state', () => {
    const { container } = render(<ProposalCard proposal={{ ...base, state: 'Rejected' }} decimals={0} onClick={vi.fn()} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for Executed state', () => {
    const { container } = render(<ProposalCard proposal={{ ...base, state: 'Executed' }} decimals={0} onClick={vi.fn()} />);
    expect(container).toMatchSnapshot();
  });

  it('sets title and aria-label with the full proposer address on the masked address', () => {
    const { getByTitle, getByLabelText } = render(
      <ProposalCard proposal={base} decimals={0} onClick={vi.fn()} />,
    );
    const addressEl = getByTitle(base.proposer);
    expect(addressEl).toHaveAttribute('title', base.proposer);
    expect(addressEl).toHaveAttribute('aria-label', base.proposer);
    expect(getByLabelText(base.proposer)).toBe(addressEl);
  });

  it('renders a copy-to-clipboard button next to the address', () => {
    const { getByRole } = render(<ProposalCard proposal={base} decimals={0} onClick={vi.fn()} />);
    expect(getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });
});