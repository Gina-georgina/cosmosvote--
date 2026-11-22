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
  /** Scroll offset (px) of the virtualised proposal list, used to restore position */
  proposalScrollOffset: number;

  // Actions
  loadProposals: () => Promise<void>;
  loadVotesForUser: (walletAddress: string) => Promise<void>;
  clearVotes: () => void;
  setProposalScrollOffset: (offset: number) => void;
  restoreProposalScrollOffset: () => void;
}

const SCROLL_STORAGE_PREFIX = 'proposalScrollOffset';

/** Build a sessionStorage key scoped to the current page/filter. */
function scrollStorageKey(): string {
  if (typeof window === 'undefined') return SCROLL_STORAGE_PREFIX;
  const { pathname, search } = window.location;
  return `${SCROLL_STORAGE_PREFIX}:${pathname}${search}`;
}

export const useProposalStore = create<ProposalState>((set, get) => ({
  proposals: [],
  decimals: 0,
  loading: false,
  error: null,
  progress: null,
  votedMap: new Map(),
  proposalScrollOffset: 0,

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

  setProposalScrollOffset: (offset) => {
    set({ proposalScrollOffset: offset });
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(scrollStorageKey(), String(offset));
    } catch {
      // sessionStorage may be unavailable (private mode, quota); ignore.
    }
  },

  restoreProposalScrollOffset: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.sessionStorage.getItem(scrollStorageKey());
      const offset = stored !== null ? Number(stored) : 0;
      set({ proposalScrollOffset: Number.isFinite(offset) ? offset : 0 });
    } catch {
      set({ proposalScrollOffset: 0 });
    }
  },
}));
