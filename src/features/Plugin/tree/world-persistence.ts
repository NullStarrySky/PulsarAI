import { markLocalDatabaseChange } from "@/features/Database/sync-metadata";
import { host } from "@/host";
import { createBuiltinGlobalWorld, createPackageWorld } from "./builtin-world";
import { globalWorldDocumentId, type WorldDocument } from "./world-types";
import {
	applyWorldUpdate,
	type WorldUpdate,
	worldUpdatePatch,
} from "./world-update";

export const worldTable = "resource_worlds";

export function packageWorldDocumentId(packageId: string) {
	return `package:${packageId}`;
}

async function loadWorldDocument(id: string) {
	return host.database.selectOne<WorldDocument>(worldTable, id);
}

async function createPersistedWorldDocument(document: WorldDocument) {
	await host.database.upsert(worldTable, document.id, document);
	markLocalDatabaseChange(worldTable, document.id, false, document);
	return document;
}

export async function ensureGlobalWorldDocument() {
	return (
		(await loadWorldDocument(globalWorldDocumentId)) ??
		createPersistedWorldDocument(createBuiltinGlobalWorld())
	);
}

export async function ensurePackageWorldDocument(packageId: string) {
	const id = packageWorldDocumentId(packageId);
	return (
		(await loadWorldDocument(id)) ??
		createPersistedWorldDocument(createPackageWorld(packageId))
	);
}

/** Storage first, then mutate the supplied in-memory document with the same update. */
export async function persistWorldUpdate(
	document: WorldDocument,
	update: WorldUpdate,
) {
	const current = update.path.reduce<unknown>(
		(value, key) =>
			value && typeof value === "object"
				? (value as Record<string, unknown>)[key]
				: undefined,
		document,
	);
	const changedAt = new Date().toISOString();
	const patch = worldUpdatePatch(["value"], update, current);
	await host.database.update(worldTable, document.id, [
		patch,
		{ op: "replace", path: "/value/updateDate", value: changedAt },
	]);
	applyWorldUpdate(document, update);
	document.updateDate = changedAt;
	markLocalDatabaseChange(worldTable, document.id, false, document);
}
