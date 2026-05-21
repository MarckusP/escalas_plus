import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import api from '../utils/api';
import { homePathForRole } from '../utils/roles';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  church_id?: number | null;
  satisfacao_resp?: number;
}

interface AuthCtx {
  user: User | null;
  login: (identifier: string, password: string) => Promise<void>;
  loginVerify: (sessionId: string, code: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  applySession: (token: string, user: User, redirect?: string) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (token && stored) {
      const parsed = JSON.parse(stored) as User;
      if (parsed.role === 'super_admin') parsed.church_id = null;
      setUser(parsed);
    }
    setLoading(false);
  }, []);

  function applySession(token: string, u: User, redirect?: string) {
    localStorage.setItem('token', token);
    if (u.role === 'super_admin') u.church_id = null;
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    router.push(redirect || homePathForRole(u.role));
  }

  async function login(identifier: string, password: string) {
    const { data } = await api.post('/auth/login', { identifier, password });
    if (data.requires2fa) {
      throw { requires2fa: true, ...data };
    }
    applySession(data.token, data.user);
  }

  async function loginVerify(sessionId: string, code: string) {
    const { data } = await api.post('/auth/login/verify', { sessionId, code });
    applySession(data.token, data.user);
  }

  async function loginWithGoogle(credential: string) {
    const { data } = await api.post('/auth/google', { credential });
    applySession(data.token, data.user);
  }

  function logout() {
    localStorage.clear();
    setUser(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider
      value={{ user, login, loginVerify, loginWithGoogle, applySession, logout, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
