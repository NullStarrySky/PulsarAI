import { host } from "@/host";
import { markLocalDatabaseChange } from "./sync-metadata";

export interface DatabaseRecord<T> {
	id: string | null;
	value: T;
}

export async function selectAll<T>(
	table: string,
): Promise<Array<DatabaseRecord<T>>> {
	return host.database.selectAll<T>(table);
}

export async function selectByField<T>(
	table: string,
	field: "packageId" | "conversationid",
	value: string,
): Promise<Array<DatabaseRecord<T>>> {
	return host.database.selectByField<T>(table, field, value);
}

export async function selectOne<T>(
	table: string,
	id: string,
): Promise<T | null> {
	return host.database.selectOne<T>(table, id);
}

export async function upsert<T>(table: string, id: string, value: T) {
	await host.database.upsert(table, id, value);
	markLocalDatabaseChange(table, id, false, value);
}

export async function remove(table: string, id: string) {
	const previous = await selectOne(table, id);
	await host.database.remove(table, id);
	markLocalDatabaseChange(table, id, true, previous);
}

export async function resetCharacterData() {
	await host.database.resetCharacterData();
}
