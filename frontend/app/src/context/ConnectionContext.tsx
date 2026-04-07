import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import * as api from '../services/api';
import * as contractService from '../services/contract';
import { useWallet } from './WalletContext';
import { useAuth } from './AuthContext';

export interface InviteItem {
  id: string;
  fromWallet: string;
  toWallet: string;
  fromRole: string;
  status: 'pending' | 'accepted' | 'declined';
  fromName?: string;
  toName?: string;
}

export interface PeerInfo {
  id: string;
  name: string;
  wallet_address: string;
  public_key: string;
  role: 'patient' | 'doctor';
  specialty?: string | null;
}

interface ConnectionContextType {
  invites: InviteItem[];
  peers: PeerInfo[];
  refreshing: boolean;
  refresh: () => Promise<void>;
  sendInvite: (toWalletAddress: string) => Promise<void>;
  acceptInvite: (inviteId: string, counterpartyWallet: string) => Promise<void>;
  declineInvite: (inviteId: string) => Promise<void>;
  pendingInvitesForMe: () => InviteItem[];
  isConnected: (walletAddress: string) => boolean;
  hasPendingInvite: (toWallet: string) => boolean;
}

const ConnectionContext = createContext<ConnectionContextType | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { signer, walletAddress } = useWallet();
  const { currentUser } = useAuth();
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentUser || !walletAddress) return;
    setRefreshing(true);
    try {
      // Fetch invites
      const rawInvites = await api.getInvites();
      const mapped: InviteItem[] = rawInvites.map(inv => ({
        id: inv.id,
        fromWallet: inv.from_id,
        toWallet: inv.to_id,
        fromRole: inv.from_role,
        status: inv.status,
        fromName: inv.from_name,
        toName: inv.to_name,
      }));
      setInvites(mapped);

      // Build peer list from accepted invites
      const acceptedInvites = mapped.filter(i => i.status === 'accepted');
      const peerWallets = new Set<string>();
      const myWallet = walletAddress.toLowerCase();
      for (const inv of acceptedInvites) {
        const pw = inv.fromWallet === myWallet ? inv.toWallet : inv.fromWallet;
        peerWallets.add(pw);
      }

      const newPeers: PeerInfo[] = [];
      for (const w of peerWallets) {
        try {
          if (currentUser.role === 'patient') {
            const d = await api.getDoctorByWallet(w);
            newPeers.push({ id: d.id, name: d.name, wallet_address: d.wallet_address, public_key: d.public_key, role: 'doctor', specialty: d.specialty });
          } else {
            const p = await api.getPatientByWallet(w);
            newPeers.push({ id: p.id, name: p.name, wallet_address: p.wallet_address, public_key: p.public_key, role: 'patient' });
          }
        } catch {
          // skip
        }
      }
      setPeers(newPeers);
    } catch {
      // backend may be down
    }
    setRefreshing(false);
  }, [currentUser, walletAddress]);

  const sendInvite = useCallback(async (toWalletAddress: string) => {
    await api.createInvite(toWalletAddress);
    await refresh();
  }, [refresh]);

  const acceptInvite = useCallback(async (inviteId: string, counterpartyWallet: string) => {
    await api.updateInvite(inviteId, 'accepted');

    // If patient, grant on-chain access
    if (currentUser?.role === 'patient' && signer) {
      try {
        await contractService.grantAccess(signer, counterpartyWallet);
      } catch {
        console.warn('On-chain grantAccess failed (contract may not be deployed)');
      }
    }
    await refresh();
  }, [currentUser, signer, refresh]);

  const declineInvite = useCallback(async (inviteId: string) => {
    await api.updateInvite(inviteId, 'declined');
    await refresh();
  }, [refresh]);

  const pendingInvitesForMe = useCallback((): InviteItem[] => {
    if (!walletAddress) return [];
    const myWallet = walletAddress.toLowerCase();
    return invites.filter(i => i.toWallet === myWallet && i.status === 'pending');
  }, [invites, walletAddress]);

  const isConnected = useCallback((peerWallet: string): boolean => {
    return peers.some(p => p.wallet_address === peerWallet.toLowerCase());
  }, [peers]);

  const hasPendingInvite = useCallback((toWallet: string): boolean => {
    if (!walletAddress) return false;
    const myWallet = walletAddress.toLowerCase();
    return invites.some(
      i => i.fromWallet === myWallet && i.toWallet === toWallet.toLowerCase() && i.status === 'pending'
    );
  }, [invites, walletAddress]);

  return (
    <ConnectionContext.Provider value={{
      invites, peers, refreshing,
      refresh, sendInvite, acceptInvite, declineInvite,
      pendingInvitesForMe, isConnected, hasPendingInvite,
    }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnections() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnections must be used inside ConnectionProvider');
  return ctx;
}
