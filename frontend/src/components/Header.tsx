/**
 * Header – responsive app header with collapsible mobile menu.
 *
 * Issue #280 – Implement responsive header and mobile menu
 *
 * Acceptance criteria:
 *  ✓ Collapsible hamburger menu for nav links on narrow viewports
 *  ✓ Header buttons remain usable on small screens (≥320px)
 *  ✓ Menu closes when the user clicks outside or presses Escape
 */
import { useEffect, useRef, useState } from 'react';
import { ACTIVE_NETWORK } from '../config';
import { useI18n } from '../i18n/I18nContext';
import { formatTokenAmount, maskAddress } from '../utils';
import styles from './Header.module.css';

interface HeaderProps {
  /** Wallet address if connected, otherwise null */
  walletAddress: string | null;
  /** Token balance in raw units */
  tokenBalance: bigint | null;
  /** Token decimal places */
  decimals: number;
  /** Called when the user requests wallet connect */
  onConnect: () => void;
  /** Called when the user disconnects the wallet */
  onDisconnect: () => void;
  /** Current theme */
  theme: 'dark' | 'light';
  /** Toggle theme callback */
  onToggleTheme: () => void;
  /** Connect-wallet button label (i18n) */
  connectLabel?: string;
}

/** Navigation links rendered inside the mobile menu. */
const NAV_LINKS = [
  { labelKey: 'header.nav.proposals', href: '#proposals' },
  { labelKey: 'header.nav.dashboard', href: '#dashboard' },
  { labelKey: 'header.nav.docs', href: 'https://github.com/sophiawilliamz/cosmosvote', target: '_blank' },
] as const;

export function Header({
  walletAddress,
  tokenBalance,
  decimals,
  onConnect,
  onDisconnect,
  theme,
  onToggleTheme,
  connectLabel,
}: HeaderProps) {
  const { t } = useI18n();
  const resolvedConnectLabel = connectLabel ?? t('header.connectWallet');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        menuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !hamburgerRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close menu when viewport widens past 768px
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <header className={styles.header} role="banner">
      {/* ── Brand ── */}
      <div className={styles.brand}>
        <h1 className={styles.title}>🌌 CosmosVote</h1>
        <span className={styles.subtitle}>
          {t('header.subtitle', { network: ACTIVE_NETWORK })}
        </span>
      </div>

      {/* ── Desktop nav (hidden on mobile) ── */}
      <nav className={styles.desktopNav} aria-label={t('header.mainNavigation')}>
        <ul className={styles.navList}>
          {NAV_LINKS.map((link) => (
            <li key={link.labelKey}>
              <a
                href={link.href}
                className={styles.navLink}
                target={'target' in link ? link.target : undefined}
                rel={'target' in link ? 'noopener noreferrer' : undefined}
              >
                {t(link.labelKey)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Right-side controls (theme toggle + wallet) ── */}
      <div className={styles.controls}>
        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className={styles.iconBtn}
          aria-label={
            theme === 'dark'
              ? t('header.switchToLightMode')
              : t('header.switchToDarkMode')
          }
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Wallet section */}
        {walletAddress ? (
          <div className={styles.walletInfo}>
            <button
              className={styles.addressBtn}
              title={showFullAddress ? t('header.clickToHide') : walletAddress}
              onClick={() => setShowFullAddress((s) => !s)}
              aria-label={
                showFullAddress
                  ? t('header.hideFullAddress')
                  : t('header.showFullAddress')
              }
            >
              {showFullAddress ? walletAddress : maskAddress(walletAddress)}
            </button>
            {tokenBalance !== null && (
              <span className={styles.balance}>
                {formatTokenAmount(tokenBalance, decimals)}
              </span>
            )}
            <button
              onClick={onDisconnect}
              className={styles.disconnectBtn}
              aria-label={t('header.disconnectWallet')}
            >
              {t('header.disconnect')}
            </button>
          </div>
        ) : (
          <button onClick={onConnect} className={styles.connectBtn}>
            {resolvedConnectLabel}
          </button>
        )}

        {/* Hamburger – visible only on mobile */}
        <button
          ref={hamburgerRef}
          className={styles.hamburger}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? t('header.closeMenu') : t('header.openMenu')}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          <span className={`${styles.hamburgerBar} ${menuOpen ? styles.open : ''}`} />
          <span className={`${styles.hamburgerBar} ${menuOpen ? styles.open : ''}`} />
          <span className={`${styles.hamburgerBar} ${menuOpen ? styles.open : ''}`} />
        </button>
      </div>

      {/* ── Mobile nav drawer ── */}
      <div
        id="mobile-menu"
        ref={menuRef}
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}
        aria-hidden={!menuOpen}
      >
        <nav aria-label={t('header.mobileNavigation')}>
          <ul className={styles.mobileNavList}>
            {NAV_LINKS.map((link) => (
              <li key={link.labelKey}>
                <a
                  href={link.href}
                  className={styles.mobileNavLink}
                  target={'target' in link ? link.target : undefined}
                  rel={'target' in link ? 'noopener noreferrer' : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {t(link.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Mobile wallet section */}
        <div className={styles.mobileWallet}>
          {walletAddress ? (
            <>
              <span className={styles.mobileAddress}>
                {maskAddress(walletAddress)}
              </span>
              {tokenBalance !== null && (
                <span className={styles.balance}>
                  {formatTokenAmount(tokenBalance, decimals)}
                </span>
              )}
              <button
                onClick={() => { onDisconnect(); setMenuOpen(false); }}
                className={styles.disconnectBtn}
              >
                {t('header.disconnect')}
              </button>
            </>
          ) : (
            <button
              onClick={() => { onConnect(); setMenuOpen(false); }}
              className={styles.connectBtn}
            >
              {resolvedConnectLabel}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
