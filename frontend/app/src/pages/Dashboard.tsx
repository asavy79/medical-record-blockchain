import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConnections } from '../context/ConnectionContext';
import Navbar from '../components/Navbar';
import PrivateKeyModal from '../components/PrivateKeyModal';
import InviteModal from '../components/InviteModal';
import { records, users, type MedRecord, type User } from '../data/mockData';
import './Dashboard.css';

type Tab = 'all' | 'shared';

export default function Dashboard() {
  const { currentUser } = useAuth();
  const { connections, sharedAccess, pendingInvitesFor, acceptInvite, declineInvite } = useConnections();
  const [selectedPeer, setSelectedPeer] = useState<User | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MedRecord | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [showInvite, setShowInvite] = useState(false);

  if (!currentUser) return null;
  const isPatient = currentUser.role === 'patient';

  const pendingInvites = pendingInvitesFor(currentUser.id);

  // ── Records visible on the main panel ──────────────────────────────────────
  function getMainRecords(): MedRecord[] {
    if (tab === 'all') {
      if (isPatient) return records.filter(r => r.patientId === currentUser!.id);
      return sharedAccess
        .filter(sa => sa.doctorId === currentUser!.id)
        .flatMap(sa => records.filter(r => sa.recordIds.includes(r.id)));
    }
    if (!selectedPeer) return [];
    if (isPatient) {
      const access = sharedAccess.find(
        sa => sa.patientId === currentUser!.id && sa.doctorId === selectedPeer.id,
      );
      return access ? records.filter(r => access.recordIds.includes(r.id)) : [];
    } else {
      const access = sharedAccess.find(
        sa => sa.doctorId === currentUser!.id && sa.patientId === selectedPeer.id,
      );
      return access ? records.filter(r => access.recordIds.includes(r.id)) : [];
    }
  }

  // ── Sidebar peers (connected) ───────────────────────────────────────────────
  function getPeers(): User[] {
    if (isPatient) {
      const doctorIds = connections
        .filter(c => c.patientId === currentUser!.id)
        .map(c => c.doctorId);
      return users.filter(u => doctorIds.includes(u.id));
    } else {
      const patientIds = connections
        .filter(c => c.doctorId === currentUser!.id)
        .map(c => c.patientId);
      return users.filter(u => patientIds.includes(u.id));
    }
  }

  function getSharedCount(peer: User): number {
    if (isPatient) {
      return sharedAccess.find(
        sa => sa.patientId === currentUser!.id && sa.doctorId === peer.id,
      )?.recordIds.length ?? 0;
    } else {
      return sharedAccess.find(
        sa => sa.doctorId === currentUser!.id && sa.patientId === peer.id,
      )?.recordIds.length ?? 0;
    }
  }

  function getSenderName(fromId: string) {
    return users.find(u => u.id === fromId)?.name ?? 'Someone';
  }

  function getSenderSub(fromId: string) {
    const u = users.find(u => u.id === fromId);
    return u?.specialty ?? u?.dob ?? '';
  }

  function getSenderInitial(fromId: string) {
    const u = users.find(u => u.id === fromId);
    return (u?.name ?? '?').replace('Dr. ', '').charAt(0);
  }

  function getSenderRole(fromId: string): 'doctor' | 'patient' {
    return users.find(u => u.id === fromId)?.role ?? 'patient';
  }

  const mainRecords = getMainRecords();
  const peers = getPeers();

  function handlePeerClick(peer: User) {
    setSelectedPeer(peer);
    setTab('shared');
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

  function getPatientName(patientId: string) {
    return users.find(u => u.id === patientId)?.name ?? 'Unknown';
  }

  return (
    <div className="dash-root">
      <Navbar />
      <div className="dash-body">

        {/* ── Main Panel ──────────────────────────────────────────────────── */}
        <main className="dash-main">
          <div className="dash-main-header">
            <div>
              <h1 className="dash-greeting">
                {isPatient ? 'My Health Records' : 'Patient Records'}
              </h1>
              <p className="dash-greeting-sub">
                {isPatient
                  ? `Welcome back, ${currentUser.name.split(' ')[0]}`
                  : `${currentUser.specialty} · ${currentUser.name}`}
              </p>
            </div>
            <div className="dash-tabs">
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

          {mainRecords.length === 0 ? (
            <div className="dash-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p>{tab === 'shared' && !selectedPeer
                ? 'Select a person from the sidebar to see shared records.'
                : 'No records found.'}</p>
            </div>
          ) : (
            <div className="records-grid">
              {mainRecords.map(rec => (
                <button key={rec.id} className="record-card" onClick={() => setSelectedRecord(rec)}>
                  <div className="record-card-top">
                    <div className="record-icon">{recordTypeIcon(rec.type)}</div>
                    <span className="record-type-badge">{rec.type}</span>
                  </div>
                  <h3 className="record-title">{rec.title}</h3>
                  {!isPatient && (
                    <p className="record-patient-name">{getPatientName(rec.patientId)}</p>
                  )}
                  <div className="record-meta">
                    <span>{rec.date}</span>
                    <span>{rec.size}</span>
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

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="dash-sidebar">

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="pending-section">
              <div className="pending-header">
                <span className="pending-title">Pending Invites</span>
                <span className="pending-badge">{pendingInvites.length}</span>
              </div>
              {pendingInvites.map(inv => (
                <div key={inv.id} className="pending-card">
                  <div className={`peer-avatar ${getSenderRole(inv.fromId)}`}>
                    {getSenderInitial(inv.fromId)}
                  </div>
                  <div className="peer-info">
                    <span className="peer-name">{getSenderName(inv.fromId)}</span>
                    <span className="peer-sub">{getSenderSub(inv.fromId)}</span>
                  </div>
                  <div className="pending-actions">
                    <button className="pending-accept" onClick={() => acceptInvite(inv.id)} title="Accept">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                    </button>
                    <button className="pending-decline" onClick={() => declineInvite(inv.id)} title="Decline">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
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
                <div className={`peer-avatar ${isPatient ? 'doctor' : 'patient'}`}>
                  {peer.name.replace('Dr. ', '').charAt(0)}
                </div>
                <div className="peer-info">
                  <span className="peer-name">{peer.name}</span>
                  <span className="peer-sub">{peer.specialty ?? peer.dob ?? ''}</span>
                </div>
                <div className="peer-badge">{getSharedCount(peer)} files</div>
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
        <InviteModal onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}
