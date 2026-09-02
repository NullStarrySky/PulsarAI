import { markLocalDatabaseChange } from "@/features/Database/sync-metadata";
import { host } from "@/host";
import { createBuiltinGlobalWorld, createPackageWorld } from "./builtin-world";
import {
	globalWorldDocumentId,
	type World,
	type WorldDocument,
} from "./world-types";
import {
	applyWorldUpdate,
	createWorldIndexes,
	resolveWorldMoveUpdates,
	resolveWorldUpdate,
	valueAt,
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

function repairBuiltinDefaultTemplateChatId(document: WorldDocument) {
	const template = document.root.children["builtin-default-plugin"];
	if (template?.type !== "folder") return false;
	const legacy = template.children["builtin-default-chat"];
	if (
		legacy?.type !== "file" ||
		legacy.id !== "builtin-default-chat" ||
		template.children["builtin-default-template-chat"]
	)
		return false;
	delete template.children[legacy.id];
	legacy.id = "builtin-default-template-chat";
	template.children[legacy.id] = legacy;
	document.updateDate = new Date().toISOString();
	return true;
}

export async function ensureGlobalWorldDocument() {
	const document = await loadWorldDocument(globalWorldDocumentId);
	if (!document)
		return createPersistedWorldDocument(createBuiltinGlobalWorld());
	return repairBuiltinDefaultTemplateChatId(document)
		? createPersistedWorldDocument(document)
		: document;
}

export async function ensurePackageWorldDocument(packageId: string) {
	const id = packageWorldDocumentId(packageId);
	return (
		(await loadWorldDocument(id)) ??
		createPersistedWorldDocument(createPackageWorld(packageId))
	);
}

/**
 * Resolves compact ID-addressed updates against a working World, writes each
 * affected document in one JSON-patch request, then commits that same result
 * to memory. Cross-document transactions remain a host concern.
 */
export async function persistWorldUpdates(
	documents: World,
	updates: WorldUpdate[],
) {
	const working = structuredClone(documents);
	const indexes = createWorldIndexes(working);
	const patches = new Map<
		"global" | "self",
		ReturnType<typeof worldUpdatePatch>[]
	>();
	for (const update of updates) {
		const resolved =
			update.value.type === "move"
				? resolveWorldMoveUpdates(working, update, indexes)
				: [resolveWorldUpdate(working, update, indexes)];
		for (const item of resolved) {
			const current = valueAt(working[item.scope], item.path);
			patches.set(item.scope, [
				...(patches.get(item.scope) ?? []),
				worldUpdatePatch(["value"], item, current),
			]);
		}
		applyWorldUpdate(working, update, indexes);
	}

	const changedAt = new Date().toISOString();
	for (const [scope, items] of patches) {
		const document = documents[scope];
		await host.database.update(worldTable, document.id, [
			...items,
			{ op: "replace", path: "/value/updateDate", value: changedAt },
		]);
		working[scope].updateDate = changedAt;
		Object.assign(document, working[scope]);
		markLocalDatabaseChange(worldTable, document.id, false, document);
	}
}
