import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  const isPatient = currentUser?.role === 'patient';

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="navbar-logo-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="var(--accent)" opacity="0.9"/>
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="navbar-brand">MedVault</span>
      </div>

      <div className="navbar-right">
        <div className="navbar-user">
          <div className={`navbar-avatar ${isPatient ? 'patient' : 'doctor'}`}>
            {currentUser?.name.charAt(0)}
          </div>
          <div className="navbar-user-info">
            <span className="navbar-user-name">{currentUser?.name}</span>
            <span className={`navbar-role-badge ${isPatient ? 'patient' : 'doctor'}`}>
              {isPatient ? 'Patient' : 'Doctor'}
            </span>
          </div>
        </div>
        <button className="navbar-logout" onClick={handleLogout}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
