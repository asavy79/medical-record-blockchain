import { useState, useRef, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import * as api from '../services/api';
import * as cryptoService from '../services/crypto';
import './PrivateKeyModal.css';

interface Props {
  onClose: () => void;
}

const CATEGORIES = ['Lab Report', 'Imaging', 'Consultation', 'Visit Summary', 'Prescription', 'Other'];

export default function UploadRecordModal({ onClose }: Props) {
  const { currentUser } = useAuth();
  const { publicKey } = useWallet();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !currentUser || !publicKey) return;
    setError('');
    setLoading(true);

    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());

      // 1. Generate a random AES-256 master key
      const masterKey = cryptoService.generateMasterKey();

      // 2. Encrypt the file with the master key
      const encryptedFile = await cryptoService.aesGcmEncrypt(masterKey, fileBytes);

      // 3. ECIES-encrypt the master key to the patient's own public key
      const pubKeyBytes = cryptoService.hexToBytes(publicKey);
      const encryptedMasterKey = await cryptoService.eciesEncrypt(pubKeyBytes, masterKey);
      const encryptedMasterKeyHex = cryptoService.bytesToHex(encryptedMasterKey);

      // 4. Upload to backend
      const metadata: api.RecordMetadata = {
        filename: file.name,
        file_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        category,
        description: description || null,
      };

      await api.uploadRecord(currentUser.id, metadata, encryptedMasterKeyHex, encryptedFile);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
    setLoading(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-file-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div>
            <h2 className="modal-title">Upload Medical Record</h2>
            <p className="modal-meta">File will be encrypted client-side before upload</p>
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
              Record uploaded &amp; encrypted successfully
            </div>
            <button className="unlock-btn" onClick={onClose} style={{ marginTop: 8 }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field-group">
              <label className="field-label">File</label>
              <input
                ref={fileRef}
                type="file"
                className="field-input"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">Category</label>
              <select className="field-input" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="field-group">
              <label className="field-label">Description (optional)</label>
              <input
                className="field-input"
                type="text"
                placeholder="Brief description..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {error && <div className="modal-error">{error}</div>}

            <button className="unlock-btn" type="submit" disabled={loading || !file}>
              {loading
                ? <><span className="spinner" /> Encrypting &amp; Uploading...</>
                : <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Encrypt &amp; Upload
                </>
              }
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
