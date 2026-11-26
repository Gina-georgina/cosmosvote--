import { create } from 'zustand';
import type { Proposal, VoteRecord } from '../types';
import { fetchAllProposals, fetchTokenDecimals, fetchHasVoted, fetchVoteRecord } from '../api';

interface ProposalState {
  proposals: Proposal[];
  decimals: number;
  loading: boolean;
  error: string | null;
  progress: { loaded: number; total: number } | null;
  /** Map from proposal id (as string) to the connected user's vote record */
  votedMap: Map<string, VoteRecord>;
  /** Current page of the proposal list (1-based) */
  currentPage: number;
  /** Number of proposals displayed per page */
  pageSize: number;

  // Actions
  loadProposals: () => Promise<void>;
  loadVotesForUser: (walletAddress: string) => Promise<void>;
  clearVotes: () => void;
  setPage: (page: number) => void;
}

export const DEFAULT_PAGE_SIZE = 10;

/** Returns the slice of proposals belonging to the given 1-based page. */
export const getPageProposals = (
  proposals: Proposal[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE
): Proposal[] => {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(proposals.length / safeSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * safeSize;
  return proposals.slice(start, start + safeSize);
};

/** Selector hook returning the proposals for the current page. */
export const usePaginatedProposals = (): Proposal[] =>
  useProposalStore((state) => getPageProposals(state.proposals, state.currentPage, state.pageSize));

export const useProposalStore = create<ProposalState>((set, get) => ({
  proposals: [],
  decimals: 0,
  loading: false,
  error: null,
  progress: null,
  votedMap: new Map(),
  currentPage: 1,
  pageSize: DEFAULT_PAGE_SIZE,

  loadProposals: async () => {
    set({ loading: true, error: null, progress: null });
    try {
      const [proposals, decimals] = await Promise.all([
        fetchAllProposals((loaded, total) => set({ progress: { loaded, total } })),
        fetchTokenDecimals(),
      ]);
      set({ proposals, decimals, loading: false, progress: null });
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

  clearVotes: () => set({ votedMap: new Map() }),

  setPage: (page) => {
    const { proposals, pageSize } = get();
    const totalPages = Math.max(1, Math.ceil(proposals.length / Math.max(1, pageSize)));
    const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
    set({ currentPage: safePage });
  },
}));
