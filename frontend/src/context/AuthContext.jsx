import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api';
import { useTenant } from './TenantContext.jsx';
import { persistTenantSlug } from '../tenant';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem('zebrazul_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const { refreshTenant, updateAgency } = useTenant();
  const [user, setUser] = useState(readStoredUser);
  const [checkingSession, setCheckingSession] = useState(Boolean(localStorage.getItem('zebrazul_token')));

  const persistUser = useCallback((nextUser) => {
    if (nextUser) localStorage.setItem('zebrazul_user', JSON.stringify(nextUser));
    else localStorage.removeItem('zebrazul_user');
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('zebrazul_token');
    if (!token) {
      setCheckingSession(false);
      return;
    }

    let active = true;
    api.get('/auth/me')
      .then(({ data }) => {
        if (active) {
          persistUser(data.user);
          if (data.user?.agency) {
            persistTenantSlug(data.user.agency.slug);
            updateAgency(data.user.agency);
          } else {
            refreshTenant(true);
          }
        }
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem('zebrazul_token');
        persistUser(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => { active = false; };
  }, [persistUser, refreshTenant, updateAgency]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('zebrazul_token', data.token);
    persistUser(data.user);
    if (data.user?.agency) {
      persistTenantSlug(data.user.agency.slug);
      updateAgency(data.user.agency);
    } else {
      await refreshTenant(true);
    }
    return data.user;
  }, [persistUser, refreshTenant, updateAgency]);

  const logout = useCallback(() => {
    localStorage.removeItem('zebrazul_token');
    persistUser(null);
  }, [persistUser]);

  const refreshUser = useCallback((updatedUser) => {
    setUser((previous) => {
      const merged = { ...previous, ...updatedUser };
      localStorage.setItem('zebrazul_user', JSON.stringify(merged));
      return merged;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, checkingSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
