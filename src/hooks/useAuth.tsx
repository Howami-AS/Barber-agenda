import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  googleProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from '../services/firebase';
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
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setIsAuthorizedAdmin(false);
        setAdminRole(null);
        setLoading(false);
        return;
      }

      if (!firebaseUser.emailVerified) {
        setIsAuthorizedAdmin(false);
        setAdminRole(null);
        setAuthError(
          'O e-mail desta conta ainda não foi verificado no Firebase Authentication. Verifique sua caixa de entrada ou utilize "Entrar com Google".'
        );
        setLoading(false);
        return;
      }

      try {
        const result = await verifyAdminOnServer();
        setIsAuthorizedAdmin(result.authorized);
        setAdminRole(result.role);
        setAuthError(null);
      } catch (err) {
        setIsAuthorizedAdmin(false);
        setAdminRole(null);
        setAuthError(
          err instanceof Error
            ? err.message
            : 'Esta conta não possui autorização administrativa.'
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = (err as Error).message || 'Falha ao entrar com Google.';
      setAuthError(msg);
      throw err;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      if (code === 'auth/operation-not-allowed') {
        setAuthError(
          'O login por E-mail/Senha ainda não foi ativado no Console do Firebase. Utilize "Entrar com Google" ou ative o provedor Email/Password no Firebase Authentication.'
        );
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setAuthError('E-mail ou senha inválidos.');
      } else {
        setAuthError((err as Error).message || 'Erro ao autenticar.');
      }
      throw err;
    }
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    await sendPasswordResetEmail(auth, email.trim());
  };

  const logout = async () => {
    setAuthError(null);
    await signOut(auth);
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
