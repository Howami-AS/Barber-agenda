import React, { useMemo, useState } from 'react';
import { MessageCircle, Plus, Search, User, X } from 'lucide-react';
import { saveCustomer } from '../../services/supabaseAdmin';
import type { Appointment, Customer } from '../../types/barber';
import {
  buildWhatsAppUrl,
  formatCurrencyBRL,
  formatDateBR,
  maskPhoneInput,
  normalizePhone,
} from '../../utils/timezone';

interface CustomersTabProps {
  customers: Customer[];
  appointments: Appointment[];
}

export const CustomersTab: React.FC<CustomersTabProps> = ({ customers, appointments }) => {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    const qDigits = q.replace(/\D/g, '');
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (qDigits.length > 0 && c.normalizedPhone.includes(qDigits))
    );
  }, [customers, search]);

  const selectedHistory = useMemo(() => {
    if (!selectedCustomer) return [];
    return appointments
      .filter((a) => a.normalizedPhone === selectedCustomer.normalizedPhone)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [appointments, selectedCustomer]);

  const openModal = (cust?: Customer) => {
    setErrorMsg(null);
    if (cust) {
      setName(cust.name);
      setPhone(cust.phone);
      setNotes(cust.notes || '');
    } else {
      setName('');
      setPhone('');
      setNotes('');
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveCustomer({ name, phone, notes });
      setModalOpen(false);
      if (selectedCustomer && normalizePhone(phone) === selectedCustomer.normalizedPhone) {
        setSelectedCustomer({ ...selectedCustomer, name, phone, notes });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Clientes</h2>
          <p className="text-xs sm:text-sm text-[#A3A3A3]">
            Identificação única por telefone/WhatsApp normalizado para evitar duplicidades.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openModal()}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273] transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Novo cliente</span>
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-[#A3A3A3] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-[#252525] border border-white/10 text-sm text-white placeholder-[#A3A3A3]/60 focus:border-[#C9A15B] focus:outline-none"
        />
      </div>

      <div className="rounded-2xl bg-[#252525] border border-white/10 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#A3A3A3]">
            Nenhum cliente encontrado. Novos clientes são vinculados automaticamente ao realizar agendamentos.
          </p>
        ) : (
          <div className="divide-y divide-white/10">
            {filtered.map((cust) => (
              <div
                key={cust.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02]"
              >
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(cust)}
                  className="text-left flex items-start gap-3 min-w-0"
                >
                  <div className="w-10 h-10 rounded-full bg-[#171717] border border-white/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[#C9A15B]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-white truncate hover:text-[#C9A15B]">
                      {cust.name}
                    </p>
                    <p className="text-xs text-[#A3A3A3] tabular-nums mt-0.5">
                      <span className="font-mono">{cust.phone}</span> · {cust.totalVisits}{' '}
                      atendimento(s)
                      {cust.lastVisitAt ? ` · Última visita: ${formatDateBR(cust.lastVisitAt)}` : ''}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={buildWhatsAppUrl(cust.phone, `Olá ${cust.name}!`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-lg bg-[#171717] border border-white/10 text-xs text-white hover:border-[#C9A15B]"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#C9A15B]" />
                    <span>WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(cust)}
                    className="min-h-[36px] px-3 rounded-lg bg-[#171717] border border-white/10 text-xs text-white hover:border-[#C9A15B]"
                  >
                    Histórico
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal(cust)}
                    className="min-h-[36px] px-3 rounded-lg bg-[#171717] border border-white/10 text-xs text-[#A3A3A3] hover:text-white"
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer History Drawer/Modal */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#252525] border border-white/10 p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="font-display text-lg font-semibold text-white">
                  {selectedCustomer.name}
                </h3>
                <p className="text-xs font-mono text-[#A3A3A3]">{selectedCustomer.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs bg-[#171717] rounded-xl p-3 border border-white/10">
              <div>
                <span className="text-[#A3A3A3] block">Primeiro</span>
                <span className="font-mono text-white">
                  {selectedCustomer.firstVisitAt ? formatDateBR(selectedCustomer.firstVisitAt) : '—'}
                </span>
              </div>
              <div>
                <span className="text-[#A3A3A3] block">Última visita</span>
                <span className="font-mono text-white">
                  {selectedCustomer.lastVisitAt ? formatDateBR(selectedCustomer.lastVisitAt) : '—'}
                </span>
              </div>
              <div>
                <span className="text-[#A3A3A3] block">Atendimentos</span>
                <span className="font-mono text-[#C9A15B] font-bold">
                  {selectedCustomer.totalVisits}
                </span>
              </div>
            </div>

            {selectedCustomer.notes && (
              <p className="text-xs text-[#A3A3A3] bg-[#171717] rounded-xl p-3 border border-white/10">
                <strong className="text-white">Observações:</strong> {selectedCustomer.notes}
              </p>
            )}

            <div className="overflow-y-auto space-y-2 pr-1">
              <h4 className="text-xs font-semibold text-[#A3A3A3] uppercase tracking-wider">
                Histórico de agendamentos
              </h4>
              {selectedHistory.length === 0 ? (
                <p className="text-xs text-[#A3A3A3] py-4">Nenhum atendimento registrado.</p>
              ) : (
                selectedHistory.map((apt) => (
                  <div
                    key={apt.id}
                    className="rounded-xl bg-[#171717] border border-white/10 p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-medium text-white">{apt.serviceName}</p>
                      <p className="text-[#A3A3A3] font-mono tabular-nums">
                        {formatDateBR(apt.date)} · {apt.startTime} · {apt.status}
                      </p>
                    </div>
                    <span className="font-mono text-[#C9A15B] font-semibold">
                      {formatCurrencyBRL(apt.servicePrice)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Customer Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#252525] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-lg font-semibold text-white">Cadastro de cliente</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {errorMsg && (
                <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-3 text-xs text-red-200">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Nome completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Telefone / WhatsApp</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Observações</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Preferências de corte, alergias, observações..."
                  className="w-full px-3 py-2 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-white/15 text-xs text-[#A3A3A3]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold"
                >
                  {saving ? 'Salvando...' : 'Salvar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
