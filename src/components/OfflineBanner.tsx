import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 w-full bg-[#252525] border-b border-[#C9A15B]/40 px-4 py-2.5 text-xs text-white"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-center">
        <WifiOff className="w-4 h-4 text-[#C9A15B] shrink-0" />
        <span>
          <strong>Modo offline:</strong> você pode visualizar a interface salva, mas a consulta de horários e confirmação de reservas exigem conexão com a internet.
        </span>
      </div>
    </div>
  );
};
