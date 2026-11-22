import { create } from 'zustand';
import type { Proposal, VoteRecord } from '../types';
import { fetchAllProposals, fetchTokenDecimals, fetchHasVoted, fetchVoteRecord } from '../api';

export interface OptimisticVote {
  vote: boolean;
  weight: number;
  /** Proposal tally snapshot before the optimistic update was applied */
  previousTally: { yes: number; no: number };
}

interface ProposalState {
  proposals: Proposal[];
  decimals: number;
  loading: boolean;
  error: string | null;
  progress: { loaded: number; total: number } | null;
  /** Map from proposal id (as string) to the connected user's vote record */
  votedMap: Map<string, VoteRecord>;
  /** Map from proposal id (as string) to pending optimistic vote state */
  optimisticVotes: Map<string, OptimisticVote>;

  // Actions
  loadProposals: () => Promise<void>;
  loadVotesForUser: (walletAddress: string) => Promise<void>;
  clearVotes: () => void;
  applyOptimisticVote: (proposalId: string, vote: boolean, weight: number) => void;
  reconcileVotes: (serverProposals: Proposal[]) => void;
  clearOptimisticVote: (proposalId: string) => void;
}

/** Read a numeric tally field from a proposal, tolerating string/number shapes. */
function tallyValue(proposal: Proposal, key: 'yes' | 'no'): number {
  const raw = (proposal as unknown as Record<string, unknown>)[key];
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Return a copy of the proposal with the given tally field set. */
function withTally(proposal: Proposal, key: 'yes' | 'no', value: number): Proposal {
  return { ...proposal, [key]: value } as Proposal;
}

export const useProposalStore = create<ProposalState>((set, get) => ({
  proposals: [],
  decimals: 0,
  loading: false,
  error: null,
  progress: null,
  votedMap: new Map(),
  optimisticVotes: new Map(),

  loadProposals: async () => {
    set({ loading: true, error: null, progress: null });
    try {
      const [proposals, decimals] = await Promise.all([
        fetchAllProposals((loaded, total) => set({ progress: { loaded, total } })),
        fetchTokenDecimals(),
      ]);
      set({ proposals, decimals, loading: false, progress: null });
      // Reconcile any pending optimistic votes against the fresh server data.
      get().reconcileVotes(proposals);
    } catch (err) {
      set({ error: String(err), loading: false, progress: null });
    }
  },

  loadVotesForUser: async (walletAddress) => {
    const { proposals } = get();
    const entries = await Promise.all(
      proposals.map(async (p) => {
        const voted = await fetchHasVoted(Number(p.id), walletAddress).catch(() => false);
        if (!voted) return null;
        const record = await fetchVoteRecord(Number(p.id), walletAddress).catch(() => null);
        return record ? [String(p.id), record] as [string, VoteRecord] : null;
      })
    );
    const votedMap = new Map<string, VoteRecord>(
      entries.filter((e): e is [string, VoteRecord] => e !== null)
    );
    set({ votedMap });
  },

  clearVotes: () => set({ votedMap: new Map(), optimisticVotes: new Map() }),

  applyOptimisticVote: (proposalId, vote, weight) => {
    const { proposals, votedMap, optimisticVotes } = get();
    const key = String(proposalId);
    const index = proposals.findIndex((p) => String(p.id) === key);
    if (index === -1) return;

    const proposal = proposals[index];
    const previousTally = { yes: tallyValue(proposal, 'yes'), no: tallyValue(proposal, 'no') };
    const tallyKey: 'yes' | 'no' = vote ? 'yes' : 'no';
    const updated = withTally(proposal, tallyKey, previousTally[tallyKey] + weight);

    const nextProposals = proposals.slice();
    nextProposals[index] = updated;

    const nextVotedMap = new Map(votedMap);
    nextVotedMap.set(key, { vote, weight } as VoteRecord);

    const nextOptimistic = new Map(optimisticVotes);
    nextOptimistic.set(key, { vote, weight, previousTally });

    set({ proposals: nextProposals, votedMap: nextVotedMap, optimisticVotes: nextOptimistic });
  },

  reconcileVotes: (serverProposals) => {
    const { optimisticVotes } = get();
    if (optimisticVotes.size === 0) {
      set({ proposals: serverProposals });
      return;
    }

    const nextOptimistic = new Map(optimisticVotes);
    const nextVotedMap = new Map(get().votedMap);

    const reconciled = serverProposals.map((serverProposal) => {
      const key = String(serverProposal.id);
      const optimistic = optimisticVotes.get(key);
      if (!optimistic) return serverProposal;

      const tallyKey: 'yes' | 'no' = optimistic.vote ? 'yes' : 'no';
      const serverTally = tallyValue(serverProposal, tallyKey);
      const expectedTally = optimistic.previousTally[tallyKey] + optimistic.weight;

      // If the server tally already includes our delta, keep the server value.
      if (serverTally >= expectedTally) {
        nextOptimistic.delete(key);
        return serverProposal;
      }

      // Conflicting value: roll back the optimistic tally and votedMap entry.
      nextOptimistic.delete(key);
      nextVotedMap.delete(key);
      return withTally(serverProposal, tallyKey, serverTally);
    });

    set({ proposals: reconciled, votedMap: nextVotedMap, optimisticVotes: nextOptimistic });
  },

  clearOptimisticVote: (proposalId) => {
    const { proposals, votedMap, optimisticVotes } = get();
    const key = String(proposalId);
    const optimistic = optimisticVotes.get(key);
    if (!optimistic) return;

    const index = proposals.findIndex((p) => String(p.id) === key);
    const nextProposals = proposals.slice();
    if (index !== -1) {
      const tallyKey: 'yes' | 'no' = optimistic.vote ? 'yes' : 'no';
      nextProposals[index] = withTally(proposals[index], tallyKey, optimistic.previousTally[tallyKey]);
    }

    const nextVotedMap = new Map(votedMap);
    nextVotedMap.delete(key);

    const nextOptimistic = new Map(optimisticVotes);
    nextOptimistic.delete(key);

    set({ proposals: nextProposals, votedMap: nextVotedMap, optimisticVotes: nextOptimistic });
  },
}));
