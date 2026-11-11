import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Never render when running in standalone/installed mode or when browser is not eligible
  if (isInstalled) {
    return null;
  }

  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-[#C9A15B]/60 bg-[#252525] text-[#C9A15B] hover:bg-[#C9A15B] hover:text-[#171717] text-xs font-semibold tracking-wide transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A15B]"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>INSTALAR APLICATIVO</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#252525] border border-white/10 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h3 id="ios-install-title" className="font-display text-lg font-semibold text-white">
                Instalar no iPhone / iPad
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white hover:bg-white/5"
                aria-label="Fechar instruções"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-[#A3A3A3] leading-relaxed">
              No Safari do iOS, a instalação é feita pelo menu de compartilhamento do sistema:
            </p>
            <ol className="mt-4 space-y-3 text-sm text-white">
              <li className="flex items-start gap-3">
                <span className="font-mono text-[#C9A15B] font-semibold">1.</span>
                <span>
                  Toque no ícone <Share className="inline w-4 h-4 text-[#C9A15B] mx-1" />{' '}
                  <strong>Compartilhar</strong> na barra do Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-[#C9A15B] font-semibold">2.</span>
                <span>
                  Role as opções e selecione <strong>Adicionar à Tela de Início</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-[#C9A15B] font-semibold">3.</span>
                <span>
                  Confirme tocando em <strong>Adicionar</strong> no canto superior direito.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-[#C9A15B] text-[#171717] font-semibold text-sm hover:bg-[#d6b273] transition-colors"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
