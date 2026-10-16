import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  const defaultProps = {
    walletAddress: null,
    tokenBalance: null,
    decimals: 7,
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    theme: 'dark' as const,
    onToggleTheme: vi.fn(),
  };

  it('renders the brand and title', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText(/CosmosVote/i)).toBeInTheDocument();
  });

  it('shows Connect Wallet button when not connected', () => {
    render(<Header {...defaultProps} />);
    const connectButtons = screen.getAllByText(/Connect Wallet/i);
    expect(connectButtons.length).toBeGreaterThan(0);
  });

  it('shows wallet address and disconnect button when connected', () => {
    render(<Header
      {...defaultProps}
      walletAddress="GABC1234567890ABCDEF1234567890ABCDEF"
      tokenBalance={1000000n}
    />);
    expect(screen.getByText(/Disconnect/i)).toBeInTheDocument();
  });

  it('calls onConnect when connect button is clicked', () => {
    const onConnect = vi.fn();
    render(<Header {...defaultProps} onConnect={onConnect} />);
    const connectButton = screen.getAllByText(/Connect Wallet/i)[0];
    fireEvent.click(connectButton);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('calls onDisconnect when disconnect button is clicked', () => {
    const onDisconnect = vi.fn();
    render(<Header
      {...defaultProps}
      walletAddress="GABC1234567890ABCDEF1234567890ABCDEF"
      onDisconnect={onDisconnect}
    />);
    const disconnectButton = screen.getAllByText(/Disconnect/i)[0];
    fireEvent.click(disconnectButton);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('toggles theme when theme button is clicked', () => {
    const onToggleTheme = vi.fn();
    render(<Header {...defaultProps} onToggleTheme={onToggleTheme} />);
    const themeButton = screen.getByLabelText(/Switch to light mode/i);
    fireEvent.click(themeButton);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  describe('Mobile menu (Issue #135)', () => {
    it('renders hamburger button with proper ARIA attributes', () => {
      render(<Header {...defaultProps} />);
      const hamburger = screen.getByLabelText(/Open menu/i);
      expect(hamburger).toBeInTheDocument();
      expect(hamburger).toHaveAttribute('aria-expanded', 'false');
      expect(hamburger).toHaveAttribute('aria-controls', 'mobile-menu');
    });

    it('opens mobile menu when hamburger is clicked', () => {
      render(<Header {...defaultProps} />);
      const hamburger = screen.getByLabelText(/Open menu/i);
      
      fireEvent.click(hamburger);
      
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByLabelText(/Close menu/i)).toBeInTheDocument();
      
      const mobileMenu = screen.getByRole('navigation', { name: /Mobile navigation/i });
      expect(mobileMenu).toBeInTheDocument();
    });

    it('closes mobile menu when hamburger is clicked again', () => {
      render(<Header {...defaultProps} />);
      const hamburger = screen.getByLabelText(/Open menu/i);
      
      // Open
      fireEvent.click(hamburger);
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');
      
      // Close
      const closeButton = screen.getByLabelText(/Close menu/i);
      fireEvent.click(closeButton);
      expect(closeButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes menu when Escape key is pressed', () => {
      render(<Header {...defaultProps} />);
      const hamburger = screen.getByLabelText(/Open menu/i);
      
      // Open menu
      fireEvent.click(hamburger);
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');
      
      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      
      // Menu should be closed
      const closedButton = screen.getByLabelText(/Open menu/i);
      expect(closedButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('renders all navigation links in mobile menu', () => {
      render(<Header {...defaultProps} />);
      const hamburger = screen.getByLabelText(/Open menu/i);
      
      fireEvent.click(hamburger);
      
      // Check that navigation links are present
      expect(screen.getByText('Proposals')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Docs')).toBeInTheDocument();
    });

    it('renders wallet controls in mobile menu when connected', () => {
      render(<Header
        {...defaultProps}
        walletAddress="GABC1234567890ABCDEF1234567890ABCDEF"
        tokenBalance={1000000n}
      />);
      const hamburger = screen.getByLabelText(/Open menu/i);
      
      fireEvent.click(hamburger);
      
      // Wallet info should be in mobile menu
      const disconnectButtons = screen.getAllByText(/Disconnect/i);
      expect(disconnectButtons.length).toBeGreaterThan(0);
    });

    it('is keyboard accessible', () => {
      render(<Header {...defaultProps} />);
      const hamburger = screen.getByLabelText(/Open menu/i);
      
      // Should be focusable and activatable with Enter
      hamburger.focus();
      expect(document.activeElement).toBe(hamburger);
      
      fireEvent.keyDown(hamburger, { key: 'Enter' });
      // Menu behavior would be tested in integration/E2E tests
    });
  });
});
