import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import * as api from '../services/api';
import { useWallet } from './WalletContext';

export type Role = 'patient' | 'doctor';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  wallet_address: string;
  public_key: string;
  specialty?: string | null;
}

interface AuthContextType {
  currentUser: AuthUser | null;
  token: string | null;
  /** Full sign-in flow: challenge → sign → login → fetch profile */
  login: () => Promise<boolean>;
  logout: () => void;
  /** Register a new patient then auto-login */
  registerPatient: (name: string, email: string) => Promise<boolean>;
  /** Register a new doctor then auto-login */
  registerDoctor: (name: string, email: string, specialty?: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { signer, walletAddress, publicKey } = useWallet();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const login = useCallback(async (): Promise<boolean> => {
    if (!signer || !walletAddress) return false;
    try {
      // 1. Get challenge nonce
      const { nonce } = await api.getChallenge(walletAddress);

      // 2. Sign the nonce
      const signature = await signer.signMessage(nonce);

      // 3. Send to backend
      const resp = await api.login(walletAddress, signature, nonce);

      // 4. Store token
      api.setAuthToken(resp.access_token);
      setToken(resp.access_token);

      // 5. Fetch user profile
      let user: AuthUser;
      if (resp.role === 'patient') {
        const p = await api.getPatient(resp.user_id);
        user = { id: p.id, role: 'patient', name: p.name, email: p.email, wallet_address: p.wallet_address, public_key: p.public_key };
      } else {
        const d = await api.getDoctor(resp.user_id);
        user = { id: d.id, role: 'doctor', name: d.name, email: d.email, wallet_address: d.wallet_address, public_key: d.public_key, specialty: d.specialty };
      }
      setCurrentUser(user);
      return true;
    } catch {
      return false;
    }
  }, [signer, walletAddress]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setToken(null);
    api.setAuthToken(null);
  }, []);

  const registerPatient = useCallback(async (name: string, email: string): Promise<boolean> => {
    if (!walletAddress || !publicKey) return false;
    try {
      await api.createPatient({ name, email, wallet_address: walletAddress, public_key: publicKey });
      return login();
    } catch {
      return false;
    }
  }, [walletAddress, publicKey, login]);

  const registerDoctor = useCallback(async (name: string, email: string, specialty?: string): Promise<boolean> => {
    if (!walletAddress || !publicKey) return false;
    try {
      await api.createDoctor({ name, email, wallet_address: walletAddress, public_key: publicKey, specialty });
      return login();
    } catch {
      return false;
    }
  }, [walletAddress, publicKey, login]);

  return (
    <AuthContext.Provider value={{ currentUser, token, login, logout, registerPatient, registerDoctor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
