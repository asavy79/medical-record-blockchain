import { createContext, useContext, useState, type ReactNode } from 'react';
import { type User, users } from '../data/mockData';

interface AuthContextType {
  currentUser: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  function login(username: string, password: string): boolean {
    const found = users.find(u => u.username === username && u.password === password);
    if (found) { setCurrentUser(found); return true; }
    return false;
  }

  function logout() { setCurrentUser(null); }

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
