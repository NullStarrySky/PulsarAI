import { invoke } from "@tauri-apps/api/core";

export interface DatabaseRecord<T> {
  id: string;
  value: T;
}

function storageKey(table: string) {
  return `pulsar:database:${table}`;
}

function readMirror<T>(table: string): Array<DatabaseRecord<T>> {
  const raw = localStorage.getItem(storageKey(table));
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as Array<DatabaseRecord<T>>;
  } catch {
    return [];
  }
}

function writeMirror<T>(table: string, records: Array<DatabaseRecord<T>>) {
  localStorage.setItem(storageKey(table), JSON.stringify(records));
}

export async function selectAll<T>(table: string): Promise<Array<DatabaseRecord<T>>> {
  const mirrored = readMirror<T>(table);

  try {
    const records = await invoke<Array<DatabaseRecord<T>>>("database_select_all", { table });
    const merged = new Map<string, DatabaseRecord<T>>();
    for (const record of records) {
      merged.set(record.id, record);
    }
    for (const record of mirrored) {
      merged.set(record.id, record);
    }
    const result = [...merged.values()];
    writeMirror(table, result);
    return result;
  } catch {
    return mirrored;
  }
}

export async function selectOne<T>(table: string, id: string): Promise<T | null> {
  try {
    return await invoke<T | null>("database_select_one", { table, id });
  } catch {
    return readMirror<T>(table).find((record) => record.id === id)?.value ?? null;
  }
}

export async function upsert<T>(table: string, id: string, value: T) {
  const records = readMirror<T>(table).filter((record) => record.id !== id);
  records.push({ id, value });
  writeMirror(table, records);
  try {
    await invoke<void>("database_upsert", { table, id, value });
  } catch {
    // The local mirror keeps the UI usable while the Tauri database command is unavailable.
  }
}

export async function remove(table: string, id: string) {
  writeMirror(table, readMirror(table).filter((record) => record.id !== id));
  try {
    await invoke<void>("database_delete", { table, id });
  } catch {
    // The local mirror keeps the UI usable while the Tauri database command is unavailable.
  }
}
