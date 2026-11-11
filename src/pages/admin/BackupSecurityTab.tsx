import React, { useState } from 'react';
import {
  CloudUpload,
  Download,
  Shield,
  Smartphone,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { exportBackupFromServer } from '../../services/api';
import {
  addAuthorizedAdmin,
  createRemoteBackupSnapshot,
  removeAuthorizedAdmin,
  removeRemoteBackup,
} from '../../services/supabaseAdmin';
import type {
  AdminUser,
  Appointment,
  BackupSnapshot,
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  Customer,
  ExpenseRecord,
  PaymentRecord,
  ServiceItem,
} from '../../types/barber';

interface BackupSecurityTabProps {
  settings: BarbershopSettings;
  services: ServiceItem[];
  businessHours: BusinessHoursDay[];
  blockedPeriods: BlockedPeriod[];
  customers: Customer[];
  appointments: Appointment[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  admins: AdminUser[];
  backups: BackupSnapshot[];
}

export const BackupSecurityTab: React.FC<BackupSecurityTabProps> = ({
  settings,
  services,
  businessHours,
  blockedPeriods,
  customers,
  appointments,
  payments,
  expenses,
  admins,
  backups,
}) => {
  const { user } = useAuth();
  const [label, setLabel] = useState(`Backup ${new Date().toISOString().slice(0, 10)}`);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [confirmDeleteBackupId, setConfirmDeleteBackupId] = useState<string | null>(null);

  const handleDownloadServerBackup = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const data = await exportBackupFromServer();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `barber-agenda-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback('Exportação JSON gerada pelo servidor e baixada.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao exportar backup.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRemoteSnapshot = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await createRemoteBackupSnapshot(label, user?.email || '', {
        settings,
        services,
        businessHours,
        blockedPeriods,
        customers,
        appointments,
        payments,
        expenses,
      });
      setFeedback('Snapshot remoto salvo com sucesso no Supabase.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao criar snapshot remoto.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSnapshot = (snap: BackupSnapshot) => {
    const content = snap.payload
      ? JSON.stringify(snap.payload, null, 2)
      : snap.payloadJson || '{}';
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snap.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await addAuthorizedAdmin(newAdminEmail, newAdminName);
      setNewAdminEmail('');
      setNewAdminName('');
      setFeedback('Administrador autorizado adicionado.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao adicionar administrador.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">
          Backup, Segurança e Aplicativo
        </h2>
        <p className="text-xs sm:text-sm text-[#A3A3A3]">
          Snapshots remotos no Supabase, exportação completa, lista de administradores e compatibilidade Android.
        </p>
      </div>

      {feedback && (
        <div className="rounded-xl bg-[#252525] border border-[#C9A15B]/50 p-3.5 text-xs text-[#C9A15B]">
          {feedback}
        </div>
      )}

      {/* Remote Backup & Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-[#C9A15B]" />
            <h3 className="font-display text-lg font-semibold text-white">
              Backup remoto e exportação
            </h3>
          </div>
          <p className="text-xs text-[#A3A3A3] leading-relaxed">
            A exportação local (JSON) serve para arquivo pessoal,             enquanto os snapshots remotos permanecem protegidos no Supabase e podem ser baixados a qualquer momento.
          </p>

          <div className="space-y-2">
            <label className="block text-xs text-[#A3A3A3]">Identificação do snapshot remoto</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#171717] border border-white/15 text-sm text-white"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleCreateRemoteSnapshot()}
              disabled={busy}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#C9A15B] text-[#171717] text-xs font-semibold flex items-center justify-center gap-2"
            >
              <CloudUpload className="w-4 h-4" />
              <span>Criar snapshot no Supabase</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadServerBackup()}
              disabled={busy}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#171717] border border-white/15 text-white text-xs font-medium hover:border-[#C9A15B] flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4 text-[#C9A15B]" />
              <span>Exportar JSON completo</span>
            </button>
          </div>

          <div className="pt-3 border-t border-white/10 space-y-2">
            <h4 className="text-xs font-semibold text-white">Snapshots remotos salvos</h4>
            {backups.length === 0 ? (
              <p className="text-xs text-[#A3A3A3]">Nenhum snapshot remoto salvo ainda.</p>
            ) : (
              <div className="divide-y divide-white/10 max-h-[220px] overflow-y-auto">
                {backups.map((b) => (
                  <div key={b.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{b.label}</p>
                      <p className="text-[#A3A3A3] truncate">Por {b.createdBy}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadSnapshot(b)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#171717] border border-white/10 text-white hover:border-[#C9A15B]"
                      >
                        Baixar
                      </button>
                      {confirmDeleteBackupId === b.id ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await removeRemoteBackup(b.id);
                              setConfirmDeleteBackupId(null);
                            } catch (err) {
                              setFeedback(
                                err instanceof Error ? err.message : 'Erro ao excluir snapshot.'
                              );
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
                        >
                          Confirmar exclusão
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBackupId(b.id)}
                          className="p-1.5 rounded-lg bg-[#171717] border border-white/10 text-red-300"
                          title="Proteção contra exclusão acidental: exige confirmação"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Authorized Admins */}
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#C9A15B]" />
            <h3 className="font-display text-lg font-semibold text-white">
              Administradores autorizados
            </h3>
          </div>
          <p className="text-xs text-[#A3A3A3]">
            Somente contas listadas abaixo (com e-mail verificado) têm acesso ao painel e aos registros privados no Supabase.
          </p>

          <form onSubmit={handleAddAdmin} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                required
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="E-mail Google do barbeiro"
                className="min-h-[42px] px-3 rounded-xl bg-[#171717] border border-white/15 text-xs text-white"
              />
              <input
                type="text"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="Nome (opcional)"
                className="min-h-[42px] px-3 rounded-xl bg-[#171717] border border-white/15 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-xl bg-[#171717] border border-white/15 text-xs font-medium text-white hover:border-[#C9A15B]"
            >
              <UserPlus className="w-4 h-4 text-[#C9A15B]" />
              <span>Autorizar administrador</span>
            </button>
          </form>

          <div className="divide-y divide-white/10 pt-2">
            {admins.length === 0 ? (
              <p className="py-3 text-xs text-[#A3A3A3]">
                Nenhum administrador cadastrado no registro <span className="font-mono text-white">admins</span>.
              </p>
            ) : (
              admins.map((adm) => {
                const isCurrentUser =
                  adm.id === user?.id ||
                  adm.email.toLowerCase() === (user?.email || '').toLowerCase();
                return (
                  <div key={adm.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-white font-medium">{adm.email}</p>
                      <p className="text-[#A3A3A3]">
                        {adm.name || (adm.role === 'owner' ? 'Proprietário' : 'Administrador')}
                        {adm.active ? '' : ' · Inativo'}
                      </p>
                    </div>
                    {isCurrentUser ? (
                      <span className="text-[#C9A15B] font-medium">Sessão atual</span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          setFeedback(null);
                          try {
                            await removeAuthorizedAdmin(adm.id);
                            setFeedback('Administrador removido da lista autorizada.');
                          } catch (err) {
                            setFeedback(
                              err instanceof Error ? err.message : 'Erro ao remover administrador.'
                            );
                          }
                        }}
                        className="text-red-300 hover:underline"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Restoration & Android TWA Readiness Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-2.5 text-xs text-[#A3A3A3] leading-relaxed">
          <h3 className="font-display text-base font-semibold text-white">
            Orientações de restauração
          </h3>
          <p>
            1. Em caso de perda acidental, baixe o último snapshot remoto ou utilize o arquivo JSON exportado.
          </p>
          <p>
            2. Para restaurar grandes volumes em produção com segurança transacional, importe o JSON utilizando o Supabase SQL Editor ou um script administrativo, preservando os IDs originais das coleções.
          </p>
          <p>
            3. Backup automático programado: configure a política de backups do seu projeto Supabase no Dashboard para retenção externa.
          </p>
        </div>

        <div className="rounded-2xl bg-[#252525] border border-white/10 p-5 space-y-2.5 text-xs text-[#A3A3A3] leading-relaxed">
          <div className="flex items-center gap-2 text-white">
            <Smartphone className="w-4 h-4 text-[#C9A15B]" />
            <h3 className="font-display text-base font-semibold">
              Compatibilidade PWA e empacotamento Android (TWA)
            </h3>
          </div>
          <p>
            Esta aplicação é uma <strong className="text-white">PWA real</strong> com manifesto, service worker e ícones 192x192 / 512x512 (incluindo maskable). Embora uma PWA não seja equivalente a um APK nativo compilado, ela está estruturada para conversão em aplicativo Android via <strong className="text-white">Trusted Web Activity (Bubblewrap / PWABuilder)</strong> apontando para o domínio de produção.
          </p>
          <p>
            Para publicar na Play Store, gere o pacote TWA com <span className="font-mono text-white">bubblewrap init --manifest=https://seu-dominio/manifest.webmanifest</span> e publique o arquivo <span className="font-mono text-white">.well-known/assetlinks.json</span>.
          </p>
        </div>
      </div>
    </div>
  );
};
