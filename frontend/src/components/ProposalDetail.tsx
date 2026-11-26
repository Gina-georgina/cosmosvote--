/**
 * ProposalDetail — modal dialog showing full proposal info and vote controls.
 *
 * Accessibility (WCAG 2.1 AA) — Issue #16:
 *   - aria-pressed on Yes/No/Abstain vote buttons reflects the user's current vote.
 *   - aria-disabled + title communicate the disabled state to screen readers.
 *   - Keyboard shortcuts Y / N / A submit the corresponding vote when the dialog
 *     has focus; shortcuts are documented via aria-keyshortcuts and a tooltip.
 *   - After a successful vote submission focus moves to a confirmation message
 *     element so screen readers immediately announce the outcome.
 *   - Focus trap and Escape-to-close behaviour are preserved.
 *   - Focus is returned to the triggering element on unmount.
 *
 * Issue #15: Real-time tally polling
 *   - usePolling re-fetches tally data every VITE_TALLY_POLL_INTERVAL ms (default 15 s)
 *     while the proposal is Active.
 *   - Polling stops when the component unmounts or the proposal is no longer Active.
 *   - A "Updated X seconds ago" timestamp is shown in the UI.
 */
import type { Proposal } from '../types';
import { fetchHasVoted, fetchVoteRecord, fetchProposal } from '../api';
import { useEffect, useRef, useState, useCallback } from 'react';
import { formatTokenAmount, maskAddress, sanitizeWalletMessage } from '../utils';
import { explorerAccountUrl } from '../config';
import { usePolling } from '../hooks/usePolling';
import { useI18n } from '../i18n/I18nContext';

/** Polling interval in ms — configurable via VITE_TALLY_POLL_INTERVAL, default 15 s. */
const TALLY_POLL_INTERVAL = Number(import.meta.env.VITE_TALLY_POLL_INTERVAL ?? 15_000);

/** Token symbol shown next to formatted vote weights. */
const TOKEN_SYMBOL = import.meta.env.VITE_TOKEN_SYMBOL ?? 'CVT';

/** Format a raw i128 weight as a human-readable token amount with symbol. */
function formatWeight(weight: bigint, decimals: number): string {
  return `${formatTokenAmount(weight, decimals)} ${TOKEN_SYMBOL}`;
}

/** Copy text to the clipboard, falling back to a hidden textarea + execCommand. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
=======

interface Props {
  proposal: Proposal;
  decimals: number;
  walletAddress: string | null;
  adminAddress?: string | null;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

function formatDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString();
}

type VoteChoice = 'Yes' | 'No' | 'Abstain';

const VOTE_CONFIG: Array<{
  vote: VoteChoice;
  labelKey: string;
  shortcut: string;
  emoji: string;
  color: string;
  shortcutKey: string;
}> = [
  { vote: 'Yes',     labelKey: 'proposalDetail.voteYes', shortcut: 'Y', emoji: '✅', color: '#16a34a', shortcutKey: 'y' },
  { vote: 'No',      labelKey: 'proposalDetail.voteNo',  shortcut: 'N', emoji: '❌', color: '#dc2626', shortcutKey: 'n' },
  { vote: 'Abstain', labelKey: 'proposalDetail.abstain', shortcut: 'A', emoji: '⬜', color: '#6b7280', shortcutKey: 'a' },
];

export function ProposalDetail({ proposal: p, decimals, walletAddress, adminAddress, onClose, triggerRef }: Props) {
  // Get signTransaction from the wallet store so votes can be signed by the real wallet.
  const { signTransaction } = useWallet();
  const { t } = useI18n();

  const [hasVoted, setHasVoted] = useState<boolean | null>(null);
  const [voteRecord, setVoteRecord] = useState<{ vote: string; weight: bigint } | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteConfirmation, setVoteConfirmation] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [showFullProposer, setShowFullProposer] = useState(false);
  const [copiedProposer, setCopiedProposer] = useState(false);
  // For multi-choice proposals: the index the user has selected (null = none selected yet)
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  // Voting power panel state — issue #20
  const [ownBalance, setOwnBalance] = useState<bigint | null>(null);
  const [delegatedWeight, setDelegatedWeight] = useState<bigint | null>(null);
  const [votingPowerLoading, setVotingPowerLoading] = useState(false);

  // Live tally — starts from the prop and updates via polling
  const [tally, setTally] = useState<{ yes: bigint; no: bigint; abstain: bigint }>({
    yes: p.votes_yes,
    no: p.votes_no,
    abstain: p.votes_abstain,
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  // Admin cancel confirmation flow — Issue #384
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // AriaLive announcement for tally changes — Issue #397
  const [tallyAnnouncement, setTallyAnnouncement] = useState('');
  const prevTallyRef = useRef<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Ref to the confirmation message — focus moves here after a successful vote
  const confirmationRef = useRef<HTMLDivElement>(null);

  const isProposalActive = p.state === 'Active';

  // Optimistic vote state from the proposal store (issue #400)
  const applyOptimisticVote = useProposalStore(s => s.applyOptimisticVote);
  const reconcileOptimisticVote = useProposalStore(s => s.reconcileOptimisticVote);

  // Fetch latest tally from chain
  const fetchTally = useCallback(async () => {
    const fresh = await fetchProposal(Number(p.id));
    // Reconcile any optimistic vote against the server tally. If the server
    // value conflicts with the optimistic value, roll back to server values.
    const reconciled = reconcileOptimisticVote(Number(p.id), {
      yes: fresh.votes_yes,
      no: fresh.votes_no,
      abstain: fresh.votes_abstain,
    });
    setTally({
      yes: reconciled.tally.yes,
      no: reconciled.tally.no,
      abstain: reconciled.tally.abstain,
    });
    if (reconciled.rolledBack) {
      setHasVoted(false);
      setVoteRecord(null);
    }
    setLastUpdated(new Date());
  }, [p.id, reconcileOptimisticVote]);

  // Poll every TALLY_POLL_INTERVAL ms while Active
  usePolling(fetchTally, { interval: TALLY_POLL_INTERVAL, enabled: isProposalActive });

  // Announce tally changes to screen readers at most once per polling cycle — Issue #397
  useEffect(() => {
    const tallyString = `Yes ${String(tally.yes)}, No ${String(tally.no)}, Abstain ${String(tally.abstain)}`;
    if (prevTallyRef.current === tallyString) return;
    prevTallyRef.current = tallyString;
    setTallyAnnouncement(`Tally updated: ${tallyString}`);
  }, [tally]);

  // Update "X seconds ago" display every second
  useEffect(() => {
    if (!lastUpdated) return;
    const tick = () => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [lastUpdated]);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const votingOpen = isProposalActive && now >= p.start_time && now <= p.end_time;
  const canVote = !!walletAddress && votingOpen && hasVoted === false && !isVoting;

  // Fetch vote status when the dialog opens or walletAddress changes
  useEffect(() => {
    if (!walletAddress) return;
    Promise.all([
      fetchHasVoted(Number(p.id), walletAddress),
      fetchVoteRecord(Number(p.id), walletAddress),
    ]).then(([voted, record]) => {
      setHasVoted(voted);
      setVoteRecord(record);
    }).catch(() => {
      setHasVoted(false);
      setVoteRecord(null);
    });
  }, [p.id, walletAddress]);

  // Fetch voting power (own balance + delegated weight) — issue #20
  useEffect(() => {
    if (!walletAddress) return;
    setVotingPowerLoading(true);
    Promise.all([
      fetchTokenBalance(walletAddress),
      fetchDelegatedWeight(walletAddress, []),
    ])
      .then(([balance, delegated]) => {
        setOwnBalance(balance);
        setDelegatedWeight(delegated);
      })
      .catch(() => {
        setOwnBalance(BigInt(0));
        setDelegatedWeight(BigInt(0));
      })
      .finally(() => setVotingPowerLoading(false));
  }, [walletAddress]);

  // Focus the close button when the dialog opens
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Return focus to the element that opened the dialog on unmount
  useEffect(() => {
    return () => {
      triggerRef?.current?.focus();
    };
  }, [triggerRef]);

  // Clear any pending "Copied!" reset timer on unmount
  useEffect(() => {
    return () => {
      if (shareResetTimer.current) clearTimeout(shareResetTimer.current);
    };
  }, []);

  // Copy the canonical deep-link URL for this proposal to the clipboard.
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/?proposal=${String(p.id)}`;
    const showFeedback = (state: 'copied' | 'error') => {
      setShareState(state);
      if (shareResetTimer.current) clearTimeout(shareResetTimer.current);
      shareResetTimer.current = setTimeout(() => setShareState('idle'), 2_000);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showFeedback('copied');
      } else {
        // Fallback for browsers without the Clipboard API
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        showFeedback(ok ? 'copied' : 'error');
      }
    } catch {
      showFeedback('error');
    }
  }, [p.id]);

  // Move focus to the confirmation message after a successful vote
  useEffect(() => {
    if (voteConfirmation) {
      confirmationRef.current?.focus();
    }
  }, [voteConfirmation]);

  // Focus trap + Escape close + keyboard shortcuts Y / N / A
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      // Keyboard shortcuts — only fire when the user is not typing in an input
      const tag = (e.target as HTMLElement).tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (!isTyping && canVote) {
        const match = VOTE_CONFIG.find(v => v.shortcutKey === e.key.toLowerCase());
        if (match) {
          e.preventDefault();
          void handleVote(match.vote);
          return;
        }
      }

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const elements = Array.from(dialog.querySelectorAll<HTMLElement>(focusable));
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, canVote]);  // re-bind when canVote changes so shortcuts stay accurate

  const total = tally.yes + tally.no + tally.abstain;
  const shortAddress = maskAddress(p.proposer);
  const hasChoices = Array.isArray(p.choices) && p.choices.length > 0;

  // Winning choice for finalised multi-choice proposals (index into p.choices)
  const winningChoiceIndex: number | null =
    !isProposalActive && hasChoices && typeof p.winning_choice === 'number'
      ? p.winning_choice
      : null;

  // Wallet-facing message fields are sanitized to ASCII-safe characters so that
  // frontend-supplied proposal content cannot inject misleading content into
  // wallet prompts or vote memos (see docs/wallet-message-sanitization.md).
  const safeTitle = sanitizeWalletMessage(p.title);
  const safeDescription = sanitizeWalletMessage(p.description);
  const safeChoices = hasChoices
    ? (p.choices ?? []).map(choice => sanitizeWalletMessage(choice))
    : [];

  // Close the cancel confirmation modal without cancelling
  function closeCancelConfirm() {
    setShowCancelConfirm(false);
    setCancelReason('');
  }

  // Submit the cancellation only after explicit confirmation — Issue #384
  async function handleConfirmCancel() {
    await cancelProposal(Number(p.id), cancelReason);
    closeCancelConfirm();
  }

  // Submit a vote via the connected wallet. Signs and broadcasts a real Soroban transaction.
  async function handleVote(voteInput: VoteInput) {
    if (!canVote || !walletAddress) return;
    setIsVoting(true);
    setVoteError(null);
    setVoteConfirmation(null);
    try {
      const txHash = await castVote(walletAddress, Number(p.id), voteInput, signTransaction);
      setHasVoted(true);
      const voteLabel =
        typeof voteInput === 'object' && 'choice' in voteInput
          ? (safeChoices[voteInput.choice] ?? t('proposalDetail.choiceFallback', { index: voteInput.choice }))
          : t(VOTE_CONFIG.find(v => v.vote === voteInput)?.labelKey ?? 'proposalDetail.voteYes');
      setVoteRecord({ vote: voteLabel, weight: BigInt(0) });
      setVoteConfirmation(
        sanitizeWalletMessage(
          t('proposalDetail.voteSubmitted', { vote: voteLabel, id: String(p.id) }),
        ),
      );
      // Refresh the header token balance so it reflects the post-vote state.
      void refreshBalance();
    } catch (e) {
      setVoteError(
        t('proposalDetail.voteFailed', {
          error: e instanceof Error ? e.message : t('proposalDetail.unknownError'),
        }),
      );
    } finally {
      setIsVoting(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-dialog-title"
        style={{ background: '#fff', borderRadius: 12, padding: '2rem', maxWidth: 600, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Skeleton pulse animation */}
        <style>{`@keyframes pulse{0%,100%{background-position:100% 50%}50%{background-position:0% 50%}}`}</style>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 id="proposal-dialog-title" style={{ margin: 0 }}>
            {t('proposalDetail.title', { id: String(p.id) })}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label={t('proposalDetail.closeDialog')}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
          >×</button>
        </div>

        <h3 style={{ margin: '0 0 0.5rem' }}>{safeTitle}</h3>
        <p style={{ color: '#555' }}>{safeDescription}</p>

        {/* Screen-reader announcement for tally changes — Issue #397 */}
        <AriaLive polite={tallyAnnouncement} />

        {/* Discussion link — shown only when discussion_url is a valid HTTPS URL */}
        {p.discussion_url && /^https:\/\/.+/.test(p.discussion_url) && (
          <p className="no-print" style={{ marginBottom: '1rem' }}>
            <a
              href={p.discussion_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.375rem 0.75rem',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 6,
                color: '#1d4ed8',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              💬 {t('proposalDetail.discussion')}
            </a>
          </p>
        )}

        {/* Details table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
          <tbody>
            {[
              [t('proposalDetail.state'), p.state],
              [t('proposalDetail.proposer'), (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <a
                    href={explorerAccountUrl(p.proposer)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={p.proposer}
                    aria-label={p.proposer}
                    style={{ color: '#2563eb', textDecoration: 'none' }}
                  >
                    {showFullProposer ? p.proposer : shortAddress}
                  </a>
                  <button
                    onClick={() => setShowFullProposer(s => !s)}
                    aria-label={showFullProposer ? t('proposalDetail.hideProposer') : t('proposalDetail.revealProposer')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.75rem', padding: 0 }}
                  >
                    {showFullProposer ? '🙈' : '👁'}
                  </button>
                  <button
                    onClick={() => {
                      void copyToClipboard(p.proposer).then(ok => {
                        if (ok) {
                          setCopiedProposer(true);
                          setTimeout(() => setCopiedProposer(false), 1_500);
                        }
                      });
                    }}
                    aria-label={copiedProposer ? 'Proposer address copied' : 'Copy proposer address'}
                    title={copiedProposer ? 'Copied!' : 'Copy address'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.75rem', padding: 0 }}
                  >
                    {copiedProposer ? '✅' : '📋'}
                  </button>
                </span>
              )],
              [t('proposalDetail.start'), formatDate(p.start_time)],
              [t('proposalDetail.end'), formatDate(p.end_time)],
              [t('proposalDetail.quorum'), formatTokenAmount(p.quorum, decimals)],
              [t('proposalDetail.totalVotes'), formatTokenAmount(total, decimals)],
            ].map(([k, v]) => (
              <tr key={String(k)} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '0.4rem 0', color: '#888', width: '40%' }}>{k}</td>
                <td style={{ padding: '0.4rem 0', fontWeight: 500 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Live tally — updated via polling while Active */}
        {isProposalActive && (
          <div className="print-tally" style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-vote-cell, #f9fafb)', borderRadius: 8, border: '1px solid var(--border-color, #e5e7eb)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>
                {t('proposalDetail.liveTally')}
              </span>
              {secondsAgo !== null && (
                <span
                  className="no-print"
                  aria-live="polite"
                  aria-atomic="true"
                  style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}
                >
                  {t('proposalDetail.updatedAgo', { seconds: secondsAgo })}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#16a34a' }}>{formatTokenAmount(tally.yes, decimals)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}>{t('proposalDetail.yes')}</div>
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#dc2626' }}>{formatTokenAmount(tally.no, decimals)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}>{t('proposalDetail.no')}</div>
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#6b7280' }}>{formatTokenAmount(tally.abstain, decimals)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}>{t('proposalDetail.abstain')}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Vote confirmation message (receives focus after vote) ── */}
        {voteConfirmation && (
          <div
            ref={confirmationRef}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            tabIndex={-1}
            style={{
              padding: '0.75rem', background: '#dcfce7', borderRadius: 8,
              fontSize: '0.875rem', marginBottom: '1rem', color: '#166534',
              outline: 'none',
            }}
          >
            ✅ {voteConfirmation}
          </div>
        )}

        {/* ── Vote error message ── */}
        {voteError && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: '0.75rem', background: '#fee2e2', borderRadius: 8,
              fontSize: '0.875rem', marginBottom: '1rem', color: '#991b1b',
            }}
          >
            ⚠️ {voteError}
          </div>
        )}

        {/* ── Vote section ── */}
        {walletAddress && (
          <div className="no-print" style={{ padding: '0.75rem', background: '#f0f9ff', borderRadius: 8, fontSize: '0.875rem', marginBottom: '1rem' }}>
            {/* Voting power panel — issue #20 */}
            {hasVoted === false && isProposalActive && (
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 6,
                  padding: '0.6rem 0.85rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: '0.35rem' }}>
                  🗳️ {t('proposalDetail.yourVotingPower')}
                </div>
                {votingPowerLoading ? (
                  <div
                    aria-busy="true"
                    aria-label={t('proposalDetail.loadingVotingPower')}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                    }}
                  >
                    {/* Skeleton lines */}
                    {[100, 80].map(w => (
                      <div
                        key={w}
                        style={{
                          height: 12,
                          width: `${w}%`,
                          background: 'linear-gradient(90deg,#e0e7ff 25%,#c7d2fe 50%,#e0e7ff 75%)',
                          backgroundSize: '200% 100%',
                          borderRadius: 4,
                          animation: 'pulse 1.4s ease-in-out infinite',
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <span>
                        <span style={{ color: '#64748b' }}>{t('proposalDetail.ownBalance')} </span>
                        <strong>{ownBalance !== null ? formatTokenAmount(ownBalance, decimals) : '—'}</strong>
                      </span>
                      <span>
                        <span style={{ color: '#64748b' }}>{t('proposalDetail.delegated')} </span>
                        <strong>{delegatedWeight !== null ? formatTokenAmount(delegatedWeight, decimals) : '—'}</strong>
                      </span>
                    </div>
                    {ownBalance !== null && delegatedWeight !== null && ownBalance + delegatedWeight === BigInt(0) && (
                      <div
                        role="alert"
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.4rem 0.6rem',
                          background: '#fef9c3',
                          border: '1px solid #fde047',
                          borderRadius: 5,
                          color: '#78350f',
                          fontWeight: 500,
                        }}
                      >
                        ⚠️ {t('proposalDetail.zeroVotingPower')}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {hasVoted === null && <span>{t('proposalDetail.checkingVoteStatus')}</span>}

            {hasVoted && voteRecord && !voteConfirmation && (
              <span>
                {t('proposalDetail.youVoted')} <strong>{voteRecord.vote}</strong>{' '}
                {t('proposalDetail.withWeight')} {formatTokenAmount(voteRecord.weight, decimals)}
              </span>
            )}

            {hasVoted === false && isProposalActive && (
              <>
                {hasChoices ? (
                  /* ── Multi-choice vote UI ── */
                  <fieldset
                    style={{ border: 'none', padding: 0, margin: 0 }}
                    aria-labelledby="choice-legend"
                    disabled={!canVote || isVoting}
                  >
                    <legend
                      id="choice-legend"
                      style={{ margin: '0 0 0.5rem', color: '#374151', fontWeight: 500, fontSize: '0.875rem' }}
                    >
                      {t('proposalDetail.selectChoice')}
                    </legend>
                    <ul
                      role="radiogroup"
                      aria-labelledby="choice-legend"
                      style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                    >
                      {safeChoices.map((choiceLabel, idx) => {
                        const inputId = `choice-${String(p.id)}-${idx}`;
                        const isSelected = selectedChoiceIndex === idx;
                        return (
                          <li key={idx}>
                            <label
                              htmlFor={inputId}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.6rem 0.75rem',
                                border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                                borderRadius: 6,
                                cursor: canVote && !isVoting ? 'pointer' : 'not-allowed',
                                background: isSelected ? '#eff6ff' : '#fff',
                                fontSize: '0.875rem',
                              }}
                            >
                              <input
                                id={inputId}
                                type="radio"
                                name={`proposal-${String(p.id)}-choice`}
                                value={idx}
                                checked={isSelected}
                                disabled={!canVote || isVoting}
                                onChange={() => setSelectedChoiceIndex(idx)}
                                aria-label={choiceLabel}
                                aria-pressed={isSelected}
                                style={{ accentColor: '#2563eb' }}
                              />
                              {choiceLabel}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      onClick={() => {
                        if (selectedChoiceIndex !== null) {
                          void handleVote({ choice: selectedChoiceIndex });
                        }
                      }}
                      disabled={!canVote || isVoting || selectedChoiceIndex === null}
                      aria-disabled={!canVote || isVoting || selectedChoiceIndex === null}
                      aria-busy={isVoting}
                      style={{
                        padding: '0.6rem 1.25rem',
                        background: !canVote || isVoting || selectedChoiceIndex === null ? '#e5e7eb' : '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: !canVote || isVoting || selectedChoiceIndex === null ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      {isVoting ? t('proposalDetail.submitting') : t('proposalDetail.submitVote')}
                    </button>
                  </fieldset>
                ) : (
                  /* ── Standard Yes / No / Abstain vote UI ── */
                  <>
                    {/* Keyboard shortcut hint */}
                    <p
                      id="vote-shortcut-hint"
                      style={{ margin: '0 0 0.5rem', color: '#374151' }}
                    >
                      {t('proposalDetail.castYourVote')}{' '}
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        ({t('proposalDetail.keyboardShortcuts')}: <kbd>Y</kbd> {t('proposalDetail.yes')} · <kbd>N</kbd> {t('proposalDetail.no')} · <kbd>A</kbd> {t('proposalDetail.abstain')})
                      </span>
                    </p>

                    {/* Vote buttons */}
                    <div
                      role="group"
                      aria-labelledby="vote-shortcut-hint"
                      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}
                    >
                      {VOTE_CONFIG.map(({ vote, labelKey, shortcut, emoji, color, shortcutKey }) => {
                        const label = t(labelKey);
                        const isCurrentVote = voteRecord?.vote === label;
                        const isDisabled = !canVote;

                        return (
                          <button
                            key={vote}
                            onClick={() => void handleVote(vote)}
                            // aria-pressed reflects whether this choice is the user's current vote
                            aria-pressed={isCurrentVote}
                            // aria-disabled communicates the disabled state to screen readers
                            // without removing the button from the tab order
                            aria-disabled={isDisabled || isVoting}
                            // Keyboard shortcut documented for AT users
                            aria-keyshortcuts={shortcutKey}
                        // Tooltip explains shortcut and disabled reason
                        title={
                          isVoting
                            ? t('proposalDetail.submittingVote')
                            : !walletAddress
                              ? t('proposalDetail.connectWalletToVote')
                              : isDisabled
                                ? t('proposalDetail.votingUnavailable')
                                : t('proposalDetail.voteWithShortcut', { label, shortcut })
                        }
                        disabled={isDisabled || isVoting}
                        aria-busy={isVoting}
                        style={{
                          padding: '0.75rem',
                          background: isDisabled || isVoting ? '#e5e7eb' : color,
                          color: '#fff',
                          border: isCurrentVote ? '3px solid #1e40af' : 'none',
                          borderRadius: 8,
                          cursor: isDisabled || isVoting ? 'not-allowed' : 'pointer',
                          fontWeight: 500,
                          opacity: isDisabled || isVoting ? 0.6 : 1,
                          position: 'relative',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        {isVoting
                          ? t('proposalDetail.submitting')
                          : <>{emoji} {label} <kbd style={{ fontSize: '0.65rem', opacity: 0.75, marginLeft: '0.25rem' }}>{shortcut}</kbd></>
                        }
                      </button>
                    );
                  })}
                </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Winning choice — shown after finalisation for multi-choice proposals */}
        {!isProposalActive && hasChoices && winningChoiceIndex !== null && (
          <div
            role="status"
            aria-live="polite"
            style={{ marginTop: '1rem', padding: '0.75rem', background: '#dcfce7', borderRadius: 8, fontSize: '0.875rem', color: '#166534' }}
          >
            🏆 {t('proposalDetail.winningChoice', {
              choice: safeChoices[winningChoiceIndex] ?? t('proposalDetail.choiceFallback', { index: winningChoiceIndex }),
            })}
          </div>
        )}

        {/* Connect wallet prompt */}
        {!walletAddress && (
          <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: 8, fontSize: '0.875rem', color: '#92400e' }}>
            ℹ️ {t('proposalDetail.connectWalletPrompt')}
          </div>
        )}

        {/* ── Vote Simulation Preview (Active proposals only) ── */}
        {/* Rendered for Active proposals regardless of wallet connection so
            users can see an estimate before connecting. When walletAddress is
            present the preview reflects the user's pending vote in real time. */}
        {isProposalActive && walletAddress && hasVoted === false && (
          <div className="no-print">
            <VoteSimulationPreview
              proposalId={Number(p.id)}
              walletAddress={walletAddress}
            />
          </div>
        )}

        {/* Already voted confirmation (when loaded from chain, not just submitted) */}
        {walletAddress && hasVoted && !voteConfirmation && voteRecord && (
          <div
            role="status"
            className="no-print"
            style={{ marginTop: '1rem', padding: '0.75rem', background: '#e0e7ff', borderRadius: 8, fontSize: '0.875rem', color: '#3730a3' }}
          >
            ✓ {t('proposalDetail.alreadyVoted')} <strong>{voteRecord.vote}</strong> {t('proposalDetail.onThisProposal')}
          </div>
        )}

        {/* Proposal not active */}
        {walletAddress && !isProposalActive && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f3e8ff', borderRadius: 8, fontSize: '0.875rem', color: '#6b21a8' }}>
            ℹ️ {t('proposalDetail.notActive')}
          </div>
        )}

        {/* Voting not yet open or closed */}
        {walletAddress && isProposalActive && !votingOpen && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f3e8ff', borderRadius: 8, fontSize: '0.875rem', color: '#6b21a8' }}>
            ℹ️ {t('proposalDetail.votingNotOpen')}
          </div>
        )}

        {/* Admin cancel action — opens confirmation modal instead of cancelling immediately (Issue #384) */}
        {walletAddress && adminAddress && walletAddress === adminAddress && isProposalActive && (
          <div style={{ marginTop: '1rem' }}>
            <button
              onClick={() => setShowCancelConfirm(true)}
              style={{
                padding: '0.6rem 1.25rem',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              Cancel Proposal
            </button>
          </div>
        )}
      </div>

      {/* Confirmation modal — Escape closes without cancelling */}
      {showCancelConfirm && (
        <ConfirmModal
          title="Cancel proposal?"
          message={`Are you sure you want to cancel "${safeTitle}"? This action is irreversible and cannot be undone.`}
          confirmLabel="Cancel Proposal"
          cancelLabel="Keep Proposal"
          onConfirm={() => void handleConfirmCancel()}
          onClose={closeCancelConfirm}
        >
          <label
            htmlFor="cancel-reason"
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}
          >
            Reason (optional)
          </label>
          <textarea
            id="cancel-reason"
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' }}
          />
        </ConfirmModal>
      )}
    </div>
  );
}
