import type {
  AvailabilityResult,
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  PublicBookingReceipt,
  ServiceItem,
} from '../types/barber';
import type { FortalezaNow } from '../utils/timezone';
import { auth } from './firebase';

export interface PublicBootstrapPayload {
  settings: BarbershopSettings;
  services: ServiceItem[];
  businessHours: BusinessHoursDay[];
  blockedPeriods: BlockedPeriod[];
  now: FortalezaNow;
}

export async function fetchPublicBootstrap(): Promise<PublicBootstrapPayload> {
  const resp = await fetch('/api/public/bootstrap');
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Erro ao carregar dados da barbearia.');
  }
  return data as PublicBootstrapPayload;
}

export async function fetchDayAvailability(
  date: string,
  serviceId: string
): Promise<AvailabilityResult & { now: FortalezaNow }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Sem conexão com a internet. A consulta de horários exige conexão ativa.');
  }
  const params = new URLSearchParams({ date, serviceId });
  const resp = await fetch(`/api/public/availability?${params.toString()}`);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Não foi possível consultar a disponibilidade.');
  }
  return data as AvailabilityResult & { now: FortalezaNow };
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
  const resp = await fetch('/api/public/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Não foi possível confirmar a reserva.');
  }
  return data as PublicBookingReceipt;
}

export async function fetchPublicBookingStatus(
  appointmentId: string,
  date: string
): Promise<{ status: string; startTime: string; endTime: string }> {
  const resp = await fetch(
    `/api/public/bookings/${encodeURIComponent(appointmentId)}/status?date=${encodeURIComponent(date)}`
  );
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Erro ao consultar status.');
  }
  return data as { status: string; startTime: string; endTime: string };
}

export async function cancelPublicBooking(
  appointmentId: string,
  date: string,
  cancelToken: string
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Conecte-se à internet para cancelar seu agendamento.');
  }
  const resp = await fetch(`/api/public/bookings/${encodeURIComponent(appointmentId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, cancelToken }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Não foi possível cancelar o agendamento.');
  }
}

export async function verifyAdminOnServer(): Promise<{
  authorized: boolean;
  email: string;
  uid: string;
  role: string;
}> {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuário não autenticado.');
  const token = await user.getIdToken();
  const resp = await fetch('/api/admin/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Acesso administrativo negado.');
  }
  return data as { authorized: boolean; email: string; uid: string; role: string };
}

export async function exportBackupFromServer(): Promise<Record<string, unknown>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuário não autenticado.');
  const token = await user.getIdToken();
  const resp = await fetch('/api/admin/backup/export', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Erro ao exportar dados.');
  }
  return data as Record<string, unknown>;
}
