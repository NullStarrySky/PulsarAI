import { computed, type MaybeRefOrGetter, ref, toRaw, toValue } from "vue";
import type {
	ChatMessage,
	ChatMessageContainer,
} from "@/features/Conversation/messages/message-types";
import { loadChat, persistChat } from "@/features/Conversation/chats/chat-service";
import {
	createContainer,
	currentMessage,
	loadContainer,
	persistContainer,
} from "@/features/Conversation/messages/message-service";
import {
	type ResourceImportEnvironment,
	wrapResource,
} from "@/features/Plugin/resources/resource-wrapper";
import {
	ensureGlobalWorldDocument,
	ensureLocalPluginWorldDocument,
	persistPulses,
} from "./world-persistence";
import { collectTypeContracts, customTypeSuffixes } from "./type-slots";
import {
	createWorldFile,
	createWorldFolder,
	type World,
	type WorldDocument,
	type WorldFileNode,
	type WorldFileType,
	type WorldFolderNode,
	type WorldNode,
	type WorldSlotSelectionMode,
	worldFileType,
} from "./world-types";
import {
	applyPulses,
	applyPulse,
	createPulse,
	createWorldNodeIndex,
	mergeContainerPulses,
	type Pulse,
	type PulseOperation,
} from "./world-update";

export interface WorldScope {
	localPluginId?: string | null;
	conversationId?: string | null;
	/** Reads the active message path into the World. Defaults to true for conversations. */
	applyReplay?: boolean;
	/** Writes to this concrete message version instead of creating a hidden one. */
	replay?: { container: ChatMessageContainer; message: ChatMessage };
}

export interface WorldResource {
	scope: "global" | "self";
	/** Stable, unambiguous API path using one or two `$id` anchors. */
	path: string;
	displayPath: string;
	/** The top-level global folder, or the local-world label. */
	sourceName: string;
	nodePath: string[];
	file: WorldFileNode;
}

export interface WorldSlotView {
	id: string;
	path: string;
	name: string;
	parent?: string;
	hasChildren: boolean;
	icon?: string;
	description?: string;
	allowedResourceTypes: WorldFileType[];
	selectionMode: WorldSlotSelectionMode;
	allResources: WorldResource[];
	resources: WorldResource[];
}

export interface WorldLocalSlotView {
	path: string;
	name: string;
	scope: "global" | "self";
	sourceName: string;
	parent?: string;
	allResources: WorldResource[];
	resources: WorldResource[];
}

export interface WorldSourceView {
	scope: "global" | "self";
	root: WorldFolderNode;
	resources: WorldResource[];
}

type ResolvedNode = {
	scope: "global" | "self";
	document: WorldDocument;
	node: WorldNode;
	nodePath: string[];
	parent: WorldFolderNode | null;
	parentPath: string[] | null;
	path: string;
};

let globalDocument: WorldDocument | null = null;
const localPluginDocuments = new Map<string, WorldDocument>();
const worldRevision = ref(0);

function clone<T>(value: T) {
	return structuredClone(toRaw(value));
}

type WorldMutationValue =
	| { type: "none" }
	| { type: "replace"; find: string; replace: string }
	| { type: "value"; value: unknown }
	| { type: "copy"; source: { scope: "global" | "self"; id: string }; idMap: Record<string, string> }
	| { type: "move"; source: { scope: "global" | "self"; id: string } };
type WorldMutation = { scope: "global" | "self"; nodeId: string; path: string[]; value: WorldMutationValue };

/** Temporary command input is immediately compiled into one persisted/replayed Pulse. */
function mutationsToPulse(world: World, mutations: WorldMutation[]): Pulse {
	const working = clone(world);
	const operations: PulseOperation[] = [];
	for (const mutation of mutations) {
		const index = createWorldNodeIndex(working[mutation.scope]);
		const target = index.get(mutation.nodeId);
		if (!target) throw new Error(`World 节点不存在：$${mutation.nodeId}`);
		const filename = target.node.name;
		let operation: PulseOperation;
		if (mutation.value.type === "none") {
			if (!target.parent) throw new Error("不能删除 World 根目录。");
			operation = { kind: "node.delete", scope: mutation.scope, nodeId: mutation.nodeId, parentId: target.parent.id, nameAtTime: filename };
		} else if (mutation.value.type === "move") {
			const source = createWorldNodeIndex(working[mutation.value.source.scope]).get(mutation.value.source.id);
			if (!source?.parent) throw new Error("移动源节点不存在。");
			operation = { kind: "node.move", scope: mutation.scope, nodeId: source.node.id, parentId: source.parent.id, targetParentId: mutation.nodeId, nameAtTime: source.node.name };
		} else if (mutation.value.type === "copy") {
			const source = createWorldNodeIndex(working[mutation.value.source.scope]).get(mutation.value.source.id);
			if (!source) throw new Error("复制源节点不存在。");
			operation = { kind: "node.copy", scope: mutation.scope, source: mutation.value.source, targetParentId: mutation.nodeId, idMap: mutation.value.idMap, nameAtTime: source.node.name };
		} else if (mutation.value.type === "replace") {
			operation = { kind: "file.replace", scope: mutation.scope, nodeId: mutation.nodeId, find: mutation.value.find, replace: mutation.value.replace, filename };
		} else if (mutation.path[0] === "children" && mutation.path[1] && mutation.value.value && typeof mutation.value.value === "object") {
			operation = { kind: "node.create", scope: mutation.scope, parentId: mutation.nodeId, node: mutation.value.value as WorldNode, parentNameAtTime: filename };
		} else if (mutation.path[0] === "content") {
			operation = { kind: "file.write", scope: mutation.scope, nodeId: mutation.nodeId, content: mutation.value.value, filename };
		} else {
			operation = target.node.type === "file"
				? { kind: "file.meta.patch", scope: mutation.scope, nodeId: mutation.nodeId, patch: { [mutation.path[0]!]: mutation.value.value }, filename }
				: { kind: "folder.meta.patch", scope: mutation.scope, nodeId: mutation.nodeId, patch: { [mutation.path[0]!]: mutation.value.value }, filename };
		}
		operations.push(operation);
		applyPulse(working, createPulse([operation]));
	}
	return createPulse(operations);
}

function normalizedScope(
	value: WorldScope | string | null | undefined,
): WorldScope {
	return typeof value === "string" ? { conversationId: value } : (value ?? {});
}

function requirePath(path: string) {
	if (!path.trim().startsWith("/"))
		throw new Error(`World 路径必须以 / 开头：${path}`);
	const parts = path
		.split("/")
		.map((part) => part.trim())
		.filter(Boolean);
	if (!parts.length || (parts[0] !== "global" && parts[0] !== "self"))
		throw new Error(`World 路径必须位于 /global 或 /self：${path}`);
	return parts;
}

function nodeByName(folder: WorldFolderNode, name: string, path: string) {
	const matches = Object.values(folder.children).filter(
		(child) => child.name === name,
	);
	if (matches.length > 1)
		throw new Error(`World 路径不明确：${path}；请使用 $ID 精确定位。`);
	return matches[0] ?? null;
}

function resolveNode(world: World, path: string): ResolvedNode {
	const parts = requirePath(path);
	const scope = parts[0] as "global" | "self";
	const document = world[scope];
	const index = createWorldNodeIndex(document);
	let node: WorldNode = document.root;
	let nodePath = ["root"];
	let parent: WorldFolderNode | null = null;
	let parentPath: string[] | null = null;
	for (const segment of parts.slice(1)) {
		if (node.type !== "folder")
			throw new Error(`World 路径的父节点不是文件夹：${path}`);
		const child: WorldNode | null = segment.startsWith("$")
			? (() => {
					const location = index.get(segment.slice(1));
					if (!location || !location.ancestors.has(node.id)) return null;
					return location.node;
				})()
			: nodeByName(node, segment, path);
		if (!child) throw new Error(`World 路径不存在：${path}`);
		const location = index.get(child.id)!;
		parent = node;
		parentPath = nodePath;
		node = child;
		nodePath = location.path;
	}
	return {
		scope,
		document,
		node,
		nodePath,
		parent,
		parentPath,
		path: `/${parts.join("/")}`,
	};
}

function walkFiles(
	scope: "global" | "self",
	folder: WorldFolderNode,
	names: string[] = [],
	nodePath: string[] = ["root"],
	sourceId?: string,
): WorldResource[] {
	return Object.values(folder.children).flatMap((node) => {
		const path = [...names, node.name];
		const pathToNode = [...nodePath, "children", node.id];
		const nextSourceId = scope === "global" ? (sourceId ?? node.id) : undefined;
		if (node.type === "file") {
			return [
				{
					scope,
					path:
						scope === "self"
							? `/self/$${node.id}`
							: `/global/$${nextSourceId}${nextSourceId === node.id ? "" : `/$${node.id}`}`,
					displayPath: `/${scope}/${path.join("/")}`,
					sourceName: scope === "self" ? "本地" : (names[0] ?? "全局"),
					nodePath: pathToNode,
					file: node,
				},
			];
		}
		return walkFiles(scope, node, path, pathToNode, nextSourceId);
	});
}

function globalSlotDefinitions(
	world: World,
): Omit<WorldSlotView, "allResources" | "resources">[] {
	try {
		const node = resolveNode(world, "/self/slot").node;
		if (node.type !== "folder") return [];
		const result: Omit<WorldSlotView, "allResources" | "resources">[] = [];
		const walk = (folder: WorldFolderNode, parentPath?: string) => {
			for (const child of Object.values(folder.children)) {
				if (child.type === "folder") {
					if (child.name === "types") continue;
					const childPath = `${parentPath ?? "/self/slot"}/$${child.id}`;
					const hasChildren = Object.values(child.children).some(
						(c) => c.type === "folder" && c.name !== "types",
					);
					result.push({
						id: child.id,
						path: childPath,
						name: child.name,
						hasChildren,
						...(child.icon ? { icon: child.icon } : {}),
						...(child.description ? { description: child.description } : {}),
						allowedResourceTypes: child.allowedResourceTypes ?? [],
						selectionMode: child.selectionMode ?? "multiple",
						...(parentPath ? { parent: parentPath } : {}),
					});
					walk(child, childPath);
				}
			}
		};
		walk(node);
		return result;
	} catch {
		return [];
	}
}

type LocalSlotDefinition = Omit<
	WorldLocalSlotView,
	"allResources" | "resources"
>;

function localSlotDefinitions(world: World): LocalSlotDefinition[] {
	const result: LocalSlotDefinition[] = [];
	const globalPathsByName = new Map(
		globalSlotDefinitions(world).map((slot) => [slot.name, slot.path]),
	);
	const collect = (
		scope: "global" | "self",
		source: WorldFolderNode,
		sourceName: string,
		sourcePrefix: string,
	) => {
		const localRoot = Object.values(source.children).find(
			(node): node is WorldFolderNode =>
				node.type === "folder" && node.name === "localSlot",
		);
		if (!localRoot) return;
		const visit = (folder: WorldFolderNode) => {
			for (const child of Object.values(folder.children)) {
				if (child.type !== "folder") continue;
				result.push({
					path: `${sourcePrefix}/$${localRoot.id}/$${child.id}`,
					name: child.name,
					scope,
					sourceName,
					...((child.parent ?? globalPathsByName.get(child.name))
						? { parent: child.parent ?? globalPathsByName.get(child.name) }
						: {}),
				});
				visit(child);
			}
		};
		visit(localRoot);
	};
	collect("self", world.self.root, "本地", "/self");
	for (const source of Object.values(world.global.root.children)) {
		if (source.type !== "folder") continue;
		collect("global", source, source.name, `/global/$${source.id}`);
	}
	return result;
}

function globalSlotForResource(
	resource: WorldResource,
	globalSlots: Pick<WorldSlotView, "path" | "selectionMode">[],
	localSlots: Pick<WorldLocalSlotView, "path" | "parent">[],
) {
	const localSlot = localSlots.find((slot) => slot.path === resource.file.slot);
	const assigned = localSlot?.parent ?? resource.file.slot;
	return globalSlots.find(
		(slot) =>
			slot.path === assigned ||
			(Boolean(assigned) && slot.path.endsWith(`/$${assigned!.split("/$").slice(-1)[0]}`)),
	);
}

function selectedResources(
	slot: Pick<WorldSlotView, "selectionMode">,
	resources: WorldResource[],
) {
	const enabled = resources.filter(
		(resource) => resource.file.resourceSelected,
	);
	return slot.selectionMode === "single" ? enabled.slice(0, 1) : enabled;
}

const conversationPulses = new Map<string, Pulse[]>();
const replayPersistenceQueues = new Map<string, Promise<void>>();

export function clearConversationPulses(conversationId?: string) {
	if (conversationId) {
		conversationPulses.delete(conversationId);
	} else {
		conversationPulses.clear();
	}
	worldRevision.value += 1;
}

function activeReplayPulses(conversationId: string) {
	return conversationPulses.get(conversationId) ?? [];
}

function appendConversationPulse(conversationId: string, pulse: Pulse) {
	const current = conversationPulses.get(conversationId) ?? [];
	current.push(clone(pulse));
	conversationPulses.set(conversationId, current);
}

function enqueueReplayPersistence(conversationId: string, pulse: Pulse) {
	const previous = replayPersistenceQueues.get(conversationId) ?? Promise.resolve();
	const task = previous
		.catch(() => undefined)
		.then(() => recordReplayPulse(conversationId, pulse));
	replayPersistenceQueues.set(conversationId, task);
	void task.then(
		() => {
			if (replayPersistenceQueues.get(conversationId) === task)
				replayPersistenceQueues.delete(conversationId);
		},
		() => {
			if (replayPersistenceQueues.get(conversationId) === task)
				replayPersistenceQueues.delete(conversationId);
		},
	);
	return task;
}

async function recordReplayPulse(
	conversationId: string,
	pulse: Pulse,
) {
	const current = conversationPulses.get(conversationId) ?? [];

	const chat = await loadChat(conversationId);
	if (!chat) throw new Error("会话不存在。");

	if (chat.lastContainerId) {
		const lastContainer = await loadContainer(chat.lastContainerId);
		const lastMsg = lastContainer ? currentMessage(lastContainer) : null;
		if (
			lastContainer &&
			lastMsg &&
			lastContainer.role === "system" &&
			lastContainer.content.length === 1 &&
			!lastMsg.content &&
			!lastMsg.parts?.length &&
			!lastMsg.meta.steps.length &&
			!lastMsg.meta.intervalOperations?.length &&
			Array.isArray(lastMsg.meta?.pulses)
		) {
			const previous = lastMsg.meta.pulses;
			const merged = mergeContainerPulses(previous, pulse);
			const pulseIndex = current.map((item) => item.id).lastIndexOf(pulse.id);
			const start = pulseIndex - previous.length;
			if (
				start >= 0 &&
				previous.every((item, index) => current[start + index]?.id === item.id)
			) current.splice(start, previous.length + 1, ...clone(merged));
			lastMsg.meta.pulses = merged;
			conversationPulses.set(conversationId, current);
			chat.updatedAt = new Date().toISOString();
			await persistContainer(lastContainer);
			await persistChat(chat);
			return;
		}
	}
	const container = createContainer({
		conversationId,
		role: "system",
		content: "",
		previousContainer: chat.lastContainerId,
	});
	const message = currentMessage(container);
	if (!message) throw new Error("World 重放容器没有消息版本。");
	message.meta.pulses = [clone(pulse)];
	await persistContainer(container);
	if (chat.lastContainerId) {
		const parent = await loadContainer(chat.lastContainerId);
		if (parent) {
			parent.availableNextContainer.push(container.id);
			parent.activeNextContainer = container.id;
			await persistContainer(parent);
		}
	} else if (!chat.rootContainerId) {
		chat.rootContainerId = container.id;
	}
	chat.lastContainerId = container.id;
	chat.updatedAt = new Date().toISOString();
	await persistChat(chat);
}

export async function initializeWorlds(localPluginId?: string) {
	globalDocument = await ensureGlobalWorldDocument();
	if (localPluginId)
		localPluginDocuments.set(
			localPluginId,
			await ensureLocalPluginWorldDocument(localPluginId),
		);
	worldRevision.value += 1;
}

export function forgetLocalPluginWorld(localPluginId: string) {
	localPluginDocuments.delete(localPluginId);
	worldRevision.value += 1;
}

/** The only World composable. `applyReplay: false` exposes persistent source documents. */
export function useWorld(
	scope: MaybeRefOrGetter<WorldScope | string | null | undefined> = undefined,
) {
	const localPluginId = computed(() => {
		const value = normalizedScope(toValue(scope));
		return value.localPluginId ?? "";
	});
	const conversationId = computed(
		() => normalizedScope(toValue(scope)).conversationId ?? "",
	);
	const applyReplay = computed(
		() =>
			normalizedScope(toValue(scope)).applyReplay ??
			Boolean(conversationId.value),
	);
	const ready = computed(() => {
		worldRevision.value;
		return Boolean(
			globalDocument &&
				localPluginId.value &&
				localPluginDocuments.has(localPluginId.value),
		);
	});
	const world = computed<World | null>(() => {
		worldRevision.value;
		if (!globalDocument || !localPluginId.value) return null;
		const self = localPluginDocuments.get(localPluginId.value);
		if (!self) return null;
		const value: World = { global: clone(globalDocument), self: clone(self) };
		if (applyReplay.value && conversationId.value)
			applyPulses(value, activeReplayPulses(conversationId.value));
		const replay = normalizedScope(toValue(scope)).replay;
		if (replay?.message.meta.pulses?.length)
			applyPulses(value, replay.message.meta.pulses);
		return value;
	});
	const resources = computed(() => {
		const value = world.value;
		return value
			? [
					...walkFiles("global", value.global.root),
					...walkFiles("self", value.self.root),
				]
			: [];
	});
	const resourceOrder = (left: WorldResource, right: WorldResource) =>
		left.file.priority - right.file.priority ||
		(left.scope === "global" ? left.nodePath[2] ?? "" : localPluginId.value).localeCompare(
			right.scope === "global" ? right.nodePath[2] ?? "" : localPluginId.value,
		) || left.file.id.localeCompare(right.file.id);
	const slots = computed<WorldSlotView[]>(() => {
		const value = world.value;
		if (!value) return [];
		const definitions = globalSlotDefinitions(value);
		const locals = localSlotDefinitions(value);
		return definitions.map((slot) => {
			const allResources = resources.value
				.filter(
					(resource) =>
						globalSlotForResource(resource, definitions, locals)?.path ===
						slot.path,
				)
				.sort(resourceOrder);
			return {
				...slot,
				allResources,
				resources: selectedResources(slot, allResources),
			};
		});
	});
	const localSlots = computed<WorldLocalSlotView[]>(() => {
		const value = world.value;
		if (!value) return [];
		const definitions = localSlotDefinitions(value);
		return definitions.map((slot) => {
			const allResources = resources.value
				.filter((resource) => resource.file.slot === slot.path)
				.sort(resourceOrder);
			return {
				...slot,
				allResources,
				resources: allResources.filter((item) => item.file.resourceSelected),
			};
		});
	});
	const sources = computed<WorldSourceView[]>(() => {
		const value = world.value;
		if (!value) return [];
		return [
			{
				scope: "global",
				root: value.global.root,
				resources: resources.value.filter((item) => item.scope === "global"),
			},
			{
				scope: "self",
				root: value.self.root,
				resources: resources.value.filter((item) => item.scope === "self"),
			},
		];
	});

	function requireWorld() {
		const value = world.value;
		if (!value) throw new Error("World 尚未加载。");
		return value;
	}

	async function ensureLoaded() {
		if (
			!globalDocument ||
			!localPluginId.value ||
			!localPluginDocuments.has(localPluginId.value)
		)
			await initializeWorlds(localPluginId.value);
		return requireWorld();
	}

	async function commit(updates: WorldMutation[]) {
		if (!updates.length) return;
		const pulse = mutationsToPulse(requireWorld(), updates);
		applyPulses(clone(requireWorld()), [pulse]);
		if (applyReplay.value && conversationId.value) {
			const replay = normalizedScope(toValue(scope)).replay;
			if (replay) {
				replay.message.meta.pulses = mergeContainerPulses(
					replay.message.meta.pulses ?? [],
					pulse,
				);
				worldRevision.value += 1;
				await persistContainer(replay.container);
				return;
			}
			appendConversationPulse(conversationId.value, pulse);
			worldRevision.value += 1;
			await enqueueReplayPersistence(conversationId.value, pulse);
			return;
		}
		const self = localPluginDocuments.get(localPluginId.value);
		if (!globalDocument || !self) throw new Error("World 文档尚未加载。");
		const persistence = persistPulses({ global: globalDocument, self }, [pulse]);
		worldRevision.value += 1;
		await persistence;
	}

	async function update(
		nodeId: string,
		path: string[],
		value: WorldMutationValue,
		scopeName: "global" | "self",
	) {
		await commit([{ scope: scopeName, nodeId, path, value }]);
	}

	function resolve(path: string) {
		return resolveNode(requireWorld(), path);
	}

	function validateNodeName(name: string) {
		const normalized = name.trim();
		if (!normalized || /[\\/]/.test(normalized))
			throw new Error("文件名不能为空或包含路径分隔符。");
		return normalized;
	}

	async function createFolder(parentPath: string, name: string) {
		await ensureLoaded();
		const parent = resolve(parentPath);
		if (parent.node.type !== "folder")
			throw new Error(`父路径不是文件夹：${parentPath}`);
		const currentWorld = requireWorld();
		const slotRoot = resolveNode(currentWorld, "/self/slot").node;
		const selfIndex = createWorldNodeIndex(currentWorld.self);
		const isSlotFolder =
			parent.scope === "self" &&
			(parent.node.id === slotRoot.id ||
				selfIndex.get(parent.node.id)?.ancestors.has(slotRoot.id) === true);
		const folder = createWorldFolder(validateNodeName(name), {
			treeOrder: nextTreeOrder(parent.node),
			...(isSlotFolder && parent.node.selectionMode
				? { selectionMode: parent.node.selectionMode }
				: {}),
			...(isSlotFolder && parent.node.allowedResourceTypes
				? { allowedResourceTypes: [...parent.node.allowedResourceTypes] }
				: {}),
		});
		const newFolderPath = isSlotFolder
			? `${parent.path}/$${folder.id}`
			: `/${parent.scope}/$${folder.id}`;
		const updates: WorldMutation[] = [
			{
				scope: parent.scope,
				nodeId: parent.node.id,
				path: ["children", folder.id],
				value: { type: "value", value: folder },
			},
		];
		if (isSlotFolder && parent.node.id !== slotRoot.id) {
			// Migrate local slots and direct file slot assignments pointing to parent slot to the new child slot
			const parentSlotPath = `/self/slot/$${parent.node.id}`;
			for (const res of resources.value) {
				if (
					res.file.slot === parentSlotPath ||
					res.file.slot === parent.path ||
					res.file.slot === `/self/$${parent.node.id}`
				) {
					updates.push({
						scope: res.scope,
						nodeId: res.file.id,
						path: ["slot"],
						value: { type: "value", value: newFolderPath },
					});
				}
			}
			for (const lSlot of localSlots.value) {
				if (
					lSlot.parent === parentSlotPath ||
					lSlot.parent === parent.path ||
					lSlot.parent === `/self/$${parent.node.id}`
				) {
					const lSlotNode = resolve(lSlot.path).node;
					updates.push({
						scope: lSlot.scope,
						nodeId: lSlotNode.id,
						path: ["parent"],
						value: { type: "value", value: newFolderPath },
					});
				}
			}
		}
		await commit(updates);
		return newFolderPath;
	}

	async function createChildSlot(parentPath: string, name: string) {
		await ensureLoaded();
		const parent = resolve(parentPath);
		if (parent.scope !== "self" || parent.node.type !== "folder")
			throw new Error("子插槽必须创建在 /self/slot 中。");
		const definitions = globalSlotDefinitions(requireWorld());
		const parentSlot = definitions.find((slot) => slot.path === parent.path);
		if (!parentSlot) throw new Error(`不是插槽文件夹：${parentPath}`);

		const child = createWorldFolder(validateNodeName(name), {
			treeOrder: nextTreeOrder(parent.node),
			selectionMode: parentSlot.selectionMode,
			allowedResourceTypes: parentSlot.allowedResourceTypes.length
				? parentSlot.allowedResourceTypes
				: [
						"markdown",
						"chat",
						"data",
						"javascript",
						"json",
						"media",
						"component",
						"text",
					],
		});
		const locals = localSlotDefinitions(requireWorld());
		const assigned = resources.value.filter(
			(resource) =>
				globalSlotForResource(resource, definitions, locals)?.path ===
				parent.path,
		);
		const existingDefault = Object.values(parent.node.children).find(
			(node): node is WorldFolderNode =>
				node.type === "folder" && node.name === "默认",
		);
		const defaultSlot =
			assigned.length && !existingDefault
				? createWorldFolder("默认", {
						treeOrder: nextTreeOrder(parent.node) + 1,
						selectionMode: parentSlot.selectionMode,
						allowedResourceTypes: parentSlot.allowedResourceTypes,
					})
				: existingDefault;
		const defaultPath = defaultSlot
			? `${parent.path}/$${defaultSlot.id}`
			: undefined;
		const updates: WorldMutation[] = [
			{
				scope: parent.scope,
				nodeId: parent.node.id,
				path: ["children", child.id],
				value: { type: "value", value: child },
			},
		];
		if (defaultSlot && !existingDefault) {
			updates.push({
				scope: parent.scope,
				nodeId: parent.node.id,
				path: ["children", defaultSlot.id],
				value: { type: "value", value: defaultSlot },
			});
		}
		if (defaultPath) {
			const updatedLocals = new Set<string>();
			for (const resource of assigned) {
				const local = locals.find((slot) => slot.path === resource.file.slot);
				if (local && !updatedLocals.has(local.path)) {
					const node = resolve(local.path).node;
					updates.push({
						scope: local.scope,
						nodeId: node.id,
						path: ["parent"],
						value: { type: "value", value: defaultPath },
					});
					updatedLocals.add(local.path);
				} else if (resource.file.slot === parent.path) {
					updates.push({
						scope: resource.scope,
						nodeId: resource.file.id,
						path: ["slot"],
						value: { type: "value", value: defaultPath },
					});
				}
			}
		}
		await commit(updates);
		return `/${parent.scope}/$${child.id}`;
	}

	async function createFile(
		parentPath: string,
		name: string,
		content: unknown = "",
	) {
		await ensureLoaded();
		const parent = resolve(parentPath);
		if (parent.node.type !== "folder")
			throw new Error(`父路径不是文件夹：${parentPath}`);
		const file = createWorldFile(validateNodeName(name), content, {
			treeOrder: nextTreeOrder(parent.node),
		});
		await update(
			parent.node.id,
			["children", file.id],
			{ type: "value", value: file },
			parent.scope,
		);
		return `/${parent.scope}/$${file.id}`;
	}

	async function mkdir(path: string) {
		await ensureLoaded();
		const parts = requirePath(path);
		let cursor = `/${parts[0]}`;
		for (const name of parts.slice(1)) {
			const nextPath = `${cursor}/${name}`;
			try {
				const node = resolve(nextPath);
				if (node.node.type !== "folder")
					throw new Error(`父路径不是文件夹：${nextPath}`);
			} catch (error) {
				if (!(error instanceof Error) || !error.message.includes("路径不存在"))
					throw error;
				await createFolder(cursor, name);
			}
			cursor = nextPath;
		}
	}

	async function write(path: string, content: unknown) {
		await ensureLoaded();
		try {
			const target = resolve(path);
			if (target.node.type !== "file")
				throw new Error(`不能写入文件夹：${path}`);
			await commit([
				{
					scope: target.scope,
					nodeId: target.node.id,
					path: ["content"],
					value: { type: "value", value: content },
				},
			]);
			return;
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes("路径不存在"))
				throw error;
		}
		const parts = requirePath(path);
		const name = parts[parts.length - 1]!;
		const parentPath = `/${parts.slice(0, -1).join("/")}`;
		await createFile(parentPath, name, content);
	}

	async function edit(path: string, find: string, replace: string) {
		await ensureLoaded();
		const target = resolve(path);
		if (target.node.type !== "file" || typeof target.node.content !== "string")
			throw new Error(`edit 只支持文本资源：${path}`);
		await commit([
			{
				scope: target.scope,
				nodeId: target.node.id,
				path: ["content"],
				value: { type: "replace", find, replace },
			},
		]);
	}

	async function remove(path: string) {
		await ensureLoaded();
		const target = resolve(path);
		if (!target.parentPath) throw new Error("不能删除 World 根目录。");
		await commit([
			{
				scope: target.scope,
				nodeId: target.node.id,
				path: [],
				value: { type: "none" },
			},
		]);
	}

	function nextTreeOrder(folder: WorldFolderNode) {
		return (
			Math.max(
				-1,
				...Object.values(folder.children).map((node) => node.treeOrder),
			) + 1
		);
	}

	function copyIdMap(node: WorldNode, target: WorldDocument) {
		const existing = createWorldNodeIndex(target);
		const result: Record<string, string> = {};
		const assign = (current: WorldNode) => {
			let id = crypto.randomUUID();
			while (existing.has(id) || Object.values(result).includes(id))
				id = crypto.randomUUID();
			result[current.id] = id;
			if (current.type === "folder")
				for (const child of Object.values(current.children)) assign(child);
		};
		assign(node);
		return result;
	}

	function assertNotDescendant(
		source: ResolvedNode,
		target: ResolvedNode,
		action: "移动" | "复制",
	) {
		if (source.scope !== target.scope || source.node.type !== "folder") return;
		const targetLocation = createWorldNodeIndex(source.document).get(
			target.node.id,
		);
		if (
			target.node.id === source.node.id ||
			targetLocation?.ancestors.has(source.node.id)
		)
			throw new Error(`不能将文件夹${action}到自身或其子级。`);
	}

	async function moveTo(
		from: string,
		destinationParent: string,
		name?: string,
	) {
		await ensureLoaded();
		const source = resolve(from);
		const targetParent = resolve(destinationParent);
		if (!source.parent || !source.parentPath)
			throw new Error("不能移动 World 根目录。");
		if (targetParent.node.type !== "folder")
			throw new Error(`移动目标不是文件夹：${destinationParent}`);
		if (source.scope !== targetParent.scope)
			throw new Error("暂不支持跨 World 文档移动。");
		assertNotDescendant(source, targetParent, "移动");
		const nextName = name?.trim() || source.node.name;
		if (!nextName || /[\\/]/.test(nextName))
			throw new Error("文件名不能为空或包含路径分隔符。");
		if (source.parent.id === targetParent.node.id) {
			if (nextName === source.node.name) return;
			await commit([
				{
					scope: source.scope,
					nodeId: source.node.id,
					path: ["name"],
					value: { type: "value", value: nextName },
				},
			]);
			return;
		}
		await commit([
			{
				scope: source.scope,
				nodeId: source.node.id,
				path: ["name"],
				value: { type: "value", value: nextName },
			},
			{
				scope: source.scope,
				nodeId: source.node.id,
				path: ["treeOrder"],
				value: { type: "value", value: nextTreeOrder(targetParent.node) },
			},
			{
				scope: targetParent.scope,
				nodeId: targetParent.node.id,
				path: ["children", source.node.id],
				value: {
					type: "move",
					source: { scope: source.scope, id: source.node.id },
				},
			},
		]);
	}

	async function move(from: string, to: string) {
		const parts = requirePath(to);
		const name = parts.pop();
		if (!name) throw new Error("移动目标不能为空。");
		await moveTo(from, `/${parts.join("/")}`, name);
	}

	async function copy(from: string, destinationParent: string, name?: string) {
		await ensureLoaded();
		const source = resolve(from);
		const targetParent = resolve(destinationParent);
		if (!source.parentPath) throw new Error("不能复制 World 根目录。");
		if (targetParent.node.type !== "folder")
			throw new Error(`复制目标不是文件夹：${destinationParent}`);
		assertNotDescendant(source, targetParent, "复制");
		const nextName = name?.trim() || source.node.name;
		if (!nextName || /[\\/]/.test(nextName))
			throw new Error("文件名不能为空或包含路径分隔符。");
		const idMap = copyIdMap(source.node, targetParent.document);
		const id = idMap[source.node.id]!;
		await commit([
			{
				scope: targetParent.scope,
				nodeId: targetParent.node.id,
				path: ["children", id],
				value: {
					type: "copy",
					source: { scope: source.scope, id: source.node.id },
					idMap,
				},
			},
			{
				scope: targetParent.scope,
				nodeId: id,
				path: ["name"],
				value: { type: "value", value: nextName },
			},
			{
				scope: targetParent.scope,
				nodeId: id,
				path: ["treeOrder"],
				value: { type: "value", value: nextTreeOrder(targetParent.node) },
			},
		]);
		return `/${targetParent.scope}/$${id}`;
	}

	async function updateFile(
		path: string,
		patch: Partial<
			Pick<
				WorldFileNode,
				| "content"
				| "priority"
				| "slot"
				| "condition"
				| "conditionEnabled"
				| "resourceSelected"
				| "icon"
				| "name"
				| "treeOrder"
			>
		>,
	): Promise<void> {
		await ensureLoaded();
		const target = resolve(path);
		if (target.node.type !== "file") throw new Error(`不是文件：${path}`);
		const file = target.node;
		if (patch.resourceSelected === true && file.slot) {
			const slot = globalSlotForResource(
				resources.value.find((item) => item.file.id === file.id) ??
					({
						file,
					} as WorldResource),
				globalSlotDefinitions(requireWorld()),
				localSlotDefinitions(requireWorld()),
			);
			if (slot?.selectionMode === "single") {
				const { resourceSelected: _resourceSelected, ...remainingPatch } =
					patch;
				if (Object.keys(remainingPatch).length)
					await updateFile(path, remainingPatch);
				await setSelected(path, true);
				return;
			}
		}
		await commit([
			...Object.entries(patch).map(([key, value]) => ({
				scope: target.scope,
				nodeId: target.node.id,
				path: [key],
				value: { type: "value" as const, value },
			})),
		]);
	}

	async function updateFolder(
		path: string,
		patch: Partial<
			Pick<
				WorldFolderNode,
				| "name"
				| "icon"
				| "openIcon"
				| "description"
				| "treeOrder"
				| "selectionMode"
				| "allowedResourceTypes"
				| "parent"
			>
		>,
	) {
		await ensureLoaded();
		const target = resolve(path);
		if (target.node.type !== "folder") throw new Error(`不是文件夹：${path}`);
		await commit([
			...Object.entries(patch).map(([key, value]) => ({
				scope: target.scope,
				nodeId: target.node.id,
				path: [key],
				value: { type: "value" as const, value },
			})),
		]);
		if (patch.selectionMode === "single") {
			const selected = resources.value.find((resource) => {
				const slot = globalSlotForResource(
					resource,
					globalSlotDefinitions(requireWorld()),
					localSlotDefinitions(requireWorld()),
				);
				return slot?.path === path && resource.file.resourceSelected;
			});
			if (selected) await setSelected(selected.path, true);
		}
	}

	async function setSelected(path: string, selected: boolean): Promise<void> {
		await ensureLoaded();
		const target = resolve(path);
		if (target.node.type !== "file") throw new Error(`不是文件：${path}`);
		const definitions = globalSlotDefinitions(requireWorld());
		const locals = localSlotDefinitions(requireWorld());
		const slot = globalSlotForResource(
			resources.value.find((item) => item.file.id === target.node.id) ??
				({
					file: target.node,
				} as WorldResource),
			definitions,
			locals,
		);
		if (!selected || slot?.selectionMode !== "single") {
			await updateFile(path, { resourceSelected: selected });
			return;
		}

		const targetUpdate = target.node.resourceSelected
			? []
			: [
					{
						scope: target.scope,
						nodeId: target.node.id,
						path: ["resourceSelected"],
						value: { type: "value" as const, value: true },
					},
			  ];

		const otherUpdates = resources.value
			.filter(
				(resource) =>
					resource.file.id !== target.node.id &&
					resource.file.resourceSelected &&
					globalSlotForResource(
						resource,
						definitions,
						locals,
					)?.path === slot?.path,
			)
			.flatMap((resource) => [
				{
					scope: resource.scope,
					nodeId: resource.file.id,
					path: ["resourceSelected"],
					value: { type: "value" as const, value: false },
				},
			]);

		const updates = [...targetUpdate, ...otherUpdates];
		if (updates.length) await commit(updates);
	}

	async function assignResourceToSlot(
		resourcePath: string,
		slotPath: string,
	): Promise<void> {
		await updateFile(resourcePath, { slot: slotPath });
	}

	function read(path: string) {
		const node = resolve(path).node;
		if (node.type !== "file") throw new Error(`不能读取文件夹：${path}`);
		return typeof node.content === "string"
			? node.content
			: JSON.stringify(node.content ?? null, null, 2);
	}

	function importResource(
		path: string | string[],
		environment: ResourceImportEnvironment = {},
	): unknown | Promise<unknown> {
		if (Array.isArray(path)) {
			const values = path.map((item) => importResource(item, environment));
			return values.some((value) => value instanceof Promise)
				? Promise.all(values).then((items) => items.flat())
				: values.flat();
		}
		const node = resolve(path).node;
		if (node.type !== "file") throw new Error(`不能导入文件夹：${path}`);
		return wrapResource(node).import(environment);
	}

	function bind(container: ChatMessageContainer, message: ChatMessage) {
		const value = clone(requireWorld());
		const apply = async (pulses: Pulse[]) => {
			applyPulses(value, pulses);
			message.meta.pulses = pulses.reduce(
				(existing, pulse) => mergeContainerPulses(existing, pulse),
				message.meta.pulses ?? [],
			);
			await persistContainer(container);
		};
		return { world: value, apply };
	}

	const customTypes = computed(() => {
		if (!world.value) return [];
		return customTypeSuffixes(collectTypeContracts(world.value.self.root));
	});

	/** Assigns a resource to a global leaf slot, creating this source's local contribution when needed. */
	async function assignSlot(path: string, globalSlotPath?: string) {
		await ensureLoaded();
		if (!globalSlotPath) {
			await updateFile(path, { slot: undefined });
			return;
		}

		const target = resolve(path);
		if (target.node.type !== "file") throw new Error(`不是文件：${path}`);
		const definitions = globalSlotDefinitions(requireWorld());
		const slot = definitions.find((item) => item.path === globalSlotPath);
		if (!slot || slot.hasChildren)
			throw new Error(`不是可分配的插槽：${globalSlotPath}`);
		const fileType = worldFileType(target.node.name, customTypes.value);
		if (
			!slot.allowedResourceTypes.includes(fileType) &&
			!customTypes.value.includes(fileType)
		)
			throw new Error(`资源类型不属于插槽：${slot.name}`);

		const sourceRoot =
			target.scope === "self"
				? target.document.root
				: target.document.root.children[target.nodePath[2] ?? ""];
		if (!sourceRoot || sourceRoot.type !== "folder")
			throw new Error("资源所属源不存在。");
		const localRoot = Object.values(sourceRoot.children).find(
			(node): node is WorldFolderNode =>
				node.type === "folder" && node.name === "localSlot",
		);
		if (!localRoot) throw new Error("资源所属源缺少 localSlot 文件夹。");

		const locals = localSlotDefinitions(requireWorld());
		const sourcePrefix =
			target.scope === "self" ? "/self" : `/global/$${sourceRoot.id}`;
		const local = locals.find(
			(item) =>
				item.parent === slot.path &&
				item.path.startsWith(`${sourcePrefix}/$${localRoot.id}/`),
		);
		if (local) {
			await updateFile(path, { slot: local.path });
			return;
		}

		const contribution = createWorldFolder(slot.name, {
			parent: slot.path,
			treeOrder: nextTreeOrder(localRoot),
		});
		const localPath = `${sourcePrefix}/$${localRoot.id}/$${contribution.id}`;
		await commit([
			{
				scope: target.scope,
				nodeId: localRoot.id,
				path: ["children", contribution.id],
				value: { type: "value" as const, value: contribution },
			},
			{
				scope: target.scope,
				nodeId: target.node.id,
				path: ["slot"],
				value: { type: "value" as const, value: localPath },
			},
		]);
	}

	return {
		localPluginId,
		conversationId,
		applyReplay,
		ready,
		world,
		resources,
		slots,
		localSlots,
		sources,
		customTypes,
		resolve,
		read,
		import: importResource,
		parse: importResource,
		ls: (path = "/") => {
			if (path === "/")
				return [
					{
						id: "global",
						name: "global",
						type: "folder" as const,
						path: "/global",
					},
					{ id: "self", name: "self", type: "folder" as const, path: "/self" },
				];
			const node = resolve(path).node;
			return node.type === "folder"
				? Object.values(node.children).map((child) => ({
						id: child.id,
						name: child.name,
						type: child.type,
					}))
				: [];
		},
		exists: (path: string) => {
			try {
				resolve(path);
				return true;
			} catch (error) {
				return (
					error instanceof Error && error.message.includes("World 路径不明确")
				);
			}
		},
		write,
		edit,
		mkdir,
		createFile,
		createFolder,
		createChildSlot,
		move,
		moveTo,
		copy,
		remove,
		updateFile,
		updateFolder,
		assignSlot,
		assignResourceToSlot,
		setSelected,
		open: (path: string) => setSelected(path, true),
		close: (path: string) => setSelected(path, false),
		toggle: (path: string) => {
			const node = resolve(path).node;
			if (node.type !== "file") throw new Error(`不能切换文件夹：${path}`);
			return setSelected(path, !node.resourceSelected);
		},
		bind,
		worldFileType,
	};
}
