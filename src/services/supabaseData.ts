import { createSupabaseRecordStore } from './supabaseRecords';
import { supabase } from './supabase';

export const db = createSupabaseRecordStore(supabase);
export const auth = supabase.auth;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface DataStoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleDatabaseError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: DataStoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.error('Supabase Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
