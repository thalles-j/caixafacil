import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  clearStoredToken,
  ensureStoredAccessToken,
  getStoredToken,
  isTokenValid,
  loginRequest,
  logoutRequest,
  refreshSessionRequest,
  registerRequest,
  resetAccountDataRequest,
  sessionRequest,
  setStoredToken,
  changePasswordRequest,
} from '../lib/auth';
import { APP_DATA_CHANGED_EVENT } from '../lib/storage';

interface AuthUser {
  id: string;
  email: string;
  role: 'client' | 'admin';
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, confirmPassword: string) => Promise<void>;
  resetAccountData: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<string>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const token = getStoredToken();
      try {
        let session;
        if (isTokenValid(token)) {
          try {
            session = await sessionRequest(token);
          } catch {
            session = await refreshSessionRequest();
          }
        } else {
          session = await refreshSessionRequest();
        }
        if (cancelled) return;
        if ('token' in session && typeof session.token === 'string') setStoredToken(session.token);
        window.dispatchEvent(new CustomEvent(APP_DATA_CHANGED_EVENT, { detail: session.data }));
        setUser(session.user);
      } catch {
        if (cancelled) return;
        clearStoredToken();
        window.dispatchEvent(new Event(APP_DATA_CHANGED_EVENT));
        setUser(null);
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    // O refresh token HTTP-only mantém a sessão. Este intervalo apenas renova o
    // access token quando necessário enquanto a aplicação permanece aberta.
    const interval = setInterval(() => {
      const token = getStoredToken();
      if (!isTokenValid(token)) {
        void refreshSessionRequest()
          .then((session) => {
            setStoredToken(session.token);
            window.dispatchEvent(new CustomEvent(APP_DATA_CHANGED_EVENT, { detail: session.data }));
            setUser(session.user);
          })
          .catch(() => {
            clearStoredToken();
            window.dispatchEvent(new Event(APP_DATA_CHANGED_EVENT));
            setUser(null);
          });
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [user]);

  const login = async (email: string, password: string) => {
    const tempoMinimoDeCarregamento = new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    const { token, user: loggedUser, data } = await loginRequest(email, password);
    const paginasPrincipaisCarregadas = loggedUser.role === 'admin'
      ? Promise.all([import('../components/AdminLayout'), import('../pages/admin/AdminClients')])
      : Promise.all([import('../components/Layout'), import('../pages/Dashboard')]);
    setStoredToken(token);
    window.dispatchEvent(new CustomEvent(APP_DATA_CHANGED_EVENT, { detail: data }));
    await Promise.all([tempoMinimoDeCarregamento, paginasPrincipaisCarregadas]);
    setUser(loggedUser);
    return loggedUser;
  };

  const register = async (email: string, password: string, confirmPassword: string) => {
    const { token, user: registeredUser } = await registerRequest(email, password, confirmPassword);
    setStoredToken(token);
    window.dispatchEvent(new Event(APP_DATA_CHANGED_EVENT));
    setUser(registeredUser);
  };

  const logout = async () => {
    try {
      await logoutRequest();
    } finally {
      clearStoredToken();
      window.dispatchEvent(new Event(APP_DATA_CHANGED_EVENT));
      setUser(null);
    }
  };

  const resetAccountData = async () => {
    const token = await ensureStoredAccessToken();
    await resetAccountDataRequest(token);
  };

  const changePassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    const token = await ensureStoredAccessToken();
    const response = await changePasswordRequest(token, currentPassword, newPassword, confirmPassword);
    return response.message;
  };

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isInitializing,
    login,
    register,
    resetAccountData,
    changePassword,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- mesmo padrão já usado em AppDataContext
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
