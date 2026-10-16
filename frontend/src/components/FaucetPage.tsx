import { useState } from 'react';
import { ACTIVE_NETWORK, config } from '../config';
import { useWalletStore } from '../store/walletStore';
import styles from './FaucetPage.module.css';

interface FaucetClaim {
  amount: string;
  symbol: string;
  transactionHash: string;
  explorerUrl: string;
}

const FAUCET_API_URL = (import.meta.env.VITE_FAUCET_API_URL as string | undefined)?.replace(/\/$/, '');

export function FaucetPage() {
  const { walletAddress, connect, refreshBalance } = useWalletStore();
  const [claim, setClaim] = useState<FaucetClaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function connectWallet(wallet: 'Freighter' | 'xBull') {
    setConnecting(true);
    setError(null);
    try {
      await connect(wallet);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Wallet connection failed.');
    } finally {
      setConnecting(false);
    }
  }

  async function requestTokens() {
    if (!walletAddress || claiming) return;
    setClaiming(true);
    setError(null);
    setClaim(null);
    try {
      const response = await fetch(`${FAUCET_API_URL || ''}/api/faucet/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      const result = await response.json() as FaucetClaim | { error?: string };
      if (!response.ok) throw new Error('error' in result && result.error ? result.error : 'Faucet request failed.');
      setClaim(result as FaucetClaim);
      await refreshBalance();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Faucet request failed.');
    } finally {
      setClaiming(false);
    }
  }

  const isTestnet = ACTIVE_NETWORK === 'testnet';
  const tokenUrl = `https://stellar.expert/explorer/testnet/contract/${config.tokenContractId}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">CosmosVote <span>TESTNET</span></a>
        <a className={styles.backLink} href="/">Back to governance</a>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>Testnet access</p>
        <h1>Get VOTE tokens</h1>
        <p className={styles.description}>
          Request a small test allocation for trying proposals and voting. Claims are limited to one per wallet every 24 hours.
        </p>

        {!isTestnet ? (
          <p className={styles.notice} role="status">The token faucet is available on Stellar testnet only.</p>
        ) : !walletAddress ? (
          <div className={styles.connectSection}>
            <div className={styles.connectButtons}>
              <button className={styles.primaryButton} onClick={() => connectWallet('Freighter')} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Freighter'}
              </button>
              <button className={styles.secondaryButton} onClick={() => connectWallet('xBull')} disabled={connecting}>
                Connect xBull
              </button>
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
        ) : (
          <section className={styles.claimSection} aria-labelledby="claim-title">
            <div className={styles.walletRow}>
              <span id="claim-title">Connected wallet</span>
              <code>{walletAddress.slice(0, 6)}…{walletAddress.slice(-6)}</code>
            </div>
            <button className={styles.primaryButton} onClick={requestTokens} disabled={claiming}>
              {claiming ? 'Requesting tokens…' : 'Get Test Tokens'}
            </button>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {claim && (
              <div className={styles.success} role="status">
                <strong>{claim.amount} {claim.symbol} sent</strong>
                <div className={styles.receiptLinks}>
                  <a href={tokenUrl} target="_blank" rel="noreferrer">View VOTE token</a>
                  <a href={claim.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>
                </div>
                <code className={styles.hash}>{claim.transactionHash}</code>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}