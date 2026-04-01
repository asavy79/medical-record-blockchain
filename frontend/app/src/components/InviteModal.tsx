import { useState } from 'react';
import { users, type User } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { useConnections } from '../context/ConnectionContext';
import './InviteModal.css';

interface Props {
  onClose: () => void;
}

export default function InviteModal({ onClose }: Props) {
  const { currentUser } = useAuth();
  const { sendInvite, isConnected, hasPendingInvite } = useConnections();
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState<string[]>([]);

  if (!currentUser) return null;
  const isPatient = currentUser.role === 'patient';

  // Show the opposite role
  const candidates: User[] = users.filter(u => {
    if (u.role === currentUser.role) return false;
    const patientId = isPatient ? currentUser.id : u.id;
    const doctorId  = isPatient ? u.id : currentUser.id;
    if (isConnected(patientId, doctorId)) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.specialty?.toLowerCase().includes(q) || u.dob?.toLowerCase().includes(q);
    }
    return true;
  });

  function handleSend(target: User) {
    if (!currentUser) return;
    sendInvite(currentUser.id, target.id);
    setSent(prev => [...prev, target.id]);
  }

  function statusFor(target: User): 'idle' | 'sent' | 'already-sent' {
    if (sent.includes(target.id)) return 'sent';
    if (!currentUser) return 'idle';
    if (hasPendingInvite(currentUser.id, target.id)) return 'already-sent';
    return 'idle';
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card invite-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-file-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </div>
          <div>
            <h2 className="modal-title">Invite a {isPatient ? 'Doctor' : 'Patient'}</h2>
            <p className="modal-meta">Send a connection request</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="invite-search-wrap">
          <svg className="invite-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="invite-search"
            placeholder={isPatient ? 'Search by name or specialty…' : 'Search by name…'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="invite-list">
          {candidates.length === 0 && (
            <p className="invite-empty">
              {query ? 'No results found.' : `All available ${isPatient ? 'doctors' : 'patients'} are already connected.`}
            </p>
          )}
          {candidates.map(u => {
            const status = statusFor(u);
            return (
              <div key={u.id} className="invite-row">
                <div className={`peer-avatar ${isPatient ? 'doctor' : 'patient'}`}>
                  {u.name.replace('Dr. ', '').charAt(0)}
                </div>
                <div className="peer-info">
                  <span className="peer-name">{u.name}</span>
                  <span className="peer-sub">{u.specialty ?? u.dob ?? ''}</span>
                </div>
                <button
                  className={`invite-send-btn ${status !== 'idle' ? 'sent' : ''}`}
                  onClick={() => handleSend(u)}
                  disabled={status !== 'idle'}
                >
                  {status === 'idle' && <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                    Invite
                  </>}
                  {status !== 'idle' && <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    Sent
                  </>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
