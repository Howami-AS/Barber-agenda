import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminPage } from './pages/AdminPage';
import { PublicPage } from './pages/PublicPage';

function isInitialAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.startsWith('/admin') ||
    window.location.hash.startsWith('#admin')
  );
}

const AppRouter: React.FC = () => {
  const [route, setRoute] = useState<'public' | 'admin'>(() =>
    isInitialAdminRoute() ? 'admin' : 'public'
  );
  const { loading, isAuthorizedAdmin } = useAuth();

  useEffect(() => {
    const onPopState = () => {
      setRoute(isInitialAdminRoute() ? 'admin' : 'public');
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onPopState);
    };
  }, []);

  const navigateTo = (target: 'public' | 'admin') => {
    setRoute(target);
    if (target === 'admin') {
      window.history.pushState({}, '', '/admin');
    } else {
      window.history.pushState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (route === 'admin') {
    if (loading) {
      return (
        <div className="min-h-screen bg-[#171717] flex items-center justify-center p-6">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-[#C9A15B] border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-[#A3A3A3]">Verificando sessão administrativa...</p>
          </div>
        </div>
      );
    }

    if (!isAuthorizedAdmin) {
      return <AdminLoginPage onBackToPublic={() => navigateTo('public')} />;
    }

    return <AdminPage onBackToPublic={() => navigateTo('public')} />;
  }

  return <PublicPage onNavigateAdmin={() => navigateTo('admin')} />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
