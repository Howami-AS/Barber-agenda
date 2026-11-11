import type {
  AvailabilityResult,
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  DaySchedule,
  ServiceItem,
  TimeSlotOption,
} from '../types/barber';
import {
  diffDaysDateStr,
  getFortalezaNow,
  isValidCalendarDateStr,
  minutesToTimeStr,
  timeStrToMinutes,
  type FortalezaNow,
} from './timezone';

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

  if (!businessHoursDay || !businessHoursDay.isOpen) {
    return {
      date: dateStr,
      isOpen: false,
      closedReason: 'Barbearia fechada neste dia da semana.',
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
        booking.status === 'pending' ||
        booking.status === 'confirmed' ||
        booking.status === 'completed'
      ) {
        occupiedIntervals.push({
          start: booking.startMinutes,
          end: booking.endMinutes,
        });
      }
    }
  }

  const duration = Math.max(5, service.durationMinutes);
  const step = Math.max(5, settings.slotIntervalMinutes || 15);
  const minLead = ignoreLeadTime ? 0 : Math.max(0, settings.minLeadMinutes || 0);

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
