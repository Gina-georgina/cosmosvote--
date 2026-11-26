import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SorobanRpc,
  TransactionBuilder,
  Account,
  Operation,
  nativeToScVal,
  Networks,
  Keypair,
} from '@stellar/stellar-sdk';
import { config, ACTIVE_NETWORK } from '../config';
import { sanitizeWalletMessage } from '../utils/sanitizeWalletMessage';
import { useI18n } from '../i18n/I18nContext';
import { useWalletStore } from '../store/walletStore';

interface Props {
  walletAddress: string;
  onSuccess: (proposalId: number) => void;
  onCancel: () => void;
}

interface FormState {
  title: string;
  description: string;
  quorum: string;
  duration: string;
  discussion_url: string;
}

const INITIAL_FORM: FormState = {
  title: '',
  description: '',
  quorum: '1000',
  duration: '86400', // 1 day in seconds
  discussion_url: '',
};

const DRAFT_NAMESPACE = 'cosmosvote:proposal_draft:';

/**
 * Sanitise a wallet address so it can never escape the draft namespace.
 * Only alphanumerics are kept; everything else is replaced with `_`.
 */
function sanitizeKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 128);
}

/**
 * Deterministic, non-reversible hash of the wallet address used as the draft
 * key segment. Uses SHA-256 via Web Crypto when available and falls back to a
 * simple FNV-1a hash otherwise (e.g. insecure contexts / older runtimes).
 */
async function hashWalletAddress(walletAddress: string): Promise<string> {
  const input = sanitizeKeySegment(walletAddress);
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fall through to the non-crypto fallback below
  }
  // FNV-1a 32-bit fallback — not cryptographic, but still avoids storing the raw address
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv${hash.toString(16).padStart(8, '0')}`;
}

/** Returns the localStorage key scoped to a hash of the wallet address. */
async function draftKey(walletAddress: string): Promise<string> {
  const hash = await hashWalletAddress(walletAddress);
  return `${DRAFT_NAMESPACE}${sanitizeKeySegment(hash)}`;
}

async function saveDraft(walletAddress: string, form: FormState): Promise<void> {
  try {
    localStorage.setItem(await draftKey(walletAddress), JSON.stringify(form));
  } catch {
    // Storage may be full or unavailable — silently ignore
  }
}

async function loadDraft(walletAddress: string): Promise<FormState | null> {
  try {
    const raw = localStorage.getItem(await draftKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FormState>;
    // Validate shape before returning
    if (
      typeof parsed.title === 'string' &&
      typeof parsed.description === 'string' &&
      typeof parsed.quorum === 'string' &&
      typeof parsed.duration === 'string'
    ) {
      return {
        title: parsed.title,
        description: parsed.description,
        quorum: parsed.quorum,
        duration: parsed.duration,
        discussion_url: typeof parsed.discussion_url === 'string' ? parsed.discussion_url : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function clearDraft(walletAddress: string): Promise<void> {
  try {
    localStorage.removeItem(await draftKey(walletAddress));
  } catch {
    // ignore
  }
}

const DURATION_PRESETS = [
  { labelKey: 'createProposal.durationPresets.oneDay', value: '86400' },
  { labelKey: 'createProposal.durationPresets.threeDays', value: '259200' },
  { labelKey: 'createProposal.durationPresets.sevenDays', value: '604800' },
  { labelKey: 'createProposal.durationPresets.fourteenDays', value: '1209600' },
  { labelKey: 'createProposal.durationPresets.thirtyDays', value: '2592000' },
];

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function fieldError(form: FormState, t: Translate): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.title.trim()) errors.title = t('createProposal.errors.titleRequired');
  else if (form.title.length > 128) errors.title = t('createProposal.errors.titleTooLong');
  if (!form.description.trim()) errors.description = t('createProposal.errors.descriptionRequired');
  else if (form.description.length > 1024) errors.description = t('createProposal.errors.descriptionTooLong');
  const q = Number(form.quorum);
  if (!form.quorum || isNaN(q) || q <= 0) errors.quorum = t('createProposal.errors.quorumInvalid');
  const d = Number(form.duration);
  if (!form.duration || isNaN(d) || d < 60 || d > 2_592_000)
    errors.duration = t('createProposal.errors.durationInvalid');
  return errors;
}

/** Builds the deep-link URL for a created proposal. */
function proposalDeepLink(proposalId: number): string {
  const base =
    typeof window !== 'undefined' && window.location
      ? `${window.location.origin}${window.location.pathname}`
      : '';
  return `${base}#/proposals/${proposalId}`;
}

/** Copies text to the clipboard, falling back to a hidden textarea when needed. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function CreateProposalForm({ walletAddress, onSuccess, onCancel }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [createdProposalId, setCreatedProposalId] = useState<number | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [reduceMotion, setReduceMotion] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the wallet whose draft is currently persisted so we can clean it up
  // when the wallet changes or disconnects.
  const draftOwnerRef = useRef<string | null>(null);

  // On mount / wallet change: check for a saved draft and prompt the user to restore it
  useEffect(() => {
    let cancelled = false;
    draftOwnerRef.current = walletAddress;
    loadDraft(walletAddress).then(draft => {
      if (cancelled) return;
      if (draft && (draft.title || draft.description)) {
        setShowRestorePrompt(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  // Clear the previous wallet's draft whenever the wallet changes or disconnects.
  useEffect(() => {
    const unsubscribe = useWalletStore.subscribe((state, prevState) => {
      const prevAddress = prevState?.address ?? null;
      const nextAddress = state.address ?? null;
      if (prevAddress && prevAddress !== nextAddress) {
        // Wallet switched or disconnected — remove the outgoing wallet's draft
        void clearDraft(prevAddress);
        if (draftOwnerRef.current === prevAddress) {
          draftOwnerRef.current = null;
          setShowRestorePrompt(false);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Auto-save after 1 second of inactivity whenever form changes
  const scheduleAutosave = useCallback(
    (nextForm: FormState) => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        void saveDraft(walletAddress, nextForm);
      }, 1000);
    },
    [walletAddress],
  );

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const errors = fieldError(form, t);
  const hasErrors = Object.keys(errors).length > 0;

  function handleChange(field: keyof FormState, value: string) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      scheduleAutosave(next);
      return next;
    });
  }

  function handleBlur(field: keyof FormState) {
    setTouched(prev => ({ ...prev, [field]: true }));
  }

  function handleRestoreDraft() {
    void loadDraft(walletAddress).then(draft => {
      if (draft) setForm(draft);
      setShowRestorePrompt(false);
    });
  }

  function handleDiscardDraft() {
    void clearDraft(walletAddress);
    setShowRestorePrompt(false);
  }

  async function handleShare(proposalId: number) {
    const ok = await copyToClipboard(proposalDeepLink(proposalId));
    setShareStatus(ok ? 'copied' : 'error');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Mark all fields as touched to show validation errors
    setTouched({ title: true, description: true, quorum: true, duration: true, discussion_url: true });
    if (hasErrors) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const server = new SorobanRpc.Server(config.rpcUrl);

      // Fetch the live account to get the current sequence number
      const accountData = await server.getAccount(walletAddress);
      const account = new Account(walletAddress, accountData.sequence);

      const networkPassphrase =
        ACTIVE_NETWORK === 'mainnet'
          ? Networks.PUBLIC
          : Networks.TESTNET;

      // Sanitize all wallet-facing message fields to ASCII-safe characters only
      // before they are embedded in the transaction (and shown by the wallet).
      const safeTitle = sanitizeWalletMessage(form.title.trim(), 128);
      const safeDescription = sanitizeWalletMessage(form.description.trim(), 1024);
      const safeDiscussionUrl = form.discussion_url.trim()
        ? sanitizeWalletMessage(form.discussion_url.trim(), 512)
        : '';

      const tx = new TransactionBuilder(account, {
        fee: '1000000', // 0.1 XLM max fee — governance calls are compute-heavy
        networkPassphrase,
      })
        .addOperation(
          Operation.invokeContractFunction({
            contract: config.governanceContractId,
            function: 'create_proposal',
            args: [
              nativeToScVal(walletAddress, { type: 'address' }),
              nativeToScVal(safeTitle, { type: 'string' }),
              nativeToScVal(safeDescription, { type: 'string' }),
              nativeToScVal(BigInt(Math.round(Number(form.quorum))), { type: 'i128' }),
              nativeToScVal(BigInt(Math.round(Number(form.duration))), { type: 'u64' }),
              nativeToScVal(safeDiscussionUrl, { type: 'string' }),
            ],
          })
        )
        .setTimeout(30)
        .build();

      // Simulate to get the footprint and fee
      const simResult = await server.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationError(simResult)) {
        throw new Error(`Simulation error: ${simResult.error}`);
      }

      // Assemble the transaction with the simulated footprint
      const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();

      // In a real app the wallet extension (Freighter, Albedo, etc.) would sign here.
      // Since CosmosVote uses a manual address entry flow without a signing extension,
      // we surface the unsigned XDR so the user can sign and submit externally, OR
      // accept a secret key in development environments via a prompt.
      //
      // Development / testnet path: ask for secret key via prompt.
      // Production path: integrate wallet extension SDK and replace this block.
      const secretKey = window.prompt(
        sanitizeWalletMessage(t('createProposal.prompts.secretKey'), 512)
      );

      if (!secretKey) {
        setSubmitError(t('createProposal.errors.signingCancelled'));
        setSubmitting(false);
        return;
      }

      if (!secretKey.startsWith('S')) {
        setSubmitError(t('createProposal.errors.invalidSecretKey'));
        setSubmitting(false);
        return;
      }

      const keypair = Keypair.fromSecret(secretKey);
      assembled.sign(keypair);

      const sendResult = await server.sendTransaction(assembled);
      if (sendResult.status === 'ERROR') {
        throw new Error(
          t('createProposal.errors.submissionError', {
            detail: JSON.stringify(sendResult.errorResult),
          })
        );
      }

      // Poll for confirmation
      let hash = sendResult.hash;
      let attempts = 0;
      while (attempts < 20) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await server.getTransaction(hash);
        if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
          // Extract the returned proposal ID from the result
          const returnedId = status.returnValue
            ? Number(status.returnValue.u64().toString())
            : 0;
          // Clear the draft on successful submission
          void clearDraft(walletAddress);
          onSuccess(returnedId);
          return;
        }
        if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
          throw new Error(t('createProposal.errors.transactionFailed'));
        }
        attempts++;
      }
      throw new Error(t('createProposal.errors.transactionTimeout'));
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = (field: keyof FormState): React.CSSProperties => ({
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: `1px solid ${touched[field] && errors[field] ? '#dc2626' : '#d1d5db'}`,
    borderRadius: 6,
    fontSize: '0.875rem',
    boxSizing: 'border-box',
    background: '#fff',
    color: '#1e293b',
    outline: 'none',
  });

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '0.35rem',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: '#dc2626',
    marginTop: '0.25rem',
  };

  const successTransition: React.CSSProperties = reduceMotion
    ? {}
    : {
        animation: 'cp-success-fade-in 320ms ease-out both',
      };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '2rem',
          maxWidth: 560,
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {!reduceMotion && (
          <style>{`
            @keyframes cp-success-fade-in {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        )}
        {createdProposalId !== null ? (
          <div style={successTransition} aria-live="polite">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#15803d' }}>✅ Proposal created</h2>
              <button
                onClick={onCancel}
                aria-label="Close"
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#334155' }}>
              Your proposal was submitted on-chain. Proposal ID:{' '}
              <strong style={{ color: '#1e293b' }}>#{createdProposalId}</strong>
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="cp-success-link" style={labelStyle}>Proposal link</label>
              <input
                id="cp-success-link"
                type="text"
                readOnly
                value={proposalDeepLink(createdProposalId)}
                onFocus={e => e.currentTarget.select()}
                style={{ ...inputStyle('title'), background: '#f8fafc', color: '#334155' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleShare(createdProposalId)}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {shareStatus === 'copied' ? '✓ Link copied' : 'Share proposal'}
              </button>
              <a
                href={proposalDeepLink(createdProposalId)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: '#2563eb',
                  border: '1px solid #93c5fd',
                  borderRadius: 6,
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                }}
              >
                View proposal →
              </a>
            </div>
            {shareStatus === 'error' && (
              <div role="alert" style={{ ...errorStyle, marginBottom: '1rem' }}>
                Could not copy the link. Please copy it manually from the field above.
              </div>
            )}

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#1e293b' }}>Next steps</h3>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#475569', lineHeight: 1.7 }}>
                <li>Share the proposal link with your community to gather support.</li>
                <li>Monitor voting progress and quorum on the proposal page.</li>
                <li>Finalise the proposal once the voting period ends.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
        <>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>{t('createProposal.title')}</h2>
          <button
            onClick={onCancel}
            aria-label={t('common.close')}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Restore draft banner */}
        {showRestorePrompt && (
          <div
            role="alert"
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              background: '#eff6ff',
              border: '1px solid #93c5fd',
              borderRadius: 6,
              fontSize: '0.875rem',
              color: '#1d4ed8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>{t('createProposal.draft.restorePrompt')}</span>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleRestoreDraft}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                {t('createProposal.draft.restore')}
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                {t('createProposal.draft.discard')}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'grid', gap: '1rem' }}>

            {/* Title */}
            <div>
              <label htmlFor="cp-title" style={labelStyle}>
                {t('createProposal.fields.title')} <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                id="cp-title"
                type="text"
                value={form.title}
                onChange={e => handleChange('title', e.target.value)}
                onBlur={() => handleBlur('title')}
                placeholder={t('createProposal.placeholders.title')}
                maxLength={128}
                autoComplete="off"
                style={inputStyle('title')}
                aria-describedby={errors.title ? 'cp-title-error' : undefined}
                aria-invalid={touched.title && !!errors.title}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {touched.title && errors.title
                  ? <span id="cp-title-error" style={errorStyle}>{errors.title}</span>
                  : <span />
                }
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{form.title.length}/128</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="cp-description" style={labelStyle}>
                {t('createProposal.fields.description')} <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                id="cp-description"
                value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                onBlur={() => handleBlur('description')}
                placeholder={t('createProposal.placeholders.description')}
                maxLength={1024}
                rows={5}
                autoComplete="off"
                style={{ ...inputStyle('description'), resize: 'vertical', fontFamily: 'inherit' }}
                aria-describedby={errors.description ? 'cp-desc-error' : undefined}
                aria-invalid={touched.description && !!errors.description}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {touched.description && errors.description
                  ? <span id="cp-desc-error" style={errorStyle}>{errors.description}</span>
                  : <span />
                }
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{form.description.length}/1024</span>
              </div>
            </div>

            {/* Quorum */}
            <div>
              <label htmlFor="cp-quorum" style={labelStyle}>
                {t('createProposal.fields.quorum')} <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                id="cp-quorum"
                type="number"
                min={1}
                value={form.quorum}
                onChange={e => handleChange('quorum', e.target.value)}
                onBlur={() => handleBlur('quorum')}
                placeholder={t('createProposal.placeholders.quorum')}
                style={inputStyle('quorum')}
                aria-describedby={errors.quorum ? 'cp-quorum-error' : undefined}
                aria-invalid={touched.quorum && !!errors.quorum}
              />
              {touched.quorum && errors.quorum && (
                <span id="cp-quorum-error" style={errorStyle}>{errors.quorum}</span>
              )}
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                {t('createProposal.hints.quorum')}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label htmlFor="cp-duration" style={labelStyle}>
                {t('createProposal.fields.duration')} <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {DURATION_PRESETS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handleChange('duration', p.value)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 4,
                      border: '1px solid',
                      borderColor: form.duration === p.value ? '#2563eb' : '#d1d5db',
                      background: form.duration === p.value ? '#eff6ff' : '#fff',
                      color: form.duration === p.value ? '#2563eb' : '#555',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    {t(p.labelKey)}
                  </button>
                ))}
              </div>
              <input
                id="cp-duration"
                type="number"
                min={60}
                max={2592000}
                value={form.duration}
                onChange={e => handleChange('duration', e.target.value)}
                onBlur={() => handleBlur('duration')}
                placeholder={t('createProposal.placeholders.duration')}
                style={inputStyle('duration')}
                aria-describedby={errors.duration ? 'cp-duration-error' : undefined}
                aria-invalid={touched.duration && !!errors.duration}
              />
              {touched.duration && errors.duration && (
                <span id="cp-duration-error" style={errorStyle}>{errors.duration}</span>
              )}
              {!errors.duration && form.duration && (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  {t('createProposal.hints.durationApprox', {
                    days: (Number(form.duration) / 86400).toFixed(1),
                  })}
                </div>
              )}
            </div>

            {/* Discussion link (optional) */}
            <div>
              <label htmlFor="cp-discussion-url" style={labelStyle}>
                Discussion link
              </label>
              <input
                id="cp-discussion-url"
                type="url"
                value={form.discussion_url}
                onChange={e => handleChange('discussion_url', e.target.value)}
                onBlur={() => handleBlur('discussion_url')}
                placeholder="https://forum.example.com/t/proposal"
                style={inputStyle('discussion_url')}
                aria-describedby={errors.discussion_url ? 'cp-discussion-url-error' : undefined}
                aria-invalid={touched.discussion_url && !!errors.discussion_url}
              />
              {touched.discussion_url && errors.discussion_url && (
                <span id="cp-discussion-url-error" style={errorStyle}>{errors.discussion_url}</span>
              )}
            </div>

          </div>

          {/* Submission error */}
          {submitError && (
            <div style={{
              margin: '1rem 0 0',
              padding: '0.75rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 6,
              fontSize: '0.875rem',
              color: '#dc2626',
            }}
              role="alert"
            >
              <strong>{t('common.error')}:</strong> {submitError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              style={{
                background: 'none',
                color: '#64748b',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: submitting ? '#93c5fd' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                minWidth: 140,
              }}
            >
              {submitting ? t('createProposal.submitting') : t('createProposal.submit')}
            </button>
          </div>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
