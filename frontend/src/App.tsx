import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import type { Proposal, ProposalState, VoteRecord } from './types';
import { fetchAllProposals, fetchTokenDecimals, checkRpcReachability } from './api';
import { ProposalCard } from './components/ProposalCard';
import { ProposalSkeleton } from './components/ProposalSkeleton';
import { ProposalDetail } from './components/ProposalDetail';
import { UserDashboard } from './components/UserDashboard';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { TreasurySkeleton } from './components/TreasurySkeleton';
import { Pagination } from './components/Pagination';
import { ConnectWalletModal } from './components/ConnectWalletModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AriaLive } from './components/AriaLive';
import { ACTIVE_NETWORK } from './config';
import { formatTokenAmount, maskAddress } from './utils';
import { useTheme } from './useTheme';
import { useMeta } from './useMeta';
import { useWallet } from './WalletContext';
import { useProposalStore } from './store/proposalStore';
import { useI18n } from './I18nContext';
import './responsive.css';

// Lazy-loaded heavy tab components (Issue #396) — split into separate chunks so
// they are only fetched when the user actually visits the relevant tab.
const GovernanceAnalytics = lazy(() => import('./components/GovernanceAnalytics'));
const DelegationPanel = lazy(() => import('./components/DelegationPanel'));

const ALL_STATES: ProposalState[] = ['Active', 'Passed', 'Rejected', 'Executed', 'Cancelled'];
const PAGE_SIZE = 10;

// Admin address — in production this would come from the contract or environment config
const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS ?? null;

type AppTab = 'proposals' | 'dashboard' | 'treasury';

// Parse a proposal id from `/?proposal=<id>` or `/proposals/<id>` (Issue #394)
function parseProposalIdFromUrl(): string | null {
  const sp = new URLSearchParams(window.location.search);
  const fromQuery = sp.get('proposal');
  if (fromQuery) return fromQuery;
  const match = window.location.pathname.match(/^\/proposals\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const { t } = useI18n();

  // Wallet state comes exclusively from WalletContext (backed by Zustand walletStore).
  // No local wallet state duplicates are created here.
  const { walletAddress, tokenBalance, showModal, openModal, disconnect, refreshBalance } = useWallet();

  // votedMap from proposalStore (keyed by string id); convert to bigint keys for analytics
  const storeVotedMap = useProposalStore(s => s.votedMap);
  const votedMapBigInt = useMemo(
    () => new Map(Array.from(storeVotedMap.entries()).map(([k, v]) => [BigInt(k), v])),
    [storeVotedMap],
  );

  const { theme, setTheme } = useTheme();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [decimals, setDecimals] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // ── URL-synced search / filter / page state (Issue #17 + #19 + #377) ───
  // Initialise from query string so deep links and browser back/forward work.
  const params = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [stateFilter, setStateFilter] = useState<ProposalState | 'All'>(
    (params.get('state') as ProposalState | 'All') ?? 'All'
  );
  const [page, setPage] = useState(Number(params.get('page') ?? 1) || 1);

  // Debounced search — 300 ms delay (Issue #17)
  const debouncedSearch = useDebounce(search, 300);

  // Sync search + stateFilter + page to URL without triggering a navigation (Issue #17 + #377)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (debouncedSearch) sp.set('q', debouncedSearch); else sp.delete('q');
    if (stateFilter !== 'All') sp.set('state', stateFilter); else sp.delete('state');
    if (page > 1) sp.set('page', String(page)); else sp.delete('page');
    const newSearch = sp.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [debouncedSearch, stateFilter, page]);

  // Restore state from URL on popstate (browser back/forward) (Issue #17 + #377)
  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      setSearch(sp.get('q') ?? '');
      setStateFilter((sp.get('state') as ProposalState | 'All') ?? 'All');
      setPage(Number(sp.get('page') ?? 1) || 1);
      // Deep-link: browser back closes the modal / restores the list
      setProposalIdParam(parseProposalIdFromUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const [selected, setSelected] = useState<Proposal | null>(null);
  // Deep-link (Issue #394): id parsed from URL, plus not-found flag
  const [proposalIdParam, setProposalIdParam] = useState<string | null>(() => parseProposalIdFromUrl());
  const [proposalNotFound, setProposalNotFound] = useState(false);
  const [rpcWarning, setRpcWarning] = useState<string | null>(null);
  const [showFullAddress, setShowFullAddress] = useState(false);
  // Tab navigation — proposals / dashboard / treasury
  const [activeTab, setActiveTab] = useState<AppTab>('proposals');
  // Loading states for dashboard and treasury tabs
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingTreasury, setLoadingTreasury] = useState(false);
  // voted map: proposalId → VoteRecord
  const [votedMap] = useState<Map<bigint, VoteRecord>>(new Map());
  const triggerRef = useRef<HTMLElement>(null);
  // Preserve scroll position when opening/closing proposal detail views
  const scrollPositionRef = useRef<number>(0);
  // PWA install prompt — wired to the beforeinstallprompt event (Issue #24)
  const { canInstall, install, dismiss } = usePWAInstall();

  useMeta(
    selected ? selected.title : t('app.meta.title'),
    selected
      ? `${selected.title} — ${selected.description.slice(0, 120)}`
      : t('app.meta.description')
  );

  useEffect(() => {
    Promise.all([
      fetchAllProposals((loaded, total) => setProgress({ loaded, total })),
      fetchTokenDecimals(),
    ])
      .then(([props, decs]) => {
        setProposals(props);
        setDecimals(decs);
        setAnnouncement(t('app.announce.proposalsLoaded', { count: props.length }));
      })
      .catch(e => {
        setError(String(e));
        setAnnouncement('');
      })
      .finally(() => { setLoading(false); setProgress(null); });
  }, [t]);

  useEffect(() => {
    checkRpcReachability().catch(err => {
      setRpcWarning(String(err));
    });
  }, []);

  // Issue #394: open the detail modal for the deep-linked proposal id.
  // Supports both `/?proposal=<id>` and `/proposals/<id>`. Invalid or unknown
  // ids render a not-found message instead of crashing.
  useEffect(() => {
    if (loading) return;
    if (proposalIdParam === null) {
      setProposalNotFound(false);
      return;
    }
    const match = proposals.find(pr => String(pr.id) === proposalIdParam);
    if (match) {
      setProposalNotFound(false);
      setSelected(match);
    } else {
      setSelected(null);
      setProposalNotFound(true);
    }
  }, [loading, proposals, proposalIdParam]);

  // Open the detail modal and push a deep-link history entry (Issue #394)
  const openProposal = (proposal: Proposal) => {
    setProposalNotFound(false);
    setSelected(proposal);
    setProposalIdParam(String(proposal.id));
    const sp = new URLSearchParams(window.location.search);
    sp.set('proposal', String(proposal.id));
    window.history.pushState(null, '', `?${sp.toString()}`);
  };

  // Close the detail modal and remove the deep-link param from history (Issue #394)
  const closeProposal = () => {
    setSelected(null);
    setProposalNotFound(false);
    setProposalIdParam(null);
    const sp = new URLSearchParams(window.location.search);
    sp.delete('proposal');
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    // Restore scroll position to where it was when the detail was opened
    window.scrollTo({ top: scrollPositionRef.current });
  };

  // Filter computation memoised on the inputs that actually affect the result
  // set (Issue #389). Unrelated state changes (polling updates, theme, etc.)
  // do not recompute this.
  const filtered = useMemo(() => {
    return proposals.filter(p => {
      const matchState = stateFilter === 'All' || p.state === stateFilter;
      const q = debouncedSearch.toLowerCase();
      const matchSearch = !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
      return matchState && matchSearch;
    });
  }, [proposals, debouncedSearch, stateFilter]);

  // Reset to page 1 whenever search or filter changes so the user always
  // starts at the beginning of the new result set.
  useEffect(() => {
    setPage(1);
  }, [search, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Clamp current page if filtered results shrink (e.g. after a search)
  const safePage = Math.min(page, totalPages);

  // Pagination slice memoised on filtered/safePage (Issue #389).
  const pagedProposals = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  // ── Virtualised proposal list (Issue #408) ──────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  const { restoreProposalScrollOffset, setProposalScrollOffset } = useProposalStore();

  const virtualizer = useVirtualizer({
    count: pagedProposals.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 180,
    overscan: 5,
  });

  // Restore the persisted scroll offset on mount and on browser back/forward.
  useEffect(() => {
    const restore = () => {
      const offset = restoreProposalScrollOffset();
      if (offset > 0 && listRef.current) {
        listRef.current.scrollTop = offset;
      }
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [restoreProposalScrollOffset]);

  const handleListScroll = useCallback(() => {
    if (listRef.current) {
      setProposalScrollOffset(listRef.current.scrollTop);
    }
  }, [setProposalScrollOffset]);

  // Keyboard navigation between cards (ArrowDown / ArrowUp) after virtualisation.
  const handleListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const container = listRef.current;
    if (!container) return;
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('[data-proposal-card]')
    );
    if (cards.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? cards.indexOf(active) : -1;
    let nextIndex: number;
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : Math.min(cards.length - 1, currentIndex + 1);
    } else {
      nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    }
    e.preventDefault();
    const target = cards[nextIndex];
    if (target) {
      target.focus();
      // Ensure the focused card is scrolled into view within the virtual list.
      const virtualIndex = Number(target.dataset.virtualIndex ?? nextIndex);
      virtualizer.scrollToIndex(virtualIndex, { align: 'auto' });
    }
  }, [virtualizer]);

  // AriaLive page-change announcement (Issue #19)
  const [pageAnnouncement, setPageAnnouncement] = useState('');

  const goToPage = (next: number) => {
    setPage(next);
    setPageAnnouncement(t('app.announce.page', { page: next, total: totalPages }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProposalCreated = (id: number) => {
    setAnnouncement(t('app.announce.proposalCreated', { id }));
    fetchAllProposals().then(setProposals).catch(() => {});
    // Issue #391: refresh token balance immediately after proposal submission
    refreshBalance().catch(() => {});
  };

  // Simulate loading state transitions for dashboard and treasury tabs.
  // In production these would drive real fetch calls (e.g. fetchVoteHistory,
  // fetchTreasuryBalance). The skeleton is shown while loadingDashboard /
  // loadingTreasury is true.
  useEffect(() => {
    if (activeTab === 'dashboard' && walletAddress) {
      setLoadingDashboard(true);
      const t = setTimeout(() => setLoadingDashboard(false), 600);
      return () => clearTimeout(t);
    }
  }, [activeTab, walletAddress]);

  useEffect(() => {
    if (activeTab === 'treasury') {
      setLoadingTreasury(true);
      const t = setTimeout(() => setLoadingTreasury(false), 600);
      return () => clearTimeout(t);
    }
  }, [activeTab]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <AriaLive polite={announcement || pageAnnouncement} assertive={error ?? undefined} />

      {/* Header */}
      <header style={{ background: 'var(--bg-header)', color: 'var(--text-header)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>🌌 {t('app.title')}</h1>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-header-sub)' }}>{t('app.subtitle', { network: ACTIVE_NETWORK })}</span>
        </div>
        {ACTIVE_NETWORK === 'testnet' && (
          <a href="/faucet" style={{ color: 'var(--text-header)', fontSize: '0.875rem' }}>{t('app.getTestTokens')}</a>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* PWA install banner — shown on supported browsers (Issue #24) */}
          {canInstall && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(74,144,226,0.15)', border: '1px solid #4A90E2', borderRadius: 6, padding: '0.25rem 0.6rem' }}>
              <span style={{ fontSize: '0.8rem' }}>📲</span>
              <button onClick={install} style={{ background: '#4A90E2', color: '#fff', border: 'none', borderRadius: 4, padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.75rem' }}>{t('app.install')}</button>
              <button onClick={dismiss} aria-label={t('app.dismissInstallPrompt')} style={{ background: 'none', border: 'none', color: 'var(--text-header-sub)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.2rem' }}>✕</button>
            </div>
          )}
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            aria-label={t('app.theme.switchTo', { mode: theme === 'dark' ? t('app.theme.light') : t('app.theme.dark') })}
            aria-pressed={theme === 'dark'}
            style={{
              background: 'none',
              border: '1px solid var(--text-header-sub)',
              borderRadius: 6,
              padding: '0.4rem 0.6rem',
              cursor: 'pointer',
              color: 'var(--text-header)',
              fontSize: '1rem',
              lineHeight: 1,
              outline: 'none',
            }}
            onFocus={e => { (e.currentTarget as HTMLButtonElement).style.outline = '2px solid #60a5fa'; (e.currentTarget as HTMLButtonElement).style.outlineOffset = '2px'; }}
            onBlur={e => { (e.currentTarget as HTMLButtonElement).style.outline = 'none'; }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
            <span style={{ marginLeft: '0.3rem', fontSize: '0.75rem' }}>
              {theme === 'dark' ? t('app.theme.light') : t('app.theme.dark')}
            </span>
          </button>
          {walletAddress ? (
            <div style={{ textAlign: 'right' }}>
              <div
                style={{ fontSize: '0.75rem', color: 'var(--text-header-sub)', cursor: 'pointer', userSelect: 'none' }}
                title={showFullAddress ? t('app.wallet.hideAddress') : walletAddress}
                onClick={() => setShowFullAddress(s => !s)}
                aria-label={showFullAddress ? t('app.wallet.hideFullAddress') : t('app.wallet.revealFullAddress')}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setShowFullAddress(s => !s)}
              >
                {showFullAddress ? walletAddress : maskAddress(walletAddress)}
              </div>
              {tokenBalance !== null && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-header-sub)' }}>
                  {formatTokenAmount(tokenBalance, decimals)}
                </div>
              )}
              <button
                onClick={disconnect}
                style={{ marginTop: '0.25rem', background: 'none', color: '#94a3b8', border: '1px solid #475569', borderRadius: 4, padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem' }}
              >
                {t('app.wallet.disconnect')}
              </button>
            </div>
          ) : (
            <button
              onClick={openModal}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer' }}
            >
              {t('app.wallet.connect')}
            </button>
          )}
        </div>
      </header>

      <ErrorBoundary>
        <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>

          {/* ── Tab navigation ── */}
          <nav
            aria-label={t('app.nav.sections')}
            style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--border-color, #e2e8f0)' }}
          >
            {([
              { id: 'proposals', label: t('app.tabs.proposals') },
              ...(walletAddress ? [{ id: 'dashboard', label: t('app.tabs.dashboard') }] : []),
              { id: 'treasury', label: t('app.tabs.treasury') },
            ] as Array<{ id: AppTab; label: string }>).map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                  marginBottom: -2,
                  padding: '0.6rem 1rem',
                  cursor: 'pointer',
                  fontWeight: activeTab === tab.id ? 700 : 400,
                  color: activeTab === tab.id ? '#2563eb' : 'var(--text-muted, #64748b)',
                  fontSize: '0.875rem',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* ── Dashboard tab ── */}
          {activeTab === 'dashboard' && walletAddress && (
            loadingDashboard
              ? <DashboardSkeleton />
              : (
                <ErrorBoundary>
                <UserDashboard
                  walletAddress={walletAddress}
                  tokenBalance={tokenBalance}
                  decimals={decimals}
                  proposals={proposals}
                  votedMap={votedMap}
                  onCreateProposal={() => setActiveTab('proposals')}
                  onDisconnect={disconnect}
                />
                </ErrorBoundary>
              )
          )}

          {/* ── Treasury tab ── */}
          {activeTab === 'treasury' && (
            loadingTreasury
              ? <TreasurySkeleton />
              : (
                <div
                  style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}
                  aria-label={t('app.treasury.ariaLabel')}
                >
                  <p>{t('app.treasury.placeholder')}</p>
                </div>
              )
          )}

          {/* ── Proposals tab ── */}
          {activeTab === 'proposals' && (
            <>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <input
              type="search"
              placeholder={t('app.search.placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '0.5rem 0.75rem', border: '1px solid var(--input-border)', borderRadius: 6, fontSize: '0.875rem', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
              aria-label={t('app.search.ariaLabel')}
            />
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value as ProposalState | 'All')}
              style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--input-border)', borderRadius: 6, fontSize: '0.875rem', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
              aria-label={t('app.filter.ariaLabel')}
            >
              <option value="All">{t('app.filter.allStates')}</option>
              {ALL_STATES.map(s => <option key={s} value={s}>{t(`proposal.state.${s}`)}</option>)}
            </select>
          </div>

          {rpcWarning && (
            <div style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
              <strong>{t('app.rpcWarning.label')}</strong> {rpcWarning}
            </div>
          )}

          {/* Stats bar */}
          <div className="stats-bar" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: t('app.stats.total'), count: proposals.length, color: 'var(--text-primary)' },
              { label: t('app.stats.active'), count: proposals.filter(p => p.state === 'Active').length, color: '#2563eb' },
              { label: t('app.stats.passed'), count: proposals.filter(p => p.state === 'Passed').length, color: '#16a34a' },
              { label: t('app.stats.executed'), count: proposals.filter(p => p.state === 'Executed').length, color: '#7c3aed' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ background: 'var(--bg-stat)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.5rem 1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{count}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {error && <p style={{ textAlign: 'center', color: '#dc2626', marginBottom: '1rem' }}>{t('app.error.prefix')} {error}</p>}

          <div style={{ display: 'grid', gap: '1rem' }}>
            {loading && (
              <>
                {progress && (
                  <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                    {t('app.loading.proposals', { loaded: progress.loaded, total: progress.total })}
                  </p>
                )}
                <ProposalSkeleton />
                <ProposalSkeleton />
                <ProposalSkeleton />
              </>
            )}
            {!loading && !error && filtered.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('app.empty.noProposals')}</p>
            )}
            {!loading && pagedProposals.map(p => (
              <ProposalCard
                key={String(p.id)}
                proposal={p}
                decimals={decimals}
                onClick={(e) => {
                  triggerRef.current = e?.currentTarget as HTMLElement ?? null;
                  // Preserve scroll position so it can be restored when detail closes
                  scrollPositionRef.current = window.scrollY;
                  openProposal(p);
                }}
              >
                {virtualizer.getVirtualItems().map(virtualRow => {
                  const p = pagedProposals[virtualRow.index];
                  return (
                    <div
                      key={String(p.id)}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom: '1rem',
                      }}
                    >
                      <ProposalCard
                        proposal={p}
                        decimals={decimals}
                        data-proposal-card
                        data-virtual-index={virtualRow.index}
                        onClick={(e) => {
                          triggerRef.current = e?.currentTarget as HTMLElement ?? null;
                          // Preserve scroll position so it can be restored when detail closes
                          scrollPositionRef.current = listRef.current?.scrollTop ?? 0;
                          setProposalScrollOffset(scrollPositionRef.current);
                          setSelected(p);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              totalCount={filtered.length}
              pageSize={PAGE_SIZE}
              onPrev={() => goToPage(safePage - 1)}
              onNext={() => goToPage(safePage + 1)}
              onPage={goToPage}
            />
          )}

          {/* ── Governance Analytics (Issue #129) — lazy-loaded (Issue #396) ── */}
          {!loading && proposals.length > 0 && (
            <ErrorBoundary>
            <GovernanceAnalytics
              proposals={proposals}
              decimals={decimals}
              votedMap={votedMapBigInt}
              onRefresh={() =>
                fetchAllProposals().then(setProposals).catch(() => {})
              }
            />
            </ErrorBoundary>
          )}
        </main>
      </ErrorBoundary>

      {/* ── Footer ── */}
      <footer
        style={{
          textAlign: 'center',
          padding: '1.5rem 1rem',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-color)',
        }}
      >
        <a
          href="/docs/analytics-policy.md"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'underline' }}
        >
          {t('app.footer.analyticsPolicy')}
        </a>
      </footer>

      {/* ── Modals ── */}

      {proposalNotFound && !selected && (
        <div
          role="alert"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
          <div style={{ background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #0f172a)', borderRadius: 10, padding: '1.5rem', maxWidth: 420, width: '100%', textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.125rem' }}>Proposal not found</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              No proposal matches the link you followed. It may have been removed or the id is invalid.
            </p>
            <button
              onClick={closeProposal}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer' }}
            >
              Back to proposals
            </button>
          </div>
        </div>
      )}

      {selected && (
        <ProposalDetail
          proposal={selected}
          decimals={decimals}
          walletAddress={walletAddress}
          adminAddress={ADMIN_ADDRESS}
          onClose={closeProposal}
          onVoteSuccess={() => { refreshBalance().catch(() => {}); }}
          triggerRef={triggerRef}
        />
      )}

      {showModal && <ConnectWalletModal />}

      {/* ── Cookie consent banner (Issue #32) ── */}
      <CookieConsent />
    </div>
  );
}