import { createContext, useContext, useState, useEffect } from 'react';
import { getUser, getToken, clearSession, setSession } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const u = getUser();
    if (token && u) setUser(u);
    setLoading(false);
  }, []);

  function login(token, userData, password) {
    setSession(token, userData, password);
    setUser(userData);
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
