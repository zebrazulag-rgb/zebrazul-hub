import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('zebrazul_user');
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('zebrazul_token', data.token);
    localStorage.setItem('zebrazul_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('zebrazul_token');
    localStorage.removeItem('zebrazul_user');
    setUser(null);
  }, []);

  const refreshUser = useCallback((updatedUser) => {
    setUser((prev) => {
      const merged = { ...prev, ...updatedUser };
      localStorage.setItem('zebrazul_user', JSON.stringify(merged));
      return merged;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
