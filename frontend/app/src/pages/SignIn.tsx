import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './SignIn.css';

export default function SignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      const ok = login(username.trim(), password);
      if (ok) {
        navigate('/dashboard');
      } else {
        setError('Invalid username or password.');
      }
      setLoading(false);
    }, 600);
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

        <h1 className="signin-title">Welcome back</h1>
        <p className="signin-subtitle">Sign in to your secure health portal</p>

        <form className="signin-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label">Username</label>
            <input
              className="field-input"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label">Password</label>
            <input
              className="field-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="signin-error">{error}</div>}

          <button className="signin-btn" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign In'}
          </button>
        </form>

        <div className="signin-hint">
          <p>Demo accounts:</p>
          <div className="hint-grid">
            <span className="hint-tag patient">Patient: john.doe / patient123</span>
            <span className="hint-tag doctor">Doctor: dr.patel / doctor123</span>
          </div>
        </div>
      </div>
    </div>
  );
}
