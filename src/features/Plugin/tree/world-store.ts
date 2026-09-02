import { computed, type MaybeRefOrGetter, ref, toRaw, toValue } from "vue";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import type {
	ChatMessage,
	ChatMessageContainer,
} from "@/features/Conversation/messages/conversation-types";
import { useMessageStore } from "@/features/Conversation/messages/message-store";
import {
	type ResourceImportEnvironment,
	wrapResource,
} from "@/features/Plugin/resources/resource-wrapper";
import {
	ensureGlobalWorldDocument,
	ensurePackageWorldDocument,
	persistWorldUpdates,
} from "./world-persistence";
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
	applyWorldUpdates,
	createWorldNodeIndex,
	type WorldUpdate,
	worldNone,
} from "./world-update";

export interface WorldScope {
	packageId?: string | null;
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
const packageDocuments = new Map<string, WorldDocument>();
const worldRevision = ref(0);

function clone<T>(value: T) {
	return structuredClone(toRaw(value));
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
		return Object.values(node.children)
			.filter((child): child is WorldFolderNode => child.type === "folder")
			.map((slot) => ({
				id: slot.id,
				path: `/self/slot/$${slot.id}`,
				name: slot.name,
				...(slot.icon ? { icon: slot.icon } : {}),
				...(slot.description ? { description: slot.description } : {}),
				allowedResourceTypes: slot.allowedResourceTypes ?? [],
				selectionMode: slot.selectionMode ?? "multiple",
			}));
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
	return globalSlots.find(
		(slot) => slot.path === (localSlot?.parent ?? resource.file.slot),
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

function activeReplayUpdates(conversationId: string) {
	const chat = useChatStore().chats.find((item) => item.id === conversationId);
	if (!chat) return [] as WorldUpdate[];
	return useMessageStore()
		.pathFor(chat.lastContainerId)
		.flatMap((container) => {
			const message =
				container.activeMessage === null
					? null
					: container.content[container.activeMessage];
			return message?.meta.worldUpdates ?? [];
		});
}

async function recordReplayUpdates(
	conversationId: string,
	updates: WorldUpdate[],
) {
	const chats = useChatStore();
	const messages = useMessageStore();
	const chat = chats.chats.find((item) => item.id === conversationId);
	if (!chat) throw new Error("会话不存在。");
	const container = await messages.append({
		conversationId,
		role: "system",
		content: "",
		previousContainer: chat.lastContainerId,
		hidden: true,
	});
	chat.lastContainerId = container.id;
	chat.updatedAt = new Date().toISOString();
	await chats.persist(chat);
	const message = messages.currentMessage(container);
	if (!message) throw new Error("World 重放容器没有消息版本。");
	message.meta.worldUpdates = clone(updates);
	await messages.persist(container);
}

export async function initializeWorlds(packageId?: string) {
	globalDocument = await ensureGlobalWorldDocument();
	if (packageId)
		packageDocuments.set(
			packageId,
			await ensurePackageWorldDocument(packageId),
		);
	worldRevision.value += 1;
}

export function forgetPackageWorld(packageId: string) {
	packageDocuments.delete(packageId);
	worldRevision.value += 1;
}

/** The only World composable. `applyReplay: false` exposes persistent source documents. */
export function useWorld(
	scope: MaybeRefOrGetter<WorldScope | string | null | undefined> = undefined,
) {
	const packageId = computed(() => {
		const value = normalizedScope(toValue(scope));
		return (
			value.packageId ??
			useChatStore().chats.find((item) => item.id === value.conversationId)
				?.packageId ??
			""
		);
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
				packageId.value &&
				packageDocuments.has(packageId.value),
		);
	});
	const world = computed<World | null>(() => {
		worldRevision.value;
		if (!globalDocument || !packageId.value) return null;
		const self = packageDocuments.get(packageId.value);
		if (!self) return null;
		const value: World = { global: clone(globalDocument), self: clone(self) };
		if (applyReplay.value && conversationId.value)
			applyWorldUpdates(value, activeReplayUpdates(conversationId.value));
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
				.sort(
					(left, right) =>
						left.file.priority - right.file.priority ||
						left.file.id.localeCompare(right.file.id),
				);
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
				.sort(
					(left, right) =>
						left.file.priority - right.file.priority ||
						left.file.id.localeCompare(right.file.id),
				);
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
			!packageId.value ||
			!packageDocuments.has(packageId.value)
		)
			await initializeWorlds(packageId.value);
		return requireWorld();
	}

	async function commit(updates: WorldUpdate[]) {
		if (!updates.length) return;
		if (applyReplay.value && conversationId.value) {
			const replay = normalizedScope(toValue(scope)).replay;
			if (replay) {
				replay.message.meta.worldUpdates ??= [];
				replay.message.meta.worldUpdates.push(...clone(updates));
				await useMessageStore().persist(replay.container);
				worldRevision.value += 1;
				return;
			}
			await recordReplayUpdates(conversationId.value, updates);
			worldRevision.value += 1;
			return;
		}
		const self = packageDocuments.get(packageId.value);
		if (!globalDocument || !self) throw new Error("World 文档尚未加载。");
		await persistWorldUpdates({ global: globalDocument, self }, updates);
		worldRevision.value += 1;
	}

	async function update(
		nodeId: string,
		path: string[],
		value: WorldUpdate["value"],
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
		const folder = createWorldFolder(validateNodeName(name), {
			treeOrder: nextTreeOrder(parent.node),
		});
		await update(
			parent.node.id,
			["children", folder.id],
			{ type: "value", value: folder },
			parent.scope,
		);
		return `/${parent.scope}/$${folder.id}`;
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
			const changedAt = new Date().toISOString();
			await commit([
				{
					scope: target.scope,
					nodeId: target.node.id,
					path: ["content"],
					value: { type: "value", value: content },
				},
				{
					scope: target.scope,
					nodeId: target.node.id,
					path: ["updateDate"],
					value: { type: "value", value: changedAt },
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
			{
				scope: target.scope,
				nodeId: target.node.id,
				path: ["updateDate"],
				value: { type: "value", value: new Date().toISOString() },
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
				value: worldNone,
			},
			{
				scope: target.scope,
				nodeId: target.parent!.id,
				path: ["updateDate"],
				value: { type: "value", value: new Date().toISOString() },
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
				{
					scope: source.scope,
					nodeId: source.node.id,
					path: ["updateDate"],
					value: { type: "value", value: new Date().toISOString() },
				},
			]);
			return;
		}
		const changedAt = new Date().toISOString();
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
				scope: source.scope,
				nodeId: source.node.id,
				path: ["updateDate"],
				value: { type: "value", value: changedAt },
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
		const changedAt = new Date().toISOString();
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
			{
				scope: targetParent.scope,
				nodeId: id,
				path: ["updateDate"],
				value: { type: "value", value: changedAt },
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
		const changedAt = new Date().toISOString();
		await commit([
			...Object.entries(patch).map(([key, value]) => ({
				scope: target.scope,
				nodeId: target.node.id,
				path: [key],
				value: { type: "value" as const, value },
			})),
			{
				scope: target.scope,
				nodeId: target.node.id,
				path: ["updateDate"],
				value: { type: "value" as const, value: changedAt },
			},
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
			>
		>,
	) {
		await ensureLoaded();
		const target = resolve(path);
		if (target.node.type !== "folder") throw new Error(`不是文件夹：${path}`);
		const changedAt = new Date().toISOString();
		await commit([
			...Object.entries(patch).map(([key, value]) => ({
				scope: target.scope,
				nodeId: target.node.id,
				path: [key],
				value: { type: "value" as const, value },
			})),
			{
				scope: target.scope,
				nodeId: target.node.id,
				path: ["updateDate"],
				value: { type: "value" as const, value: changedAt },
			},
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
		const slot = globalSlotForResource(
			resources.value.find((item) => item.file.id === target.node.id) ??
				({
					file: target.node,
				} as WorldResource),
			globalSlotDefinitions(requireWorld()),
			localSlotDefinitions(requireWorld()),
		);
		if (!selected || slot?.selectionMode !== "single") {
			await updateFile(path, { resourceSelected: selected });
			return;
		}

		const changedAt = new Date().toISOString();
		const updates = resources.value
			.filter(
				(resource) =>
					globalSlotForResource(
						resource,
						globalSlotDefinitions(requireWorld()),
						localSlotDefinitions(requireWorld()),
					)?.path === slot?.path,
			)
			.flatMap((resource) => {
				const resourceSelected = resource.path === target.path;
				if (resource.file.resourceSelected === resourceSelected) return [];
				return [
					{
						scope: resource.scope,
						nodeId: resource.file.id,
						path: ["resourceSelected"],
						value: { type: "value" as const, value: resourceSelected },
					},
					{
						scope: resource.scope,
						nodeId: resource.file.id,
						path: ["updateDate"],
						value: { type: "value" as const, value: changedAt },
					},
				];
			});
		if (updates.length) await commit(updates);
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
		const apply = async (updates: WorldUpdate[]) => {
			applyWorldUpdates(value, updates);
			message.meta.worldUpdates ??= [];
			message.meta.worldUpdates.push(...clone(updates));
			await useMessageStore().persist(container);
		};
		return { world: value, apply };
	}

	return {
		packageId,
		conversationId,
		applyReplay,
		ready,
		world,
		resources,
		slots,
		localSlots,
		sources,
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
		move,
		moveTo,
		copy,
		remove,
		updateFile,
		updateFolder,
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
