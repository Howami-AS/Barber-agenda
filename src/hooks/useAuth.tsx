import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { verifyAdminOnServer } from '../services/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthorizedAdmin: boolean;
  adminRole: string | null;
  authError: string | null;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  retryAdminCheck: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const verifyUserAdmin = async (user: User, isStale?: () => boolean) => {
    if (!user.email_confirmed_at) {
      if (isStale?.()) return;
      setIsAuthorizedAdmin(false);
      setAdminRole(null);
      setAuthError(
        'O e-mail desta conta ainda não foi confirmado no Supabase Auth. Verifique sua caixa de entrada ou utilize "Entrar com Google".'
      );
      setLoading(false);
      return;
    }

    try {
      const result = await verifyAdminOnServer(user);
      if (isStale?.()) return;
      setIsAuthorizedAdmin(Boolean(result.authorized));
      setAdminRole(result.role);
      setAuthError(
        result.authorized ? null : 'Esta conta não está na lista de administradores autorizados.'
      );
    } catch (err) {
      if (isStale?.()) return;
      setIsAuthorizedAdmin(false);
      setAdminRole(null);
      setAuthError(
        err instanceof Error && err.message
          ? err.message
          : 'Esta conta não possui autorização administrativa.'
      );
    } finally {
      if (!isStale?.()) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let checkSeq = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const mySeq = ++checkSeq;
      const isStale = () => mySeq !== checkSeq;
      const currentUser = session?.user ?? null;

      setUser(currentUser);
      if (!currentUser) {
        setIsAuthorizedAdmin(false);
        setAdminRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setAuthError(null);
      void verifyUserAdmin(currentUser, isStale);
    });

    return () => {
      checkSeq += 1;
      subscription.unsubscribe();
    };
  }, []);

  const retryAdminCheck = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    setLoading(true);
    setAuthError(null);
    await verifyUserAdmin(currentUser);
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/admin` },
      });
      if (error) throw error;
    } catch (err) {
      const msg = (err as Error).message || 'Falha ao entrar com Google.';
      setAuthError(msg);
      throw err;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err) {
      setAuthError((err as Error).message || 'Erro ao autenticar.');
      throw err;
    }
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin`,
    });
    if (error) throw error;
  };

  const logout = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthorizedAdmin,
        adminRole,
        authError,
        loginWithGoogle,
        loginWithEmail,
        resetPassword,
        logout,
        retryAdminCheck,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  return ctx;
}
