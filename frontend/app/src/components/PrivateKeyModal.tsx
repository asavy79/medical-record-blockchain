import { useState, type FormEvent } from 'react';
import { type MedRecord, MOCK_PRIVATE_KEY } from '../data/mockData';
import './PrivateKeyModal.css';

interface Props {
  record: MedRecord;
  onClose: () => void;
}

export default function PrivateKeyModal({ record, onClose }: Props) {
  const [key, setKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Simulate decryption delay
    setTimeout(() => {
      if (key.trim() === MOCK_PRIVATE_KEY) {
        setUnlocked(true);
      } else {
        setError('Invalid private key. Access denied.');
      }
      setLoading(false);
    }, 800);
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
            <h2 className="modal-title">{record.title}</h2>
            <p className="modal-meta">{record.type} &nbsp;·&nbsp; {record.date} &nbsp;·&nbsp; {record.size}</p>
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
              This record is encrypted. Enter your private key to decrypt and view the contents.
            </p>
            <form className="key-form" onSubmit={handleUnlock}>
              <div className="field-group">
                <label className="field-label">Private Key</label>
                <input
                  className="field-input mono"
                  type="password"
                  placeholder="0x..."
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  required
                />
              </div>
              {error && <div className="modal-error">{error}</div>}
              <div className="key-hint">
                Demo key: <code>0xabc123privatekey</code>
              </div>
              <button className="unlock-btn" type="submit" disabled={loading}>
                {loading
                  ? <><span className="spinner" /> Decrypting…</>
                  : <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                    </svg>
                    Unlock MedRecord
                  </>
                }
              </button>
            </form>
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
            <pre className="record-content">{record.content}</pre>
            <button className="download-btn">
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
