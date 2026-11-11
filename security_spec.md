# Barber Agenda — Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Default-Deny Safety Net**: Every unspecified path under `/databases/{database}/documents` is denied by default (`allow read, write: if false`).
2. **Admin-Only Writes (Zero Public Client Writes)**: Unauthenticated clients and authenticated non-admin users MUST NEVER create, update, or delete any document in any Firestore collection (`admins`, `settings`, `services`, `businessHours`, `blockedPeriods`, `daySchedules`, `appointments`, `customers`, `payments`, `expenses`, `backups`). All public bookings/cancellations must be executed server-side via the Firebase Admin SDK (`FIREBASE_SERVICE_ACCOUNT_JSON`) or by an authenticated administrator.
3. **LGPD Read Restrictions (Zero Public PII Exposure)**: Collections containing personal data (names, phones, emails, notes, financial history, backups) — `appointments`, `customers`, `admins`, `payments`, `expenses`, `backups` — are strictly restricted (`get` and `list`) to verified active administrators (`isAdmin()`). Public reads are limited strictly to non-PII storefront/availability data (`settings/barbershop` via `get`, `services`, `businessHours`, `blockedPeriods`, and anonymous slot occupancy `daySchedules/{date}` via `get` only; `list` on `settings` and `daySchedules` is restricted to `isAdmin()`).
4. **Verified Admin Gate**: Administrative privileges require `request.auth != null`, `request.auth.token.email_verified == true`, and an active (`active == true`) document in `/admins/{uid}` or `/admins/{email}`. Only an existing active `'owner'` in `/admins` can grant `'owner'` role or modify/delete an `'owner'` record, and no admin can delete their own admin entry.
5. **Strict Schema, Types, Sizes & Timestamps**: Every document write validates `hasAll` & `hasOnly` keys, field types, regex IDs (`^[a-zA-Z0-9_\-]+$`), string/map `.size()` boundaries, valid dates/times (`endMinutes - startMinutes == durationMinutes`), native Maps/Lists in `backups.payload`, immutable `createdAt`/`source`, and server timestamps (`request.time`).

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)

1. **Unauthenticated Customer PII List**: Anonymous `list` on `/customers`.
2. **Unauthenticated Appointment Read**: Anonymous `get` on `/appointments/apt_001`.
3. **Spoofed Email Unverified Admin**: Authenticated user matching an active `/admins/{email}` document with `email_verified: false` attempting `list` on `/payments`.
4. **Self-Admin Escalation**: Authenticated non-admin user attempting `create` on `/admins/attacker_uid` with `{ role: "owner", active: true }`.
5. **Unauthenticated Public Appointment Write**: Anonymous `create` on `/appointments/apt_public`.
6. **Authenticated Non-Admin Appointment Write**: Signed-in non-admin client attempting `create` on `/appointments/apt_nonadmin`.
7. **Unauthenticated DaySchedule Write / Hijack**: Anonymous `create` or `update` on `/daySchedules/2026-12-15`.
8. **ID Poisoning & Resource Exhaustion**: Any write on `/appointments/{200-char-id}` or oversized fields.
9. **Unauthenticated DaySchedules / Settings List Scraping**: Anonymous `list` on `/daySchedules` or `/settings`.
10. **Non-Admin Service Price Tampering**: Non-admin `update` on `/services/svc_corte_masculino` setting `price: 0`.
11. **Non-Admin Financial Ledger Forgery**: Non-admin `create` on `/payments/pay_fake` or `/expenses/exp_fake`.
12. **Client-Forged Timestamp or JSON Backup String**: Write passing a past `createdAt` or `payloadJson` string instead of `request.time` / native map.
