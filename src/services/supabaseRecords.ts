import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseRecordStore {
  client: SupabaseClient;
  collection(name: string): AdminCollectionReference;
  runTransaction<T>(
    callback: (transaction: TransactionContext) => Promise<T>
  ): Promise<T>;
}

export interface CollectionReference {
  kind: 'collection';
  collection: string;
  db: SupabaseRecordStore;
}

export interface AdminCollectionReference extends CollectionReference {
  doc(id: string): AdminDocumentReference;
  get(): Promise<QuerySnapshot>;
}

export interface DocumentReference {
  kind: 'document';
  collection: string;
  id: string;
  db: SupabaseRecordStore;
  get(): Promise<DocumentSnapshot>;
}

export interface AdminDocumentReference extends DocumentReference {
  get(): Promise<DocumentSnapshot>;
}

export type CompatReference = CollectionReference | DocumentReference;
export type Unsubscribe = () => void;

interface StoredRecord {
  id: string;
  data: Record<string, unknown>;
  revision: number;
}

class DocumentSnapshot {
  readonly id: string;
  readonly exists: () => boolean;

  constructor(
    private readonly record: StoredRecord | null,
    id: string
  ) {
    this.id = id;
    this.exists = () => this.record !== null;
  }

  data(): unknown {
    return this.record?.data;
  }

  get revision(): number | null {
    return this.record?.revision ?? null;
  }
}

class QuerySnapshot {
  readonly docs: DocumentSnapshot[];
  readonly empty: boolean;

  constructor(records: StoredRecord[]) {
    this.docs = records.map((record) => new DocumentSnapshot(record, record.id));
    this.empty = records.length === 0;
  }

  forEach(callback: (snapshot: DocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

interface TransactionContext {
  get(ref: DocumentReference): Promise<DocumentSnapshot>;
  get(ref: CollectionReference): Promise<QuerySnapshot>;
  set(ref: DocumentReference, data: object): void;
  update(ref: DocumentReference, data: object): void;
  delete(ref: DocumentReference): void;
}

interface WriteOperation {
  operation: 'set' | 'update' | 'delete';
  collection: string;
  id: string;
  data?: Record<string, unknown>;
  merge?: boolean;
}

interface ReadVersion {
  collection: string;
  id: string;
  revision: number | null;
}

let nextChannelId = 0;

function isDocumentReference(ref: CompatReference): ref is DocumentReference {
  return ref.kind === 'document';
}

type DocumentKey = Pick<DocumentReference, 'collection' | 'id' | 'db'>;

async function fetchDocument(ref: DocumentKey): Promise<DocumentSnapshot> {
  const { data, error } = await ref.db.client
    .from('app_records')
    .select('id,data,revision')
    .eq('collection', ref.collection)
    .eq('id', ref.id)
    .maybeSingle();

  if (error) throw error;
  return new DocumentSnapshot((data as StoredRecord | null) ?? null, ref.id);
}

async function fetchCollection(ref: CollectionReference): Promise<QuerySnapshot> {
  const records: StoredRecord[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await ref.db.client
      .from('app_records')
      .select('id,data,revision')
      .eq('collection', ref.collection)
      .order('id')
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as StoredRecord[];
    records.push(...page);
    if (page.length < pageSize) break;
  }
  return new QuerySnapshot(records);
}

async function applyOperations(
  db: SupabaseRecordStore,
  operations: WriteOperation[],
  reads: ReadVersion[] = []
): Promise<void> {
  if (operations.length === 0) return;
  const { error } = await db.client.rpc('apply_record_batch', {
    p_reads: reads,
    p_operations: operations,
  });
  if (error) throw error;
}

export function createSupabaseRecordStore(client: SupabaseClient): SupabaseRecordStore {
  const db = {} as SupabaseRecordStore;
  db.client = client;
  db.collection = (name) => {
    const ref = collection(db, name);
    return Object.assign(ref, {
      doc: (id: string) => doc(db, name, id),
      get: () => getDocs(ref),
    });
  };
  db.runTransaction = (callback) => runTransaction(db, callback);
  return db;
}

export function collection(db: SupabaseRecordStore, name: string): CollectionReference {
  return { kind: 'collection', collection: name, db };
}

export function doc(
  dbOrCollection: SupabaseRecordStore | CollectionReference,
  collectionOrId: string,
  maybeId?: string
): DocumentReference {
  if ('client' in dbOrCollection) {
    if (!maybeId) throw new Error('O ID do documento é obrigatório.');
    const ref = {
      kind: 'document' as const,
      collection: collectionOrId,
      id: maybeId,
      db: dbOrCollection,
    };
    return Object.assign(ref, { get: () => fetchDocument(ref) });
  }
  const ref = {
    kind: 'document' as const,
    collection: dbOrCollection.collection,
    id: collectionOrId,
    db: dbOrCollection.db,
  };
  return Object.assign(ref, { get: () => fetchDocument(ref) });
}

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  return fetchDocument(ref);
}

export async function getDocs(ref: CollectionReference): Promise<QuerySnapshot> {
  return fetchCollection(ref);
}

export async function getDocFromServer(ref: DocumentReference): Promise<DocumentSnapshot> {
  return fetchDocument(ref);
}

export function serverTimestamp(): Record<string, boolean> {
  return { __supabaseServerTimestamp: true };
}

export const Bytes = {
  fromUint8Array(value: Uint8Array): number[] {
    return Array.from(value);
  },
};

export const FieldValue = { serverTimestamp };

export async function setDoc(
  ref: DocumentReference,
  data: object,
  options?: { merge?: boolean }
): Promise<void> {
  await applyOperations(ref.db, [
    {
      operation: 'set',
      collection: ref.collection,
      id: ref.id,
      data: { ...data },
      merge: options?.merge,
    },
  ]);
}

export async function updateDoc(
  ref: DocumentReference,
  data: object
): Promise<void> {
  await applyOperations(ref.db, [
    { operation: 'update', collection: ref.collection, id: ref.id, data: { ...data } },
  ]);
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await applyOperations(ref.db, [{ operation: 'delete', collection: ref.collection, id: ref.id }]);
}

export function writeBatch(db: SupabaseRecordStore) {
  const operations: WriteOperation[] = [];
  return {
    set(ref: DocumentReference, data: object) {
      operations.push({ operation: 'set', collection: ref.collection, id: ref.id, data: { ...data } });
    },
    update(ref: DocumentReference, data: object) {
      operations.push({ operation: 'update', collection: ref.collection, id: ref.id, data: { ...data } });
    },
    delete(ref: DocumentReference) {
      operations.push({ operation: 'delete', collection: ref.collection, id: ref.id });
    },
    commit() {
      return applyOperations(db, operations);
    },
  };
}

export async function runTransaction<T>(
  db: SupabaseRecordStore,
  callback: (transaction: TransactionContext) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reads = new Map<string, ReadVersion>();
    const operations: WriteOperation[] = [];
    async function get(ref: DocumentReference): Promise<DocumentSnapshot>;
    async function get(ref: CollectionReference): Promise<QuerySnapshot>;
    async function get(
      ref: CompatReference
    ): Promise<DocumentSnapshot | QuerySnapshot> {
      if (isDocumentReference(ref)) {
        const snapshot = await fetchDocument(ref);
        reads.set(`${ref.collection}\0${ref.id}`, {
          collection: ref.collection,
          id: ref.id,
          revision: snapshot.revision,
        });
        return snapshot;
      }

      const snapshot = await fetchCollection(ref);
      for (const docSnapshot of snapshot.docs) {
        reads.set(`${ref.collection}\0${docSnapshot.id}`, {
          collection: ref.collection,
          id: docSnapshot.id,
          revision: docSnapshot.revision,
        });
      }
      return snapshot;
    }

    const transaction = {
      get,
      set(ref: DocumentReference, data: object) {
        operations.push({ operation: 'set', collection: ref.collection, id: ref.id, data: { ...data } });
      },
      update(ref: DocumentReference, data: object) {
        operations.push({ operation: 'update', collection: ref.collection, id: ref.id, data: { ...data } });
      },
      delete(ref: DocumentReference) {
        operations.push({ operation: 'delete', collection: ref.collection, id: ref.id });
      },
    };

    const result = await callback(transaction);
    try {
      await applyOperations(db, operations, Array.from(reads.values()));
      return result;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== '40001' || attempt === 4) throw error;
    }
  }

  throw new Error('A transação não pôde ser concluída após várias tentativas.');
}

export function onSnapshot(
  ref: DocumentReference,
  next: (snapshot: DocumentSnapshot) => void,
  error?: (cause: Error) => void
): Unsubscribe;
export function onSnapshot(
  ref: CollectionReference,
  next: (snapshot: QuerySnapshot) => void,
  error?: (cause: Error) => void
): Unsubscribe;
export function onSnapshot(
  ref: CompatReference,
  next: ((snapshot: DocumentSnapshot) => void) | ((snapshot: QuerySnapshot) => void),
  error?: (cause: Error) => void
): Unsubscribe {
  const refresh = async () => {
    try {
      if (isDocumentReference(ref)) {
        (next as (snapshot: DocumentSnapshot) => void)(await fetchDocument(ref));
      } else {
        (next as (snapshot: QuerySnapshot) => void)(await fetchCollection(ref));
      }
    } catch (cause) {
      error?.(cause instanceof Error ? cause : new Error(String(cause)));
    }
  };

  void refresh();
  const channel = ref.db.client
    .channel(`records:${ref.collection}:${nextChannelId++}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'app_records',
        filter: `collection=eq.${ref.collection}`,
      },
      () => void refresh()
    )
    .subscribe((status, cause) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        error?.(new Error(`Falha na assinatura em tempo real: ${cause || status}`));
      }
    });

  return () => {
    void ref.db.client.removeChannel(channel);
  };
}
