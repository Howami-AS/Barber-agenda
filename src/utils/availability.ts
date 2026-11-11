import type {
  AvailabilityResult,
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  DaySchedule,
  ServiceItem,
  TimeSlotOption,
} from '../types/barber.ts';
import {
  diffDaysDateStr,
  getFortalezaNow,
  isValidCalendarDateStr,
  minutesToTimeStr,
  timeStrToMinutes,
  type FortalezaNow,
} from './timezone.ts';

interface Interval {
  start: number;
  end: number;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function computeDayAvailability(params: {
  dateStr: string;
  service: Pick<ServiceItem, 'durationMinutes' | 'active'>;
  businessHoursDay?: BusinessHoursDay;
  blockedPeriods: BlockedPeriod[];
  daySchedule?: DaySchedule;
  settings: Pick<BarbershopSettings, 'minLeadMinutes' | 'slotIntervalMinutes'>;
  now?: FortalezaNow;
  ignoreLeadTime?: boolean;
}): AvailabilityResult {
  const {
    dateStr,
    service,
    businessHoursDay,
    blockedPeriods,
    daySchedule,
    settings,
    now = getFortalezaNow(),
    ignoreLeadTime = false,
  } = params;

  if (!isValidCalendarDateStr(dateStr)) {
    return { date: dateStr, isOpen: false, closedReason: 'Data inválida.', slots: [] };
  }

  const dayDelta = diffDaysDateStr(dateStr, now.dateStr);
  if (dayDelta < 0) {
    return {
      date: dateStr,
      isOpen: false,
      closedReason: 'Não é possível agendar em datas passadas.',
      slots: [],
    };
  }

  if (!service.active) {
    return {
      date: dateStr,
      isOpen: false,
      closedReason: 'Este serviço está temporariamente indisponível.',
      slots: [],
    };
  }

  if (
    !Number.isFinite(service.durationMinutes) ||
    service.durationMinutes < 5 ||
    service.durationMinutes > 480
  ) {
    return {
      date: dateStr,
      isOpen: false,
      closedReason: 'Duração do serviço inválida.',
      slots: [],
    };
  }

  if (!businessHoursDay || !businessHoursDay.isOpen) {
    return {
      date: dateStr,
      isOpen: false,
      closedReason: 'Barbearia fechada neste dia da semana.',
      slots: [],
    };
  }

  if (
    !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(businessHoursDay.startTime) ||
    !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(businessHoursDay.endTime)
  ) {
    return {
      date: dateStr,
      isOpen: false,
      closedReason: 'Horário de funcionamento inválido.',
      slots: [],
    };
  }

  const openMinutes = timeStrToMinutes(businessHoursDay.startTime);
  const closeMinutes = timeStrToMinutes(businessHoursDay.endTime);

  if (closeMinutes <= openMinutes) {
    return {
      date: dateStr,
      isOpen: false,
      closedReason: 'Expediente sem janela de atendimento configurada.',
      slots: [],
    };
  }

  const blockedIntervals: Interval[] = [];

  if (businessHoursDay.hasBreak && businessHoursDay.breakStart && businessHoursDay.breakEnd) {
    const bStart = timeStrToMinutes(businessHoursDay.breakStart);
    const bEnd = timeStrToMinutes(businessHoursDay.breakEnd);
    if (bEnd > bStart) {
      blockedIntervals.push({ start: bStart, end: bEnd });
    }
  }

  for (const block of blockedPeriods) {
    if (block.startDate <= dateStr && dateStr <= block.endDate) {
      if (block.allDay) {
        return {
          date: dateStr,
          isOpen: false,
          closedReason: `${block.title} (${block.type}).`,
          slots: [],
        };
      }
      if (block.startTime && block.endTime) {
        const bStart = timeStrToMinutes(block.startTime);
        const bEnd = timeStrToMinutes(block.endTime);
        if (bEnd > bStart) {
          blockedIntervals.push({ start: bStart, end: bEnd });
        }
      }
    }
  }

  const occupiedIntervals: Interval[] = [];
  if (daySchedule?.bookings) {
    for (const booking of Object.values(daySchedule.bookings)) {
      if (
        booking &&
        Number.isFinite(booking.startMinutes) &&
        Number.isFinite(booking.endMinutes) &&
        booking.endMinutes > booking.startMinutes &&
        (booking.status === 'pending' ||
          booking.status === 'confirmed' ||
          booking.status === 'completed')
      ) {
        occupiedIntervals.push({
          start: booking.startMinutes,
          end: booking.endMinutes,
        });
      }
    }
  }

  const duration = Math.round(service.durationMinutes);
  const step = Number.isFinite(settings.slotIntervalMinutes)
    ? Math.max(5, Math.min(120, Math.round(settings.slotIntervalMinutes)))
    : 15;
  const minLead = ignoreLeadTime
    ? 0
    : Number.isFinite(settings.minLeadMinutes)
      ? Math.max(0, settings.minLeadMinutes)
      : 0;

  const slots: TimeSlotOption[] = [];

  for (let start = openMinutes; start + duration <= closeMinutes; start += step) {
    const end = start + duration;

    // Lead time check in America/Fortaleza
    const minutesAhead = dayDelta * 1440 + start - now.minutesOfDay;
    if (minutesAhead < minLead) {
      continue;
    }

    const hitsBreakOrBlock = blockedIntervals.some((b) =>
      intervalsOverlap(start, end, b.start, b.end)
    );
    if (hitsBreakOrBlock) {
      continue;
    }

    const hitsBooking = occupiedIntervals.some((o) =>
      intervalsOverlap(start, end, o.start, o.end)
    );
    if (hitsBooking) {
      continue;
    }

    slots.push({
      startTime: minutesToTimeStr(start),
      endTime: minutesToTimeStr(end),
      startMinutes: start,
      endMinutes: end,
    });
  }

  return {
    date: dateStr,
    isOpen: true,
    slots,
  };
}
