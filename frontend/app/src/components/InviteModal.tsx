import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConnections } from '../context/ConnectionContext';
import * as api from '../services/api';
import './InviteModal.css';

interface Props {
  onClose: () => void;
}

interface Candidate {
  id: string;
  name: string;
  wallet_address: string;
  role: 'patient' | 'doctor';
  specialty?: string | null;
}

export default function InviteModal({ onClose }: Props) {
  const { currentUser } = useAuth();
  const { sendInvite, isConnected, hasPendingInvite } = useConnections();
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  const isPatient = currentUser?.role === 'patient';

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (isPatient) {
          const doctors = await api.getDoctors(query || undefined);
          setCandidates(doctors.map(d => ({
            id: d.id, name: d.name, wallet_address: d.wallet_address, role: 'doctor' as const, specialty: d.specialty,
          })));
        } else {
          const patients = await api.getPatients();
          setCandidates(patients
            .filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()))
            .map(p => ({
              id: p.id, name: p.name, wallet_address: p.wallet_address, role: 'patient' as const,
            })));
        }
      } catch {
        setCandidates([]);
      }
      setLoading(false);
    }
    load();
  }, [query, isPatient]);

  if (!currentUser) return null;

  const filtered = candidates.filter(c => {
    if (c.wallet_address === currentUser.wallet_address.toLowerCase()) return false;
    if (isConnected(c.wallet_address)) return false;
    return true;
  });

  async function handleSend(target: Candidate) {
    try {
      await sendInvite(target.wallet_address);
      setSent(prev => [...prev, target.wallet_address]);
    } catch {
      // error
    }
  }

  function statusFor(target: Candidate): 'idle' | 'sent' | 'already-sent' {
    if (sent.includes(target.wallet_address)) return 'sent';
    if (hasPendingInvite(target.wallet_address)) return 'already-sent';
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
            placeholder={isPatient ? 'Search by name or specialty...' : 'Search by name...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="invite-list">
          {loading && <p className="invite-empty">Loading...</p>}
          {!loading && filtered.length === 0 && (
            <p className="invite-empty">
              {query ? 'No results found.' : `All available ${isPatient ? 'doctors' : 'patients'} are already connected.`}
            </p>
          )}
          {filtered.map(u => {
            const status = statusFor(u);
            return (
              <div key={u.id} className="invite-row">
                <div className={`peer-avatar ${u.role}`}>
                  {u.name.replace('Dr. ', '').charAt(0)}
                </div>
                <div className="peer-info">
                  <span className="peer-name">{u.name}</span>
                  <span className="peer-sub">{u.specialty ?? ''}</span>
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
