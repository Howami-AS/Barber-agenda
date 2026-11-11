import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from './supabaseRecords';
import type {
  AdminUser,
  Appointment,
  AppointmentStatus,
  BackupSnapshot,
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  Customer,
  DaySchedule,
  ExpenseRecord,
  PaymentMethod,
  PaymentRecord,
  ServiceItem,
} from '../types/barber';
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SETTINGS, INITIAL_DEMO_SERVICES } from '../utils/defaults';
import {
  isValidCalendarDateStr,
  minutesToTimeStr,
  normalizePhone,
  timeStrToMinutes,
} from '../utils/timezone';
import { auth, db, handleDatabaseError, OperationType } from './supabaseData';

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export async function ensureInitialBarbershopSeed(): Promise<void> {
  try {
    const settingsRef = doc(db, 'settings', 'barbershop');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        ...DEFAULT_SETTINGS,
        updatedAt: serverTimestamp(),
      });
    }

    const hoursSnap = await getDocs(collection(db, 'businessHours'));
    if (hoursSnap.empty) {
      const batch = writeBatch(db);
      for (const day of DEFAULT_BUSINESS_HOURS) {
        batch.set(doc(db, 'businessHours', `day_${day.dayOfWeek}`), {
          dayOfWeek: day.dayOfWeek,
          label: day.label,
          isOpen: day.isOpen,
          startTime: day.startTime,
          endTime: day.endTime,
          hasBreak: day.hasBreak,
          breakStart: day.breakStart || '',
          breakEnd: day.breakEnd || '',
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    const servicesSnap = await getDocs(collection(db, 'services'));
    if (servicesSnap.empty) {
      const batch = writeBatch(db);
      for (const svc of INITIAL_DEMO_SERVICES) {
        batch.set(doc(db, 'services', svc.id), {
          name: svc.name,
          description: svc.description || '',
          price: svc.price,
          durationMinutes: svc.durationMinutes,
          active: svc.active,
          isDemo: true,
          sortOrder: svc.sortOrder || 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    handleDatabaseError(err, OperationType.WRITE, 'settings/services/businessHours');
  }
}

export function subscribeSettings(cb: (s: BarbershopSettings) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'settings', 'barbershop'),
    (snap) => {
      if (snap.exists()) {
        cb({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<BarbershopSettings>) });
      } else {
        cb(DEFAULT_SETTINGS);
      }
    },
    (err) => handleDatabaseError(err, OperationType.GET, 'settings/barbershop')
  );
}

export async function saveSettings(data: BarbershopSettings): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'barbershop'), {
      shopName: data.shopName.trim().slice(0, 120),
      slogan: data.slogan.trim().slice(0, 140),
      address: data.address.trim().slice(0, 240),
      phone: data.phone.trim().slice(0, 32),
      whatsapp: data.whatsapp.trim().slice(0, 32),
      minLeadMinutes: Number(data.minLeadMinutes) || 0,
      slotIntervalMinutes: Math.max(5, Number(data.slotIntervalMinutes) || 15),
      cancellationMinHours: Math.max(0, Number(data.cancellationMinHours) || 0),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleDatabaseError(err, OperationType.WRITE, 'settings/barbershop');
  }
}

export function subscribeServices(cb: (items: ServiceItem[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'services'),
    (snap) => {
      const list: ServiceItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ServiceItem, 'id'>),
      }));
      list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name));
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'services')
  );
}

export async function saveService(
  input: Omit<ServiceItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const id = input.id || makeId('svc');
  const ref = doc(db, 'services', id);
  const priceNum = Number(input.price);
  const durationNum = Number(input.durationMinutes);
  const safePrice = Number.isFinite(priceNum) ? Math.max(0, Math.min(50000, priceNum)) : 0;
  const safeDuration = Number.isFinite(durationNum) ? Math.max(5, Math.min(480, Math.round(durationNum))) : 30;
  const safeSortOrder = Number.isFinite(Number(input.sortOrder))
    ? Math.max(0, Math.min(9999, Math.round(Number(input.sortOrder))))
    : 0;
  try {
    if (input.id) {
      await updateDoc(ref, {
        name: input.name.trim().slice(0, 100),
        description: (input.description || '').trim().slice(0, 400),
        price: safePrice,
        durationMinutes: safeDuration,
        active: Boolean(input.active),
        isDemo: Boolean(input.isDemo),
        sortOrder: safeSortOrder,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        name: input.name.trim().slice(0, 100),
        description: (input.description || '').trim().slice(0, 400),
        price: safePrice,
        durationMinutes: safeDuration,
        active: Boolean(input.active),
        isDemo: Boolean(input.isDemo),
        sortOrder: safeSortOrder || 10,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (err) {
    handleDatabaseError(err, OperationType.WRITE, `services/${id}`);
  }
}

export async function removeService(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'services', id));
  } catch (err) {
    handleDatabaseError(err, OperationType.DELETE, `services/${id}`);
  }
}

export function subscribeBusinessHours(cb: (days: BusinessHoursDay[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'businessHours'),
    (snap) => {
      if (snap.empty) {
        cb(DEFAULT_BUSINESS_HOURS);
        return;
      }
      const list: BusinessHoursDay[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<BusinessHoursDay, 'id'>),
      }));
      list.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'businessHours')
  );
}

export async function saveBusinessHoursDay(day: BusinessHoursDay): Promise<void> {
  const id = day.id || `day_${day.dayOfWeek}`;
  try {
    await setDoc(doc(db, 'businessHours', id), {
      dayOfWeek: day.dayOfWeek,
      label: day.label.trim().slice(0, 32),
      isOpen: Boolean(day.isOpen),
      startTime: day.startTime,
      endTime: day.endTime,
      hasBreak: Boolean(day.hasBreak),
      breakStart: day.hasBreak ? day.breakStart || '' : '',
      breakEnd: day.hasBreak ? day.breakEnd || '' : '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleDatabaseError(err, OperationType.WRITE, `businessHours/${id}`);
  }
}

export function subscribeBlockedPeriods(cb: (items: BlockedPeriod[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'blockedPeriods'),
    (snap) => {
      const list: BlockedPeriod[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<BlockedPeriod, 'id'>),
      }));
      list.sort((a, b) => a.startDate.localeCompare(b.startDate));
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'blockedPeriods')
  );
}

export async function saveBlockedPeriod(
  input: Omit<BlockedPeriod, 'id' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const id = makeId('blk');
  try {
    await setDoc(doc(db, 'blockedPeriods', id), {
      title: input.title.trim().slice(0, 120),
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      allDay: Boolean(input.allDay),
      startTime: input.allDay ? '' : input.startTime || '',
      endTime: input.allDay ? '' : input.endTime || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleDatabaseError(err, OperationType.CREATE, `blockedPeriods/${id}`);
  }
}

export async function removeBlockedPeriod(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'blockedPeriods', id));
  } catch (err) {
    handleDatabaseError(err, OperationType.DELETE, `blockedPeriods/${id}`);
  }
}

export function subscribeAppointments(cb: (items: Appointment[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'appointments'),
    (snap) => {
      const list: Appointment[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Appointment, 'id'>),
      }));
      list.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.startMinutes - b.startMinutes;
      });
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'appointments')
  );
}

export function subscribeDaySchedules(cb: (map: Record<string, DaySchedule>) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'daySchedules'),
    (snap) => {
      const result: Record<string, DaySchedule> = {};
      snap.forEach((d) => {
        result[d.id] = d.data() as DaySchedule;
      });
      cb(result);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'daySchedules')
  );
}

/**
 * Keeps appointment statuses synchronized with public cancellations recorded on daySchedules
 * and ensures every customer phone is registered in the customers directory without duplication.
 */
export async function syncAdminConsistency(
  appointments: Appointment[],
  daySchedules: Record<string, DaySchedule>,
  customers: Customer[]
): Promise<void> {
  try {
    const customerMap = new Map<string, Customer>();
    for (const c of customers) {
      customerMap.set(c.normalizedPhone, c);
    }

    // 1. Sync any public cancellation from daySchedules onto appointments
    for (const apt of appointments) {
      const scheduleEntry = daySchedules[apt.date]?.bookings?.[apt.id];
      if (scheduleEntry && scheduleEntry.status === 'cancelled' && apt.status !== 'cancelled') {
        await updateDoc(doc(db, 'appointments', apt.id), {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        });
      }
    }

    // 2. Ensure recurring customers from public bookings exist in customers collection
    const byPhone = new Map<string, Appointment[]>();
    for (const apt of appointments) {
      if (!apt.normalizedPhone || !/^[0-9]{10,15}$/.test(apt.normalizedPhone)) continue;
      const list = byPhone.get(apt.normalizedPhone) || [];
      list.push(apt);
      byPhone.set(apt.normalizedPhone, list);
    }

    for (const [phoneKey, apts] of byPhone.entries()) {
      const validVisits = apts.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show');
      const sortedDates = apts.map((a) => a.date).sort();
      const latestApt = [...apts].sort((a, b) => b.date.localeCompare(a.date))[0];
      const existingInState = customerMap.get(phoneKey);

      if (!existingInState && latestApt) {
        const custRef = doc(db, 'customers', phoneKey);
        const liveSnap = await getDoc(custRef);
        if (!liveSnap.exists()) {
          await setDoc(custRef, {
            name: latestApt.customerName.trim().slice(0, 120),
            phone: latestApt.customerPhone.trim().slice(0, 32),
            normalizedPhone: phoneKey,
            firstVisitAt: sortedDates[0] || latestApt.date,
            lastVisitAt: sortedDates[sortedDates.length - 1] || latestApt.date,
            totalVisits: validVisits.length,
            notes: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const liveData = liveSnap.data() as Customer;
          const nextLastVisit = sortedDates[sortedDates.length - 1] || liveData.lastVisitAt || '';
          if (liveData.totalVisits !== validVisits.length || liveData.lastVisitAt !== nextLastVisit) {
            await updateDoc(custRef, {
              lastVisitAt: nextLastVisit,
              totalVisits: validVisits.length,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } else if (existingInState && existingInState.totalVisits !== validVisits.length) {
        await updateDoc(doc(db, 'customers', existingInState.id), {
          lastVisitAt: sortedDates[sortedDates.length - 1] || existingInState.lastVisitAt || '',
          totalVisits: validVisits.length,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleDatabaseError(err, OperationType.WRITE, 'appointments/customers');
  }
}

export async function createOrUpdateManualAppointment(params: {
  id?: string;
  service: ServiceItem;
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  status: AppointmentStatus;
  notes?: string;
  oldDate?: string;
}): Promise<string> {
  const { id, service, date, startTime, customerName, customerPhone, status, notes, oldDate } =
    params;

  if (!isValidCalendarDateStr(date)) {
    throw new Error('Data do agendamento inválida.');
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
    throw new Error('Horário inicial inválido.');
  }

  const aptId = id || makeId('apt');
  const startMinutes = timeStrToMinutes(startTime);
  const endMinutes = startMinutes + service.durationMinutes;
  if (endMinutes <= startMinutes || endMinutes > 1440) {
    throw new Error('O serviço ultrapassa o limite do mesmo dia (24:00). Escolha um horário mais cedo.');
  }
  const endTime = endMinutes === 1440 ? '23:59' : minutesToTimeStr(endMinutes);
  const normalizedPhone = normalizePhone(customerPhone);
  if (!/^[0-9]{10,15}$/.test(normalizedPhone)) {
    throw new Error('Telefone/WhatsApp inválido. Informe DDD + número.');
  }
  if (customerName.trim().length < 2) {
    throw new Error('Nome do cliente deve ter pelo menos 2 caracteres.');
  }
  const confirmationCode = `BA-${aptId.slice(-5).toUpperCase()}`;

  const isVisitStatus = (s: AppointmentStatus) => s !== 'cancelled' && s !== 'no_show';

  try {
    await runTransaction(db, async (tx) => {
      const aptRef = doc(db, 'appointments', aptId);
      const dayRef = doc(db, 'daySchedules', date);
      const oldDayRef = oldDate && oldDate !== date ? doc(db, 'daySchedules', oldDate) : null;
      const customerRef = doc(db, 'customers', normalizedPhone);

      const [daySnap, oldDaySnap, aptSnap, customerSnap] = await Promise.all([
        tx.get(dayRef),
        oldDayRef ? tx.get(oldDayRef) : Promise.resolve(null),
        id ? tx.get(aptRef) : Promise.resolve(null),
        tx.get(customerRef),
      ]);

      const dayData = daySnap.exists() ? (daySnap.data() as DaySchedule) : { date, bookings: {} };

      // Check conflict with other active appointments on target date
      if (status === 'pending' || status === 'confirmed' || status === 'completed') {
        for (const [otherId, slot] of Object.entries(dayData.bookings || {})) {
          if (otherId === aptId) continue;
          if (slot.status === 'cancelled' || slot.status === 'no_show') continue;
          if (startMinutes < slot.endMinutes && endMinutes > slot.startMinutes) {
            throw new Error(
              `Conflito de horário com outra reserva das ${minutesToTimeStr(slot.startMinutes)} às ${minutesToTimeStr(slot.endMinutes)}.`
            );
          }
        }
      }

      if (oldDayRef && oldDaySnap?.exists()) {
        const oldData = oldDaySnap.data() as DaySchedule;
        const oldBookings = { ...(oldData.bookings || {}) };
        delete oldBookings[aptId];
        tx.set(oldDayRef, {
          date: oldDate!,
          bookings: oldBookings,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(dayRef, {
        date,
        bookings: {
          ...(dayData.bookings || {}),
          [aptId]: {
            startMinutes,
            endMinutes,
            status,
          },
        },
        updatedAt: serverTimestamp(),
      });

      if (id && aptSnap?.exists()) {
        tx.update(aptRef, {
          serviceId: service.id,
          serviceName: service.name,
          servicePrice: service.price,
          durationMinutes: service.durationMinutes,
          date,
          startTime,
          endTime,
          startMinutes,
          endMinutes,
          customerName: customerName.trim().slice(0, 120),
          customerPhone: customerPhone.trim().slice(0, 32),
          normalizedPhone,
          status,
          notes: (notes || '').trim().slice(0, 500),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(aptRef, {
          confirmationCode,
          serviceId: service.id,
          serviceName: service.name,
          servicePrice: service.price,
          durationMinutes: service.durationMinutes,
          date,
          startTime,
          endTime,
          startMinutes,
          endMinutes,
          customerName: customerName.trim().slice(0, 120),
          customerPhone: customerPhone.trim().slice(0, 32),
          normalizedPhone,
          status,
          source: 'admin',
          notes: (notes || '').trim().slice(0, 500),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (!customerSnap.exists()) {
        tx.set(customerRef, {
          name: customerName.trim().slice(0, 120),
          phone: customerPhone.trim().slice(0, 32),
          normalizedPhone,
          firstVisitAt: date,
          lastVisitAt: date,
          totalVisits: isVisitStatus(status) ? 1 : 0,
          notes: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const cust = customerSnap.data() as Customer;
        const prevCounts = id && aptSnap?.exists()
          ? isVisitStatus((aptSnap.data() as Appointment).status)
          : false;
        const nextCounts = isVisitStatus(status);
        const delta = (nextCounts ? 1 : 0) - (prevCounts ? 1 : 0);
        tx.update(customerRef, {
          name: customerName.trim().slice(0, 120),
          phone: customerPhone.trim().slice(0, 32),
          lastVisitAt: date,
          totalVisits: Math.max(0, (cust.totalVisits || 0) + delta),
          updatedAt: serverTimestamp(),
        });
      }
    });
    return aptId;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Conflito de horário')) {
      throw err;
    }
    handleDatabaseError(err, OperationType.WRITE, `appointments/${aptId}`);
  }
}

export async function updateAppointmentStatus(
  appointment: Appointment,
  newStatus: AppointmentStatus
): Promise<void> {
  const isVisitStatus = (s: AppointmentStatus) => s !== 'cancelled' && s !== 'no_show';
  try {
    await runTransaction(db, async (tx) => {
      const aptRef = doc(db, 'appointments', appointment.id);
      const aptSnap = await tx.get(aptRef);
      if (!aptSnap.exists()) {
        throw new Error('Agendamento não encontrado.');
      }
      const liveApt = aptSnap.data() as Appointment;
      const dayRef = doc(db, 'daySchedules', liveApt.date);
      const custRef = /^[0-9]{10,15}$/.test(liveApt.normalizedPhone || '')
        ? doc(db, 'customers', liveApt.normalizedPhone)
        : null;

      const [daySnap, custSnap] = await Promise.all([
        tx.get(dayRef),
        custRef ? tx.get(custRef) : Promise.resolve(null),
      ]);

      const dayData = daySnap.exists()
        ? (daySnap.data() as DaySchedule)
        : { date: liveApt.date, bookings: {} };

      tx.set(dayRef, {
        date: liveApt.date,
        bookings: {
          ...(dayData.bookings || {}),
          [appointment.id]: {
            startMinutes: liveApt.startMinutes,
            endMinutes: liveApt.endMinutes,
            status: newStatus,
          },
        },
        updatedAt: serverTimestamp(),
      });

      tx.update(aptRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      if (custRef && custSnap?.exists()) {
        const prevCounts = isVisitStatus(liveApt.status);
        const nextCounts = isVisitStatus(newStatus);
        const delta = (nextCounts ? 1 : 0) - (prevCounts ? 1 : 0);
        if (delta !== 0) {
          const cust = custSnap.data() as Customer;
          tx.update(custRef, {
            totalVisits: Math.max(0, (cust.totalVisits || 0) + delta),
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
  } catch (err) {
    handleDatabaseError(err, OperationType.UPDATE, `appointments/${appointment.id}`);
  }
}

export function subscribeCustomers(cb: (items: Customer[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'customers'),
    (snap) => {
      const list: Customer[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Customer, 'id'>),
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'customers')
  );
}

export async function saveCustomer(input: {
  name: string;
  phone: string;
  notes?: string;
}): Promise<void> {
  const normalizedPhone = normalizePhone(input.phone);
  if (!/^[0-9]{10,15}$/.test(normalizedPhone)) {
    throw new Error('Telefone inválido. Informe DDD + número.');
  }
  const ref = doc(db, 'customers', normalizedPhone);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        name: input.name.trim().slice(0, 120),
        phone: input.phone.trim().slice(0, 32),
        notes: (input.notes || '').trim().slice(0, 1000),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        name: input.name.trim().slice(0, 120),
        phone: input.phone.trim().slice(0, 32),
        normalizedPhone,
        firstVisitAt: '',
        lastVisitAt: '',
        totalVisits: 0,
        notes: (input.notes || '').trim().slice(0, 1000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleDatabaseError(err, OperationType.WRITE, `customers/${normalizedPhone}`);
  }
}

export function subscribePayments(cb: (items: PaymentRecord[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'payments'),
    (snap) => {
      const list: PaymentRecord[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<PaymentRecord, 'id'>),
      }));
      list.sort((a, b) => b.date.localeCompare(a.date));
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'payments')
  );
}

export async function createPayment(input: {
  amount: number;
  serviceId?: string;
  serviceName: string;
  customerName: string;
  customerPhone?: string;
  appointmentId?: string;
  date: string;
  method: PaymentMethod;
  notes?: string;
}): Promise<string> {
  const id = makeId('pay');
  const parsedAmount = Number(input.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Informe um valor de pagamento maior que zero.');
  }
  try {
    await runTransaction(db, async (tx) => {
      const payRef = doc(db, 'payments', id);
      const aptRef = input.appointmentId ? doc(db, 'appointments', input.appointmentId) : null;
      const aptSnap = aptRef ? await tx.get(aptRef) : null;
      const aptData = aptSnap?.exists() ? (aptSnap.data() as Appointment) : null;
      const dayRef = aptData ? doc(db, 'daySchedules', aptData.date) : null;
      const daySnap = dayRef ? await tx.get(dayRef) : null;

      tx.set(payRef, {
        amount: Math.min(100000, parsedAmount),
        serviceId: input.serviceId || '',
        serviceName: input.serviceName.trim().slice(0, 100),
        customerName: input.customerName.trim().slice(0, 120),
        customerPhone: (input.customerPhone || '').trim().slice(0, 32),
        appointmentId: input.appointmentId || '',
        date: input.date,
        method: input.method,
        notes: (input.notes || '').trim().slice(0, 300),
        createdAt: serverTimestamp(),
      });

      if (aptRef && aptData) {
        tx.update(aptRef, {
          paymentId: id,
          status: 'completed',
          updatedAt: serverTimestamp(),
        });

        if (dayRef) {
          const dayData = daySnap?.exists()
            ? (daySnap.data() as DaySchedule)
            : { date: aptData.date, bookings: {} };
          tx.set(dayRef, {
            date: aptData.date,
            bookings: {
              ...(dayData.bookings || {}),
              [input.appointmentId!]: {
                startMinutes: aptData.startMinutes,
                endMinutes: aptData.endMinutes,
                status: 'completed',
              },
            },
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
    return id;
  } catch (err) {
    handleDatabaseError(err, OperationType.CREATE, `payments/${id}`);
  }
}

export async function removePayment(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'payments', id));
  } catch (err) {
    handleDatabaseError(err, OperationType.DELETE, `payments/${id}`);
  }
}

export function subscribeExpenses(cb: (items: ExpenseRecord[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'expenses'),
    (snap) => {
      const list: ExpenseRecord[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ExpenseRecord, 'id'>),
      }));
      list.sort((a, b) => b.date.localeCompare(a.date));
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'expenses')
  );
}

export async function createExpense(input: {
  description: string;
  amount: number;
  category: string;
  date: string;
}): Promise<void> {
  const id = makeId('exp');
  try {
    await setDoc(doc(db, 'expenses', id), {
      description: input.description.trim().slice(0, 160),
      amount: Math.max(0.01, Number(input.amount)),
      category: input.category.trim().slice(0, 80),
      date: input.date,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleDatabaseError(err, OperationType.CREATE, `expenses/${id}`);
  }
}

export async function removeExpense(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'expenses', id));
  } catch (err) {
    handleDatabaseError(err, OperationType.DELETE, `expenses/${id}`);
  }
}

export function subscribeAdmins(cb: (items: AdminUser[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'admins'),
    (snap) => {
      const list: AdminUser[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AdminUser, 'id'>),
      }));
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'admins')
  );
}

export async function addAuthorizedAdmin(email: string, name: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 160) {
    throw new Error('E-mail inválido.');
  }
  try {
    await setDoc(doc(db, 'admins', cleanEmail), {
      email: cleanEmail,
      name: name.trim().slice(0, 120) || cleanEmail,
      role: 'admin',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleDatabaseError(err, OperationType.WRITE, `admins/${cleanEmail}`);
  }
}

export async function removeAuthorizedAdmin(id: string): Promise<void> {
  const { data: { user } } = await auth.getUser();
  const currentUid = user?.id;
  const currentEmail = user?.email?.toLowerCase();
  if (id === currentUid || (currentEmail && id === currentEmail)) {
    throw new Error('Você não pode remover a própria conta conectada.');
  }
  try {
    await deleteDoc(doc(db, 'admins', id));
  } catch (err) {
    handleDatabaseError(err, OperationType.DELETE, `admins/${id}`);
  }
}

export function subscribeBackups(cb: (items: BackupSnapshot[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'backups'),
    (snap) => {
      const list: BackupSnapshot[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<BackupSnapshot, 'id'>),
      }));
      list.sort((a, b) => b.id.localeCompare(a.id));
      cb(list);
    },
    (err) => handleDatabaseError(err, OperationType.LIST, 'backups')
  );
}

function sanitizeJsonMap(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonMap(item));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toDate === 'function') {
      try {
        return (obj as { toDate: () => Date }).toDate().toISOString();
      } catch {
        return null;
      }
    }
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || k === 'cancelHash') continue;
      clean[k] = sanitizeJsonMap(v);
    }
    return clean;
  }
  return String(value);
}

export async function createRemoteBackupSnapshot(
  label: string,
  createdBy: string,
  data: {
    settings: BarbershopSettings;
    services: ServiceItem[];
    businessHours: BusinessHoursDay[];
    blockedPeriods: BlockedPeriod[];
    customers: Customer[];
    appointments: Appointment[];
    payments: PaymentRecord[];
    expenses: ExpenseRecord[];
  }
): Promise<string> {
  const id = makeId('bkp');
  const cleanEmail = createdBy.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('E-mail do administrador inválido para registrar snapshot.');
  }

  const payload = sanitizeJsonMap({
    version: 2,
    createdAtIso: new Date().toISOString(),
    ...data,
  }) as Record<string, unknown>;

  const approxBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (approxBytes > 880000) {
    throw new Error(
      'O snapshot excede o limite interno de segurança. Use a exportação JSON completa.'
    );
  }

  try {
    await setDoc(doc(db, 'backups', id), {
      label: label.trim().slice(0, 120) || `Backup ${new Date().toISOString().slice(0, 10)}`,
      createdBy: cleanEmail.slice(0, 160),
      recordCounts: {
        services: data.services.length,
        customers: data.customers.length,
        appointments: data.appointments.length,
        payments: data.payments.length,
        expenses: data.expenses.length,
      },
      payload,
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleDatabaseError(err, OperationType.CREATE, `backups/${id}`);
  }
}

export async function removeRemoteBackup(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'backups', id));
  } catch (err) {
    handleDatabaseError(err, OperationType.DELETE, `backups/${id}`);
  }
}
