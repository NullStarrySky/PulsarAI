import { invoke } from "@tauri-apps/api/core";
import { markLocalDatabaseChange } from "./sync-metadata";
import { traceDatabaseOperation } from "./database-log";

export interface DatabaseRecord<T> {
  id: string | null;
  value: T;
}

export async function selectAll<T>(table: string): Promise<Array<DatabaseRecord<T>>> {
  const records = await traceDatabaseOperation(
    "selectAll",
    { table },
    () => invoke<Array<DatabaseRecord<T>>>("database_select_all", { table }),
    (result) => ({ count: result.length }),
  );
  return records;
}

export async function selectOne<T>(table: string, id: string): Promise<T | null> {
  const value = await traceDatabaseOperation(
    "selectOne",
    { table, id },
    () => invoke<T | null>("database_select_one", { table, id }),
    (result) => ({ found: result !== null }),
  );
  return value;
}

export async function upsert<T>(table: string, id: string, value: T) {
  await traceDatabaseOperation(
    "upsert",
    { table, id },
    () => invoke<void>("database_upsert", { table, id, value }),
  );
  markLocalDatabaseChange(table, id, false, value);
}

export async function remove(table: string, id: string) {
  const previous = await selectOne(table, id);
  await traceDatabaseOperation(
    "remove",
    { table, id },
    () => invoke<void>("database_delete", { table, id }),
  );
  markLocalDatabaseChange(table, id, true, previous);
}

export async function resetCharacterData() {
  await traceDatabaseOperation(
    "resetCharacterData",
    {},
    () => invoke<void>("database_reset_character_data"),
  );
}
