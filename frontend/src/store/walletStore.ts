import { create } from 'zustand';
import { isConnected, requestAccess, getAddress } from '@stellar/freighter-api';
import { fetchTokenBalance } from '../api';

type WalletName = 'Freighter' | 'xBull';

interface WalletState {
  walletAddress: string | null;
  walletName: WalletName | null;
  tokenBalance: bigint | null;
  showModal: boolean;

  // Actions
  openModal: () => void;
  closeModal: () => void;
  connect: (wallet: WalletName) => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  walletAddress: sessionStorage.getItem('cosmosvote-wallet-address'),
  walletName: sessionStorage.getItem('cosmosvote-wallet-name') as WalletName | null,
  tokenBalance: null,
  showModal: false,

  openModal: () => set({ showModal: true }),
  closeModal: () => set({ showModal: false }),

  connect: async (wallet) => {
    let address: string | null = null;

    if (wallet === 'Freighter') {
      const connected = await isConnected();
      if (!connected) throw new Error('Freighter extension not found');
      await requestAccess();
      const result = await getAddress();
      if (result.error) throw new Error(result.error.message);
      address = result.address;
    } else if (wallet === 'xBull') {
      const sdk = (window as unknown as { xBullSDK?: { connect: () => Promise<{ publicKey: string }> } }).xBullSDK;
      if (!sdk) throw new Error('xBull extension not found');
      const result = await sdk.connect();
      address = result.publicKey;
    }

    if (!address) return;

    sessionStorage.setItem('cosmosvote-wallet-address', address);
    sessionStorage.setItem('cosmosvote-wallet-name', wallet);
    set({ walletAddress: address, walletName: wallet, showModal: false });

    fetchTokenBalance(address)
      .then(tokenBalance => set({ tokenBalance }))
      .catch(() => set({ tokenBalance: null }));
  },

  disconnect: () => {
    sessionStorage.removeItem('cosmosvote-wallet-address');
    sessionStorage.removeItem('cosmosvote-wallet-name');
    set({ walletAddress: null, walletName: null, tokenBalance: null });
  },

  refreshBalance: async () => {
    const { walletAddress } = get();
    if (!walletAddress) return;
    try {
      const tokenBalance = await fetchTokenBalance(walletAddress);
      set({ tokenBalance });
    } catch {
      set({ tokenBalance: null });
    }
  },
}));
