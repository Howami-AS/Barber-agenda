import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface FooterProps {
  onOpenAdmin?: () => void;
  showAdminLink?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ onOpenAdmin, showAdminLink = true }) => {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <footer className="border-t border-white/10 bg-[#171717] py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#A3A3A3]">
          <p className="text-center sm:text-left">
            ©️ {currentYear} Alisson Salvador
          </p>

          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="hover:text-white transition-colors min-h-[40px] px-2"
            >
              Privacidade e LGPD
            </button>
            {showAdminLink && onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hover:text-[#C9A15B] transition-colors min-h-[40px] px-2"
              >
                Área do Barbeiro
              </button>
            )}
          </div>
        </div>
      </footer>

      {showPrivacy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lgpd-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#252525] border border-white/10 p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#C9A15B]" />
                <h3 id="lgpd-title" className="font-display text-lg font-semibold text-white">
                  Política de Privacidade e LGPD
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacy(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white hover:bg-white/5"
                aria-label="Fechar política de privacidade"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-[#A3A3A3] leading-relaxed">
              <p>
                O <strong className="text-white">Barber Agenda</strong> coleta apenas os dados
                estritamente necessários para confirmar e gerenciar o seu atendimento: nome e
                telefone/WhatsApp.
              </p>
              <p>
                <strong className="text-white">Proteção de acesso:</strong> Seus dados pessoais
                ficam armazenados de forma privada no banco de dados com regras de negação por
                padrão. Clientes e visitantes anônimos nunca conseguem visualizar nomes, telefones
                ou históricos de outros clientes.
              </p>
              <p>
                <strong className="text-white">Uso e retenção:</strong> As informações são
                utilizadas exclusivamente pela barbearia para organização da agenda, atendimento ao
                cliente e contato via WhatsApp quando solicitado. Dados sensíveis não são
                armazenados no cache offline do aplicativo.
              </p>
              <p>
                <strong className="text-white">Seus direitos (LGPD):</strong> Você pode solicitar a
                atualização ou exclusão dos seus dados cadastrais diretamente com a barbearia pelo
                canal oficial de WhatsApp.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPrivacy(false)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-[#C9A15B] text-[#171717] font-semibold text-sm hover:bg-[#d6b273] transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
};
