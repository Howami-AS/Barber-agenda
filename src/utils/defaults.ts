import type { BarbershopSettings, BusinessHoursDay, ServiceItem } from '../types/barber.ts';

export const DEFAULT_SETTINGS: BarbershopSettings = {
  shopName: 'Barber Agenda',
  slogan: 'Seu estilo. Seu horário.',
  address: 'Av. Dom Luís, 880 · Aldeota, Fortaleza - CE',
  phone: '(85) 99999-0000',
  whatsapp: '5585999990000',
  minLeadMinutes: 30,
  slotIntervalMinutes: 15,
  cancellationMinHours: 2,
};

export const DEFAULT_BUSINESS_HOURS: BusinessHoursDay[] = [
  { dayOfWeek: 0, label: 'Domingo', isOpen: false, startTime: '09:00', endTime: '13:00', hasBreak: false, breakStart: '', breakEnd: '' },
  { dayOfWeek: 1, label: 'Segunda-feira', isOpen: true, startTime: '09:00', endTime: '19:00', hasBreak: true, breakStart: '12:00', breakEnd: '13:30' },
  { dayOfWeek: 2, label: 'Terça-feira', isOpen: true, startTime: '09:00', endTime: '19:00', hasBreak: true, breakStart: '12:00', breakEnd: '13:30' },
  { dayOfWeek: 3, label: 'Quarta-feira', isOpen: true, startTime: '09:00', endTime: '19:00', hasBreak: true, breakStart: '12:00', breakEnd: '13:30' },
  { dayOfWeek: 4, label: 'Quinta-feira', isOpen: true, startTime: '09:00', endTime: '19:00', hasBreak: true, breakStart: '12:00', breakEnd: '13:30' },
  { dayOfWeek: 5, label: 'Sexta-feira', isOpen: true, startTime: '09:00', endTime: '20:00', hasBreak: true, breakStart: '12:00', breakEnd: '13:30' },
  { dayOfWeek: 6, label: 'Sábado', isOpen: true, startTime: '09:00', endTime: '17:00', hasBreak: false, breakStart: '', breakEnd: '' },
];

export const INITIAL_DEMO_SERVICES: Array<Omit<ServiceItem, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'svc_corte_masculino',
    name: 'Corte masculino',
    description: 'Corte social ou degradê na tesoura e máquina com acabamento na navalha.',
    price: 30,
    durationMinutes: 30,
    active: true,
    isDemo: true,
    sortOrder: 1,
  },
  {
    id: 'svc_barba',
    name: 'Barba',
    description: 'Alinhamento completo com toalha quente, espuma e finalização com balm.',
    price: 20,
    durationMinutes: 20,
    active: true,
    isDemo: true,
    sortOrder: 2,
  },
  {
    id: 'svc_corte_barba',
    name: 'Corte + barba',
    description: 'Combo completo de corte masculino e modelagem de barba com acabamento.',
    price: 45,
    durationMinutes: 50,
    active: true,
    isDemo: true,
    sortOrder: 3,
  },
  {
    id: 'svc_sobrancelha',
    name: 'Sobrancelha',
    description: 'Limpeza e alinhamento discreto na pinça ou navalha.',
    price: 10,
    durationMinutes: 15,
    active: true,
    isDemo: true,
    sortOrder: 4,
  },
];
