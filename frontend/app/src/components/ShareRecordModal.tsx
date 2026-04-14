import { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useAuth } from '../context/AuthContext';
import { useConnections, type PeerInfo } from '../context/ConnectionContext';
import * as api from '../services/api';
import * as cryptoService from '../services/crypto';
import * as contractService from '../services/contract';
import './PrivateKeyModal.css';
import './ShareRecordModal.css';

interface Props {
  record: api.RecordResponse;
  onClose: () => void;
  onShared?: () => void;
}

export default function ShareRecordModal({ record, onClose, onShared }: Props) {
  const { signer, walletAddress } = useWallet();
  const { currentUser } = useAuth();
  const { peers } = useConnections();

  const [selectedDoctor, setSelectedDoctor] = useState<PeerInfo | null>(null);
  const [enteredKey, setEnteredKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sharedDoctorIds, setSharedDoctorIds] = useState<Set<string>>(new Set());

  const doctors = peers.filter(p => p.role === 'doctor');

  // Fetch existing permissions to mark already-shared doctors
  useEffect(() => {
    async function loadPermissions() {
      try {
        const perms = await api.getRecordPermissions(record.patient_id, record.id);
        setSharedDoctorIds(new Set(perms.map(p => p.doctor_id)));
      } catch {
        // permissions endpoint may not exist yet
      }
    }
    loadPermissions();
  }, [record.patient_id, record.id]);

  async function handleShare() {
    const keyHex = enteredKey.trim();
    if (!keyHex || !selectedDoctor || !signer || !walletAddress || !currentUser) return;
    setError('');
    setLoading(true);

    try {
      // Validate key matches connected wallet
      const derivedPub = cryptoService.derivePublicKey(keyHex);
      if (derivedPub !== currentUser.public_key) {
        throw new Error('This private key does not match your connected wallet.');
      }

      const privKeyBytes = cryptoService.hexToBytes(keyHex);

      // 1. Decrypt the record's master key (ECIES)
      const encMasterKey = cryptoService.hexToBytes(record.encrypted_master_key);
      const masterKeyBytes = await cryptoService.eciesDecrypt(privKeyBytes, encMasterKey);

      // 2. Derive ECDH shared secret with the doctor's public key
      const doctorPubKeyBytes = cryptoService.hexToBytes(selectedDoctor.public_key);
      const sharedKey = cryptoService.ecdhDeriveKey(privKeyBytes, doctorPubKeyBytes);

      // 3. AES-GCM encrypt the master key with the shared secret
      const encryptedKeyForDoctor = await cryptoService.aesGcmEncrypt(sharedKey, masterKeyBytes);
      const encryptedKeyHex = cryptoService.bytesToHex(encryptedKeyForDoctor);

      // 4. Store on-chain via smart contract
      const onChainRecordId = cryptoService.uuidToUint256(record.id);
      await contractService.shareKeyWithDoctor(
        signer,
        walletAddress,
        onChainRecordId,
        selectedDoctor.wallet_address,
        encryptedKeyHex
      );

      // 5. Create permission in backend database so the doctor can access the record
      await api.createPermission(record.patient_id, record.id, selectedDoctor.id);

      setSuccess(true);
      onShared?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share record key.');
    }
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-file-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </div>
          <div>
            <h2 className="modal-title">Share Record</h2>
            <p className="modal-meta">{record.metadata.filename} &nbsp;·&nbsp; {record.metadata.category}</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {success ? (
          <div className="modal-content-body">
            <div className="unlock-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 12l2 2 4-4"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              Record key shared successfully
            </div>
            <p className="lock-description" style={{ textAlign: 'left', maxWidth: '100%' }}>
              {selectedDoctor?.name} can now decrypt this record. It may take a few seconds for the permission to appear.
            </p>
            <button className="unlock-btn" onClick={onClose} style={{ marginTop: 4 }}>
              Close
            </button>
          </div>
        ) : (
          <div className="modal-lock-body" style={{ alignItems: 'stretch' }}>
            {/* Doctor selection */}
            <p className="lock-description" style={{ textAlign: 'left', maxWidth: '100%', marginBottom: 8 }}>
              Select a connected doctor to share this record's decryption key with.
            </p>

            {doctors.length === 0 ? (
              <p className="lock-description" style={{ textAlign: 'center' }}>
                No connected doctors. Invite a doctor first.
              </p>
            ) : (
              <div className="doctor-list">
                {doctors.map(doc => {
                  const alreadyShared = sharedDoctorIds.has(doc.id);
                  return (
                    <button
                      key={doc.id}
                      className={`doctor-row${selectedDoctor?.id === doc.id ? ' selected' : ''}${alreadyShared ? ' disabled' : ''}`}
                      onClick={() => !alreadyShared && setSelectedDoctor(doc)}
                      disabled={alreadyShared}
                    >
                      <div className={`peer-avatar doctor`}>
                        {doc.name.replace('Dr. ', '').charAt(0)}
                      </div>
                      <div className="peer-info">
                        <span className="peer-name">{doc.name}</span>
                        <span className="peer-sub">{doc.specialty ?? ''}</span>
                      </div>
                      {alreadyShared && <span className="shared-badge">Shared</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Private key input */}
            <div className="key-form" style={{ marginTop: 16 }}>
              <div className="field-group">
                <label className="field-label">Your Private Key</label>
                <input
                  className="field-input mono"
                  type="password"
                  placeholder="0x..."
                  value={enteredKey}
                  onChange={e => setEnteredKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <p className="key-hint">
                Required to re-encrypt the record key for the doctor. Your key will not be stored.
              </p>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <button
              className="unlock-btn"
              onClick={handleShare}
              disabled={loading || !selectedDoctor || !enteredKey.trim()}
              style={{ marginTop: 16 }}
            >
              {loading
                ? <><span className="spinner" /> Sharing...</>
                : <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/>
                    <line x1="22" y1="11" x2="16" y2="11"/>
                  </svg>
                  Share Record Key
                </>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
