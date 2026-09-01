export interface EntitySyncMeta {
	vector: Record<string, number>;
	updatedAt: string;
	deleted?: boolean;
	scopePackageId?: string | null;
	parentConversationId?: string;
	syncable?: boolean;
}

interface SyncMetadataSnapshot {
	counter: number;
	entities: Record<string, EntitySyncMeta>;
}

const deviceIdKey = "pulsar:sync:device-id";
const metadataKey = "pulsar:sync:entity-metadata:v1";
let remoteWriteDepth = 0;

export function getLocalDeviceId() {
	let deviceId = localStorage.getItem(deviceIdKey);
	if (!deviceId) {
		deviceId = crypto.randomUUID();
		localStorage.setItem(deviceIdKey, deviceId);
	}
	return deviceId;
}

export function syncEntityKey(table: string, id: string) {
	return `${table}:${id}`;
}

export function readSyncMetadata(): SyncMetadataSnapshot {
	const raw = localStorage.getItem(metadataKey);
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

export function writeSyncMetadata(snapshot: SyncMetadataSnapshot) {
	localStorage.setItem(metadataKey, JSON.stringify(snapshot));
}

export function clearResourceSyncMetadata() {
	localStorage.removeItem(metadataKey);
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
	const scopePackageId =
		table === "resource_packages"
			? id
			: typeof record.packageId === "string" || record.packageId === null
				? (record.packageId as string | null)
				: previous?.scopePackageId;
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
		scopePackageId,
		parentConversationId,
		syncable:
			table === "resource_packages"
				? record.syncEnabled !== false
				: (previous?.syncable ?? true),
	};
	writeSyncMetadata(snapshot);
}

export async function withRemoteDatabaseWrites<T>(operation: () => Promise<T>) {
	remoteWriteDepth += 1;
	try {
		return await operation();
	} finally {
		remoteWriteDepth -= 1;
	}
}

export function mergeEntitySyncMeta(
	local: EntitySyncMeta | undefined,
	remote: EntitySyncMeta | undefined,
): EntitySyncMeta {
	const vector: Record<string, number> = {};
	for (const [deviceId, counter] of Object.entries(local?.vector ?? {})) {
		vector[deviceId] = Math.max(vector[deviceId] ?? 0, counter);
	}
	for (const [deviceId, counter] of Object.entries(remote?.vector ?? {})) {
		vector[deviceId] = Math.max(vector[deviceId] ?? 0, counter);
	}
	return {
		vector,
		updatedAt:
			[local?.updatedAt, remote?.updatedAt]
				.filter(Boolean)
				.sort()
				.slice(-1)[0] ?? new Date().toISOString(),
		deleted: Boolean(local?.deleted && remote?.deleted),
		scopePackageId: local?.scopePackageId ?? remote?.scopePackageId,
		parentConversationId:
			local?.parentConversationId ?? remote?.parentConversationId,
		syncable: local?.syncable ?? remote?.syncable,
	};
}

export type VectorRelation =
	| "equal"
	| "local-newer"
	| "remote-newer"
	| "concurrent";

export function compareVersionVectors(
	local: Record<string, number> = {},
	remote: Record<string, number> = {},
): VectorRelation {
	const devices = new Set([...Object.keys(local), ...Object.keys(remote)]);
	let localGreater = false;
	let remoteGreater = false;
	for (const deviceId of devices) {
		const localCounter = local[deviceId] ?? 0;
		const remoteCounter = remote[deviceId] ?? 0;
		localGreater ||= localCounter > remoteCounter;
		remoteGreater ||= remoteCounter > localCounter;
	}
	if (!localGreater && !remoteGreater) {
		return "equal";
	}
	if (localGreater && !remoteGreater) {
		return "local-newer";
	}
	if (remoteGreater && !localGreater) {
		return "remote-newer";
	}
	return "concurrent";
}
