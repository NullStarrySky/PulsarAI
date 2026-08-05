import { invoke } from "@tauri-apps/api/core";
import { markLocalDatabaseChange } from "./sync-metadata";

export interface DatabaseRecord<T> {
  id: string | null;
  value: T;
}

export async function selectAll<T>(table: string): Promise<Array<DatabaseRecord<T>>> {
  return invoke<Array<DatabaseRecord<T>>>("database_select_all", { table });
}

export async function selectOne<T>(table: string, id: string): Promise<T | null> {
  return invoke<T | null>("database_select_one", { table, id });
}

export async function upsert<T>(table: string, id: string, value: T) {
  await invoke<void>("database_upsert", { table, id, value });
  markLocalDatabaseChange(table, id, false, value);
}

export async function remove(table: string, id: string) {
  const previous = await selectOne(table, id);
  await invoke<void>("database_delete", { table, id });
  markLocalDatabaseChange(table, id, true, previous);
}

export async function resetCharacterData() {
  await invoke<void>("database_reset_character_data");
}
