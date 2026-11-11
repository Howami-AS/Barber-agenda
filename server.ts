import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { initializeApp as initializeClientApp, getApps as getClientApps } from 'firebase/app';
import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore as getClientFirestore,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { createServer as createViteServer } from 'vite';
import type {
  Appointment,
  BarbershopSettings,
  BlockedPeriod,
  BusinessHoursDay,
  DaySchedule,
  ServiceItem,
} from './src/types/barber.ts';
import { computeDayAvailability } from './src/utils/availability.ts';
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SETTINGS } from './src/utils/defaults.ts';
import {
  diffDaysDateStr,
  getDayOfWeekFromDateStr,
  getFortalezaNow,
  isValidCalendarDateStr,
  minutesToTimeStr,
  normalizePhone,
} from './src/utils/timezone.ts';

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
}

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const BOOTSTRAPPED_OWNER_EMAIL = 'alysson.mgs@gmail.com';
const PORT = Number(process.env.PORT || 3000);

// Initialize Firebase Web Client SDK for public transactional endpoints & availability queries
const clientApp =
  getClientApps().length > 0 ? getClientApps()[0] : initializeClientApp(firebaseConfig);
const firestoreDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

// Optional Firebase Admin SDK when service account credentials are provided
let adminAuth: import('firebase-admin/auth').Auth | null = null;
let adminDb: import('firebase-admin/firestore').Firestore | null = null;

async function initOptionalAdminSdk() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return;
  try {
    const adminAppMod = await import('firebase-admin/app');
    const adminAuthMod = await import('firebase-admin/auth');
    const adminFsMod = await import('firebase-admin/firestore');
    const parsed = JSON.parse(saJson);
    const app =
      adminAppMod.getApps().length > 0
        ? adminAppMod.getApps()[0]
        : adminAppMod.initializeApp({
            credential: adminAppMod.cert(parsed),
            projectId: firebaseConfig.projectId,
          });
    adminAuth = adminAuthMod.getAuth(app);
    adminDb = adminFsMod.getFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log('[Barber Agenda] Firebase Admin SDK initialized.');
  } catch (err) {
    console.warn('[Barber Agenda] Optional Admin SDK init skipped:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Anti-Spam & Rate Limiting
// ---------------------------------------------------------------------------
interface RateBucket {
  count: number;
  resetAt: number;
}
const ipRateMap = new Map<string, RateBucket>();
const bookingPhoneRateMap = new Map<string, RateBucket>();

function checkRateLimit(
  map: Map<string, RateBucket>,
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const current = map.get(key);
  if (!current || current.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maxRequests) {
    return false;
  }
  current.count += 1;
  return true;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// ---------------------------------------------------------------------------
// Token & Admin Verification
// ---------------------------------------------------------------------------
interface VerifiedAdminUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  idToken: string;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedAdminUser | null> {
  if (!idToken || idToken.length < 20) return null;

  if (adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      if (!decoded.email || !decoded.email_verified) return null;
      return {
        uid: decoded.uid,
        email: decoded.email.toLowerCase(),
        emailVerified: true,
        idToken,
      };
    } catch {
      return null;
    }
  }

  // Official Firebase Identity Toolkit verification using project API key
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId || !user?.email || !user.emailVerified) return null;
    return {
      uid: user.localId,
      email: user.email.toLowerCase(),
      emailVerified: true,
      idToken,
    };
  } catch {
    return null;
  }
}

async function checkIsAuthorizedAdmin(user: VerifiedAdminUser): Promise<boolean> {
  if (!user.emailVerified) return false;
  if (user.email === BOOTSTRAPPED_OWNER_EMAIL) return true;

  if (adminDb) {
    const byUid = await adminDb.collection('admins').doc(user.uid).get();
    if (byUid.exists && byUid.data()?.active === true) return true;
    const byEmail = await adminDb.collection('admins').doc(user.email).get();
    if (byEmail.exists && byEmail.data()?.active === true) return true;
    return false;
  }

  // Check via Firestore REST API using the verified user's own Bearer token
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/admins`;
  for (const docKey of [user.uid, user.email]) {
    const resp = await fetch(`${baseUrl}/${encodeURIComponent(docKey)}`, {
      headers: { Authorization: `Bearer ${user.idToken}` },
    });
    if (resp.ok) {
      const docJson = (await resp.json()) as { fields?: { active?: { booleanValue?: boolean } } };
      if (docJson.fields?.active?.booleanValue === true) {
        return true;
      }
    }
  }
  return false;
}

interface AuthedRequest extends Request {
  adminUser?: VerifiedAdminUser;
}

async function requireAdminMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }

  const verified = await verifyFirebaseIdToken(match[1]);
  if (!verified) {
    res.status(401).json({ error: 'Sessão inválida ou e-mail não verificado.' });
    return;
  }

  const isAuthorized = await checkIsAuthorizedAdmin(verified);
  if (!isAuthorized) {
    res.status(403).json({ error: 'Acesso restrito a administradores autorizados.' });
    return;
  }

  req.adminUser = verified;
  next();
}

// ---------------------------------------------------------------------------
// Firestore Public Readers (Server-Side, Fail-Closed on Real DB Errors)
// ---------------------------------------------------------------------------
function docExists(snap: { exists: boolean | (() => boolean) }): boolean {
  return typeof snap.exists === 'function' ? snap.exists() : Boolean(snap.exists);
}

async function loadPublicSettings(): Promise<BarbershopSettings | null> {
  if (adminDb) {
    const snap = await adminDb.collection('settings').doc('barbershop').get();
    return snap.exists ? (snap.data() as BarbershopSettings) : null;
  }
  const snap = await getDoc(doc(firestoreDb, 'settings', 'barbershop'));
  return snap.exists() ? (snap.data() as BarbershopSettings) : null;
}

async function loadPublicServices(): Promise<ServiceItem[]> {
  const items: ServiceItem[] = [];
  if (adminDb) {
    const snap = await adminDb.collection('services').get();
    snap.forEach((d) => {
      items.push({ id: d.id, ...(d.data() as Omit<ServiceItem, 'id'>) });
    });
  } else {
    const snap = await getDocs(collection(firestoreDb, 'services'));
    snap.forEach((d) => {
      items.push({ id: d.id, ...(d.data() as Omit<ServiceItem, 'id'>) });
    });
  }
  return items.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name));
}

async function loadBusinessHoursMap(): Promise<Map<number, BusinessHoursDay>> {
  const map = new Map<number, BusinessHoursDay>();
  if (adminDb) {
    const snap = await adminDb.collection('businessHours').get();
    snap.forEach((d) => {
      const data = d.data() as BusinessHoursDay;
      if (typeof data.dayOfWeek === 'number') {
        map.set(data.dayOfWeek, { id: d.id, ...data });
      }
    });
  } else {
    const snap = await getDocs(collection(firestoreDb, 'businessHours'));
    snap.forEach((d) => {
      const data = d.data() as BusinessHoursDay;
      if (typeof data.dayOfWeek === 'number') {
        map.set(data.dayOfWeek, { id: d.id, ...data });
      }
    });
  }
  return map;
}

async function loadBlockedPeriods(): Promise<BlockedPeriod[]> {
  const list: BlockedPeriod[] = [];
  if (adminDb) {
    const snap = await adminDb.collection('blockedPeriods').get();
    snap.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as Omit<BlockedPeriod, 'id'>) });
    });
  } else {
    const snap = await getDocs(collection(firestoreDb, 'blockedPeriods'));
    snap.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as Omit<BlockedPeriod, 'id'>) });
    });
  }
  return list;
}

async function listCollectionRest(collectionName: string, idToken: string): Promise<unknown[]> {
  const results: unknown[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: '300' });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collectionName}?${params.toString()}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) {
      throw new Error(`Falha ao ler coleção ${collectionName} (${resp.status}).`);
    }
    const data = (await resp.json()) as {
      documents?: Array<{ name: string; fields?: Record<string, unknown> }>;
      nextPageToken?: string;
    };
    for (const d of data.documents || []) {
      results.push({
        id: d.name.split('/').pop(),
        fields: d.fields || {},
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

// ---------------------------------------------------------------------------
// App Bootstrapping
// ---------------------------------------------------------------------------
async function startServer() {
  await initOptionalAdminSdk();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use('/api', (req, res, next) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(ipRateMap, ip, 120, 60_000)) {
      res.status(429).json({ error: 'Muitas requisições em pouco tempo. Aguarde alguns segundos.' });
      return;
    }
    next();
  });

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'Barber Agenda API',
      timezone: 'America/Fortaleza',
      now: getFortalezaNow(),
      adminSdkActive: Boolean(adminDb),
    });
  });

  // Public bootstrap (shop settings, active services, business hours, blocked dates)
  app.get('/api/public/bootstrap', async (_req, res) => {
    try {
      const [settings, services, hoursMap, blockedPeriods] = await Promise.all([
        loadPublicSettings(),
        loadPublicServices(),
        loadBusinessHoursMap(),
        loadBlockedPeriods(),
      ]);

      res.json({
        configured: Boolean(settings && hoursMap.size > 0 && services.length > 0),
        settings: settings || DEFAULT_SETTINGS,
        services: services.filter((s) => s.active),
        businessHours: Array.from(hoursMap.values()).sort((a, b) => a.dayOfWeek - b.dayOfWeek),
        blockedPeriods,
        now: getFortalezaNow(),
      });
    } catch (err) {
      console.error('Error in /api/public/bootstrap:', err);
      res.status(503).json({ error: 'Erro ao carregar informações reais da barbearia no Firestore.' });
    }
  });

  // Public real-time availability check (America/Fortaleza)
  app.get('/api/public/availability', async (req, res) => {
    const date = String(req.query.date || '').trim();
    const serviceId = String(req.query.serviceId || '').trim();

    if (!isValidCalendarDateStr(date)) {
      res.status(400).json({ error: 'Data inválida. Use uma data válida no formato YYYY-MM-DD.' });
      return;
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(serviceId) || serviceId.length > 128) {
      res.status(400).json({ error: 'Serviço inválido.' });
      return;
    }

    try {
      const [settings, serviceSnap, hoursMap, blockedPeriods, daySnap] = await Promise.all([
        loadPublicSettings(),
        adminDb
          ? adminDb.collection('services').doc(serviceId).get()
          : getDoc(doc(firestoreDb, 'services', serviceId)),
        loadBusinessHoursMap(),
        loadBlockedPeriods(),
        adminDb
          ? adminDb.collection('daySchedules').doc(date).get()
          : getDoc(doc(firestoreDb, 'daySchedules', date)),
      ]);

      if (!settings || hoursMap.size === 0) {
        res.status(404).json({
          error:
            'Agenda aguardando ativação inicial: faça o primeiro login na Área do Barbeiro (/admin) para gravar os serviços e horários no Cloud Firestore.',
        });
        return;
      }

      if (!docExists(serviceSnap)) {
        res.status(404).json({ error: 'Serviço não encontrado.' });
        return;
      }

      const service = { id: serviceSnap.id, ...(serviceSnap.data() as Omit<ServiceItem, 'id'>) };
      const dayOfWeek = getDayOfWeekFromDateStr(date);
      const businessHoursDay = hoursMap.get(dayOfWeek);
      const daySchedule = docExists(daySnap) ? (daySnap.data() as DaySchedule) : undefined;

      const availability = computeDayAvailability({
        dateStr: date,
        service,
        businessHoursDay,
        blockedPeriods,
        daySchedule,
        settings,
        now: getFortalezaNow(),
      });

      res.json({
        ...availability,
        service: {
          id: service.id,
          name: service.name,
          price: service.price,
          durationMinutes: service.durationMinutes,
        },
        now: getFortalezaNow(),
      });
    } catch (err) {
      console.error('Error in /api/public/availability:', err);
      res.status(503).json({ error: 'Erro ao consultar disponibilidade no Firestore.' });
    }
  });

  // Public atomic booking creation
  app.post('/api/public/bookings', async (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(ipRateMap, `book:${ip}`, 10, 10 * 60_000)) {
      res.status(429).json({
        error: 'Limite temporário de reservas atingido. Aguarde alguns minutos e tente novamente.',
      });
      return;
    }

    const body = req.body as {
      serviceId?: string;
      date?: string;
      startTime?: string;
      customerName?: string;
      customerPhone?: string;
      notes?: string;
      website?: string; // honeypot
    };

    if (body.website && body.website.trim().length > 0) {
      res.status(400).json({ error: 'Requisição inválida.' });
      return;
    }

    const serviceId = String(body.serviceId || '').trim();
    const date = String(body.date || '').trim();
    const startTime = String(body.startTime || '').trim();
    const customerName = String(body.customerName || '').trim().slice(0, 120);
    const customerPhone = String(body.customerPhone || '').trim().slice(0, 32);
    const notes = String(body.notes || '').trim().slice(0, 500);
    const normalizedPhone = normalizePhone(customerPhone);

    if (!/^[a-zA-Z0-9_\-]+$/.test(serviceId) || serviceId.length > 128) {
      res.status(400).json({ error: 'Selecione um serviço válido.' });
      return;
    }
    if (!isValidCalendarDateStr(date)) {
      res.status(400).json({ error: 'Selecione uma data válida.' });
      return;
    }
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
      res.status(400).json({ error: 'Selecione um horário válido.' });
      return;
    }
    if (customerName.length < 2) {
      res.status(400).json({ error: 'Informe seu nome completo (mínimo 2 caracteres).' });
      return;
    }
    if (!/^[0-9]{10,15}$/.test(normalizedPhone)) {
      res.status(400).json({ error: 'Informe um telefone/WhatsApp válido com DDD.' });
      return;
    }

    if (!checkRateLimit(bookingPhoneRateMap, normalizedPhone, 5, 10 * 60_000)) {
      res.status(429).json({
        error: 'Muitas tentativas para este telefone. Aguarde alguns minutos.',
      });
      return;
    }

    try {
      const blockedPeriods = await loadBlockedPeriods();
      const dayOfWeek = getDayOfWeekFromDateStr(date);

      const appointmentId = `apt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const confirmationCode = `BA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const cancelToken = crypto.randomBytes(24).toString('hex');
      const cancelHashBytes = crypto.createHash('sha256').update(cancelToken).digest();

      let bookedSlotStart = 0;
      let bookedSlotEnd = 0;
      let bookedServiceName = '';
      let bookedServicePrice = 0;
      let bookedDuration = 0;

      if (adminDb) {
        await adminDb.runTransaction(async (tx) => {
          const settingsRef = adminDb!.collection('settings').doc('barbershop');
          const hoursRef = adminDb!.collection('businessHours').doc(`day_${dayOfWeek}`);
          const serviceRef = adminDb!.collection('services').doc(serviceId);
          const dayRef = adminDb!.collection('daySchedules').doc(date);
          const aptRef = adminDb!.collection('appointments').doc(appointmentId);
          const customerRef = adminDb!.collection('customers').doc(normalizedPhone);

          const [settingsSnap, hoursSnap, serviceSnap, daySnap, customerSnap] = await Promise.all([
            tx.get(settingsRef),
            tx.get(hoursRef),
            tx.get(serviceRef),
            tx.get(dayRef),
            tx.get(customerRef),
          ]);

          if (!settingsSnap.exists || !hoursSnap.exists) {
            throw Object.assign(
              new Error('Configurações ou expediente da barbearia ainda não configurados.'),
              { statusCode: 409 }
            );
          }

          if (!serviceSnap.exists) {
            throw Object.assign(new Error('Serviço não encontrado.'), { statusCode: 404 });
          }

          const settings = settingsSnap.data() as BarbershopSettings;
          const businessHoursDay = hoursSnap.data() as BusinessHoursDay;
          const service = { id: serviceSnap.id, ...(serviceSnap.data() as Omit<ServiceItem, 'id'>) };
          const daySchedule = daySnap.exists ? (daySnap.data() as DaySchedule) : undefined;
          const nowFortaleza = getFortalezaNow();

          const availability = computeDayAvailability({
            dateStr: date,
            service,
            businessHoursDay,
            blockedPeriods,
            daySchedule,
            settings,
            now: nowFortaleza,
          });

          const matchedSlot = availability.slots.find((s) => s.startTime === startTime);
          if (!matchedSlot) {
            throw Object.assign(
              new Error(
                availability.closedReason ||
                  'Este horário acabou de ser reservado ou está indisponível. Escolha outro horário.'
              ),
              { statusCode: 409 }
            );
          }

          bookedSlotStart = matchedSlot.startMinutes;
          bookedSlotEnd = matchedSlot.endMinutes;
          bookedServiceName = service.name;
          bookedServicePrice = service.price;
          bookedDuration = service.durationMinutes;

          const { FieldValue } = await import('firebase-admin/firestore');
          const nextBookings = {
            ...(daySchedule?.bookings || {}),
            [appointmentId]: {
              startMinutes: matchedSlot.startMinutes,
              endMinutes: matchedSlot.endMinutes,
              status: 'confirmed',
            },
          };

          tx.set(dayRef, {
            date,
            bookings: nextBookings,
            updatedAt: FieldValue.serverTimestamp(),
          });

          tx.set(aptRef, {
            confirmationCode,
            serviceId,
            serviceName: service.name,
            servicePrice: service.price,
            durationMinutes: service.durationMinutes,
            date,
            startTime: matchedSlot.startTime,
            endTime: matchedSlot.endTime,
            startMinutes: matchedSlot.startMinutes,
            endMinutes: matchedSlot.endMinutes,
            customerName,
            customerPhone,
            normalizedPhone,
            status: 'confirmed',
            source: 'public',
            ...(notes ? { notes } : {}),
            cancelHash: cancelHashBytes,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          if (customerSnap.exists) {
            const existingCust = customerSnap.data() as { totalVisits?: number; firstVisitAt?: string };
            tx.update(customerRef, {
              name: customerName,
              phone: customerPhone,
              lastVisitAt: date,
              firstVisitAt: existingCust.firstVisitAt || date,
              totalVisits: (existingCust.totalVisits || 0) + 1,
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            tx.set(customerRef, {
              name: customerName,
              phone: customerPhone,
              normalizedPhone,
              firstVisitAt: date,
              lastVisitAt: date,
              totalVisits: 1,
              notes: '',
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        });
      } else {
        await runTransaction(firestoreDb, async (tx) => {
          const settingsRef = doc(firestoreDb, 'settings', 'barbershop');
          const hoursRef = doc(firestoreDb, 'businessHours', `day_${dayOfWeek}`);
          const serviceRef = doc(firestoreDb, 'services', serviceId);
          const dayRef = doc(firestoreDb, 'daySchedules', date);
          const aptRef = doc(firestoreDb, 'appointments', appointmentId);

          const [settingsSnap, hoursSnap, serviceSnap, daySnap] = await Promise.all([
            tx.get(settingsRef),
            tx.get(hoursRef),
            tx.get(serviceRef),
            tx.get(dayRef),
          ]);

          if (!settingsSnap.exists() || !hoursSnap.exists()) {
            throw Object.assign(
              new Error('Configurações ou expediente da barbearia ainda não configurados.'),
              { statusCode: 409 }
            );
          }

          if (!serviceSnap.exists()) {
            throw Object.assign(new Error('Serviço não encontrado.'), { statusCode: 404 });
          }

          const settings = settingsSnap.data() as BarbershopSettings;
          const businessHoursDay = hoursSnap.data() as BusinessHoursDay;
          const service = { id: serviceSnap.id, ...(serviceSnap.data() as Omit<ServiceItem, 'id'>) };
          const daySchedule = daySnap.exists() ? (daySnap.data() as DaySchedule) : undefined;
          const nowFortaleza = getFortalezaNow();

          const availability = computeDayAvailability({
            dateStr: date,
            service,
            businessHoursDay,
            blockedPeriods,
            daySchedule,
            settings,
            now: nowFortaleza,
          });

          const matchedSlot = availability.slots.find((s) => s.startTime === startTime);
          if (!matchedSlot) {
            throw Object.assign(
              new Error(
                availability.closedReason ||
                  'Este horário acabou de ser reservado ou está indisponível. Escolha outro horário.'
              ),
              { statusCode: 409 }
            );
          }

          bookedSlotStart = matchedSlot.startMinutes;
          bookedSlotEnd = matchedSlot.endMinutes;
          bookedServiceName = service.name;
          bookedServicePrice = service.price;
          bookedDuration = service.durationMinutes;

          const nextBookings = {
            ...(daySchedule?.bookings || {}),
            [appointmentId]: {
              startMinutes: matchedSlot.startMinutes,
              endMinutes: matchedSlot.endMinutes,
              status: 'confirmed',
            },
          };

          tx.set(dayRef, {
            date,
            bookings: nextBookings,
            updatedAt: serverTimestamp(),
          });

          tx.set(aptRef, {
            confirmationCode,
            serviceId,
            serviceName: service.name,
            servicePrice: service.price,
            durationMinutes: service.durationMinutes,
            date,
            startTime: matchedSlot.startTime,
            endTime: matchedSlot.endTime,
            startMinutes: matchedSlot.startMinutes,
            endMinutes: matchedSlot.endMinutes,
            customerName,
            customerPhone,
            normalizedPhone,
            status: 'confirmed',
            source: 'public',
            ...(notes ? { notes } : {}),
            cancelHash: Bytes.fromUint8Array(new Uint8Array(cancelHashBytes)),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      }

      res.status(201).json({
        appointmentId,
        confirmationCode,
        cancelToken,
        serviceId,
        serviceName: bookedServiceName,
        servicePrice: bookedServicePrice,
        durationMinutes: bookedDuration,
        date,
        startTime: minutesToTimeStr(bookedSlotStart),
        endTime: minutesToTimeStr(bookedSlotEnd),
        customerName,
        customerPhone,
        status: 'confirmed',
        createdAtIso: new Date().toISOString(),
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode || 500;
      const code = (err as { code?: string }).code || '';
      const message = (err as Error).message || 'Não foi possível concluir seu agendamento.';
      if (statusCode === 409 || statusCode === 404 || statusCode === 400) {
        res.status(statusCode).json({ error: message });
        return;
      }
      if (
        code === 'permission-denied' ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('Missing or insufficient permissions')
      ) {
        res.status(503).json({
          error:
            'As regras do Firestore exigem autenticação administrativa para escrita. Configure FIREBASE_SERVICE_ACCOUNT_JSON no servidor para habilitar reservas públicas via Admin SDK.',
        });
        return;
      }
      console.error('Booking transaction failed:', err);
      res.status(500).json({ error: 'Erro interno ao registrar agendamento.' });
    }
  });

  // Public non-PII status lookup for client's own appointment receipt
  app.get('/api/public/bookings/:id/status', async (req, res) => {
    const id = String(req.params.id || '').trim();
    const date = String(req.query.date || '').trim();

    if (!/^[a-zA-Z0-9_\-]+$/.test(id) || id.length > 128 || !isValidCalendarDateStr(date)) {
      res.status(400).json({ error: 'Parâmetros inválidos.' });
      return;
    }

    try {
      const daySnap = adminDb
        ? await adminDb.collection('daySchedules').doc(date).get()
        : await getDoc(doc(firestoreDb, 'daySchedules', date));
      if (!docExists(daySnap)) {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      const data = daySnap.data() as DaySchedule;
      const entry = data.bookings?.[id];
      if (!entry) {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      res.json({
        appointmentId: id,
        date,
        status: entry.status,
        startTime: minutesToTimeStr(entry.startMinutes),
        endTime: minutesToTimeStr(entry.endMinutes),
      });
    } catch {
      res.status(500).json({ error: 'Erro ao consultar status.' });
    }
  });

  // Public cancellation by owner of the cancelToken
  app.post('/api/public/bookings/:id/cancel', async (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(ipRateMap, `cancel:${ip}`, 15, 10 * 60_000)) {
      res.status(429).json({
        error: 'Muitas tentativas de cancelamento. Aguarde alguns minutos.',
      });
      return;
    }

    const id = String(req.params.id || '').trim();
    const body = req.body as { date?: string; cancelToken?: string };
    const date = String(body.date || '').trim();
    const cancelToken = String(body.cancelToken || '').trim();

    if (
      !/^[a-zA-Z0-9_\-]+$/.test(id) ||
      id.length > 128 ||
      !isValidCalendarDateStr(date) ||
      cancelToken.length < 16 ||
      cancelToken.length > 128
    ) {
      res.status(400).json({ error: 'Dados de cancelamento inválidos.' });
      return;
    }

    try {
      const settings = await loadPublicSettings();
      if (!settings) {
        res.status(409).json({ error: 'Configurações da barbearia não encontradas.' });
        return;
      }
      const now = getFortalezaNow();

      if (adminDb) {
        await adminDb.runTransaction(async (tx) => {
          const dayRef = adminDb!.collection('daySchedules').doc(date);
          const aptRef = adminDb!.collection('appointments').doc(id);
          const [daySnap, aptSnap] = await Promise.all([tx.get(dayRef), tx.get(aptRef)]);
          if (!daySnap.exists || !aptSnap.exists) {
            throw Object.assign(new Error('Agendamento não encontrado.'), { statusCode: 404 });
          }

          const aptData = aptSnap.data() as Appointment & { cancelHash?: Buffer };
          const providedHash = crypto.createHash('sha256').update(cancelToken).digest();
          if (!aptData.cancelHash || !providedHash.equals(Buffer.from(aptData.cancelHash))) {
            throw Object.assign(new Error('Token de cancelamento inválido.'), { statusCode: 403 });
          }
          if (aptData.status === 'cancelled' || aptData.status === 'completed') {
            throw Object.assign(new Error('Este agendamento não pode mais ser cancelado.'), {
              statusCode: 409,
            });
          }

          const dayDelta = diffDaysDateStr(date, now.dateStr);
          const minutesUntilStart = dayDelta * 1440 + aptData.startMinutes - now.minutesOfDay;
          if (minutesUntilStart < settings.cancellationMinHours * 60) {
            throw Object.assign(
              new Error(
                `Cancelamentos online exigem antecedência mínima de ${settings.cancellationMinHours}h. Entre em contato pelo WhatsApp.`
              ),
              { statusCode: 400 }
            );
          }

          const { FieldValue } = await import('firebase-admin/firestore');
          const dayData = daySnap.data() as DaySchedule;
          const nextBookings = {
            ...(dayData.bookings || {}),
            [id]: {
              ...dayData.bookings[id],
              status: 'cancelled',
            },
          };
          tx.update(dayRef, { bookings: nextBookings, updatedAt: FieldValue.serverTimestamp() });
          tx.update(aptRef, { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
        });
      } else {
        await runTransaction(firestoreDb, async (tx) => {
          const dayRef = doc(firestoreDb, 'daySchedules', date);
          const daySnap = await tx.get(dayRef);
          if (!daySnap.exists()) {
            throw Object.assign(new Error('Agendamento não encontrado.'), { statusCode: 404 });
          }
          const dayData = daySnap.data() as DaySchedule;
          const entry = dayData.bookings?.[id];
          if (!entry) {
            throw Object.assign(new Error('Agendamento não encontrado.'), { statusCode: 404 });
          }
          if (entry.status !== 'pending' && entry.status !== 'confirmed') {
            throw Object.assign(new Error('Este agendamento não pode mais ser cancelado.'), {
              statusCode: 409,
            });
          }

          const dayDelta = diffDaysDateStr(date, now.dateStr);
          const minutesUntilStart = dayDelta * 1440 + entry.startMinutes - now.minutesOfDay;
          if (minutesUntilStart < settings.cancellationMinHours * 60) {
            throw Object.assign(
              new Error(
                `Cancelamentos online exigem antecedência mínima de ${settings.cancellationMinHours}h. Entre em contato pelo WhatsApp.`
              ),
              { statusCode: 400 }
            );
          }

          const nextBookings = {
            ...dayData.bookings,
            [id]: {
              startMinutes: entry.startMinutes,
              endMinutes: entry.endMinutes,
              status: 'cancelled',
            },
          };

          tx.update(dayRef, {
            date,
            bookings: nextBookings,
            lastCancelToken: cancelToken,
            updatedAt: serverTimestamp(),
          });
        });
      }

      res.json({ ok: true, status: 'cancelled' });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode || 500;
      const msg = (err as Error).message || 'Erro ao cancelar agendamento.';
      if (statusCode < 500) {
        res.status(statusCode).json({ error: msg });
        return;
      }
      if (msg.includes('PERMISSION_DENIED') || msg.includes('permission-denied')) {
        res.status(403).json({ error: 'Token de cancelamento inválido ou sem permissão.' });
        return;
      }
      console.error('Public cancellation error:', err);
      res.status(500).json({ error: 'Não foi possível cancelar o agendamento.' });
    }
  });

  // -------------------------------------------------------------------------
  // Protected Admin Routes
  // -------------------------------------------------------------------------
  app.get('/api/admin/me', requireAdminMiddleware, (req: AuthedRequest, res) => {
    res.json({
      authorized: true,
      uid: req.adminUser!.uid,
      email: req.adminUser!.email,
      role: req.adminUser!.email === BOOTSTRAPPED_OWNER_EMAIL ? 'owner' : 'admin',
      adminSdkActive: Boolean(adminDb),
    });
  });

  app.post('/api/admin/backup/export', requireAdminMiddleware, async (req: AuthedRequest, res) => {
    try {
      const collections = [
        'settings',
        'services',
        'businessHours',
        'blockedPeriods',
        'customers',
        'appointments',
        'daySchedules',
        'payments',
        'expenses',
        'admins',
      ];

      const data: Record<string, unknown[]> = {};
      if (adminDb) {
        for (const col of collections) {
          const snap = await adminDb.collection(col).get();
          data[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
      } else {
        for (const col of collections) {
          data[col] = await listCollectionRest(col, req.adminUser!.idToken);
        }
      }

      res.json({
        exportedAt: new Date().toISOString(),
        exportedBy: req.adminUser!.email,
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId,
        collections: data,
      });
    } catch (err) {
      console.error('Backup export error:', err);
      res.status(500).json({ error: 'Erro ao gerar exportação de backup.' });
    }
  });

  // -------------------------------------------------------------------------
  // Vite Middleware (Dev) or Static Assets (Prod)
  // -------------------------------------------------------------------------
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Barber Agenda] Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
