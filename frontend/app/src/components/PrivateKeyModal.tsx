import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import * as cryptoService from '../services/crypto';
import * as contractService from '../services/contract';
import './PrivateKeyModal.css';

interface Props {
  record: api.RecordResponse;
  onClose: () => void;
}

export default function PrivateKeyModal({ record, onClose }: Props) {
  const { signer } = useWallet();
  const { currentUser } = useAuth();
  const [enteredKey, setEnteredKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [decryptedContent, setDecryptedContent] = useState<string>('');
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isPatient = currentUser?.role === 'patient';

  async function handleUnlock() {
    const keyHex = enteredKey.trim();
    if (!keyHex || !currentUser) return;
    setError('');
    setLoading(true);

    try {
      // Validate key matches connected wallet
      const derivedPub = cryptoService.derivePublicKey(keyHex);
      if (derivedPub !== currentUser.public_key) {
        throw new Error('This private key does not match your connected wallet.');
      }

      const privKeyBytes = cryptoService.hexToBytes(keyHex);

      // 1. Fetch the encrypted file from backend
      const encryptedFile = new Uint8Array(
        await api.getRecordFile(record.patient_id, record.id)
      );

      let masterKeyBytes: Uint8Array;

      if (isPatient) {
        // Patient: decrypt master key via ECIES (encrypted to their own public key)
        const encMasterKey = cryptoService.hexToBytes(record.encrypted_master_key);
        masterKeyBytes = await cryptoService.eciesDecrypt(privKeyBytes, encMasterKey);
      } else {
        // Doctor: get encrypted key from on-chain, then decrypt via ECDH shared secret
        if (!signer) throw new Error('No signer available');

        const onChainRecordId = cryptoService.uuidToUint256(record.id);
        const patient = await api.getPatient(record.patient_id);

        // Get the re-encrypted key from the smart contract
        const encKeyHex = await contractService.getDoctorKey(signer, patient.wallet_address, onChainRecordId);
        if (!encKeyHex || encKeyHex === '0x' || encKeyHex === '') {
          throw new Error('No shared key found on-chain. The patient has not shared this record key with you yet.');
        }

        // Get patient's public key for ECDH
        const patientPubKey = cryptoService.hexToBytes(patient.public_key);

        // Derive shared secret
        const sharedKey = cryptoService.ecdhDeriveKey(privKeyBytes, patientPubKey);

        // Decrypt the re-encrypted master key
        const encKeyBytes = cryptoService.hexToBytes(encKeyHex);
        masterKeyBytes = await cryptoService.aesGcmDecrypt(sharedKey, encKeyBytes);
      }

      // 2. Decrypt the file with the master key
      const fileBytes = await cryptoService.aesGcmDecrypt(masterKeyBytes, encryptedFile);

      // 3. Try to display as text, or offer as download
      const blob = new Blob([fileBytes.buffer as ArrayBuffer]);
      setDecryptedBlob(blob);

      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(fileBytes);
        setDecryptedContent(text);
      } catch {
        setDecryptedContent('[Binary file — use Download button]');
      }

      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decryption failed.');
    }
    setLoading(false);
  }

  function handleDownload() {
    if (!decryptedBlob) return;
    const url = URL.createObjectURL(decryptedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.metadata.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-file-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <h2 className="modal-title">{record.metadata.filename}</h2>
            <p className="modal-meta">
              {record.metadata.category} &nbsp;·&nbsp; {record.metadata.file_type} &nbsp;·&nbsp;
              {record.metadata.size_bytes < 1024 * 1024
                ? `${(record.metadata.size_bytes / 1024).toFixed(0)} KB`
                : `${(record.metadata.size_bytes / (1024 * 1024)).toFixed(1)} MB`
              }
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {!unlocked ? (
          <div className="modal-lock-body">
            <div className="lock-icon-wrap">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <p className="lock-description">
              This record is encrypted. Enter your private key to decrypt it client-side. Your key will not be stored.
              {!isPatient && ' The patient must have shared the record key with you on-chain.'}
            </p>
            <div className="key-form">
              <div className="field-group">
                <label className="field-label">Private Key</label>
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
                Your Anvil private key starting with <code>0x</code>
              </p>
            </div>
            {error && <div className="modal-error">{error}</div>}
            <button className="unlock-btn" onClick={handleUnlock} disabled={loading || !enteredKey.trim()}>
              {loading
                ? <><span className="spinner" /> Decrypting...</>
                : <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                  </svg>
                  Decrypt Record
                </>
              }
            </button>
          </div>
        ) : (
          <div className="modal-content-body">
            <div className="unlock-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 12l2 2 4-4"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              Decrypted successfully
            </div>
            <pre className="record-content">{decryptedContent}</pre>
            <button className="download-btn" onClick={handleDownload}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
