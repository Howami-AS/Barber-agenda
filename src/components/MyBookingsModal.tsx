import React, { useEffect, useState } from 'react';
import { Calendar, MessageCircle, RefreshCw, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { cancelPublicBooking, fetchPublicBookingStatus } from '../services/api';
import type { BarbershopSettings, PublicBookingReceipt } from '../types/barber';
import { buildWhatsAppUrl, formatCurrencyBRL, formatDateBR } from '../utils/timezone';
import { loadLocalReceipts, updateLocalReceiptStatus } from './BookingFlow';

interface MyBookingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: BarbershopSettings;
}

export const MyBookingsModal: React.FC<MyBookingsModalProps> = ({ open, onClose, settings }) => {
  const isOnline = useOnlineStatus();
  const [items, setItems] = useState<PublicBookingReceipt[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const syncStatuses = async (current: PublicBookingReceipt[]) => {
    if (!isOnline || current.length === 0) return;
    const updated = await Promise.all(
      current.map(async (item) => {
        try {
          const live = await fetchPublicBookingStatus(item.appointmentId, item.date);
          const nextStatus = live.status as PublicBookingReceipt['status'];
          updateLocalReceiptStatus(item.appointmentId, nextStatus);
          return { ...item, status: nextStatus };
        } catch {
          return item;
        }
      })
    );
    setItems(updated);
  };

  useEffect(() => {
    if (open) {
      const local = loadLocalReceipts();
      setItems(local);
      setFeedback(null);
      void syncStatuses(local);
    }
  }, [open]);

  if (!open) return null;

  const handleCancel = async (item: PublicBookingReceipt) => {
    setBusyId(item.appointmentId);
    setFeedback(null);
    try {
      await cancelPublicBooking(item.appointmentId, item.date, item.cancelToken);
      updateLocalReceiptStatus(item.appointmentId, 'cancelled');
      setItems((prev) =>
        prev.map((x) => (x.appointmentId === item.appointmentId ? { ...x, status: 'cancelled' } : x))
      );
      setFeedback(`Reserva ${item.confirmationCode} cancelada e horário liberado.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao cancelar.');
    } finally {
      setBusyId(null);
    }
  };

  const statusLabels: Record<string, string> = {
    confirmed: 'Confirmado',
    pending: 'Pendente',
    completed: 'Concluído',
    cancelled: 'Cancelado',
    no_show: 'Ausente',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-bookings-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#252525] border border-white/10 p-6 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-[#C9A15B]" />
            <h3 id="my-bookings-title" className="font-display text-lg font-semibold text-white">
              Meus Agendamentos (neste dispositivo)
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void syncStatuses(items)}
              disabled={!isOnline}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white hover:bg-white/5 disabled:opacity-40"
              aria-label="Atualizar status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white hover:bg-white/5"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-4 rounded-xl bg-[#171717] border border-[#C9A15B]/40 p-3 text-xs text-white">
            {feedback}
          </div>
        )}

        <div className="mt-4 overflow-y-auto space-y-3 pr-1">
          {items.length === 0 ? (
            <p className="text-sm text-[#A3A3A3] py-8 text-center">
              Nenhum agendamento registrado neste navegador ainda.
            </p>
          ) : (
            items.map((item) => {
              const canCancel = item.status === 'confirmed' || item.status === 'pending';
              return (
                <div
                  key={item.appointmentId}
                  className="rounded-xl bg-[#171717] border border-white/10 p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display font-semibold text-white">{item.serviceName}</p>
                      <p className="text-xs text-[#A3A3A3] mt-0.5 tabular-nums">
                        {formatDateBR(item.date)} · {item.startTime} às {item.endTime} ·{' '}
                        {item.confirmationCode}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-semibold text-[#C9A15B] tabular-nums">
                      {formatCurrencyBRL(item.servicePrice)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs">
                    <span
                      className={
                        item.status === 'cancelled'
                          ? 'text-red-300'
                          : item.status === 'completed'
                            ? 'text-emerald-300'
                            : 'text-[#C9A15B]'
                      }
                    >
                      Situação: {statusLabels[item.status] || item.status}
                    </span>

                    <div className="flex items-center gap-3">
                      <a
                        href={buildWhatsAppUrl(
                          settings.whatsapp,
                          `Olá, sobre meu agendamento ${item.confirmationCode} (${formatDateBR(item.date)} às ${item.startTime}).`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-white hover:text-[#C9A15B]"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>

                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => void handleCancel(item)}
                          disabled={busyId === item.appointmentId || !isOnline}
                          className="text-red-300 hover:text-red-200 disabled:opacity-40 font-medium"
                        >
                          {busyId === item.appointmentId ? 'Cancelando...' : 'Cancelar'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
