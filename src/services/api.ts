import type { User } from '@supabase/supabase-js';
import type {
  AvailabilityResult,
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  PublicBookingReceipt,
  ServiceItem,
} from '../types/barber';
import type { FortalezaNow } from '../utils/timezone';
import { supabase } from './supabase';

export interface PublicBootstrapPayload {
  settings: BarbershopSettings;
  services: ServiceItem[];
  businessHours: BusinessHoursDay[];
  blockedPeriods: BlockedPeriod[];
  now: FortalezaNow;
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : fallback);
  }
  return data as T;
}

export async function fetchPublicBootstrap(): Promise<PublicBootstrapPayload> {
  return readResponse(await fetch('/api/public/bootstrap'), 'Erro ao carregar dados da barbearia.');
}

export async function fetchDayAvailability(
  date: string,
  serviceId: string
): Promise<AvailabilityResult & { now: FortalezaNow }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Sem conexão com a internet. A consulta de horários exige conexão ativa.');
  }
  const params = new URLSearchParams({ date, serviceId });
  return readResponse(
    await fetch(`/api/public/availability?${params.toString()}`),
    'Não foi possível consultar a disponibilidade.'
  );
}

export async function createPublicBooking(payload: {
  serviceId: string;
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  notes?: string;
}): Promise<PublicBookingReceipt> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Você está offline. Conecte-se à internet para confirmar o agendamento.');
  }
  return readResponse(
    await fetch('/api/public/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    'Não foi possível confirmar a reserva.'
  );
}

export async function fetchPublicBookingStatus(
  appointmentId: string,
  date: string
): Promise<{ status: string; startTime: string; endTime: string }> {
  return readResponse(
    await fetch(
      `/api/public/bookings/${encodeURIComponent(appointmentId)}/status?date=${encodeURIComponent(date)}`
    ),
    'Erro ao consultar status.'
  );
}

export async function cancelPublicBooking(
  appointmentId: string,
  date: string,
  cancelToken: string
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Conecte-se à internet para cancelar seu agendamento.');
  }
  await readResponse(
    await fetch(`/api/public/bookings/${encodeURIComponent(appointmentId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, cancelToken }),
    }),
    'Não foi possível cancelar o agendamento.'
  );
}

export async function verifyAdminOnServer(currentUser?: User | null): Promise<{
  authorized: boolean;
  email: string;
  uid: string;
  role: string;
}> {
  const user = currentUser ?? (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Usuário não autenticado.');

  const requestVerify = async (refresh: boolean) => {
    let { data: { session } } = await supabase.auth.getSession();
    if (refresh || !session) {
      const result = await supabase.auth.refreshSession();
      if (result.error) throw result.error;
      session = result.data.session;
    }
    if (!session?.access_token) throw new Error('Sessão do Supabase inválida.');
    const response = await fetch('/api/admin/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { response, data };
  };

  let result = await requestVerify(false);
  if (result.response.status === 401) result = await requestVerify(true);
  if (!result.response.ok) {
    throw new Error(
      (typeof result.data.error === 'string' && result.data.error) ||
        'Acesso administrativo negado.'
    );
  }
  return result.data as { authorized: boolean; email: string; uid: string; role: string };
}

export async function exportBackupFromServer(): Promise<Record<string, unknown>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão do Supabase inválida.');
  return readResponse(
    await fetch('/api/admin/backup/export', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }),
    'Erro ao exportar dados.'
  );
}
