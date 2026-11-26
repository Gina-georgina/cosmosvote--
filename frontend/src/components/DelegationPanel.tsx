import { useState, useEffect } from 'react';
import { fetchDelegation } from '../api';

interface Props {
  walletAddress: string;
}

type PanelState = 'idle' | 'delegating' | 'revoking';

export function DelegationPanel({ walletAddress }: Props) {
  const [currentDelegate, setCurrentDelegate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [delegateInput, setDelegateInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchDelegation(walletAddress)
      .then(setCurrentDelegate)
      .catch(() => setCurrentDelegate(null))
      .finally(() => setLoading(false));
  }, [walletAddress]);

  function handleDelegate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!delegateInput.startsWith('G') || delegateInput.length < 56) {
      setError('Enter a valid Stellar address (G…)');
      return;
    }
    if (delegateInput === walletAddress) {
      setError('You cannot delegate to yourself.');
      return;
    }
    // In a real app this would submit a signed transaction via the wallet SDK.
    // Here we optimistically update the UI to demonstrate the flow.
    setCurrentDelegate(delegateInput);
    setDelegateInput('');
    setPanelState('idle');
    setSuccess(`Voting power delegated to ${delegateInput.slice(0, 8)}…${delegateInput.slice(-6)}.`);
  }

  function handleRevoke() {
    setError(null);
    setCurrentDelegate(null);
    setPanelState('idle');
    setSuccess('Delegation revoked. Voting power returned to your account.');
  }

  return (
    <section
      aria-label="Delegation management"
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#1e293b' }}>
        🗳️ Vote Delegation
      </h2>

      {loading ? (
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading delegation status…</p>
      ) : (
        <>
          {/* Current delegation status */}
          <div
            role="status"
            aria-live="polite"
            style={{
              background: currentDelegate ? '#eff6ff' : '#f8fafc',
              border: `1px solid ${currentDelegate ? '#bfdbfe' : '#e2e8f0'}`,
              borderRadius: 8,
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}
          >
            {currentDelegate ? (
              <>
                <span style={{ color: '#1d4ed8', fontWeight: 600 }}>Delegating to: </span>
                <code style={{ color: '#1e293b', wordBreak: 'break-all' }}>
                  {currentDelegate.slice(0, 8)}…{currentDelegate.slice(-6)}
                </code>
                <span
                  title={currentDelegate}
                  style={{ marginLeft: '0.5rem', cursor: 'help', color: '#64748b' }}
                  aria-label={`Full address: ${currentDelegate}`}
                >
                  ℹ️
                </span>
              </>
            ) : (
              <span style={{ color: '#64748b' }}>No active delegation — you vote with your own balance.</span>
            )}
          </div>

          {/* Success / error messages */}
          {success && (
            <p role="status" style={{ color: '#16a34a', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              ✅ {success}
            </p>
          )}
          {error && (
            <p role="alert" style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              ⚠️ {error}
            </p>
          )}

          {/* Actions */}
          {panelState === 'idle' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {!currentDelegate && (
                <button
                  onClick={() => { setPanelState('delegating'); setSuccess(null); }}
                  style={btnStyle('#2563eb')}
                  aria-label="Set a delegate for your voting power"
                >
                  Delegate voting power
                </button>
              )}
              {currentDelegate && (
                <button
                  onClick={() => { setPanelState('revoking'); setSuccess(null); }}
                  style={btnStyle('#dc2626')}
                  aria-label="Revoke current delegation"
                >
                  Revoke delegation
                </button>
              )}
            </div>
          )}

          {/* Delegate form */}
          {panelState === 'delegating' && (
            <form onSubmit={handleDelegate} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="delegate-address" style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                Delegate address (Stellar G… address)
              </label>
              <input
                id="delegate-address"
                type="text"
                value={delegateInput}
                onChange={e => setDelegateInput(e.target.value.trim())}
                placeholder="GABC…XYZ"
                autoComplete="off"
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" style={btnStyle('#2563eb')}>Confirm delegation</button>
                <button
                  type="button"
                  onClick={() => { setPanelState('idle'); setDelegateInput(''); setError(null); }}
                  style={btnStyle('#64748b')}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Revoke confirmation */}
          {panelState === 'revoking' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.875rem', color: '#374151', margin: 0 }}>
                Are you sure you want to revoke your delegation? Your voting power will return to your account.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleRevoke} style={btnStyle('#dc2626')}>Yes, revoke</button>
                <button
                  onClick={() => { setPanelState('idle'); setError(null); }}
                  style={btnStyle('#64748b')}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '0.4rem 0.85rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
  };
}

export default DelegationPanel;
