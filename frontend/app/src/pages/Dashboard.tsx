import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConnections, type PeerInfo } from '../context/ConnectionContext';
import Navbar from '../components/Navbar';
import PrivateKeyModal from '../components/PrivateKeyModal';
import InviteModal from '../components/InviteModal';
import UploadRecordModal from '../components/UploadRecordModal';
import * as api from '../services/api';
import './Dashboard.css';

type Tab = 'all' | 'shared';

export default function Dashboard() {
  const { currentUser } = useAuth();
  const { peers, pendingInvitesForMe, acceptInvite, declineInvite, refresh } = useConnections();

  const [selectedPeer, setSelectedPeer] = useState<PeerInfo | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<api.RecordResponse | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [showInvite, setShowInvite] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Records state
  const [records, setRecords] = useState<api.RecordResponse[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // User name cache for invite sender display
  const [nameCache, setNameCache] = useState<Map<string, { name: string; role: string; sub: string }>>(new Map());

  const isPatient = currentUser?.role === 'patient';
  const pendingInvites = pendingInvitesForMe();

  // Load connections + records on mount and when user changes
  useEffect(() => {
    if (!currentUser) return;
    refresh();
    loadRecords();
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRecords() {
    if (!currentUser) return;
    setLoadingRecords(true);
    try {
      if (isPatient) {
        const recs = await api.getRecords(currentUser.id);
        setRecords(recs);
      } else {
        // Doctor: load records from each connected patient
        const allRecs: api.RecordResponse[] = [];
        for (const peer of peers) {
          try {
            const recs = await api.getRecords(peer.id);
            allRecs.push(...recs);
          } catch {
            // no access
          }
        }
        setRecords(allRecs);
      }
    } catch {
      // backend may be down
    }
    setLoadingRecords(false);
  }

  // Re-load records when peers change (for doctors)
  useEffect(() => {
    if (!isPatient && currentUser) {
      loadRecords();
    }
  }, [peers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve invite sender names
  useEffect(() => {
    async function resolveSenders() {
      const newCache = new Map(nameCache);
      for (const inv of pendingInvites) {
        if (newCache.has(inv.fromWallet)) continue;
        try {
          const d = await api.getDoctorByWallet(inv.fromWallet);
          newCache.set(inv.fromWallet, { name: d.name, role: 'doctor', sub: d.specialty ?? '' });
        } catch {
          try {
            const p = await api.getPatientByWallet(inv.fromWallet);
            newCache.set(inv.fromWallet, { name: p.name, role: 'patient', sub: '' });
          } catch {
            newCache.set(inv.fromWallet, { name: inv.fromWallet.slice(0, 10) + '...', role: inv.fromRole, sub: '' });
          }
        }
      }
      setNameCache(newCache);
    }
    if (pendingInvites.length > 0) resolveSenders();
  }, [pendingInvites.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser) return null;

  // Records visible on the main panel
  function getMainRecords(): api.RecordResponse[] {
    if (tab === 'all') return records;
    if (!selectedPeer) return [];
    // Show records for the selected peer
    return records.filter(r => r.patient_id === selectedPeer.id);
  }

  function getSenderInfo(wallet: string) {
    return nameCache.get(wallet) ?? { name: wallet.slice(0, 10) + '...', role: 'patient', sub: '' };
  }

  function getPeerSharedCount(_peer: PeerInfo): number {
    if (isPatient) {
      // For patients, count records shared with this doctor (approximation: all their records with permissions)
      return records.length;
    }
    return records.filter(r => r.patient_id === _peer.id).length;
  }

  function getPatientName(patientId: string): string {
    const peer = peers.find(p => p.id === patientId);
    return peer?.name ?? 'Patient';
  }

  const mainRecords = getMainRecords();

  function handlePeerClick(peer: PeerInfo) {
    setSelectedPeer(peer);
    setTab('shared');
  }

  async function handleAccept(inviteId: string, fromWallet: string) {
    await acceptInvite(inviteId, fromWallet);
    loadRecords();
  }

  async function handleDecline(inviteId: string) {
    await declineInvite(inviteId);
  }

  const recordTypeIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('lab') || t.includes('report'))
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5m4 0h10m0-11v11m0 0v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4"/>
        </svg>
      );
    if (t.includes('imag'))
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      );
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    );
  };

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="dash-root">
      <Navbar />
      <div className="dash-body">

        {/* Main Panel */}
        <main className="dash-main">
          <div className="dash-main-header">
            <div>
              <h1 className="dash-greeting">
                {isPatient ? 'My Health Records' : 'Patient Records'}
              </h1>
              <p className="dash-greeting-sub">
                {isPatient
                  ? `Welcome back, ${currentUser.name.split(' ')[0]}`
                  : `${currentUser.specialty ?? ''} · ${currentUser.name}`}
              </p>
            </div>
            <div className="dash-tabs">
              {isPatient && (
                <button className="dash-tab upload-btn" onClick={() => setShowUpload(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload Record
                </button>
              )}
              <button
                className={`dash-tab ${tab === 'all' ? 'active' : ''}`}
                onClick={() => { setTab('all'); setSelectedPeer(null); }}
              >
                All Records
              </button>
              <button
                className={`dash-tab ${tab === 'shared' ? 'active' : ''}`}
                onClick={() => setTab('shared')}
                disabled={!selectedPeer}
              >
                {selectedPeer
                  ? `Shared with ${selectedPeer.name.replace('Dr. ', 'Dr.')}`
                  : 'Shared — select someone'}
              </button>
            </div>
          </div>

          {loadingRecords ? (
            <div className="dash-empty">
              <span className="spinner" />
              <p>Loading records...</p>
            </div>
          ) : mainRecords.length === 0 ? (
            <div className="dash-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p>{tab === 'shared' && !selectedPeer
                ? 'Select a person from the sidebar to see shared records.'
                : isPatient
                  ? 'No records yet. Upload your first medical record!'
                  : 'No records found.'}</p>
            </div>
          ) : (
            <div className="records-grid">
              {mainRecords.map(rec => (
                <button key={rec.id} className="record-card" onClick={() => setSelectedRecord(rec)}>
                  <div className="record-card-top">
                    <div className="record-icon">{recordTypeIcon(rec.metadata.category)}</div>
                    <span className="record-type-badge">{rec.metadata.category}</span>
                  </div>
                  <h3 className="record-title">{rec.metadata.filename}</h3>
                  {!isPatient && (
                    <p className="record-patient-name">{getPatientName(rec.patient_id)}</p>
                  )}
                  <div className="record-meta">
                    <span>{formatDate(rec.created_at)}</span>
                    <span>{formatSize(rec.metadata.size_bytes)}</span>
                  </div>
                  <div className="record-lock">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Click to decrypt
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside className="dash-sidebar">

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="pending-section">
              <div className="pending-header">
                <span className="pending-title">Pending Invites</span>
                <span className="pending-badge">{pendingInvites.length}</span>
              </div>
              {pendingInvites.map(inv => {
                const info = getSenderInfo(inv.fromWallet);
                return (
                  <div key={inv.id} className="pending-card">
                    <div className={`peer-avatar ${info.role}`}>
                      {info.name.replace('Dr. ', '').charAt(0)}
                    </div>
                    <div className="peer-info">
                      <span className="peer-name">{info.name}</span>
                      <span className="peer-sub">{info.sub}</span>
                    </div>
                    <div className="pending-actions">
                      <button className="pending-accept" onClick={() => handleAccept(inv.id, inv.fromWallet)} title="Accept">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      </button>
                      <button className="pending-decline" onClick={() => handleDecline(inv.id)} title="Decline">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Connected peers */}
          <div className="sidebar-header">
            <h2 className="sidebar-title">{isPatient ? 'My Doctors' : 'My Patients'}</h2>
            <span className="sidebar-count">{peers.length}</span>
          </div>

          <div className="peer-list">
            {peers.length === 0 && (
              <p className="sidebar-empty">No connections yet.</p>
            )}
            {peers.map(peer => (
              <button
                key={peer.id}
                className={`peer-card ${selectedPeer?.id === peer.id ? 'active' : ''}`}
                onClick={() => handlePeerClick(peer)}
              >
                <div className={`peer-avatar ${peer.role}`}>
                  {peer.name.replace('Dr. ', '').charAt(0)}
                </div>
                <div className="peer-info">
                  <span className="peer-name">{peer.name}</span>
                  <span className="peer-sub">{peer.specialty ?? ''}</span>
                </div>
                <div className="peer-badge">{getPeerSharedCount(peer)} files</div>
              </button>
            ))}
          </div>

          {/* Invite button */}
          <div className="sidebar-invite-wrap">
            <button className="sidebar-invite-btn" onClick={() => setShowInvite(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              Invite a {isPatient ? 'Doctor' : 'Patient'}
            </button>
          </div>
        </aside>
      </div>

      {selectedRecord && (
        <PrivateKeyModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      )}
      {showInvite && (
        <InviteModal onClose={() => { setShowInvite(false); refresh(); }} />
      )}
      {showUpload && (
        <UploadRecordModal onClose={() => { setShowUpload(false); loadRecords(); }} />
      )}
    </div>
  );
}
