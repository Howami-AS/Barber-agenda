import React, { useState } from 'react';
import { ArrowLeft, KeyRound, Lock, LogOut, Mail } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Footer } from '../components/Footer';
import { useAuth } from '../hooks/useAuth';

interface AdminLoginPageProps {
  onBackToPublic: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onBackToPublic }) => {
  const {
    user,
    loading,
    isAuthorizedAdmin,
    authError,
    loginWithGoogle,
    loginWithEmail,
    resetPassword,
    logout,
    retryAdminCheck,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setBusy(true);
    setResetFeedback(null);
    try {
      await loginWithGoogle();
    } catch {
      // Handled in context
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResetFeedback(null);
    try {
      await loginWithEmail(email, password);
    } catch {
      // Handled in context
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setResetFeedback('Informe seu e-mail acima para enviar o link de recuperação.');
      return;
    }
    setBusy(true);
    setResetFeedback(null);
    try {
      await resetPassword(email);
      setResetFeedback('E-mail de recuperação enviado, caso o provedor E-mail/Senha esteja ativo.');
    } catch (err) {
      setResetFeedback(
        err instanceof Error ? err.message : 'Não foi possível enviar a recuperação de acesso.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#171717] text-white">
      <header className="border-b border-white/10 px-4 sm:px-6 h-16 flex items-center justify-between">
        <BrandLogo name="Barber Agenda" size="sm" />
        <button
          type="button"
          onClick={onBackToPublic}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-xs text-[#A3A3A3] hover:text-white hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para área pública</span>
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl bg-[#252525] border border-white/10 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs text-[#C9A15B] font-medium">
              <Lock className="w-3.5 h-3.5" />
              <span>Acesso restrito ao barbeiro</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              Painel Administrativo
            </h1>
            <p className="text-sm text-[#A3A3A3]">
              Entre com uma conta de administrador autorizada para gerenciar agenda, clientes e financeiro.
            </p>
          </div>

          {user && !isAuthorizedAdmin && !loading && !busy && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-4 space-y-3 text-sm">
              <p className="text-red-200">
                {authError || (
                  <>
                    A conta <strong>{user.email}</strong> não está na lista de administradores autorizados.
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => void retryAdminCheck()}
                  className="text-xs font-medium text-[#C9A15B] underline"
                >
                  Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="inline-flex items-center gap-2 text-xs font-medium text-white underline"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair e tentar outra conta</span>
                </button>
              </div>
            </div>
          )}

          {authError && !user && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-3.5 text-xs text-red-200">
              {authError}
            </div>
          )}

          {resetFeedback && (
            <div className="rounded-xl bg-[#171717] border border-[#C9A15B]/40 p-3.5 text-xs text-[#C9A15B]">
              {resetFeedback}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={busy}
            className="w-full min-h-[48px] rounded-xl bg-[#C9A15B] text-[#171717] font-semibold text-sm hover:bg-[#d6b273] disabled:opacity-50 transition-colors flex items-center justify-center gap-2.5"
          >
            <KeyRound className="w-4 h-4" />
            <span>{busy ? 'Autenticando...' : 'Entrar com Google'}</span>
          </button>

          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowEmailForm((v) => !v)}
              className="w-full text-center text-xs text-[#A3A3A3] hover:text-white py-2"
            >
              {showEmailForm
                ? 'Ocultar login por e-mail e senha'
                : 'Usar e-mail e senha (quando configurado no Supabase Auth)'}
            </button>

            {showEmailForm && (
              <form onSubmit={handleEmailLogin} className="mt-4 space-y-3.5">
                <div>
                  <label htmlFor="admin-email" className="block text-xs text-[#A3A3A3] mb-1">
                    E-mail administrativo
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#A3A3A3] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="barbeiro@barbearia.com"
                      className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-[#171717] border border-white/15 text-sm text-white focus:border-[#C9A15B] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="admin-pass" className="block text-xs text-[#A3A3A3] mb-1">
                    Senha
                  </label>
                  <input
                    id="admin-pass"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#171717] border border-white/15 text-sm text-white focus:border-[#C9A15B] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[44px] rounded-xl bg-[#171717] border border-white/20 text-white font-medium text-sm hover:border-[#C9A15B] transition-colors"
                >
                  Entrar com credenciais
                </button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={busy}
                  className="w-full text-xs text-[#C9A15B] hover:underline py-1"
                >
                  Recuperar acesso (redefinir senha)
                </button>
              </form>
            )}
          </div>

          <p className="text-[11px] text-[#A3A3A3] leading-relaxed">
            Não há cadastro público de administradores. Novos acessos devem ser autorizados pelo proprietário dentro do painel.
          </p>
        </div>
      </main>

      <Footer showAdminLink={false} />
    </div>
  );
};
