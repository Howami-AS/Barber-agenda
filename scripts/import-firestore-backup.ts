import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const allowedCollections = new Set([
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
  'backups',
]);

interface BackupDocument {
  id: string;
  [key: string]: unknown;
}

function decodeFirestoreValue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const entry = value as Record<string, unknown>;

  if (
    entry.type === 'firestore/timestamp/1.0' &&
    typeof entry.seconds === 'number' &&
    typeof entry.nanoseconds === 'number'
  ) {
    return new Date(entry.seconds * 1000 + entry.nanoseconds / 1_000_000).toISOString();
  }
  if (entry.type === 'Buffer' && Array.isArray(entry.data)) return entry.data;
  if ('stringValue' in entry) return entry.stringValue;
  if ('integerValue' in entry) return Number(entry.integerValue);
  if ('doubleValue' in entry) return Number(entry.doubleValue);
  if ('booleanValue' in entry) return entry.booleanValue;
  if ('timestampValue' in entry) return entry.timestampValue;
  if ('nullValue' in entry) return null;
  if ('bytesValue' in entry) {
    const bytes = Buffer.from(String(entry.bytesValue), 'base64');
    return Array.from(bytes);
  }
  if ('arrayValue' in entry) {
    const array = entry.arrayValue as { values?: unknown[] };
    return (array.values ?? []).map(decodeFirestoreValue);
  }
  if ('mapValue' in entry) {
    const map = entry.mapValue as { fields?: Record<string, unknown> };
    return decodeFirestoreFields(map.fields ?? {});
  }
  return decodeFirestoreFields(entry);
}

function decodeFirestoreFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function readDocument(document: BackupDocument): { id: string; data: Record<string, unknown> } {
  const id = typeof document.id === 'string' ? document.id : '';
  if (!id || id.length > 128) throw new Error('Backup contém documento com ID inválido.');

  if (document.fields && typeof document.fields === 'object') {
    return { id, data: decodeFirestoreFields(document.fields as Record<string, unknown>) };
  }

  const { id: ignoredId, ...data } = document;
  void ignoredId;
  return { id, data };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Uso: npm run import:firestore -- <arquivo-backup.json> [--confirm]');
  }

  const sourcePath = path.resolve(inputPath);
  const contents = (await fs.readFile(sourcePath, 'utf8')).replace(/^\uFEFF/, '');
  const backup = JSON.parse(contents) as {
    collections?: Record<string, unknown>;
  };
  if (!backup.collections || typeof backup.collections !== 'object') {
    throw new Error('Formato inválido: o JSON deve conter o objeto "collections".');
  }

  const records: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
  for (const [collection, collectionData] of Object.entries(backup.collections)) {
    if (!allowedCollections.has(collection)) {
      console.warn(`Ignorando coleção não suportada: ${collection}`);
      continue;
    }
    if (!Array.isArray(collectionData)) {
      throw new Error(`A coleção "${collection}" deve ser uma lista de documentos.`);
    }
    for (const item of collectionData) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`Documento inválido na coleção "${collection}".`);
      }
      const { id, data } = readDocument(item as BackupDocument);
      records.push({ collection, id, data });
    }
  }

  const counts = records.reduce<Record<string, number>>((result, record) => {
    result[record.collection] = (result[record.collection] ?? 0) + 1;
    return result;
  }, {});
  console.log(`Registros preparados: ${JSON.stringify(counts)}`);

  if (!process.argv.includes('--confirm')) {
    console.log('Modo de verificação: nenhum dado foi escrito. Revise e repita com --confirm.');
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Configure SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (let offset = 0; offset < records.length; offset += 200) {
    const batch = records.slice(offset, offset + 200).map((record) => ({
      operation: 'set',
      ...record,
    }));
    const { error } = await supabase.rpc('apply_record_batch', {
      p_reads: [],
      p_operations: batch,
    });
    if (error) {
      throw new Error(`Falha ao importar lote ${Math.floor(offset / 200) + 1}: ${error.message}`);
    }
  }
  console.log(`Importação concluída: ${records.length} documentos.`);
}

main().catch((error: unknown) => {
  console.error('Importação interrompida:', error);
  process.exitCode = 1;
});
