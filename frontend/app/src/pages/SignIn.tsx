import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import './SignIn.css';

type Step = 'select-wallet' | 'logging-in' | 'register';

export default function SignIn() {
  const { login, registerPatient, registerDoctor } = useAuth();
  const { connectAnvil, walletAddress, anvilAccounts } = useWallet();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('select-wallet');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Registration form state
  const [regRole, setRegRole] = useState<'patient' | 'doctor'>('patient');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSpecialty, setRegSpecialty] = useState('');

  async function handleConnect() {
    setError('');
    setLoading(true);
    try {
      connectAnvil(selectedIdx);

      // Small delay to let WalletContext propagate into AuthContext
      await new Promise(r => setTimeout(r, 100));
    } catch {
      setError('Failed to connect wallet.');
      setLoading(false);
      return;
    }
    setStep('logging-in');
    setLoading(false);
  }

  // This runs when step transitions to 'logging-in'
  // We use a separate effect-like approach via the step state
  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const ok = await login();
      if (ok) {
        navigate('/dashboard');
      } else {
        // User not registered → show registration form
        setStep('register');
      }
    } catch {
      setStep('register');
    }
    setLoading(false);
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let ok: boolean;
      if (regRole === 'patient') {
        ok = await registerPatient(regName, regEmail);
      } else {
        ok = await registerDoctor(regName, regEmail, regSpecialty || undefined);
      }
      if (ok) {
        navigate('/dashboard');
      } else {
        setError('Registration failed. Check your details.');
      }
    } catch {
      setError('Registration failed. Is the backend running?');
    }
    setLoading(false);
  }

  function truncAddr(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  return (
    <div className="signin-bg">
      <div className="signin-glow" />
      <div className="signin-card">
        <div className="signin-logo">
          <div className="signin-logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="var(--accent)" opacity="0.9"/>
              <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="signin-logo-text">MedVault</span>
        </div>

        {/* ── Step 1: Select Anvil wallet ──────────────────────────── */}
        {step === 'select-wallet' && (
          <>
            <h1 className="signin-title">Connect Wallet</h1>
            <p className="signin-subtitle">Select an Anvil account to sign in</p>

            <div className="signin-form">
              <div className="field-group">
                <label className="field-label">Anvil Account</label>
                <select
                  className="field-input"
                  value={selectedIdx}
                  onChange={e => setSelectedIdx(Number(e.target.value))}
                >
                  {anvilAccounts.map((acc, i) => (
                    <option key={i} value={i}>
                      Account {i} — {truncAddr(acc.address)}
                    </option>
                  ))}
                </select>
              </div>

              {error && <div className="signin-error">{error}</div>}

              <button className="signin-btn" onClick={handleConnect} disabled={loading}>
                {loading ? <span className="spinner" /> : 'Connect Wallet'}
              </button>
            </div>

            <div className="signin-hint">
              <p>Local Development</p>
              <div className="hint-grid">
                <span className="hint-tag patient">Uses Anvil pre-funded accounts</span>
                <span className="hint-tag doctor">No MetaMask required</span>
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Logging in (auto-signs challenge) ────────────── */}
        {step === 'logging-in' && (
          <>
            <h1 className="signin-title">Signing In</h1>
            <p className="signin-subtitle">
              Connected as {walletAddress ? truncAddr(walletAddress) : '...'}
            </p>

            <div className="signin-form">
              {error && <div className="signin-error">{error}</div>}

              {!loading && (
                <button className="signin-btn" onClick={handleLogin}>
                  Sign Challenge &amp; Login
                </button>
              )}
              {loading && (
                <button className="signin-btn" disabled>
                  <span className="spinner" />
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Step 3: Registration form ────────────────────────────── */}
        {step === 'register' && (
          <>
            <h1 className="signin-title">Register</h1>
            <p className="signin-subtitle">
              Wallet {walletAddress ? truncAddr(walletAddress) : ''} not found — create an account
            </p>

            <form className="signin-form" onSubmit={handleRegister}>
              <div className="field-group">
                <label className="field-label">I am a</label>
                <select className="field-input" value={regRole} onChange={e => setRegRole(e.target.value as 'patient' | 'doctor')}>
                  <option value="patient">Patient</option>
                  <option value="doctor">Doctor</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label">Full Name</label>
                <input
                  className="field-input"
                  type="text"
                  placeholder={regRole === 'doctor' ? 'Dr. Jane Smith' : 'Jane Smith'}
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Email</label>
                <input
                  className="field-input"
                  type="email"
                  placeholder="jane@example.com"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  required
                />
              </div>

              {regRole === 'doctor' && (
                <div className="field-group">
                  <label className="field-label">Specialty</label>
                  <input
                    className="field-input"
                    type="text"
                    placeholder="Cardiology"
                    value={regSpecialty}
                    onChange={e => setRegSpecialty(e.target.value)}
                  />
                </div>
              )}

              {error && <div className="signin-error">{error}</div>}

              <button className="signin-btn" type="submit" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Create Account & Sign In'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
