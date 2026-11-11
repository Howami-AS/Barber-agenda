import React, { useState } from 'react';
import { Edit3, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { removeService, saveService } from '../../services/supabaseAdmin';
import type { ServiceItem } from '../../types/barber';
import { formatCurrencyBRL } from '../../utils/timezone';

interface ServicesTabProps {
  services: ServiceItem[];
}

export const ServicesTab: React.FC<ServicesTabProps> = ({ services }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('30');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [active, setActive] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [sortOrder, setSortOrder] = useState('1');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openNew = () => {
    setEditingId(undefined);
    setName('');
    setDescription('');
    setPrice('35');
    setDurationMinutes('30');
    setActive(true);
    setIsDemo(false);
    setSortOrder(String(services.length + 1));
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEdit = (svc: ServiceItem) => {
    setEditingId(svc.id);
    setName(svc.name);
    setDescription(svc.description || '');
    setPrice(String(svc.price));
    setDurationMinutes(String(svc.durationMinutes));
    setActive(svc.active);
    setIsDemo(Boolean(svc.isDemo));
    setSortOrder(String(svc.sortOrder ?? 1));
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveService({
        id: editingId,
        name,
        description,
        price: Number(price),
        durationMinutes: Number(durationMinutes),
        active,
        isDemo,
        sortOrder: Number(sortOrder) || 0,
      });
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar serviço.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (svc: ServiceItem) => {
    setErrorMsg(null);
    try {
      await saveService({
        id: svc.id,
        name: svc.name,
        description: svc.description,
        price: svc.price,
        durationMinutes: svc.durationMinutes,
        active: !svc.active,
        isDemo: svc.isDemo,
        sortOrder: svc.sortOrder,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao alterar disponibilidade do serviço.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Serviços e preços</h2>
          <p className="text-xs sm:text-sm text-[#A3A3A3]">
            Edite valores, durações ou disponibilidade a qualquer momento. Itens de demonstração podem ser alterados livremente.
          </p>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273] transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar serviço</span>
        </button>
      </div>

      {errorMsg && !modalOpen && (
        <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-3 text-xs text-red-200 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-200/80 hover:text-white underline shrink-0"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((svc) => (
          <div
            key={svc.id}
            className={`rounded-2xl bg-[#252525] border p-5 flex flex-col justify-between gap-4 ${
              svc.active ? 'border-white/10' : 'border-white/5 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-white">{svc.name}</h3>
                {svc.description && (
                  <p className="text-xs text-[#A3A3A3] mt-1">{svc.description}</p>
                )}
              </div>
              <span className="font-mono text-xl font-bold text-[#C9A15B] tabular-nums shrink-0">
                {formatCurrencyBRL(svc.price)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs">
              <span className="text-[#A3A3A3] tabular-nums">
                Duração: <strong className="text-white">{svc.durationMinutes} min</strong> ·{' '}
                {svc.active ? 'Ativo' : 'Desativado'}
                {svc.isDemo ? ' · Demonstração' : ''}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleActive(svc)}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-[#171717] border border-white/10 text-white hover:border-[#C9A15B]"
                >
                  {svc.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{svc.active ? 'Desativar' : 'Ativar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(svc)}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-[#171717] border border-white/10 text-white hover:border-[#C9A15B]"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#C9A15B]" />
                  <span>Editar</span>
                </button>
                {confirmDeleteId === svc.id ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setErrorMsg(null);
                      try {
                        await removeService(svc.id);
                        setConfirmDeleteId(null);
                      } catch (err) {
                        setErrorMsg(
                          err instanceof Error ? err.message : 'Erro ao excluir serviço.'
                        );
                      }
                    }}
                    className="min-h-[36px] px-2.5 rounded-lg bg-red-600 text-white font-semibold"
                  >
                    Confirmar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(svc.id)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[#171717] border border-white/10 text-red-300 hover:border-red-500/40"
                    aria-label="Excluir serviço"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#252525] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-lg font-semibold text-white">
                {editingId ? 'Editar serviço' : 'Novo serviço'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A3A3A3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-3 text-xs text-red-200">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Nome do serviço</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Descrição</label>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1">Duração (min)</label>
                  <input
                    type="number"
                    min="5"
                    max="480"
                    step="5"
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1">Ordem</label>
                  <input
                    type="number"
                    min="0"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-white pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="accent-[#C9A15B]"
                  />
                  <span>Disponível para agendamento</span>
                </label>
                {editingId && isDemo && (
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDemo}
                      onChange={(e) => setIsDemo(e.target.checked)}
                      className="accent-[#C9A15B]"
                    />
                    <span>Manter rótulo demonstração</span>
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  {saving ? 'Salvando...' : 'Salvar serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
