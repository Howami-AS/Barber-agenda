import React, { useEffect, useState } from 'react';
import { CalendarOff, Plus, Save, Trash2 } from 'lucide-react';
import {
  removeBlockedPeriod,
  saveBlockedPeriod,
  saveBusinessHoursDay,
  saveSettings,
} from '../../services/firestoreAdmin';
import type {
  BarbershopSettings,
  BlockedPeriod,
  BlockedPeriodType,
  BusinessHoursDay,
} from '../../types/barber';
import { formatDateBR, getFortalezaNow } from '../../utils/timezone';

interface ScheduleConfigTabProps {
  settings: BarbershopSettings;
  businessHours: BusinessHoursDay[];
  blockedPeriods: BlockedPeriod[];
}

export const ScheduleConfigTab: React.FC<ScheduleConfigTabProps> = ({
  settings,
  businessHours,
  blockedPeriods,
}) => {
  const [formSettings, setFormSettings] = useState<BarbershopSettings>(settings);
  const [daysDraft, setDaysDraft] = useState<BusinessHoursDay[]>(businessHours);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Blocked period form
  const [blkTitle, setBlkTitle] = useState('');
  const [blkType, setBlkType] = useState<BlockedPeriodType>('folga');
  const [blkStartDate, setBlkStartDate] = useState(() => getFortalezaNow().dateStr);
  const [blkEndDate, setBlkEndDate] = useState(() => getFortalezaNow().dateStr);
  const [blkAllDay, setBlkAllDay] = useState(true);
  const [blkStartTime, setBlkStartTime] = useState('12:00');
  const [blkEndTime, setBlkEndTime] = useState('15:00');
  const [savingBlock, setSavingBlock] = useState(false);

  useEffect(() => {
    setFormSettings(settings);
  }, [settings]);

  useEffect(() => {
    setDaysDraft(businessHours);
  }, [businessHours]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setFeedback(null);
    try {
      await saveSettings(formSettings);
      setFeedback('Configurações da barbearia atualizadas com sucesso.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveAllHours = async () => {
    setSavingHours(true);
    setFeedback(null);
    try {
      for (const day of daysDraft) {
        if (day.isOpen && day.endTime <= day.startTime) {
          throw new Error(`Horário inválido em ${day.label}: fechamento deve ser após a abertura.`);
        }
        if (day.isOpen && day.hasBreak && (!day.breakStart || !day.breakEnd || day.breakEnd <= day.breakStart)) {
          throw new Error(`Intervalo inválido em ${day.label}.`);
        }
      }
      for (const day of daysDraft) {
        await saveBusinessHoursDay(day);
      }
      setFeedback('Horários de funcionamento salvos no banco de dados.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar horários de funcionamento.');
    } finally {
      setSavingHours(false);
    }
  };

  const updateDayDraft = (dow: number, patch: Partial<BusinessHoursDay>) => {
    setDaysDraft((prev) =>
      prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d))
    );
  };

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBlock(true);
    setFeedback(null);
    try {
      if (!blkAllDay && blkEndTime <= blkStartTime) {
        throw new Error('O horário final do bloqueio deve ser posterior ao inicial.');
      }
      await saveBlockedPeriod({
        title: blkTitle,
        type: blkType,
        startDate: blkStartDate,
        endDate: blkEndDate < blkStartDate ? blkStartDate : blkEndDate,
        allDay: blkAllDay,
        startTime: blkAllDay ? '' : blkStartTime,
        endTime: blkAllDay ? '' : blkEndTime,
      });
      setBlkTitle('');
      setFeedback('Bloqueio registrado na agenda.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao adicionar bloqueio.');
    } finally {
      setSavingBlock(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">
          Horário de funcionamento e bloqueios
        </h2>
        <p className="text-xs sm:text-sm text-[#A3A3A3]">
          Altere expediente, intervalos, antecedentes mínimos, folgas, feriados e férias sem editar código.
        </p>
      </div>

      {feedback && (
        <div className="rounded-xl bg-[#252525] border border-[#C9A15B]/50 p-3.5 text-xs text-[#C9A15B]">
          {feedback}
        </div>
      )}

      {/* Barbershop Profile & Smart Scheduling Rules */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl bg-[#252525] border border-white/10 p-5 sm:p-6 space-y-5"
      >
        <h3 className="font-display text-lg font-semibold text-white">
          Dados da barbearia e regras de agenda
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">Nome da barbearia</label>
            <input
              type="text"
              required
              value={formSettings.shopName}
              onChange={(e) => setFormSettings({ ...formSettings, shopName: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">Slogan</label>
            <input
              type="text"
              value={formSettings.slogan}
              onChange={(e) => setFormSettings({ ...formSettings, slogan: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-[#A3A3A3] mb-1">Endereço completo</label>
            <input
              type="text"
              required
              value={formSettings.address}
              onChange={(e) => setFormSettings({ ...formSettings, address: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">Telefone exibido</label>
            <input
              type="text"
              required
              value={formSettings.phone}
              onChange={(e) => setFormSettings({ ...formSettings, phone: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">
              WhatsApp oficial (somente números com DDI, ex: 5585999990000)
            </label>
            <input
              type="text"
              required
              value={formSettings.whatsapp}
              onChange={(e) =>
                setFormSettings({ ...formSettings, whatsapp: e.target.value.replace(/\D/g, '') })
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-white/10">
          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">
              Antecedência mínima (minutos)
            </label>
            <input
              type="number"
              min="0"
              max="10080"
              value={formSettings.minLeadMinutes}
              onChange={(e) =>
                setFormSettings({ ...formSettings, minLeadMinutes: Number(e.target.value) })
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">
              Grade de horários (minutos)
            </label>
            <select
              value={formSettings.slotIntervalMinutes}
              onChange={(e) =>
                setFormSettings({
                  ...formSettings,
                  slotIntervalMinutes: Number(e.target.value),
                })
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
            >
              <option value={10}>10 min</option>
              <option value={15}>15 min</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">
              Antecedência p/ cancelamento (horas)
            </label>
            <input
              type="number"
              min="0"
              max="168"
              value={formSettings.cancellationMinHours}
              onChange={(e) =>
                setFormSettings({ ...formSettings, cancellationMinHours: Number(e.target.value) })
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm font-mono text-white"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273]"
          >
            <Save className="w-4 h-4" />
            <span>{savingSettings ? 'Salvando...' : 'Salvar configurações'}</span>
          </button>
        </div>
      </form>

      {/* Weekly Business Hours */}
      <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">Expediente semanal</h3>
            <p className="text-xs text-[#A3A3A3]">
              Defina abertura, fechamento e intervalo de cada dia.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveAllHours()}
            disabled={savingHours}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold hover:bg-[#d6b273]"
          >
            <Save className="w-4 h-4" />
            <span>{savingHours ? 'Salvando...' : 'Salvar expediente'}</span>
          </button>
        </div>

        <div className="divide-y divide-white/10">
          {daysDraft.map((day) => (
            <div
              key={day.dayOfWeek}
              className="py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-[180px]">
                <input
                  type="checkbox"
                  checked={day.isOpen}
                  onChange={(e) => updateDayDraft(day.dayOfWeek, { isOpen: e.target.checked })}
                  className="w-4 h-4 accent-[#C9A15B]"
                  id={`open-${day.dayOfWeek}`}
                />
                <label
                  htmlFor={`open-${day.dayOfWeek}`}
                  className="text-sm font-medium text-white cursor-pointer"
                >
                  {day.label}
                </label>
              </div>

              {day.isOpen ? (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#A3A3A3]">Abre</span>
                    <input
                      type="time"
                      value={day.startTime}
                      onChange={(e) => updateDayDraft(day.dayOfWeek, { startTime: e.target.value })}
                      className="min-h-[38px] px-2 rounded-lg bg-[#171717] border border-white/15 font-mono text-white"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#A3A3A3]">Fecha</span>
                    <input
                      type="time"
                      value={day.endTime}
                      onChange={(e) => updateDayDraft(day.dayOfWeek, { endTime: e.target.value })}
                      className="min-h-[38px] px-2 rounded-lg bg-[#171717] border border-white/15 font-mono text-white"
                    />
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[#A3A3A3] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.hasBreak}
                      onChange={(e) =>
                        updateDayDraft(day.dayOfWeek, {
                          hasBreak: e.target.checked,
                          breakStart: day.breakStart || '12:00',
                          breakEnd: day.breakEnd || '13:30',
                        })
                      }
                      className="accent-[#C9A15B]"
                    />
                    <span>Intervalo</span>
                  </label>
                  {day.hasBreak && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={day.breakStart || '12:00'}
                        onChange={(e) =>
                          updateDayDraft(day.dayOfWeek, { breakStart: e.target.value })
                        }
                        className="min-h-[38px] px-2 rounded-lg bg-[#171717] border border-white/15 font-mono text-white"
                      />
                      <span className="text-[#A3A3A3]">às</span>
                      <input
                        type="time"
                        value={day.breakEnd || '13:30'}
                        onChange={(e) =>
                          updateDayDraft(day.dayOfWeek, { breakEnd: e.target.value })
                        }
                        className="min-h-[38px] px-2 rounded-lg bg-[#171717] border border-white/15 font-mono text-white"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-[#A3A3A3]/70">Fechado</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Blocked Periods (Holidays, Vacations, Manual Blocks) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleCreateBlock}
          className="lg:col-span-5 rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <CalendarOff className="w-4 h-4 text-[#C9A15B]" />
            <h3 className="font-display text-lg font-semibold text-white">
              Novo bloqueio / folga / férias
            </h3>
          </div>

          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">Motivo / Descrição</label>
            <input
              type="text"
              required
              value={blkTitle}
              onChange={(e) => setBlkTitle(e.target.value)}
              placeholder="Ex: Feriado Proclamação / Consulta médica"
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-[#A3A3A3] mb-1">Tipo</label>
            <select
              value={blkType}
              onChange={(e) => setBlkType(e.target.value as BlockedPeriodType)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
            >
              <option value="folga">Folga</option>
              <option value="feriado">Feriado</option>
              <option value="ferias">Férias</option>
              <option value="bloqueio">Bloqueio temporário</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#A3A3A3] mb-1">Data inicial</label>
              <input
                type="date"
                required
                value={blkStartDate}
                onChange={(e) => setBlkStartDate(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#A3A3A3] mb-1">Data final</label>
              <input
                type="date"
                required
                min={blkStartDate}
                value={blkEndDate}
                onChange={(e) => setBlkEndDate(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-xs font-mono text-white"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-white cursor-pointer">
            <input
              type="checkbox"
              checked={blkAllDay}
              onChange={(e) => setBlkAllDay(e.target.checked)}
              className="accent-[#C9A15B]"
            />
            <span>Dia inteiro</span>
          </label>

          {!blkAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Das</label>
                <input
                  type="time"
                  required
                  value={blkStartTime}
                  onChange={(e) => setBlkStartTime(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#171717] border border-white/15 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A3A3A3] mb-1">Até</label>
                <input
                  type="time"
                  required
                  value={blkEndTime}
                  onChange={(e) => setBlkEndTime(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#171717] border border-white/15 text-xs font-mono text-white"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={savingBlock}
            className="w-full min-h-[44px] rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{savingBlock ? 'Bloqueando...' : 'Adicionar bloqueio'}</span>
          </button>
        </form>

        <div className="lg:col-span-7 rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-4">
          <h3 className="font-display text-lg font-semibold text-white">Bloqueios cadastrados</h3>
          {blockedPeriods.length === 0 ? (
            <p className="text-sm text-[#A3A3A3] py-6 text-center">
              Nenhum bloqueio, feriado ou período de férias ativo.
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {blockedPeriods.map((blk) => (
                <div key={blk.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-white text-sm">{blk.title}</p>
                    <p className="text-xs text-[#A3A3A3] font-mono tabular-nums">
                      {blk.type} · {formatDateBR(blk.startDate)}
                      {blk.endDate !== blk.startDate ? ` até ${formatDateBR(blk.endDate)}` : ''} ·{' '}
                      {blk.allDay ? 'Dia inteiro' : `${blk.startTime} às ${blk.endTime}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeBlockedPeriod(blk.id)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[#171717] border border-white/10 text-red-300 hover:border-red-500/40"
                    aria-label="Remover bloqueio"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
