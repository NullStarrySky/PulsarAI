/**
 * In-memory implementation of the `HostDatabase` contract for debugging and agent testing outside Electron.
 */

import { toRaw } from "vue";

export interface JsonPatch {
	op: "add" | "replace" | "remove";
	path: string;
	value?: unknown;
}

type StoredValue = Record<string, unknown>;

function deepToRaw<T>(val: T): T {
	const raw = toRaw(val);
	if (raw && typeof raw === "object") {
		return JSON.parse(JSON.stringify(raw));
	}
	return raw;
}

function pointerParts(path: string) {
	return path
		.split("/")
		.filter(Boolean)
		.map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function applyPatch(record: StoredValue, patch: JsonPatch) {
	const parts = pointerParts(patch.path);
	if (!parts.length) return;
	let parent: Record<string, unknown> = record;
	for (const key of parts.slice(0, -1)) {
		const next = parent[key];
		if (next === null || typeof next !== "object") {
			parent[key] = {};
		}
		parent = parent[key] as Record<string, unknown>;
	}
	const key = parts[parts.length - 1]!;
	if (patch.op === "remove") delete parent[key];
	else parent[key] = structuredClone(patch.value);
}

const state = { tables: new Map<string, Map<string, StoredValue>>() };

function table(name: string) {
	let map = state.tables.get(name);
	if (!map) {
		map = new Map();
		state.tables.set(name, map);
	}
	return map;
}

export const mockHostDatabase = {
	selectAll<T>(
		tableName: string,
	): Promise<Array<{ id: string | null; value: T }>> {
		return Promise.resolve(
			Array.from(table(tableName).entries()).map(([id, value]) => ({
				id,
				value: structuredClone(value) as T,
			})),
		);
	},
	selectByField<T>(
		tableName: string,
		field: "localPluginId" | "conversationid",
		value: string,
	): Promise<Array<{ id: string | null; value: T }>> {
		return mockHostDatabase
			.selectAll<T>(tableName)
			.then((rows) =>
				rows.filter((row) => {
					const val = row.value as Record<string, unknown> | null | undefined;
					if (!val) return false;
					return (
						val[field] === value ||
						(field === "conversationid" && val["conversationId"] === value)
					);
				}),
			);
	},
	selectOne<T>(tableName: string, id: string): Promise<T | null> {
		const value = table(tableName).get(id);
		return Promise.resolve(value ? (deepToRaw(value) as T) : null);
	},
	upsert<T>(tableName: string, id: string, value: T): Promise<void> {
		table(tableName).set(id, deepToRaw(value) as StoredValue);
		return Promise.resolve();
	},
	update(tableName: string, id: string, patches: JsonPatch[]): Promise<void> {
		const record = table(tableName).get(id);
		if (!record) throw new Error(`mock update 目标不存在：${tableName}/${id}`);
		for (const patch of patches) applyPatch(record, patch);
		return Promise.resolve();
	},
	remove(tableName: string, id: string): Promise<void> {
		table(tableName).delete(id);
		return Promise.resolve();
	},
	resetCharacterData(): Promise<void> {
		for (const name of Array.from(state.tables.keys())) {
			if (name.startsWith("resource_")) state.tables.delete(name);
		}
		return Promise.resolve();
	},
};

export function resetMockHostDatabase() {
	state.tables = new Map();
}

/** Read one raw stored value (no clone) for assertions/debugging. */
export function peekTable(tableName: string): Map<string, StoredValue> {
	return state.tables.get(tableName) ?? new Map();
}
