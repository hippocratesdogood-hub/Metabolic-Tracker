import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from './api';
import { setUserContext, clearUserContext } from './errorTracking';

type AuthUser = {
  id: string;
  email: string;
  role: string;
  name: string;
  coachId?: string | null;
  forcePasswordReset?: boolean;
  aiConsentGiven?: boolean;
} | null;

type AuthContextType = {
  user: AuthUser;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const { user: currentUser } = await api.getCurrentUser();
      setUser(currentUser);
      // Set user context for error tracking (ID and role only - no PHI)
      if (currentUser) {
        setUserContext(currentUser.id, currentUser.role);
      }
    } catch (error) {
      setUser(null);
      clearUserContext();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const { user: loggedInUser } = await api.login(email, password);
    setUser(loggedInUser);
    // Set user context for error tracking (ID and role only - no PHI)
    if (loggedInUser) {
      setUserContext(loggedInUser.id, loggedInUser.role);
    }
  };

  const signup = async (email: string, name: string, password: string) => {
    const { user: newUser } = await api.signup({
      email,
      name,
      passwordHash: password,
      role: 'participant',
    });
    setUser(newUser);
    // Set user context for error tracking (ID and role only - no PHI)
    if (newUser) {
      setUserContext(newUser.id, newUser.role);
    }
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    // Clear user context from error tracking
    clearUserContext();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
