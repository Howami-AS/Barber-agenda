export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    // In development preview, unregister old SWs and clear shell caches so code updates apply immediately
    if (import.meta.env.DEV) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if ('caches' in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((k) => k.startsWith('barber-agenda-'))
                .map((k) => caches.delete(k))
            )
          )
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        void registration.update();
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              console.info('[PWA] Nova versão disponível e pronta.');
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[PWA] Falha ao registrar service-worker.js:', err);
      });
  });
}
