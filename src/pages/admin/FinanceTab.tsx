import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Plus, Trash2 } from 'lucide-react';
import {
  createExpense,
  createPayment,
  removeExpense,
  removePayment,
} from '../../services/supabaseAdmin';
import type {
  Appointment,
  ExpenseRecord,
  PaymentMethod,
  PaymentRecord,
  ServiceItem,
} from '../../types/barber';
import {
  addDaysToDateStr,
  formatCurrencyBRL,
  formatDateBR,
  getFortalezaNow,
} from '../../utils/timezone';

interface FinanceTabProps {
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  appointments: Appointment[];
  services: ServiceItem[];
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito',
};

export const FinanceTab: React.FC<FinanceTabProps> = ({
  payments,
  expenses,
  appointments,
  services,
}) => {
  const today = getFortalezaNow().dateStr;
  const weekStart = addDaysToDateStr(today, -6);
  const monthPrefix = today.slice(0, 7);

  // Payment form
  const [payServiceName, setPayServiceName] = useState(services[0]?.name || 'Outro atendimento');
  const [payCustomerName, setPayCustomerName] = useState('');
  const [payAmount, setPayAmount] = useState(services[0] ? String(services[0].price) : '');
  const [payDate, setPayDate] = useState(today);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('pix');
  const [savingPay, setSavingPay] = useState(false);

  // Expense form
  const [expDesc, setExpDesc] = useState('');
  const [expCategory, setExpCategory] = useState('Produtos e insumos');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(today);
  const [savingExp, setSavingExp] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);

  useEffect(() => {
    if (services.length > 0 && (payServiceName === 'Outro atendimento' || !payAmount)) {
      setPayServiceName(services[0].name);
      setPayAmount(String(services[0].price));
    }
  }, [services, payServiceName, payAmount]);

  const report = useMemo(() => {
    const dailyRevenue = payments
      .filter((p) => p.date === today)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const weeklyRevenue = payments
      .filter((p) => p.date >= weekStart && p.date <= today)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const monthlyRevenue = payments
      .filter((p) => p.date.startsWith(monthPrefix))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const monthlyExpenses = expenses
      .filter((e) => e.date.startsWith(monthPrefix))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Explicitly separate future / pending bookings as projected, NEVER received revenue
    const projectedFuture = appointments
      .filter(
        (a) =>
          (a.status === 'confirmed' || a.status === 'pending') &&
          a.date >= today &&
          !a.paymentId
      )
      .reduce((sum, a) => sum + Number(a.servicePrice || 0), 0);

    const serviceStatsMap = new Map<string, { name: string; count: number; total: number }>();
    for (const p of payments) {
      const key = p.serviceName;
      const prev = serviceStatsMap.get(key) || { name: key, count: 0, total: 0 };
      prev.count += 1;
      prev.total += Number(p.amount || 0);
      serviceStatsMap.set(key, prev);
    }
    const topServices = Array.from(serviceStatsMap.values()).sort((a, b) => b.count - a.count);

    return {
      dailyRevenue,
      weeklyRevenue,
      monthlyRevenue,
      monthlyExpenses,
      netBalance: monthlyRevenue - monthlyExpenses,
      projectedFuture,
      topServices,
    };
  }, [payments, expenses, appointments, today, weekStart, monthPrefix]);

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPay(true);
    setFinanceError(null);
    try {
      const matchedSvc = services.find((s) => s.name === payServiceName);
      await createPayment({
        amount: Number(payAmount),
        serviceId: matchedSvc?.id,
        serviceName: payServiceName,
        customerName: payCustomerName,
        date: payDate,
        method: payMethod,
      });
      setPayCustomerName('');
    } catch (err) {
      setFinanceError(err instanceof Error ? err.message : 'Erro ao registrar pagamento.');
    } finally {
      setSavingPay(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingExp(true);
    setFinanceError(null);
    try {
      await createExpense({
        description: expDesc,
        amount: Number(expAmount),
        category: expCategory,
        date: expDate,
      });
      setExpDesc('');
      setExpAmount('');
    } catch (err) {
      setFinanceError(err instanceof Error ? err.message : 'Erro ao registrar despesa.');
    } finally {
      setSavingExp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">Financeiro</h2>
        <p className="text-xs sm:text-sm text-[#A3A3A3]">
          Controle de receitas efetivamente recebidas, despesas e valores previstos de agendamentos futuros.
        </p>
      </div>

      {financeError && (
        <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-3.5 text-xs text-red-200">
          {financeError}
        </div>
      )}

      {/* Reports KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-4 space-y-1">
          <span className="text-xs text-[#A3A3A3]">Receita do dia</span>
          <p className="font-mono text-xl font-bold text-white tabular-nums">
            {formatCurrencyBRL(report.dailyRevenue)}
          </p>
        </div>
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-4 space-y-1">
          <span className="text-xs text-[#A3A3A3]">Receita 7 dias</span>
          <p className="font-mono text-xl font-bold text-white tabular-nums">
            {formatCurrencyBRL(report.weeklyRevenue)}
          </p>
        </div>
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-4 space-y-1">
          <span className="text-xs text-[#A3A3A3]">Receita do mês</span>
          <p className="font-mono text-xl font-bold text-emerald-300 tabular-nums">
            {formatCurrencyBRL(report.monthlyRevenue)}
          </p>
        </div>
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-4 space-y-1">
          <span className="text-xs text-[#A3A3A3]">Despesas do mês</span>
          <p className="font-mono text-xl font-bold text-red-300 tabular-nums">
            {formatCurrencyBRL(report.monthlyExpenses)}
          </p>
        </div>
        <div className="rounded-2xl bg-[#252525] border border-[#C9A15B]/40 p-4 space-y-1 col-span-2 lg:col-span-1">
          <span className="text-xs text-[#C9A15B]">Saldo líquido (mês)</span>
          <p className="font-mono text-xl font-bold text-[#C9A15B] tabular-nums">
            {formatCurrencyBRL(report.netBalance)}
          </p>
        </div>
      </div>

      {/* Projected Future Revenue Notice */}
      <div className="rounded-2xl bg-[#252525] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <p className="font-medium text-white">Valores previstos (agendamentos futuros em aberto)</p>
          <p className="text-xs text-[#A3A3A3]">
            Não contabilizados na receita recebida até a confirmação do pagamento.
          </p>
        </div>
        <span className="font-mono text-lg font-semibold text-[#C9A15B] tabular-nums">
          {formatCurrencyBRL(report.projectedFuture)}
        </span>
      </div>

      {/* Entry Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleCreatePayment}
          className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-emerald-300">
            <ArrowUpCircle className="w-5 h-5" />
            <h3 className="font-display text-lg font-semibold text-white">Registrar pagamento</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#A3A3A3] mb-1">Serviço</label>
              <select
                value={payServiceName}
                onChange={(e) => {
                  const name = e.target.value;
                  setPayServiceName(name);
                  const found = services.find((s) => s.name === name);
                  if (found) setPayAmount(String(found.price));
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} ({formatCurrencyBRL(s.price)})
                  </option>
                ))}
                <option value="Outro atendimento">Outro atendimento</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#A3A3A3] mb-1">Cliente</label>
              <input
                type="text"
                required
                value={payCustomerName}
                onChange={(e) => setPayCustomerName(e.target.value)}
                placeholder="Nome do cliente"
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#A3A3A3] mb-1">Valor (R$)</label>
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
          </div>

          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">Data</label>
            <input
              type="date"
              required
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
            />
          </div>

          <button
            type="submit"
            disabled={savingPay}
            className="w-full min-h-[44px] rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{savingPay ? 'Registrando...' : 'Registrar receita'}</span>
          </button>
        </form>

        <form
          onSubmit={handleCreateExpense}
          className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-red-300">
            <ArrowDownCircle className="w-5 h-5" />
            <h3 className="font-display text-lg font-semibold text-white">Registrar despesa</h3>
          </div>

          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">Descrição</label>
            <input
              type="text"
              required
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              placeholder="Ex: Lâminas, pomada modeladora, energia elétrica"
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#A3A3A3] mb-1">Categoria</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
              >
                <option value="Produtos e insumos">Produtos e insumos</option>
                <option value="Aluguel e contas">Aluguel e contas</option>
                <option value="Equipamentos">Equipamentos</option>
                <option value="Marketing">Marketing</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#A3A3A3] mb-1">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#A3A3A3] mb-1">Data</label>
              <input
                type="date"
                required
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingExp}
            className="w-full min-h-[44px] rounded-xl bg-[#171717] border border-white/20 text-white text-xs font-semibold hover:border-[#C9A15B] flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 text-[#C9A15B]" />
            <span>{savingExp ? 'Salvando...' : 'Lançar despesa'}</span>
          </button>
        </form>
      </div>

      {/* Top Services & Ledgers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-3">
          <h3 className="font-display text-lg font-semibold text-white">Serviços mais realizados</h3>
          {report.topServices.length === 0 ? (
            <p className="text-xs text-[#A3A3A3] py-4">Nenhum pagamento registrado ainda.</p>
          ) : (
            <div className="divide-y divide-white/10 text-sm">
              {report.topServices.map((item) => (
                <div key={item.name} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-white font-medium">{item.name}</p>
                    <p className="text-xs text-[#A3A3A3] tabular-nums">{item.count} lançamento(s)</p>
                  </div>
                  <span className="font-mono text-[#C9A15B] font-semibold tabular-nums">
                    {formatCurrencyBRL(item.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-8 rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-4">
          <h3 className="font-display text-lg font-semibold text-white">Últimos lançamentos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                Receitas recebidas ({payments.length})
              </h4>
              <div className="divide-y divide-white/10 max-h-[300px] overflow-y-auto">
                {payments.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">
                        {p.serviceName} · {p.customerName}
                      </p>
                      <p className="text-[#A3A3A3] font-mono tabular-nums">
                        {formatDateBR(p.date)} · {METHOD_LABELS[p.method]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                        {formatCurrencyBRL(p.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removePayment(p.id)}
                        className="text-[#A3A3A3] hover:text-red-300"
                        aria-label="Excluir pagamento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-red-300 uppercase tracking-wider">
                Despesas ({expenses.length})
              </h4>
              <div className="divide-y divide-white/10 max-h-[300px] overflow-y-auto">
                {expenses.map((ex) => (
                  <div key={ex.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{ex.description}</p>
                      <p className="text-[#A3A3A3] font-mono tabular-nums">
                        {formatDateBR(ex.date)} · {ex.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-semibold text-red-300 tabular-nums">
                        - {formatCurrencyBRL(ex.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeExpense(ex.id)}
                        className="text-[#A3A3A3] hover:text-red-300"
                        aria-label="Excluir despesa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
