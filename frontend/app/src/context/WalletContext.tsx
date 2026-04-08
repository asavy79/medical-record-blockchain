import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { ethers } from 'ethers';
import { ANVIL_ACCOUNTS, getProvider } from '../services/wallet';
import { derivePublicKey } from '../services/crypto';

interface WalletState {
  provider: ethers.JsonRpcProvider | null;
  signer: ethers.Wallet | null;
  walletAddress: string | null;
  publicKey: string | null;     // uncompressed hex (130 chars, no 0x)
}

interface WalletContextType extends WalletState {
  /** Connect using an Anvil account index (0–9) */
  connectAnvil: (accountIndex: number) => void;
  disconnect: () => void;
  anvilAccounts: typeof ANVIL_ACCOUNTS;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    provider: null,
    signer: null,
    walletAddress: null,
    publicKey: null,
  });

  const connectAnvil = useCallback((accountIndex: number) => {
    const account = ANVIL_ACCOUNTS[accountIndex];
    if (!account) throw new Error(`Invalid Anvil account index: ${accountIndex}`);

    const provider = getProvider();
    const signer = new ethers.Wallet(account.privateKey, provider);
    const publicKey = derivePublicKey(account.privateKey);

    setState({
      provider,
      signer,
      walletAddress: account.address,
      publicKey,
    });
  }, []);

  const disconnect = useCallback(() => {
    setState({
      provider: null,
      signer: null,
      walletAddress: null,
      publicKey: null,
    });
  }, []);

  return (
    <WalletContext.Provider
      value={{
        ...state,
        connectAnvil,
        disconnect,
        anvilAccounts: ANVIL_ACCOUNTS,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
