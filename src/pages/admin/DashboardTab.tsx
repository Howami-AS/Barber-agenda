import React, { useMemo } from 'react';
import {
  CalendarCheck,
  Clock,
  DollarSign,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import type {
  Appointment,
  Customer,
  ExpenseRecord,
  PaymentRecord,
} from '../../types/barber';
import {
  addDaysToDateStr,
  formatCurrencyBRL,
  formatDateBR,
  getFortalezaNow,
} from '../../utils/timezone';

interface DashboardTabProps {
  appointments: Appointment[];
  customers: Customer[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  onOpenAgenda: () => void;
  onOpenFinance: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  appointments,
  customers,
  payments,
  expenses,
  onOpenAgenda,
  onOpenFinance,
}) => {
  const now = getFortalezaNow();
  const today = now.dateStr;
  const weekStart = addDaysToDateStr(today, -6);
  const monthPrefix = today.slice(0, 7);

  const metrics = useMemo(() => {
    const todayApts = appointments
      .filter((a) => a.date === today)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    const activeToday = todayApts.filter((a) => a.status !== 'cancelled');
    const completedToday = todayApts.filter((a) => a.status === 'completed');
    const cancelledToday = todayApts.filter((a) => a.status === 'cancelled');

    const nextAppointment =
      todayApts.find(
        (a) =>
          (a.status === 'confirmed' || a.status === 'pending') &&
          a.endMinutes > now.minutesOfDay
      ) || null;

    const upcomingToday = todayApts.filter(
      (a) =>
        (a.status === 'confirmed' || a.status === 'pending') &&
        a.endMinutes > now.minutesOfDay
    );

    const todayRevenue = payments
      .filter((p) => p.date === today)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);

    const todayProjected = todayApts
      .filter((a) => (a.status === 'confirmed' || a.status === 'pending') && !a.paymentId)
      .reduce((acc, a) => acc + Number(a.servicePrice || 0), 0);

    const weekRevenue = payments
      .filter((p) => p.date >= weekStart && p.date <= today)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);

    const monthRevenue = payments
      .filter((p) => p.date.startsWith(monthPrefix))
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);

    const monthExpenses = expenses
      .filter((e) => e.date.startsWith(monthPrefix))
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);

    return {
      todayCount: activeToday.length,
      completedTodayCount: completedToday.length,
      cancelledTodayCount: cancelledToday.length,
      nextAppointment,
      upcomingToday,
      todayRevenue,
      todayProjected,
      weekRevenue,
      monthRevenue,
      monthExpenses,
      monthBalance: monthRevenue - monthExpenses,
    };
  }, [appointments, payments, expenses, today, weekStart, monthPrefix, now.minutesOfDay]);

  const statusText: Record<string, string> = {
    pending: 'Pendente',
    confirmed: 'Confirmado',
    completed: 'Concluído',
    cancelled: 'Cancelado',
    no_show: 'Ausente',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Visão geral</h2>
          <p className="text-xs sm:text-sm text-[#A3A3A3]">
            Hoje ({formatDateBR(today)}) · Horário de Fortaleza ({now.timeStr})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAgenda}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273] transition-colors"
          >
            Abrir Agenda
          </button>
          <button
            type="button"
            onClick={onOpenFinance}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#252525] border border-white/10 text-white text-xs font-medium hover:border-[#C9A15B] transition-colors"
          >
            Registrar Caixa
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#A3A3A3]">
            <span>Agendamentos de hoje</span>
            <CalendarCheck className="w-4 h-4 text-[#C9A15B]" />
          </div>
          <p className="font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums">
            {metrics.todayCount}
          </p>
          <p className="text-xs text-[#A3A3A3] tabular-nums">
            {metrics.completedTodayCount} concluídos · {metrics.cancelledTodayCount} cancelados
          </p>
        </div>

        <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#A3A3A3]">
            <span>Próximo atendimento</span>
            <Clock className="w-4 h-4 text-[#C9A15B]" />
          </div>
          {metrics.nextAppointment ? (
            <>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-[#C9A15B] tabular-nums">
                {metrics.nextAppointment.startTime}
              </p>
              <p className="text-xs text-white truncate">
                {metrics.nextAppointment.customerName} · {metrics.nextAppointment.serviceName}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-semibold text-white">Sem fila pendente</p>
              <p className="text-xs text-[#A3A3A3]">Nenhum horário futuro hoje</p>
            </>
          )}
        </div>

        <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#A3A3A3]">
            <span>Faturamento do dia</span>
            <DollarSign className="w-4 h-4 text-[#C9A15B]" />
          </div>
          <p className="font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums">
            {formatCurrencyBRL(metrics.todayRevenue)}
          </p>
          <p className="text-xs text-[#A3A3A3] tabular-nums">
            Previsto hoje: {formatCurrencyBRL(metrics.todayProjected)}
          </p>
        </div>

        <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#A3A3A3]">
            <span>Clientes cadastrados</span>
            <Users className="w-4 h-4 text-[#C9A15B]" />
          </div>
          <p className="font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums">
            {customers.length}
          </p>
          <p className="text-xs text-[#A3A3A3]">Base identificada por WhatsApp</p>
        </div>
      </div>

      {/* Upcoming Schedule + Financial Summary Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl bg-[#252525] border border-white/10 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-white/10">
            <h3 className="font-display text-lg font-semibold text-white">
              Próximos horários de hoje
            </h3>
            <span className="text-xs text-[#A3A3A3] tabular-nums">
              {metrics.upcomingToday.length} restantes
            </span>
          </div>

          {metrics.upcomingToday.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#A3A3A3]">
              Nenhum atendimento restante para hoje.
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {metrics.upcomingToday.slice(0, 6).map((apt) => (
                <div
                  key={apt.id}
                  className="py-3.5 flex items-center justify-between gap-4 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-semibold text-[#C9A15B] tabular-nums shrink-0">
                      {apt.startTime}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{apt.customerName}</p>
                      <p className="text-xs text-[#A3A3A3] truncate">
                        {apt.serviceName} · {statusText[apt.status] || apt.status}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs sm:text-sm text-white tabular-nums shrink-0">
                    {formatCurrencyBRL(apt.servicePrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#252525] border border-white/10 p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-white/10">
              <h3 className="font-display text-lg font-semibold text-white">
                Indicadores financeiros
              </h3>
              <TrendingUp className="w-4 h-4 text-[#C9A15B]" />
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#A3A3A3]">Receita últimos 7 dias</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {formatCurrencyBRL(metrics.weekRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A3A3A3]">Receita efetivada no mês</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {formatCurrencyBRL(metrics.monthRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A3A3A3]">Despesas no mês</span>
                <span className="font-mono font-semibold text-red-300 tabular-nums">
                  - {formatCurrencyBRL(metrics.monthExpenses)}
                </span>
              </div>
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="font-medium text-white">Saldo líquido do mês</span>
                <span
                  className={`font-mono text-lg font-bold tabular-nums ${
                    metrics.monthBalance >= 0 ? 'text-[#C9A15B]' : 'text-red-400'
                  }`}
                >
                  {formatCurrencyBRL(metrics.monthBalance)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs text-[#A3A3A3]">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="tabular-nums">
                {appointments.filter((a) => a.status === 'completed').length} atendimentos concluídos
              </span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="tabular-nums">
                {appointments.filter((a) => a.status === 'cancelled').length} cancelamentos totais
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
