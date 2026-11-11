import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Edit3,
  MessageCircle,
  Plus,
  UserX,
  X,
  XCircle,
} from 'lucide-react';
import {
  createOrUpdateManualAppointment,
  createPayment,
  updateAppointmentStatus,
} from '../../services/firestoreAdmin';
import type {
  Appointment,
  AppointmentStatus,
  PaymentMethod,
  ServiceItem,
} from '../../types/barber';
import {
  addDaysToDateStr,
  buildWhatsAppUrl,
  formatCurrencyBRL,
  formatDateBR,
  getDayOfWeekFromDateStr,
  getFortalezaNow,
  maskPhoneInput,
} from '../../utils/timezone';

interface AgendaTabProps {
  appointments: Appointment[];
  services: ServiceItem[];
}

type ViewMode = 'day' | 'week' | 'month';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Ausente',
};

export const AgendaTab: React.FC<AgendaTabProps> = ({ appointments, services }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(() => getFortalezaNow().dateStr);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApt, setEditingApt] = useState<Appointment | null>(null);
  const [detailApt, setDetailApt] = useState<Appointment | null>(null);
  const [payModalApt, setPayModalApt] = useState<Appointment | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('pix');
  const [payAmount, setPayAmount] = useState('');

  // Form state for manual/edit appointment
  const [formServiceId, setFormServiceId] = useState('');
  const [formDate, setFormDate] = useState(() => getFortalezaNow().dateStr);
  const [formTime, setFormTime] = useState('09:00');
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState<AppointmentStatus>('confirmed');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openCreateModal = (dateOverride?: string) => {
    setEditingApt(null);
    setFormServiceId(services.find((s) => s.active)?.id || services[0]?.id || '');
    setFormDate(dateOverride || selectedDate);
    setFormTime('09:00');
    setFormName('');
    setFormPhone('');
    setFormStatus('confirmed');
    setFormNotes('');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (apt: Appointment) => {
    setEditingApt(apt);
    setFormServiceId(apt.serviceId);
    setFormDate(apt.date);
    setFormTime(apt.startTime);
    setFormName(apt.customerName);
    setFormPhone(apt.customerPhone);
    setFormStatus(apt.status);
    setFormNotes(apt.notes || '');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    const svc = services.find((s) => s.id === formServiceId);
    if (!svc) {
      setErrorMsg('Selecione um serviço válido.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await createOrUpdateManualAppointment({
        id: editingApt?.id,
        service: svc,
        date: formDate,
        startTime: formTime,
        customerName: formName,
        customerPhone: formPhone,
        status: formStatus,
        notes: formNotes,
        oldDate: editingApt?.date,
      });
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (apt: Appointment, nextStatus: AppointmentStatus) => {
    setActionError(null);
    try {
      await updateAppointmentStatus(apt, nextStatus);
      if (nextStatus === 'completed' && !apt.paymentId) {
        setPayModalApt({ ...apt, status: 'completed' });
        setPayAmount(String(apt.servicePrice));
        setPayMethod('pix');
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar status do agendamento.'
      );
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalApt) return;
    setSaving(true);
    setActionError(null);
    try {
      await createPayment({
        amount: Number(payAmount) || payModalApt.servicePrice,
        serviceId: payModalApt.serviceId,
        serviceName: payModalApt.serviceName,
        customerName: payModalApt.customerName,
        customerPhone: payModalApt.customerPhone,
        appointmentId: payModalApt.id,
        date: payModalApt.date,
        method: payMethod,
      });
      setPayModalApt(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao registrar pagamento.');
    } finally {
      setSaving(false);
    }
  };

  const weekDays = useMemo(() => {
    const dow = getDayOfWeekFromDateStr(selectedDate);
    const start = addDaysToDateStr(selectedDate, -dow);
    return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(start, i));
  }, [selectedDate]);

  const monthDays = useMemo(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    const firstDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const firstDow = getDayOfWeekFromDateStr(firstDate);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: Array<{ dateStr: string | null; dayNum?: number }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
      });
    }
    return cells;
  }, [selectedDate]);

  const filteredAppointments = useMemo(() => {
    return appointments
      .filter((a) => (statusFilter === 'all' ? true : a.status === statusFilter))
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [appointments, statusFilter]);

  const dayAppointments = useMemo(
    () => filteredAppointments.filter((a) => a.date === selectedDate),
    [filteredAppointments, selectedDate]
  );

  const shiftDate = (delta: number) => {
    if (viewMode === 'day') {
      setSelectedDate(addDaysToDateStr(selectedDate, delta));
    } else if (viewMode === 'week') {
      setSelectedDate(addDaysToDateStr(selectedDate, delta * 7));
    } else {
      const [y, m] = selectedDate.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + delta, 1, 12, 0, 0));
      setSelectedDate(
        `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Agenda</h2>
          <p className="text-xs sm:text-sm text-[#A3A3A3]">
            Gerencie reservas diárias, semanais, mensais e crie agendamentos manuais.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreateModal()}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273] transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nova reserva manual</span>
        </button>
      </div>

      {actionError && (
        <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-3 text-xs text-red-200 flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-200/80 hover:text-white underline shrink-0"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="rounded-2xl bg-[#252525] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#171717]">
          {(
            [
              { id: 'day', label: 'Diária' },
              { id: 'week', label: 'Semanal' },
              { id: 'month', label: 'Mensal' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setViewMode(tab.id)}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === tab.id ? 'bg-[#C9A15B] text-[#171717]' : 'text-[#A3A3A3] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#171717] border border-white/10 text-white hover:border-[#C9A15B]"
            aria-label="Período anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className="min-h-[40px] px-3 rounded-lg bg-[#171717] border border-white/10 text-xs font-mono text-white"
          />
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#171717] border border-white/10 text-white hover:border-[#C9A15B]"
            aria-label="Próximo período"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[40px] px-3 rounded-lg bg-[#171717] border border-white/10 text-xs text-white"
          aria-label="Filtrar por situação"
        >
          <option value="all">Todas as situações</option>
          <option value="confirmed">Confirmados</option>
          <option value="pending">Pendentes</option>
          <option value="completed">Concluídos</option>
          <option value="cancelled">Cancelados</option>
          <option value="no_show">Ausentes</option>
        </select>
      </div>

      {/* DAY VIEW */}
      {viewMode === 'day' && (
        <div className="rounded-2xl bg-[#252525] border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-display font-semibold text-white">
              {formatDateBR(selectedDate)}
            </h3>
            <span className="text-xs text-[#A3A3A3] tabular-nums">
              {dayAppointments.length} registro(s)
            </span>
          </div>

          {dayAppointments.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#A3A3A3]">
              Nenhum agendamento encontrado para esta data e filtro.
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {dayAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-white/[0.02]"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="font-mono text-sm font-bold text-[#C9A15B] tabular-nums shrink-0 pt-0.5">
                      {apt.startTime}
                      <span className="block text-[11px] font-normal text-[#A3A3A3]">
                        {apt.endTime}
                      </span>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <button
                        type="button"
                        onClick={() => setDetailApt(apt)}
                        className="font-display font-semibold text-base text-white hover:text-[#C9A15B] text-left truncate block"
                      >
                        {apt.customerName}
                      </button>
                      <p className="text-xs text-[#A3A3A3] tabular-nums">
                        {apt.serviceName} · {formatCurrencyBRL(apt.servicePrice)} ·{' '}
                        {apt.customerPhone} · {STATUS_LABELS[apt.status]}
                      </p>
                      {apt.notes && (
                        <p className="text-xs text-[#A3A3A3]/80 italic">Obs: {apt.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={buildWhatsAppUrl(
                        apt.customerPhone,
                        `Olá ${apt.customerName}, confirmando seu horário em ${formatDateBR(apt.date)} às ${apt.startTime} (${apt.serviceName}).`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-[#171717] border border-white/10 text-xs text-white hover:border-[#C9A15B]"
                      title="Abrir conversa no WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[#C9A15B]" />
                      <span>WhatsApp</span>
                    </a>

                    {apt.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(apt, 'confirmed')}
                        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-[#171717] border border-white/10 text-xs text-white hover:border-[#C9A15B]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#C9A15B]" />
                        <span>Confirmar</span>
                      </button>
                    )}

                    {(apt.status === 'confirmed' || apt.status === 'pending') && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(apt, 'completed')}
                          className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200 hover:bg-emerald-500/25"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Concluir</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(apt, 'no_show')}
                          className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-[#171717] border border-white/10 text-xs text-[#A3A3A3] hover:text-amber-300"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Ausente</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(apt, 'cancelled')}
                          className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-[#171717] border border-white/10 text-xs text-red-300 hover:border-red-500/40"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancelar</span>
                        </button>
                      </>
                    )}

                    {apt.status === 'completed' && !apt.paymentId && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayModalApt(apt);
                          setPayAmount(String(apt.servicePrice));
                        }}
                        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-[#C9A15B] text-[#171717] text-xs font-semibold"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Receber</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openEditModal(apt)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[#171717] border border-white/10 text-[#A3A3A3] hover:text-white"
                      aria-label="Editar agendamento"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((dateStr) => {
            const list = filteredAppointments.filter((a) => a.date === dateStr);
            const isSelected = dateStr === selectedDate;
            return (
              <div
                key={dateStr}
                className={`rounded-2xl bg-[#252525] border p-3 flex flex-col gap-2 min-h-[180px] ${
                  isSelected ? 'border-[#C9A15B]' : 'border-white/10'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(dateStr);
                    setViewMode('day');
                  }}
                  className="flex items-center justify-between text-xs pb-2 border-b border-white/10 text-left"
                >
                  <span className="font-semibold text-white">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][getDayOfWeekFromDateStr(dateStr)]}{' '}
                    {dateStr.slice(8, 10)}
                  </span>
                  <span className="font-mono text-[#C9A15B] tabular-nums">{list.length}</span>
                </button>
                <div className="space-y-1.5 flex-1">
                  {list.map((apt) => (
                    <button
                      key={apt.id}
                      type="button"
                      onClick={() => setDetailApt(apt)}
                      className="w-full text-left p-2 rounded-lg bg-[#171717] border border-white/5 hover:border-[#C9A15B]/50 text-[11px]"
                    >
                      <span className="font-mono text-[#C9A15B] font-semibold tabular-nums">
                        {apt.startTime}
                      </span>{' '}
                      <span className="text-white font-medium truncate">{apt.customerName}</span>
                      <span className="block text-[#A3A3A3] truncate">{apt.serviceName}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-4">
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-[#A3A3A3] pb-3">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((cell, idx) => {
              if (!cell.dateStr) {
                return <div key={`empty-${idx}`} className="h-20 rounded-xl bg-[#171717]/30" />;
              }
              const count = filteredAppointments.filter(
                (a) => a.date === cell.dateStr && a.status !== 'cancelled'
              ).length;
              const active = cell.dateStr === selectedDate;
              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => {
                    setSelectedDate(cell.dateStr!);
                    setViewMode('day');
                  }}
                  className={`h-20 rounded-xl border p-2 flex flex-col justify-between text-left transition-colors ${
                    active
                      ? 'bg-[#171717] border-[#C9A15B]'
                      : 'bg-[#171717]/80 border-white/10 hover:border-[#C9A15B]/50'
                  }`}
                >
                  <span className="font-mono text-xs font-semibold text-white tabular-nums">
                    {cell.dayNum}
                  </span>
                  {count > 0 && (
                    <span className="font-mono text-[11px] text-[#C9A15B] tabular-nums">
                      {count} atend.
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Create/Edit Appointment Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#252525] border border-white/10 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="font-display text-lg font-semibold text-white">
                {editingApt ? 'Editar agendamento' : 'Nova reserva manual'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAppointment} className="mt-4 space-y-4">
              {errorMsg && (
                <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-3 text-xs text-red-200">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Serviço</label>
                <select
                  required
                  value={formServiceId}
                  onChange={(e) => setFormServiceId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {formatCurrencyBRL(s.price)} ({s.durationMinutes} min)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1">Horário inicial</label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1">Nome do cliente</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1">Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(maskPhoneInput(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Situação</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as AppointmentStatus)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                >
                  <option value="confirmed">Confirmado</option>
                  <option value="pending">Pendente</option>
                  <option value="completed">Concluído</option>
                  <option value="no_show">Ausente</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Observações</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-white/15 text-xs font-medium text-[#A3A3A3] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273] disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar agendamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailApt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#252525] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-lg font-semibold text-white">
                Detalhes do agendamento
              </h3>
              <button
                type="button"
                onClick={() => setDetailApt(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-[#A3A3A3]">Código:</span>{' '}
                <span className="font-mono text-white">{detailApt.confirmationCode}</span>
              </p>
              <p>
                <span className="text-[#A3A3A3]">Cliente:</span>{' '}
                <span className="text-white font-medium">{detailApt.customerName}</span>
              </p>
              <p>
                <span className="text-[#A3A3A3]">Telefone:</span>{' '}
                <span className="font-mono text-white">{detailApt.customerPhone}</span>
              </p>
              <p>
                <span className="text-[#A3A3A3]">Serviço:</span>{' '}
                <span className="text-white">
                  {detailApt.serviceName} ({detailApt.durationMinutes} min)
                </span>
              </p>
              <p>
                <span className="text-[#A3A3A3]">Valor registrado:</span>{' '}
                <span className="font-mono text-[#C9A15B] font-semibold">
                  {formatCurrencyBRL(detailApt.servicePrice)}
                </span>
              </p>
              <p>
                <span className="text-[#A3A3A3]">Data e hora:</span>{' '}
                <span className="font-mono text-white">
                  {formatDateBR(detailApt.date)} · {detailApt.startTime}–{detailApt.endTime}
                </span>
              </p>
              <p>
                <span className="text-[#A3A3A3]">Situação:</span>{' '}
                <span className="text-white">{STATUS_LABELS[detailApt.status]}</span>
              </p>
              <p>
                <span className="text-[#A3A3A3]">Origem:</span>{' '}
                <span className="text-white">
                  {detailApt.source === 'public' ? 'Agendamento online' : 'Reserva manual'}
                </span>
              </p>
              {detailApt.notes && (
                <p>
                  <span className="text-[#A3A3A3]">Observações:</span>{' '}
                  <span className="text-white">{detailApt.notes}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Payment Registration Modal */}
      {payModalApt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#252525] border border-white/10 p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-white">
              Registrar pagamento do atendimento
            </h3>
            <p className="text-xs text-[#A3A3A3]">
              {payModalApt.customerName} · {payModalApt.serviceName}
            </p>
            <form onSubmit={handleRegisterPayment} className="space-y-3">
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Valor recebido (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Forma de pagamento</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                >
                  <option value="pix">Pix</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_debito">Cartão de débito</option>
                  <option value="cartao_credito">Cartão de crédito</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalApt(null)}
                  className="min-h-[40px] px-3 rounded-xl border border-white/15 text-xs text-[#A3A3A3]"
                >
                  Depois
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[40px] px-4 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold"
                >
                  {saving ? 'Salvando...' : 'Confirmar recebimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
