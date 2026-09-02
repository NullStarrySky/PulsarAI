import { toRaw } from "vue";
import type {
	World,
	WorldDocument,
	WorldFolderNode,
	WorldNode,
} from "./world-types";

export type WorldScopeName = "global" | "self";

export interface WorldNodeRef {
	scope: WorldScopeName;
	id: string;
}

export const worldNone = { type: "none" } as const;

type WorldUpdateValue =
	| typeof worldNone
	| { type: "replace"; find: string; replace: string }
	| { type: "value"; value: unknown }
	| { type: "copy"; source: WorldNodeRef; idMap: Record<string, string> }
	| { type: "move"; source: WorldNodeRef };

/** A replay update addresses one stable node ID plus a short path below it. */
export interface WorldUpdate {
	scope: WorldScopeName;
	nodeId: string;
	/** `[]` addresses the node; `["children", childId]` creates a child. */
	path: string[];
	value: WorldUpdateValue;
}

export interface WorldJsonPatch {
	op: "add" | "replace" | "remove";
	path: string;
	value?: unknown;
}

export interface ResolvedWorldUpdate {
	scope: WorldScopeName;
	path: string[];
	value: Exclude<WorldUpdateValue, { type: "copy" } | { type: "move" }>;
}

type WorldNodeLocation = {
	node: WorldNode;
	parent: WorldFolderNode | null;
	path: string[];
	ancestors: Set<string>;
};

export type WorldNodeIndex = Map<string, WorldNodeLocation>;
export type WorldIndexes = Record<WorldScopeName, WorldNodeIndex>;

function clone<T>(value: T): T {
	return structuredClone(toRaw(value));
}

function isContainer(
	value: unknown,
): value is Record<string, unknown> | unknown[] {
	return Boolean(value && typeof value === "object");
}

function parentAt(root: unknown, path: string[]) {
	if (!path.length) throw new Error("World update 路径不能为空。");
	let current = root as Record<string, unknown> | unknown[];
	for (const part of path.slice(0, -1)) {
		const next = Array.isArray(current) ? current[Number(part)] : current[part];
		if (!isContainer(next))
			throw new Error(`World update 路径不存在：/${path.join("/")}`);
		current = next;
	}
	return { parent: current, key: path[path.length - 1]! };
}

export function valueAt(root: unknown, path: string[]) {
	let current = root as unknown;
	for (const part of path) {
		if (!isContainer(current)) return undefined;
		current = Array.isArray(current) ? current[Number(part)] : current[part];
	}
	return current;
}

function escapedPointer(path: string[]) {
	return `/${path.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
}

export function createWorldNodeIndex(document: WorldDocument): WorldNodeIndex {
	const index: WorldNodeIndex = new Map();
	const visit = (
		node: WorldNode,
		parent: WorldFolderNode | null,
		path: string[],
		ancestors: Set<string>,
	) => {
		if (index.has(node.id))
			throw new Error(`World 节点 ID 重复：${node.id}`);
		index.set(node.id, { node, parent, path, ancestors });
		if (node.type !== "folder") return;
		const nextAncestors = new Set(ancestors).add(node.id);
		for (const child of Object.values(node.children))
			visit(child, node, [...path, "children", child.id], nextAncestors);
	};
	visit(document.root, null, ["root"], new Set());
	return index;
}

export function createWorldIndexes(world: World): WorldIndexes {
	return {
		global: createWorldNodeIndex(world.global),
		self: createWorldNodeIndex(world.self),
	};
}

function copyNode(node: WorldNode, idMap: Record<string, string>): WorldNode {
	const id = idMap[node.id];
	if (!id) throw new Error(`复制缺少节点 ID 映射：${node.id}`);
	if (node.type === "file") return { ...clone(node), id };
	const children = Object.fromEntries(
		Object.values(node.children).map((child) => {
			const copied = copyNode(child, idMap);
			return [copied.id, copied];
		}),
	);
	return { ...clone(node), id, children };
}

function resolveValue(
	indexes: WorldIndexes,
	value: WorldUpdateValue,
): Exclude<WorldUpdateValue, { type: "copy" } | { type: "move" }> {
	if (value.type === "move")
		throw new Error("move 更新必须作为独立的 World 操作处理。");
	if (value.type !== "copy") return value;
	const source = indexes[value.source.scope].get(value.source.id);
	if (!source)
		throw new Error(`复制源节点不存在：$${value.source.id}`);
	return { type: "value", value: copyNode(source.node, value.idMap) };
}

export function resolveWorldMoveUpdates(
	world: World,
	update: WorldUpdate,
	indexes = createWorldIndexes(world),
): ResolvedWorldUpdate[] {
	if (update.value.type !== "move")
		throw new Error("不是 move World 更新。");
	if (update.scope !== update.value.source.scope)
		throw new Error("暂不支持跨 World 文档移动。");
	const target = indexes[update.scope].get(update.nodeId);
	const source = indexes[update.scope].get(update.value.source.id);
	if (!target || !source || target.node.type !== "folder" || !source.parent)
		throw new Error("移动节点或目标文件夹不存在。");
	if (target.node.id === source.node.id || target.ancestors.has(source.node.id))
		throw new Error("不能将文件夹移动到自身或其子级。");
	return [
		{
			scope: update.scope,
			path: [...target.path, ...update.path],
			value: { type: "value", value: clone(source.node) },
		},
		{ scope: update.scope, path: source.path, value: worldNone },
	];
}

export function resolveWorldUpdate(
	world: World,
	update: WorldUpdate,
	indexes = createWorldIndexes(world),
): ResolvedWorldUpdate {
	const target = indexes[update.scope].get(update.nodeId);
	if (!target)
		throw new Error(`World 节点不存在：$${update.nodeId}`);
	return {
		scope: update.scope,
		path: [...target.path, ...update.path],
		value: resolveValue(indexes, update.value),
	};
}

function applyResolvedWorldUpdate(
	document: WorldDocument,
	update: Omit<ResolvedWorldUpdate, "scope">,
): WorldDocument {
	const { parent, key } = parentAt(document, update.path);
	if (update.value.type === "none") {
		if (Array.isArray(parent)) parent.splice(Number(key), 1);
		else delete parent[key];
		return document;
	}
	if (update.value.type === "replace") {
		const source = valueAt(document, update.path);
		if (typeof source !== "string" || !source.includes(update.value.find))
			throw new Error(`World 文本替换失败：/${update.path.join("/")}`);
		const next = source.replace(update.value.find, update.value.replace);
		if (Array.isArray(parent)) parent[Number(key)] = next;
		else parent[key] = next;
		return document;
	}
	if (Array.isArray(parent)) parent[Number(key)] = clone(update.value.value);
	else parent[key] = clone(update.value.value);
	return document;
}

function changesTree(path: string[]) {
	return path.length === 1 || path.includes("children");
}

/** Applies one compact update to a complete World. */
export function applyWorldUpdate(
	world: World,
	update: WorldUpdate,
	indexes = createWorldIndexes(world),
): World {
	if (update.value.type === "move") {
		if (update.scope !== update.value.source.scope)
			throw new Error("暂不支持跨 World 文档移动。");
		const target = indexes[update.scope].get(update.nodeId);
		const source = indexes[update.scope].get(update.value.source.id);
		if (!target || !source || target.node.type !== "folder" || !source.parent)
			throw new Error("移动节点或目标文件夹不存在。");
		if (target.node.id === source.node.id || target.ancestors.has(source.node.id))
			throw new Error("不能将文件夹移动到自身或其子级。");
		if (
			update.path.length !== 2 ||
			update.path[0] !== "children" ||
			update.path[1] !== source.node.id
		)
			throw new Error("move 更新目标必须是目标文件夹的节点键。");
		delete source.parent.children[source.node.id];
		target.node.children[source.node.id] = source.node;
		indexes[update.scope] = createWorldNodeIndex(world[update.scope]);
		return world;
	}
	const resolved = resolveWorldUpdate(world, update, indexes);
	applyResolvedWorldUpdate(world[resolved.scope], resolved);
	if (changesTree(resolved.path))
		indexes[resolved.scope] = createWorldNodeIndex(world[resolved.scope]);
	return world;
}

/** Applies ordered replay updates while maintaining one node index per document. */
export function applyWorldUpdates(world: World, updates: WorldUpdate[]): World {
	const indexes = createWorldIndexes(world);
	for (const update of updates) applyWorldUpdate(world, update, indexes);
	return world;
}

/** Converts one resolved World update into the SurrealDB JSON patch for `record.value`. */
export function worldUpdatePatch(
	documentPath: string[],
	update: Omit<ResolvedWorldUpdate, "scope">,
	current: unknown,
): WorldJsonPatch {
	const path = [...documentPath, ...update.path];
	if (update.value.type === "none")
		return { op: "remove", path: escapedPointer(path) };
	if (update.value.type === "replace") {
		if (typeof current !== "string" || !current.includes(update.value.find))
			throw new Error(`World 文本替换失败：/${update.path.join("/")}`);
		return {
			op: "replace",
			path: escapedPointer(path),
			value: current.replace(update.value.find, update.value.replace),
		};
	}
	return {
		op: current === undefined ? "add" : "replace",
		path: escapedPointer(path),
		value: clone(update.value.value),
	};
}
