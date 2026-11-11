import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  MessageCircle,
  Scissors,
  User,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  cancelPublicBooking,
  createPublicBooking,
  fetchDayAvailability,
} from '../services/api';
import type {
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  PublicBookingReceipt,
  ServiceItem,
  TimeSlotOption,
} from '../types/barber';
import {
  addDaysToDateStr,
  buildWhatsAppUrl,
  formatCurrencyBRL,
  formatDateBR,
  formatDateLongBR,
  getDayOfWeekFromDateStr,
  getFortalezaNow,
  maskPhoneInput,
} from '../utils/timezone';

const LOCAL_BOOKINGS_KEY = 'barber_agenda_my_bookings_v1';

export function saveReceiptLocally(receipt: PublicBookingReceipt): void {
  try {
    const raw = localStorage.getItem(LOCAL_BOOKINGS_KEY);
    const list: PublicBookingReceipt[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((item) => item.appointmentId !== receipt.appointmentId);
    filtered.unshift(receipt);
    localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify(filtered.slice(0, 20)));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLocalReceipts(): PublicBookingReceipt[] {
  try {
    const raw = localStorage.getItem(LOCAL_BOOKINGS_KEY);
    return raw ? (JSON.parse(raw) as PublicBookingReceipt[]) : [];
  } catch {
    return [];
  }
}

export function updateLocalReceiptStatus(appointmentId: string, status: PublicBookingReceipt['status']): void {
  try {
    const list = loadLocalReceipts().map((item) =>
      item.appointmentId === appointmentId ? { ...item, status } : item
    );
    localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
}

interface BookingFlowProps {
  services: ServiceItem[];
  businessHours: BusinessHoursDay[];
  blockedPeriods: BlockedPeriod[];
  settings: BarbershopSettings;
  preselectedServiceId?: string | null;
  onBookingCompleted?: () => void;
}

type BookingStep = 1 | 2 | 3 | 4 | 5;

export const BookingFlow: React.FC<BookingFlowProps> = ({
  services,
  businessHours,
  blockedPeriods,
  settings,
  preselectedServiceId,
  onBookingCompleted,
}) => {
  const isOnline = useOnlineStatus();
  const [step, setStep] = useState<BookingStep>(1);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => getFortalezaNow().dateStr);
  const [slots, setSlots] = useState<TimeSlotOption[]>([]);
  const [closedReason, setClosedReason] = useState<string | undefined>(undefined);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlotOption | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PublicBookingReceipt | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedServiceId && services.some((s) => s.id === preselectedServiceId)) {
      setSelectedServiceId(preselectedServiceId);
      setSelectedSlot(null);
      setReceipt(null);
      setStep(2);
    }
  }, [preselectedServiceId, services]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  const upcomingDates = useMemo(() => {
    const today = getFortalezaNow().dateStr;
    const hoursByDay = new Map<number, BusinessHoursDay>();
    for (const h of businessHours) hoursByDay.set(h.dayOfWeek, h);

    return Array.from({ length: 21 }, (_, idx) => {
      const dateStr = addDaysToDateStr(today, idx);
      const dow = getDayOfWeekFromDateStr(dateStr);
      const bh = hoursByDay.get(dow);
      const allDayBlock = blockedPeriods.find(
        (b) => b.allDay && b.startDate <= dateStr && dateStr <= b.endDate
      );
      const [, month, day] = dateStr.split('-');
      const weekdayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dow];

      return {
        dateStr,
        day,
        month,
        weekdayShort,
        isOpen: Boolean(bh?.isOpen) && !allDayBlock,
        blockLabel: allDayBlock?.title,
      };
    });
  }, [businessHours, blockedPeriods]);

  const loadAvailability = async (dateStr: string, serviceId: string) => {
    if (!dateStr || !serviceId) return;
    setLoadingSlots(true);
    setSlotsError(null);
    setClosedReason(undefined);
    setSelectedSlot(null);

    try {
      const res = await fetchDayAvailability(dateStr, serviceId);
      setSlots(res.slots);
      setClosedReason(res.closedReason);
    } catch (err) {
      setSlots([]);
      setSlotsError(err instanceof Error ? err.message : 'Erro ao consultar horários.');
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (step === 2 && selectedServiceId && selectedDate) {
      void loadAvailability(selectedDate, selectedServiceId);
    }
  }, [step, selectedServiceId, selectedDate]);

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !selectedSlot) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const created = await createPublicBooking({
        serviceId: selectedService.id,
        date: selectedDate,
        startTime: selectedSlot.startTime,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        notes: notes.trim(),
      });
      saveReceiptLocally(created);
      setReceipt(created);
      setStep(5);
      onBookingCompleted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível concluir a reserva.');
      // Refresh slots immediately so user sees updated availability
      if (selectedServiceId && selectedDate) {
        void loadAvailability(selectedDate, selectedServiceId);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelCreatedBooking = async () => {
    if (!receipt) return;
    setCancelling(true);
    setCancelMessage(null);
    try {
      await cancelPublicBooking(receipt.appointmentId, receipt.date, receipt.cancelToken);
      updateLocalReceiptStatus(receipt.appointmentId, 'cancelled');
      setReceipt({ ...receipt, status: 'cancelled' });
      setCancelMessage('Agendamento cancelado e horário liberado na agenda.');
      onBookingCompleted?.();
    } catch (err) {
      setCancelMessage(err instanceof Error ? err.message : 'Não foi possível cancelar.');
    } finally {
      setCancelling(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setSelectedSlot(null);
    setSubmitError(null);
    setCancelMessage(null);
    setReceipt(null);
  };

  const whatsappBookingMessage = receipt
    ? `Olá! Acabei de realizar um agendamento no ${settings.shopName}.\n\n` +
      `Código: ${receipt.confirmationCode}\n` +
      `Serviço: ${receipt.serviceName} (${formatCurrencyBRL(receipt.servicePrice)})\n` +
      `Data: ${formatDateBR(receipt.date)}\n` +
      `Horário: ${receipt.startTime}\n` +
      `Nome: ${receipt.customerName}\n` +
      `WhatsApp: ${receipt.customerPhone}`
    : '';

  const stepLabels = [
    { num: 1, title: 'Serviço' },
    { num: 2, title: 'Data e Horário' },
    { num: 3, title: 'Seus Dados' },
    { num: 4, title: 'Resumo' },
  ];

  return (
    <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 sm:p-8 shadow-xl">
      {/* Progress Header */}
      {step < 5 && (
        <div className="mb-6 pb-5 border-b border-white/10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-xl sm:text-2xl font-semibold text-white">
                Agendar horário
              </h3>
              <p className="text-xs sm:text-sm text-[#A3A3A3] mt-0.5">
                Escolha o serviço, consulte horários reais e confirme em segundos sem criar conta.
              </p>
            </div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev > 1 ? ((prev - 1) as BookingStep) : 1))}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg border border-white/15 text-xs font-medium text-white hover:bg-white/5 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {stepLabels.map((item) => {
              const active = step === item.num;
              const completed = step > item.num;
              return (
                <div key={item.num} className="space-y-1.5">
                  <div
                    className={`h-1 rounded-full transition-colors ${
                      active ? 'bg-[#C9A15B]' : completed ? 'bg-[#C9A15B]/60' : 'bg-white/10'
                    }`}
                  />
                  <p
                    className={`text-[11px] font-medium truncate ${
                      active ? 'text-[#C9A15B]' : completed ? 'text-white' : 'text-[#A3A3A3]'
                    }`}
                  >
                    {item.num}. {item.title}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 1: Select Service */}
      {step === 1 && (
        <div className="space-y-3">
          {services.length === 0 ? (
            <p className="text-sm text-[#A3A3A3] py-6 text-center">
              Nenhum serviço disponível no momento.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {services.map((svc) => {
                const isSelected = svc.id === selectedServiceId;
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => {
                      setSelectedServiceId(svc.id);
                      setSelectedSlot(null);
                      setStep(2);
                    }}
                    className={`text-left p-4 rounded-xl border transition-all min-h-[88px] flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#171717] border-[#C9A15B] ring-1 ring-[#C9A15B]/40'
                        : 'bg-[#171717]/70 border-white/10 hover:border-[#C9A15B]/60 hover:bg-[#171717]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display font-semibold text-base text-white">
                          {svc.name}
                        </p>
                        {svc.description && (
                          <p className="text-xs text-[#A3A3A3] mt-1 line-clamp-2">
                            {svc.description}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-base font-semibold text-[#C9A15B] tabular-nums shrink-0">
                        {formatCurrencyBRL(svc.price)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#A3A3A3] pt-1">
                      <Clock className="w-3.5 h-3.5 text-[#C9A15B]" />
                      <span className="tabular-nums">{svc.durationMinutes} min</span>
                      {svc.isDemo && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Demonstração</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Select Date & Consult Live Slots */}
      {step === 2 && selectedService && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#171717] border border-white/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-2.5">
              <Scissors className="w-4 h-4 text-[#C9A15B]" />
              <span className="font-medium text-white">{selectedService.name}</span>
              <span className="text-[#A3A3A3]" aria-hidden="true">·</span>
              <span className="text-[#A3A3A3] tabular-nums">{selectedService.durationMinutes} min</span>
            </div>
            <span className="font-mono font-semibold text-[#C9A15B] tabular-nums">
              {formatCurrencyBRL(selectedService.price)}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <label htmlFor="booking-date-input" className="text-sm font-medium text-white">
                Escolha a data (horário de Fortaleza)
              </label>
              <input
                id="booking-date-input"
                type="date"
                min={getFortalezaNow().dateStr}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="bg-[#171717] border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#C9A15B] focus:outline-none"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {upcomingDates.map((d) => {
                const active = d.dateStr === selectedDate;
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(d.dateStr)}
                    className={`min-w-[68px] min-h-[68px] px-3 py-2 rounded-xl border flex flex-col items-center justify-center transition-colors shrink-0 ${
                      active
                        ? 'bg-[#C9A15B] border-[#C9A15B] text-[#171717]'
                        : d.isOpen
                          ? 'bg-[#171717] border-white/10 text-white hover:border-[#C9A15B]/60'
                          : 'bg-[#171717]/40 border-white/5 text-[#A3A3A3]/60'
                    }`}
                  >
                    <span className="text-[11px] font-medium">{d.weekdayShort}</span>
                    <span className="font-mono text-lg font-bold tabular-nums leading-tight">
                      {d.day}
                    </span>
                    <span className="text-[10px] opacity-80">{d.month}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-medium text-white">
                Horários disponíveis em {formatDateBR(selectedDate)}
              </h4>
              <button
                type="button"
                onClick={() => void loadAvailability(selectedDate, selectedService.id)}
                disabled={loadingSlots || !isOnline}
                className="text-xs text-[#C9A15B] hover:underline disabled:opacity-50"
              >
                Atualizar horários
              </button>
            </div>

            {!isOnline ? (
              <div className="rounded-xl bg-[#171717] border border-[#C9A15B]/40 p-4 flex items-center gap-3 text-sm text-[#A3A3A3]">
                <WifiOff className="w-5 h-5 text-[#C9A15B] shrink-0" />
                <span>
                  Você está sem internet. Reconecte-se para consultar horários reais da agenda.
                </span>
              </div>
            ) : loadingSlots ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-11 rounded-xl bg-[#171717] border border-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : slotsError ? (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-200">
                {slotsError}
              </div>
            ) : closedReason ? (
              <div className="rounded-xl bg-[#171717] border border-white/10 p-5 text-sm text-[#A3A3A3] text-center">
                {closedReason}
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-xl bg-[#171717] border border-white/10 p-5 text-sm text-[#A3A3A3] text-center">
                Todos os horários deste dia já estão ocupados ou fora da janela mínima de antecedência. Escolha outra data.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {slots.map((slot) => {
                  const active = selectedSlot?.startTime === slot.startTime;
                  return (
                    <button
                      key={slot.startTime}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setStep(3);
                      }}
                      className={`min-h-[44px] px-3 py-2 rounded-xl font-mono text-sm font-medium tabular-nums border transition-colors ${
                        active
                          ? 'bg-[#C9A15B] border-[#C9A15B] text-[#171717]'
                          : 'bg-[#171717] border-white/15 text-white hover:border-[#C9A15B] hover:text-[#C9A15B]'
                      }`}
                    >
                      {slot.startTime}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Customer Name & WhatsApp Phone */}
      {step === 3 && selectedService && selectedSlot && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStep(4);
          }}
          className="space-y-4"
        >
          <div className="rounded-xl bg-[#171717] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <span className="text-white font-medium">
              {selectedService.name} · {formatDateBR(selectedDate)} às {selectedSlot.startTime}
            </span>
            <span className="font-mono text-[#C9A15B] font-semibold tabular-nums">
              {formatCurrencyBRL(selectedService.price)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="client-name" className="block text-sm font-medium text-white mb-1.5">
                Seu nome completo
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#A3A3A3] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="client-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex: João Pedro"
                  className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#171717] border border-white/15 text-white placeholder-[#A3A3A3]/50 text-sm focus:border-[#C9A15B] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="client-phone" className="block text-sm font-medium text-white mb-1.5">
                Telefone / WhatsApp
              </label>
              <input
                id="client-phone"
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(maskPhoneInput(e.target.value))}
                placeholder="(85) 99999-9999"
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#171717] border border-white/15 text-white placeholder-[#A3A3A3]/50 text-sm font-mono tabular-nums focus:border-[#C9A15B] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="client-notes" className="block text-sm font-medium text-white mb-1.5">
              Observação (opcional)
            </label>
            <input
              id="client-notes"
              type="text"
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Degradê na zero, acabamento na navalha"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#171717] border border-white/15 text-white placeholder-[#A3A3A3]/50 text-sm focus:border-[#C9A15B] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={customerName.trim().length < 2 || customerPhone.replace(/\D/g, '').length < 10}
            className="w-full min-h-[48px] rounded-xl bg-[#C9A15B] text-[#171717] font-semibold text-sm hover:bg-[#d6b273] disabled:opacity-50 transition-colors"
          >
            Revisar agendamento
          </button>
        </form>
      )}

      {/* STEP 4: Summary & Atomic Server Confirmation */}
      {step === 4 && selectedService && selectedSlot && (
        <form onSubmit={handleConfirmBooking} className="space-y-5">
          <div className="rounded-xl bg-[#171717] border border-white/10 divide-y divide-white/10">
            <div className="p-4 flex items-center justify-between gap-4">
              <span className="text-xs text-[#A3A3A3]">Serviço</span>
              <span className="text-sm font-semibold text-white text-right">
                {selectedService.name} ({selectedService.durationMinutes} min)
              </span>
            </div>
            <div className="p-4 flex items-center justify-between gap-4">
              <span className="text-xs text-[#A3A3A3]">Data e horário</span>
              <span className="text-sm font-medium text-white text-right capitalize">
                {formatDateLongBR(selectedDate)} ·{' '}
                <span className="font-mono text-[#C9A15B] tabular-nums">
                  {selectedSlot.startTime} às {selectedSlot.endTime}
                </span>
              </span>
            </div>
            <div className="p-4 flex items-center justify-between gap-4">
              <span className="text-xs text-[#A3A3A3]">Cliente</span>
              <span className="text-sm font-medium text-white text-right">{customerName}</span>
            </div>
            <div className="p-4 flex items-center justify-between gap-4">
              <span className="text-xs text-[#A3A3A3]">WhatsApp</span>
              <span className="text-sm font-mono text-white tabular-nums text-right">
                {customerPhone}
              </span>
            </div>
            <div className="p-4 flex items-center justify-between gap-4">
              <span className="text-xs text-[#A3A3A3]">Valor</span>
              <span className="font-mono text-lg font-bold text-[#C9A15B] tabular-nums">
                {formatCurrencyBRL(selectedService.price)}
              </span>
            </div>
          </div>

          {submitError && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-4 text-sm text-red-200">
              {submitError}
            </div>
          )}

          {!isOnline && (
            <div className="rounded-xl bg-[#171717] border border-[#C9A15B]/50 p-4 text-sm text-[#C9A15B]">
              Sem conexão com a internet. Não é possível confirmar reservas no modo offline.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !isOnline}
            className="w-full min-h-[48px] rounded-xl bg-[#C9A15B] text-[#171717] font-semibold text-sm hover:bg-[#d6b273] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{submitting ? 'Confirmando reserva...' : 'Confirmar reserva'}</span>
          </button>
        </form>
      )}

      {/* STEP 5: Receipt & WhatsApp Integration */}
      {step === 5 && receipt && (
        <div className="space-y-5">
          <div className="flex flex-col items-center text-center py-2">
            {receipt.status === 'cancelled' ? (
              <XCircle className="w-12 h-12 text-red-400 mb-3" />
            ) : (
              <CheckCircle2 className="w-12 h-12 text-[#C9A15B] mb-3" />
            )}
            <h3 className="font-display text-2xl font-semibold text-white">
              {receipt.status === 'cancelled' ? 'Reserva cancelada' : 'Horário reservado'}
            </h3>
            <p className="text-sm text-[#A3A3A3] mt-1">
              Código identificador:{' '}
              <span className="font-mono text-white font-semibold">{receipt.confirmationCode}</span>
            </p>
          </div>

          <div className="rounded-xl bg-[#171717] border border-white/10 divide-y divide-white/10 text-sm">
            <div className="p-3.5 flex justify-between gap-4">
              <span className="text-[#A3A3A3]">Serviço</span>
              <span className="font-medium text-white">{receipt.serviceName}</span>
            </div>
            <div className="p-3.5 flex justify-between gap-4">
              <span className="text-[#A3A3A3]">Data</span>
              <span className="font-mono text-white tabular-nums">{formatDateBR(receipt.date)}</span>
            </div>
            <div className="p-3.5 flex justify-between gap-4">
              <span className="text-[#A3A3A3]">Horário</span>
              <span className="font-mono text-[#C9A15B] font-semibold tabular-nums">
                {receipt.startTime} às {receipt.endTime}
              </span>
            </div>
            <div className="p-3.5 flex justify-between gap-4">
              <span className="text-[#A3A3A3]">Valor</span>
              <span className="font-mono text-white font-semibold tabular-nums">
                {formatCurrencyBRL(receipt.servicePrice)}
              </span>
            </div>
          </div>

          {cancelMessage && (
            <div className="rounded-xl bg-[#171717] border border-white/15 p-3.5 text-xs text-[#A3A3A3]">
              {cancelMessage}
            </div>
          )}

          {receipt.status !== 'cancelled' && (
            <div className="space-y-2.5">
              <a
                href={buildWhatsAppUrl(settings.whatsapp, whatsappBookingMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[48px] rounded-xl bg-[#C9A15B] text-[#171717] font-semibold text-sm hover:bg-[#d6b273] transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Abrir WhatsApp com mensagem pronta</span>
              </a>
              <p className="text-[11px] text-center text-[#A3A3A3]">
                O botão abre sua conversa no WhatsApp com os dados preenchidos para você enviar ao barbeiro.
              </p>

              <button
                type="button"
                onClick={handleCancelCreatedBooking}
                disabled={cancelling || !isOnline}
                className="w-full min-h-[44px] rounded-xl border border-white/15 text-xs font-medium text-[#A3A3A3] hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-50"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar este agendamento'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={resetFlow}
            className="w-full min-h-[44px] rounded-xl bg-[#171717] border border-white/15 text-sm font-medium text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4 text-[#C9A15B]" />
            <span>Fazer outro agendamento</span>
          </button>
        </div>
      )}
    </div>
  );
};
