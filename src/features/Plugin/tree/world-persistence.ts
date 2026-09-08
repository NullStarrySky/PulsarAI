import { markLocalDatabaseChange } from "@/features/Database/sync-metadata";
import { host } from "@/host";
import { createBuiltinGlobalWorld, createLocalPluginWorld } from "./builtin-world";
import {
	globalWorldDocumentId,
	type World,
	type WorldDocument,
} from "./world-types";
import {
	applyPulses,
	type Pulse,
} from "./world-update";

export const worldTable = "resource_worlds";

export function localPluginWorldDocumentId(localPluginId: string) {
	return `local:${localPluginId}`;
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
	return true;
}

function syncBuiltinFolder(source: import("./world-types").WorldFolderNode, target: import("./world-types").WorldFolderNode): boolean {
	let changed = false;
	for (const [key, sourceChild] of Object.entries(source.children)) {
		const targetChild = target.children[key];
		if (!targetChild) {
			target.children[key] = sourceChild;
			changed = true;
		} else if (sourceChild.type === "folder" && targetChild.type === "folder") {
			if (syncBuiltinFolder(sourceChild, targetChild)) changed = true;
		} else if (sourceChild.type === "file" && targetChild.type === "file") {
			if ((!targetChild.content || targetChild.content === "") && sourceChild.content) {
				targetChild.content = sourceChild.content;
				changed = true;
			}
		}
	}
	return changed;
}

export async function ensureGlobalWorldDocument() {
	const document = await loadWorldDocument(globalWorldDocumentId);
	if (!document)
		return createPersistedWorldDocument(createBuiltinGlobalWorld());
	let changed = repairBuiltinDefaultTemplateChatId(document);
	const builtin = createBuiltinGlobalWorld();
	if (syncBuiltinFolder(builtin.root, document.root)) {
		changed = true;
	}
	return changed ? createPersistedWorldDocument(document) : document;
}

export async function ensureLocalPluginWorldDocument(localPluginId: string) {
	const id = localPluginWorldDocumentId(localPluginId);
	return (
		(await loadWorldDocument(id)) ??
		createPersistedWorldDocument(createLocalPluginWorld(localPluginId))
	);
}

/**
 * Resolves compact ID-addressed updates against a working World, publishes the
 * result to memory, then writes each affected document in one JSON-patch request.
 * Cross-document transactions remain a host concern.
 */
export async function persistPulses(
	documents: World,
	pulses: Pulse[],
) {
	const working = structuredClone(documents);
	applyPulses(working, pulses);

	const changedScopes = new Set(pulses.flatMap((pulse) => pulse.operations.map((operation) => operation.scope)));
	for (const scope of changedScopes)
		Object.assign(documents[scope], working[scope]);
	for (const scope of changedScopes) {
		const document = documents[scope];
		await host.database.update(worldTable, document.id, [
			{ op: "replace", path: "/value", value: working[scope] },
		]);
		markLocalDatabaseChange(worldTable, document.id, false, document);
	}
}
