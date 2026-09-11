import { toRaw } from "vue";
import {
	defaultFileMeta,
	defaultFolderMeta,
	type FileMeta,
	type FolderMeta,
	type PluginData,
	type Pulse,
	type ResourceMeta,
	type ResourceNode,
	type ResourcePath,
	type ResourceTree,
} from "./types";

type ResolvedNode = {
	node: ResourceNode;
	parent: ResourceTree | null;
	name: string | null;
	path: ResourcePath;
};

function own<T extends object>(value: T, key: PropertyKey) {
	return Object.hasOwn(value, key);
}

function set<T>(target: Record<string, T>, key: string, value: T) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}

export function normalizeResourcePath(path: string): ResourcePath {
	const source = path.trim();
	if (!source.startsWith("/"))
		throw new Error(`资源路径必须以 / 开头：${path}`);
	const parts = source.split("/").filter(Boolean);
	if (parts.some((part) => part === "." || part === ".."))
		throw new Error(`资源路径不能包含 . 或 ..：${path}`);
	return parts.length ? `/${parts.join("/")}` : "/";
}

export type PluginPath =
	| { scope: "local"; path: ResourcePath }
	| { scope: "global"; pluginId: string; path: ResourcePath };

/** `/x` belongs to the local source; `/global/<pluginId>/x` addresses one global source. */
export function parsePluginPath(path: string): PluginPath {
	const normalized = normalizeResourcePath(path);
	const parts = normalized.slice(1).split("/").filter(Boolean);
	if (parts[0] !== "global") return { scope: "local", path: normalized };
	const pluginId = parts[1];
	if (!pluginId) throw new Error(`全局资源路径缺少 Plugin ID：${path}`);
	return {
		scope: "global",
		pluginId,
		path: parts.length > 2 ? `/${parts.slice(2).join("/")}` : "/",
	};
}

/** Resolves authored `@/` and relative references without leaking global mount prefixes into source text. */
export function resolveResourcePath(sourcePath: ResourcePath, request: string) {
	if (request.startsWith("/")) return normalizeResourcePath(request);
	const source = parsePluginPath(sourcePath);
	const root = source.scope === "local" ? "" : `/global/${source.pluginId}`;
	if (request.startsWith("@/"))
		return normalizeResourcePath(`${root}/${request.slice(2)}`);
	const parent = sourcePath.split("/").slice(0, -1);
	const rootLength = source.scope === "local" ? 1 : 3;
	for (const part of request.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			if (parent.length <= rootLength)
				throw new Error(`资源引用不能越过来源根目录：${request}`);
			parent.pop();
		} else parent.push(part);
	}
	return normalizeResourcePath(parent.join("/") || "/");
}

export function parentPath(path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") return null;
	const index = normalized.lastIndexOf("/");
	return index === 0 ? "/" : normalized.slice(0, index);
}

export function basename(path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") throw new Error("资源根目录没有名称。");
	return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function isResourceTree(node: ResourceNode): node is ResourceTree {
	return typeof node === "object" && node !== null && !Array.isArray(node);
}

export function resolveNode(
	tree: ResourceTree,
	path: ResourcePath,
): ResolvedNode {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/")
		return { node: tree, parent: null, name: null, path: normalized };
	let parent: ResourceTree | null = null;
	let node: ResourceNode = tree;
	let name: string | null = null;
	for (const part of normalized.slice(1).split("/")) {
		if (!isResourceTree(node)) throw new Error(`资源父节点不是文件夹：${path}`);
		if (!own(node, part)) throw new Error(`资源不存在：${path}`);
		parent = node;
		name = part;
		node = node[part]!;
	}
	return { node, parent, name, path: normalized };
}

function resolveFolder(tree: ResourceTree, path: ResourcePath) {
	const resolved = resolveNode(tree, path);
	if (!isResourceTree(resolved.node)) throw new Error(`不是文件夹：${path}`);
	return resolved.node;
}

function sameOrChild(path: ResourcePath, prefix: ResourcePath) {
	return path === prefix || path.startsWith(`${prefix}/`);
}

function moveMeta(
	meta: PluginData["meta"],
	from: ResourcePath,
	to: ResourcePath,
	copy = false,
) {
	const entries = Object.entries(meta).filter(([path]) =>
		sameOrChild(path, from),
	);
	if (!copy) for (const [path] of entries) delete meta[path];
	for (const [path, value] of entries) {
		const nextPath = `${to}${path.slice(from.length)}`;
		const next = structuredClone(value) as ResourceMeta;
		if ("slot" in next && next.slot && sameOrChild(next.slot, from))
			next.slot = `${to}${next.slot.slice(from.length)}`;
		if ("parent" in next && next.parent && sameOrChild(next.parent, from))
			next.parent = `${to}${next.parent.slice(from.length)}`;
		set(meta, nextPath, next);
	}
}

/** Rewrites references owned by resources outside a moved subtree. */
function rewriteMetaReferences(
	meta: PluginData["meta"],
	from: ResourcePath,
	to: ResourcePath,
) {
	for (const [path, value] of Object.entries(meta)) {
		const next = structuredClone(value) as ResourceMeta;
		let changed = false;
		if ("slot" in next && next.slot && sameOrChild(next.slot, from)) {
			next.slot = `${to}${next.slot.slice(from.length)}`;
			changed = true;
		}
		if ("parent" in next && next.parent && sameOrChild(next.parent, from)) {
			next.parent = `${to}${next.parent.slice(from.length)}`;
			changed = true;
		}
		if (changed) set(meta, path, next);
	}
}

function deleteMeta(meta: PluginData["meta"], path: ResourcePath) {
	for (const key of Object.keys(meta))
		if (sameOrChild(key, path)) delete meta[key];
}

function requireFileMeta(data: PluginData, path: ResourcePath) {
	const current = data.meta[path];
	return {
		...defaultFileMeta(),
		...(current && "priority" in current ? current : {}),
	} as FileMeta;
}

function requireFolderMeta(data: PluginData, path: ResourcePath) {
	const current = data.meta[path];
	return {
		...defaultFolderMeta(),
		...(current && "selectionMode" in current ? current : {}),
	} as FolderMeta;
}

function createFolders(data: PluginData, path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") return;
	let current = data.tree;
	let currentPath = "";
	for (const part of normalized.slice(1).split("/")) {
		currentPath += `/${part}`;
		const existing = current[part];
		if (existing === undefined) {
			const next: ResourceTree = {};
			set(current, part, next);
			set(data.meta, currentPath, defaultFolderMeta());
			current = next;
			continue;
		}
		if (!isResourceTree(existing))
			throw new Error(`文件不能作为文件夹：${currentPath}`);
		current = existing;
		if (!data.meta[currentPath])
			set(data.meta, currentPath, defaultFolderMeta());
	}
}

export function clonePluginData(data: PluginData): PluginData {
	return structuredClone(toRaw(data));
}

/** Mutates one in-memory tree. Persistence belongs to the caller that owns the Pulse. */
export function applyPulse(data: PluginData, pulse: Pulse): PluginData {
	switch (pulse.kind) {
		case "folder.mkdir": {
			createFolders(data, pulse.path);
			return data;
		}
		case "file.write": {
			const path = normalizeResourcePath(pulse.path);
			if (path === "/") throw new Error("不能写入资源根目录。");
			const parent = resolveFolder(data.tree, parentPath(path)!);
			const name = basename(path);
			if (isResourceTree(parent[name]!))
				throw new Error(`不能写入文件夹：${path}`);
			set(parent, name, pulse.content);
			if (!data.meta[path]) set(data.meta, path, defaultFileMeta());
			return data;
		}
		case "file.replace": {
			const resolved = resolveNode(data.tree, pulse.path);
			if (typeof resolved.node !== "string")
				throw new Error(`edit 只支持文件：${pulse.path}`);
			if (!pulse.find || !resolved.node.includes(pulse.find))
				throw new Error(`文件中未找到待替换文本：${pulse.path}`);
			if (!resolved.parent || !resolved.name)
				throw new Error("不能修改资源根目录。");
			set(
				resolved.parent,
				resolved.name,
				resolved.node.replace(pulse.find, pulse.replace),
			);
			return data;
		}
		case "file.meta.patch": {
			const resolved = resolveNode(data.tree, pulse.path);
			if (typeof resolved.node !== "string")
				throw new Error(`不是文件：${pulse.path}`);
			set(data.meta, resolved.path, {
				...requireFileMeta(data, resolved.path),
				...pulse.patch,
			});
			return data;
		}
		case "folder.meta.patch": {
			const resolved = resolveNode(data.tree, pulse.path);
			if (!isResourceTree(resolved.node))
				throw new Error(`不是文件夹：${pulse.path}`);
			if (resolved.path === "/")
				throw new Error("资源根目录没有可编辑元数据。");
			set(data.meta, resolved.path, {
				...requireFolderMeta(data, resolved.path),
				...pulse.patch,
			});
			return data;
		}
		case "node.remove": {
			const resolved = resolveNode(data.tree, pulse.path);
			if (!resolved.parent || !resolved.name)
				throw new Error("不能删除资源根目录。");
			delete resolved.parent[resolved.name];
			deleteMeta(data.meta, resolved.path);
			return data;
		}
		case "node.move": {
			const from = normalizeResourcePath(pulse.from);
			const to = normalizeResourcePath(pulse.to);
			if (from === "/" || to === "/") throw new Error("不能移动资源根目录。");
			if (sameOrChild(to, from))
				throw new Error("不能把文件夹移动到自身或子级。");
			const source = resolveNode(data.tree, from);
			const targetParent = resolveFolder(data.tree, parentPath(to)!);
			const targetName = basename(to);
			if (own(targetParent, targetName) && to !== from)
				throw new Error(`目标路径已存在：${to}`);
			if (!source.parent || !source.name)
				throw new Error("不能移动资源根目录。");
			delete source.parent[source.name];
			set(targetParent, targetName, source.node);
			moveMeta(data.meta, from, to);
			rewriteMetaReferences(data.meta, from, to);
			return data;
		}
		case "node.copy": {
			const from = normalizeResourcePath(pulse.from);
			const to = normalizeResourcePath(pulse.to);
			if (from === "/" || to === "/") throw new Error("不能复制资源根目录。");
			const source = resolveNode(data.tree, from);
			const targetParent = resolveFolder(data.tree, parentPath(to)!);
			const targetName = basename(to);
			if (own(targetParent, targetName))
				throw new Error(`目标路径已存在：${to}`);
			set(targetParent, targetName, structuredClone(source.node));
			moveMeta(data.meta, from, to, true);
			return data;
		}
	}
}

export function applyPulses(data: PluginData, pulses: readonly Pulse[]) {
	for (const pulse of pulses) applyPulse(data, pulse);
	return data;
}

export function replayPluginData(
	base: PluginData,
	groups: readonly (readonly Pulse[])[],
) {
	const data = clonePluginData(base);
	for (const group of groups) applyPulses(data, group);
	return data;
}

export function readFile(data: PluginData, path: ResourcePath) {
	const resolved = resolveNode(data.tree, path);
	if (typeof resolved.node !== "string") throw new Error(`不是文件：${path}`);
	return resolved.node;
}

export function listFolder(data: PluginData, path: ResourcePath = "/") {
	return Object.keys(resolveFolder(data.tree, path)).sort((left, right) =>
		left.localeCompare(right),
	);
}
