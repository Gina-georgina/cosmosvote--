import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProposalDetail } from './ProposalDetail';
import type { Proposal } from '../types';

const proposal: Proposal = {
  id: 7n,
  proposer: 'GABC1234567890ABCDEF1234567890ABCDEF',
  title: 'Test proposal',
  description: 'A proposal used for accessibility testing.',
  votes_yes: 100n,
  votes_no: 20n,
  votes_abstain: 5n,
  quorum: 250n,
  start_time: 1_700_000_000n,
  end_time: 1_700_100_000n,
  state: 'Active',
};

describe('ProposalDetail', () => {
  it('exposes dialog semantics and accessibility labels', () => {
    const onClose = vi.fn();

    render(
      <ProposalDetail
        proposal={proposal}
        decimals={7}
        walletAddress={null}
        onClose={onClose}
      />
    );

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Proposal 7');
    const closeButton = document.querySelector('button[aria-label="Close proposal details"]');
    expect(closeButton).not.toBeNull();

    const detailsTable = document.querySelector('table[aria-label="Proposal details"]');
    expect(detailsTable).not.toBeNull();

    const voteGroup = document.querySelector('div[aria-label="Vote controls"]');
    expect(voteGroup).not.toBeNull();
  });
});