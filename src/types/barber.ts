export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito';

export type BlockedPeriodType = 'folga' | 'feriado' | 'ferias' | 'bloqueio';

export interface BarbershopSettings {
  shopName: string;
  slogan: string;
  address: string;
  phone: string;
  whatsapp: string;
  minLeadMinutes: number;
  slotIntervalMinutes: number;
  cancellationMinHours: number;
  updatedAt?: unknown;
}

export interface ServiceItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  active: boolean;
  isDemo?: boolean;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  firstVisitAt?: string;
  lastVisitAt?: string;
  totalVisits: number;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Appointment {
  id: string;
  confirmationCode: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  durationMinutes: number;
  date: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  customerName: string;
  customerPhone: string;
  normalizedPhone: string;
  status: AppointmentStatus;
  source: 'public' | 'admin';
  notes?: string;
  paymentId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DayScheduleBooking {
  startMinutes: number;
  endMinutes: number;
  status: AppointmentStatus;
}

export interface DaySchedule {
  date: string;
  bookings: Record<string, DayScheduleBooking>;
  updatedAt?: unknown;
}

export interface BusinessHoursDay {
  id?: string;
  dayOfWeek: number; // 0 = Domingo, 6 = Sabado
  label: string;
  isOpen: boolean;
  startTime: string;
  endTime: string;
  hasBreak: boolean;
  breakStart?: string;
  breakEnd?: string;
  updatedAt?: unknown;
}

export interface BlockedPeriod {
  id: string;
  title: string;
  type: BlockedPeriodType;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  serviceId?: string;
  serviceName: string;
  customerName: string;
  customerPhone?: string;
  appointmentId?: string;
  date: string;
  method: PaymentMethod;
  notes?: string;
  createdAt?: unknown;
}

export interface ExpenseRecord {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  createdAt?: unknown;
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  role: 'owner' | 'admin';
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BackupPayloadMap {
  version: number;
  createdAtIso: string;
  settings: BarbershopSettings;
  services: ServiceItem[];
  businessHours: BusinessHoursDay[];
  blockedPeriods: BlockedPeriod[];
  customers: Customer[];
  appointments: Appointment[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
}

export interface BackupSnapshot {
  id: string;
  label: string;
  createdBy: string;
  recordCounts: Record<string, number>;
  payload?: BackupPayloadMap;
  payloadJson?: string;
  createdAt?: unknown;
}

export interface TimeSlotOption {
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
}

export interface AvailabilityResult {
  date: string;
  isOpen: boolean;
  closedReason?: string;
  slots: TimeSlotOption[];
}

export interface PublicBookingReceipt {
  appointmentId: string;
  confirmationCode: string;
  cancelToken: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  durationMinutes: number;
  date: string;
  startTime: string;
  endTime: string;
  customerName: string;
  customerPhone: string;
  status: AppointmentStatus;
  createdAtIso: string;
}
