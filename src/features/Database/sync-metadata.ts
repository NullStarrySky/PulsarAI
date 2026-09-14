interface EntitySyncMeta {
	vector: Record<string, number>;
	updatedAt: string;
	deleted?: boolean;
	scopeLocalPluginId?: string | null;
	parentConversationId?: string;
	syncable?: boolean;
}

interface SyncMetadataSnapshot {
	counter: number;
	entities: Record<string, EntitySyncMeta>;
}

const deviceIdKey = "pulsar:sync:device-id";
const metadataKey = "pulsar:sync:entity-metadata:v1";
const remoteWriteDepth = 0;

const memoryStore = new Map<string, string>();
const storage = {
	getItem(key: string): string | null {
		if (typeof localStorage !== "undefined") {
			return localStorage.getItem(key);
		}
		return memoryStore.get(key) ?? null;
	},
	setItem(key: string, value: string): void {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(key, value);
		} else {
			memoryStore.set(key, value);
		}
	},
	removeItem(key: string): void {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(key);
		} else {
			memoryStore.delete(key);
		}
	},
};

function getLocalDeviceId() {
	let deviceId = storage.getItem(deviceIdKey);
	if (!deviceId) {
		deviceId = crypto.randomUUID();
		storage.setItem(deviceIdKey, deviceId);
	}
	return deviceId;
}

function syncEntityKey(table: string, id: string) {
	return `${table}:${id}`;
}

function readSyncMetadata(): SyncMetadataSnapshot {
	const raw = storage.getItem(metadataKey);
	if (!raw) {
		return { counter: 0, entities: {} };
	}
	try {
		const parsed = JSON.parse(raw) as Partial<SyncMetadataSnapshot>;
		return {
			counter: Number(parsed.counter) || 0,
			entities:
				parsed.entities && typeof parsed.entities === "object"
					? parsed.entities
					: {},
		};
	} catch {
		return { counter: 0, entities: {} };
	}
}

function writeSyncMetadata(snapshot: SyncMetadataSnapshot) {
	storage.setItem(metadataKey, JSON.stringify(snapshot));
}

export function clearResourceSyncMetadata() {
	storage.removeItem(metadataKey);
}

export function markLocalDatabaseChange(
	table: string,
	id: string,
	deleted = false,
	value?: unknown,
) {
	if (remoteWriteDepth > 0 || !table.startsWith("resource_")) {
		return;
	}
	const snapshot = readSyncMetadata();
	const deviceId = getLocalDeviceId();
	snapshot.counter += 1;
	const key = syncEntityKey(table, id);
	const previous = snapshot.entities[key];
	const record =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	const scopeLocalPluginId =
		table === "resource_worlds" && id.startsWith("local:")
			? id.slice("local:".length)
			: typeof record.localPluginId === "string" ||
					record.localPluginId === null
				? (record.localPluginId as string | null)
				: previous?.scopeLocalPluginId;
	const parentConversationId =
		typeof record.conversationid === "string"
			? record.conversationid
			: previous?.parentConversationId;
	snapshot.entities[key] = {
		vector: {
			...(previous?.vector ?? {}),
			[deviceId]: snapshot.counter,
		},
		updatedAt: new Date().toISOString(),
		deleted,
		scopeLocalPluginId,
		parentConversationId,
		syncable: previous?.syncable ?? true,
	};
	writeSyncMetadata(snapshot);
}
