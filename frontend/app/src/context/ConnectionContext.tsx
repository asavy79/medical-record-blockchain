import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  type Connection,
  type Invite,
  initialConnections,
  initialSharedAccess,
  initialInvites,
  type SharedAccess,
  users,
} from '../data/mockData';

interface ConnectionContextType {
  connections: Connection[];
  sharedAccess: SharedAccess[];
  invites: Invite[];
  sendInvite: (fromId: string, toId: string) => void;
  acceptInvite: (inviteId: string) => void;
  declineInvite: (inviteId: string) => void;
  pendingInvitesFor: (userId: string) => Invite[];
  hasPendingInvite: (fromId: string, toId: string) => boolean;
  isConnected: (patientId: string, doctorId: string) => boolean;
}

const ConnectionContext = createContext<ConnectionContextType | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [sharedAccess, setSharedAccess] = useState<SharedAccess[]>(initialSharedAccess);
  const [invites, setInvites] = useState<Invite[]>(initialInvites);

  function sendInvite(fromId: string, toId: string) {
    const id = `inv-${Date.now()}`;
    setInvites(prev => [...prev, { id, fromId, toId, status: 'pending' }]);
  }

  function acceptInvite(inviteId: string) {
    const invite = invites.find(i => i.id === inviteId);
    if (!invite) return;

    // Mark accepted
    setInvites(prev => prev.map(i => i.id === inviteId ? { ...i, status: 'accepted' } : i));

    // Determine which is patient and which is doctor
    const { fromId, toId } = invite;
    const fromUser = users.find(u => u.id === fromId);
    const toUser   = users.find(u => u.id === toId);
    if (!fromUser || !toUser) return;

    const patientId = fromUser.role === 'patient' ? fromId : toId;
    const doctorId  = fromUser.role === 'doctor'  ? fromId : toId;

    // Add connection if not already there
    setConnections(prev => {
      const exists = prev.some(c => c.patientId === patientId && c.doctorId === doctorId);
      if (exists) return prev;
      return [...prev, { patientId, doctorId }];
    });

    // Add empty sharedAccess entry so the sidebar shows them (0 files shared yet)
    setSharedAccess(prev => {
      const exists = prev.some(s => s.patientId === patientId && s.doctorId === doctorId);
      if (exists) return prev;
      return [...prev, { patientId, doctorId, recordIds: [] }];
    });
  }

  function declineInvite(inviteId: string) {
    setInvites(prev => prev.map(i => i.id === inviteId ? { ...i, status: 'declined' } : i));
  }

  function pendingInvitesFor(userId: string): Invite[] {
    return invites.filter(i => i.toId === userId && i.status === 'pending');
  }

  function hasPendingInvite(fromId: string, toId: string): boolean {
    return invites.some(
      i => i.fromId === fromId && i.toId === toId && i.status === 'pending'
    );
  }

  function isConnected(patientId: string, doctorId: string): boolean {
    return connections.some(c => c.patientId === patientId && c.doctorId === doctorId);
  }

  return (
    <ConnectionContext.Provider value={{
      connections, sharedAccess, invites,
      sendInvite, acceptInvite, declineInvite,
      pendingInvitesFor, hasPendingInvite, isConnected,
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
