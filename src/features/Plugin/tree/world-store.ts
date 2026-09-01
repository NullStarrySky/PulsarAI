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
	persistWorldUpdate,
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
import { applyWorldUpdate, type WorldUpdate, worldNone } from "./world-update";

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
	path: string;
	/** The top-level global folder, or the local-world label. */
	sourceName: string;
	nodePath: string[];
	file: WorldFileNode;
}

export interface WorldSlotView {
	path: string;
	name: string;
	icon?: string;
	description?: string;
	allowedResourceTypes: WorldFileType[];
	selectionMode: WorldSlotSelectionMode;
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

function nodeByName(folder: WorldFolderNode, name: string) {
	return (
		folder.children[name] ??
		Object.values(folder.children).find((child) => child.name === name) ??
		null
	);
}

function resolveNode(world: World, path: string): ResolvedNode {
	const parts = requirePath(path);
	const scope = parts[0] as "global" | "self";
	const document = world[scope];
	let node: WorldNode = document.root;
	let nodePath = ["root"];
	let parent: WorldFolderNode | null = null;
	let parentPath: string[] | null = null;
	for (const segment of parts.slice(1)) {
		if (node.type !== "folder")
			throw new Error(`World 路径的父节点不是文件夹：${path}`);
		const child = nodeByName(node, segment);
		if (!child) throw new Error(`World 路径不存在：${path}`);
		parent = node;
		parentPath = nodePath;
		node = child;
		nodePath = [...nodePath, "children", child.id];
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
): WorldResource[] {
	return Object.values(folder.children).flatMap((node) => {
		const path = [...names, node.name];
		const pathToNode = [...nodePath, "children", node.id];
		if (node.type === "file") {
			return [
				{
					scope,
					path: `/${scope}/${path.join("/")}`,
					sourceName: scope === "self" ? "本地" : (names[0] ?? "全局"),
					nodePath: pathToNode,
					file: node,
				},
			];
		}
		return walkFiles(scope, node, path, pathToNode);
	});
}

function slotDefinitions(
	world: World,
): Omit<WorldSlotView, "allResources" | "resources">[] {
	try {
		const node = resolveNode(world, "/self/slot").node;
		if (node.type !== "folder") return [];
		return Object.values(node.children)
			.filter((child): child is WorldFolderNode => child.type === "folder")
			.map((slot) => ({
				path: `/self/slot/${slot.name}`,
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
		if (applyReplay.value && conversationId.value) {
			for (const update of activeReplayUpdates(conversationId.value))
				applyWorldUpdate(value[update.scope], update);
		}
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
		return slotDefinitions(value).map((slot) => {
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
				resources: selectedResources(slot, allResources),
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
		for (const update of updates) {
			const document =
				update.scope === "global"
					? globalDocument
					: packageDocuments.get(packageId.value);
			if (!document) throw new Error("World 文档尚未加载。");
			await persistWorldUpdate(document, update);
		}
		worldRevision.value += 1;
	}

	async function update(
		path: string[],
		value: WorldUpdate["value"],
		scopeName: "global" | "self",
	) {
		await commit([{ scope: scopeName, path, value }]);
	}

	function resolve(path: string) {
		return resolveNode(requireWorld(), path);
	}

	async function mkdir(path: string) {
		await ensureLoaded();
		const parts = requirePath(path);
		const scopeName = parts[0] as "global" | "self";
		let cursor = `/${scopeName}`;
		for (const name of parts.slice(1)) {
			const nextPath = `${cursor}/${name}`;
			try {
				const node = resolve(nextPath);
				if (node.node.type !== "folder")
					throw new Error(`父路径不是文件夹：${nextPath}`);
			} catch (error) {
				if (!(error instanceof Error) || !error.message.includes("路径不存在"))
					throw error;
				const parent = resolve(cursor);
				if (parent.node.type !== "folder")
					throw new Error(`父路径不是文件夹：${cursor}`);
				const folder = createWorldFolder(name, {
					treeOrder: Object.keys(parent.node.children).length,
				});
				await update(
					[...parent.nodePath, "children", folder.id],
					{ type: "value", value: folder },
					scopeName,
				);
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
					path: [...target.nodePath, "content"],
					value: { type: "value", value: content },
				},
				{
					scope: target.scope,
					path: [...target.nodePath, "updateDate"],
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
		const parent = resolve(parentPath);
		if (parent.node.type !== "folder")
			throw new Error(`父路径不是文件夹：${parentPath}`);
		const file = createWorldFile(name, content, {
			treeOrder: Object.keys(parent.node.children).length,
		});
		await update(
			[...parent.nodePath, "children", file.id],
			{ type: "value", value: file },
			parent.scope,
		);
	}

	async function edit(path: string, find: string, replace: string) {
		await ensureLoaded();
		const target = resolve(path);
		if (target.node.type !== "file" || typeof target.node.content !== "string")
			throw new Error(`edit 只支持文本资源：${path}`);
		await commit([
			{
				scope: target.scope,
				path: [...target.nodePath, "content"],
				value: { type: "replace", find, replace },
			},
			{
				scope: target.scope,
				path: [...target.nodePath, "updateDate"],
				value: { type: "value", value: new Date().toISOString() },
			},
		]);
	}

	async function remove(path: string) {
		await ensureLoaded();
		const target = resolve(path);
		if (!target.parentPath) throw new Error("不能删除 World 根目录。");
		await commit([
			{ scope: target.scope, path: target.nodePath, value: worldNone },
			{
				scope: target.scope,
				path: [...target.parentPath, "updateDate"],
				value: { type: "value", value: new Date().toISOString() },
			},
		]);
	}

	async function move(from: string, to: string) {
		await ensureLoaded();
		const source = resolve(from);
		if (!source.parentPath) throw new Error("不能移动 World 根目录。");
		const parts = requirePath(to);
		const name = parts[parts.length - 1]!;
		const targetParent = resolve(`/${parts.slice(0, -1).join("/")}`);
		if (targetParent.node.type !== "folder")
			throw new Error(`移动目标不是文件夹：${to}`);
		if (nodeByName(targetParent.node, name))
			throw new Error(`移动目标已存在：${to}`);
		const node = clone(source.node);
		node.name = name;
		node.updateDate = new Date().toISOString();
		await commit([
			{ scope: source.scope, path: source.nodePath, value: worldNone },
			{
				scope: targetParent.scope,
				path: [...targetParent.nodePath, "children", node.id],
				value: { type: "value", value: node },
			},
		]);
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
			const slot = slotDefinitions(requireWorld()).find(
				(item) => item.path === file.slot,
			);
			if (slot?.selectionMode === "single") {
				const { resourceSelected: _resourceSelected, ...remainingPatch } = patch;
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
				path: [...target.nodePath, key],
				value: { type: "value" as const, value },
			})),
			{
				scope: target.scope,
				path: [...target.nodePath, "updateDate"],
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
				path: [...target.nodePath, key],
				value: { type: "value" as const, value },
			})),
			{
				scope: target.scope,
				path: [...target.nodePath, "updateDate"],
				value: { type: "value" as const, value: changedAt },
			},
		]);
		if (patch.selectionMode === "single") {
			const selected = resources.value.find(
				(resource) =>
					resource.file.slot === path && resource.file.resourceSelected,
			);
			if (selected) await setSelected(selected.path, true);
		}
	}

	async function setSelected(path: string, selected: boolean): Promise<void> {
		await ensureLoaded();
		const target = resolve(path);
		if (target.node.type !== "file") throw new Error(`不是文件：${path}`);
		const slotPath = target.node.slot;
		const slot = slotPath
			? slotDefinitions(requireWorld()).find((item) => item.path === slotPath)
			: undefined;
		if (!selected || slot?.selectionMode !== "single") {
			await updateFile(path, { resourceSelected: selected });
			return;
		}

		const changedAt = new Date().toISOString();
		const updates = resources.value
			.filter((resource) => resource.file.slot === slotPath)
			.flatMap((resource) => {
				const resourceSelected = resource.path === target.path;
				if (resource.file.resourceSelected === resourceSelected) return [];
				return [
					{
						scope: resource.scope,
						path: [...resource.nodePath, "resourceSelected"],
						value: { type: "value" as const, value: resourceSelected },
					},
					{
						scope: resource.scope,
						path: [...resource.nodePath, "updateDate"],
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
			for (const item of updates) applyWorldUpdate(value[item.scope], item);
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
			} catch {
				return false;
			}
		},
		write,
		edit,
		mkdir,
		move,
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
