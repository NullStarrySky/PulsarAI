import { toRaw } from "vue";
import {
	defaultFileMeta,
	defaultFolderMeta,
	type FileMeta,
	type FolderMeta,
	type PluginData,
	type Pulse,
	type ResourceEntry,
	type ResourceListResult,
	type ResourceMeta,
	type ResourceNode,
	type ResourcePath,
	type ResourceSearchMatch,
	type ResourceSearchResult,
	type ResourceStat,
	type ResourceTreeEntry,
	type ResourceTreeResult,
	type ResourceTree,
} from "./types";

export type ResolvedNode = {
	node: ResourceNode;
	parent: ResourceTree | null;
	name: string | null;
	path: ResourcePath;
};

function own<T extends object>(value: T, key: PropertyKey) {
	return Object.hasOwn(value, key);
}

function set(target: object, key: string, value: unknown) {
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
	| { scope: "global"; folder: string; path: ResourcePath };

/** `/x` belongs to the local source; `/global/<folder>/x` addresses one global source. */
export function parsePluginPath(path: string): PluginPath {
	const normalized = normalizeResourcePath(path);
	const parts = normalized.slice(1).split("/").filter(Boolean);
	if (parts[0] !== "global") return { scope: "local", path: normalized };
	const folder = parts[1];
	if (!folder) throw new Error(`全局资源路径缺少 Plugin 文件夹：${path}`);
	return {
		scope: "global",
		folder,
		path: parts.length > 2 ? `/${parts.slice(2).join("/")}` : "/",
	};
}

/** Resolves authored `@/` and relative references without leaking global mount prefixes into source text. */
export function resolveResourcePath(sourcePath: ResourcePath, request: string) {
	if (request.startsWith("/")) return normalizeResourcePath(request);
	const source = parsePluginPath(sourcePath);
	const root = source.scope === "local" ? "" : `/global/${source.folder}`;
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

function basename(path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") throw new Error("资源根目录没有名称。");
	return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function isResourceTree(
	node: ResourceNode | null | undefined,
): node is ResourceTree {
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
		const next = (copy ? structuredClone(value) : value) as ResourceMeta;
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
		let changed = false;
		if ("slot" in value && value.slot && sameOrChild(value.slot, from)) {
			value.slot = `${to}${value.slot.slice(from.length)}`;
			changed = true;
		}
		if ("parent" in value && value.parent && sameOrChild(value.parent, from)) {
			value.parent = `${to}${value.parent.slice(from.length)}`;
			changed = true;
		}
		if (changed) set(meta, path, value);
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

function applyPulses(data: PluginData, pulses: readonly Pulse[]) {
	for (const pulse of pulses) applyPulse(data, pulse);
	return data;
}

function compactPulseSegment(segment: readonly Pulse[]): Pulse[] {
	const result: Array<Pulse | null> = [...segment];
	const patches = new Map<
		string,
		{
			index: number;
			pulse: Extract<Pulse, { kind: "file.meta.patch" | "folder.meta.patch" }>;
		}
	>();
	const contents = new Map<
		string,
		{ first: number; lastWrite: number; pulse: Pulse }
	>();
	for (const [index, pulse] of segment.entries()) {
		if (pulse.kind === "file.write" || pulse.kind === "file.replace") {
			const path = normalizeResourcePath(pulse.path);
			const previous = contents.get(path);
			if (!previous)
				contents.set(path, {
					first: index,
					lastWrite: pulse.kind === "file.write" ? index : -1,
					pulse,
				});
			else if (pulse.kind === "file.write") {
				previous.lastWrite = index;
				previous.pulse = pulse;
			}
		}
		if (pulse.kind !== "file.meta.patch" && pulse.kind !== "folder.meta.patch")
			continue;
		const key = `${pulse.kind}:${normalizeResourcePath(pulse.path)}`;
		const previous = patches.get(key);
		if (!previous) {
			patches.set(key, { index, pulse });
			continue;
		}
		previous.pulse = {
			...previous.pulse,
			patch: { ...previous.pulse.patch, ...pulse.patch },
		} as typeof previous.pulse;
		result[previous.index] = previous.pulse;
		result[index] = null;
	}
	for (const [index, pulse] of segment.entries()) {
		if (pulse.kind !== "file.write" && pulse.kind !== "file.replace") continue;
		const content = contents.get(normalizeResourcePath(pulse.path))!;
		if (content.lastWrite < 0 || index > content.lastWrite) continue;
		result[index] = index === content.first ? content.pulse : null;
	}
	return result.filter((pulse): pulse is Pulse => pulse !== null);
}

/** Compacts one replay group without moving writes across dependent tree mutations. */
export function compactPulses(pulses: readonly Pulse[]): Pulse[] {
	const result: Pulse[] = [];
	let segment: Pulse[] = [];
	const flush = () => {
		result.push(...compactPulseSegment(segment));
		segment = [];
	};
	for (const pulse of pulses) {
		// ponytail: O(n²) dependency scans for large groups; index paths only if measured.
		const affected =
			pulse.kind === "node.remove"
				? [pulse.path]
				: pulse.kind === "node.copy"
					? [pulse.from, pulse.to]
					: [];
		if (
			pulse.kind === "node.move" ||
			affected.some((path) =>
				segment.some(
					(item) =>
						(item.kind === "file.write" ||
							item.kind === "file.replace" ||
							item.kind === "file.meta.patch" ||
							item.kind === "folder.meta.patch") &&
						sameOrChild(
							normalizeResourcePath(item.path),
							normalizeResourcePath(path),
						),
				),
			)
		)
			flush();
		segment.push(pulse);
	}
	flush();
	return result;
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

function entry(
	path: ResourcePath,
	name: string,
	node: ResourceNode,
): ResourceEntry {
	return { path, name, kind: isResourceTree(node) ? "folder" : "file" };
}

/** Returns one resource's identity, type, and a detached metadata snapshot. */
export function statResource(data: PluginData, path: ResourcePath): ResourceStat {
	const resolved = resolveNode(data.tree, path);
	return {
		...entry(resolved.path, resolved.name ?? "/", resolved.node),
		meta: data.meta[resolved.path]
			? structuredClone(data.meta[resolved.path])
			: null,
	};
}

function resourcePath(parent: ResourcePath, name: string): ResourcePath {
	return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

function validateLimit(limit: number) {
	if (!Number.isInteger(limit) || limit < 1)
		throw new Error(`查询上限必须是正整数：${limit}`);
}

/** Lists direct children with enough information for a later File API call. */
export function listFolder(
	data: PluginData,
	path: ResourcePath = "/",
	limit = 100,
): ResourceListResult {
	validateLimit(limit);
	const folder = resolveFolder(data.tree, path);
	const parent = normalizeResourcePath(path);
	const entries = Object.entries(folder)
		.map(([name, node]) =>
			entry(resourcePath(parent, name), name, node),
		)
		.sort((left, right) => left.name.localeCompare(right.name));
	return { entries: entries.slice(0, limit), truncated: entries.length > limit };
}

/** Recursively finds resource entries below a file or folder path. */
export function findResources(
	data: PluginData,
	path: ResourcePath,
	match: (entry: ResourceEntry) => boolean,
	limit = 100,
): ResourceListResult {
	validateLimit(limit);
	const root = resolveNode(data.tree, path);
	const entries: ResourceEntry[] = [];
	let truncated = false;
	const visit = (node: ResourceNode, currentPath: ResourcePath, name: string) => {
		if (truncated) return;
		const current = entry(currentPath, name, node);
		if (match(current)) {
			if (entries.length === limit) {
				truncated = true;
				return;
			}
			entries.push(current);
		}
		if (!isResourceTree(node)) return;
		for (const [childName, child] of Object.entries(node).sort(([left], [right]) =>
			left.localeCompare(right),
		))
			visit(child, resourcePath(currentPath, childName), childName);
	};
	if (typeof root.node === "string") visit(root.node, root.path, root.name ?? "");
	else
		for (const [name, node] of Object.entries(root.node).sort(([left], [right]) =>
			left.localeCompare(right),
		))
			visit(node, resourcePath(root.path, name), name);
	return { entries, truncated };
}

export interface SearchResourcesOptions {
	context?: number;
	limit?: number;
	offset?: number;
	caseSensitive?: boolean;
	regex?: boolean;
	wholeWord?: boolean;
	maxDepth?: number;
	extensions?: string[];
}

function nonNegativeInteger(value: number, name: string) {
	if (!Number.isInteger(value) || value < 0)
		throw new Error(`${name}必须是非负整数：${value}`);
}

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchMatcher(query: string, options: SearchResourcesOptions) {
	if (!query) throw new Error("搜索文本不能为空。");
	if (options.regex && options.wholeWord)
		throw new Error("正则搜索不能同时使用 wholeWord。");
	try {
		return new RegExp(
			options.regex
				? query
				: options.wholeWord
					? `\\b${escapeRegex(query)}\\b`
					: escapeRegex(query),
			options.caseSensitive === false ? "i" : "",
		);
	} catch (error) {
		throw new Error(
			`无效的搜索正则：${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function hasExtension(path: ResourcePath, extensions?: string[]) {
	if (!extensions) return true;
	return extensions.some((extension) => path.toLowerCase().endsWith(extension.toLowerCase()));
}

/** Returns a bounded, nested directory view without exposing mutable tree nodes. */
export function treeResources(
	data: PluginData,
	path: ResourcePath = "/",
	options: { limit?: number; maxDepth?: number } = {},
): ResourceTreeResult {
	const limit = options.limit ?? 100;
	const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
	validateLimit(limit);
	if (maxDepth !== Number.POSITIVE_INFINITY) nonNegativeInteger(maxDepth, "最大深度");
	const root = resolveNode(data.tree, path);
	const entries: ResourceTreeEntry[] = [];
	let count = 0;
	let truncated = false;
	const visit = (
		node: ResourceNode,
		currentPath: ResourcePath,
		name: string,
		depth: number,
	): ResourceTreeEntry | null => {
		if (count === limit) {
			truncated = true;
			return null;
		}
		count += 1;
		const current: ResourceTreeEntry = entry(currentPath, name, node);
		if (!isResourceTree(node) || depth === maxDepth) return current;
		const children: ResourceTreeEntry[] = [];
		for (const [childName, child] of Object.entries(node).sort(([left], [right]) =>
			left.localeCompare(right),
		)) {
			const childEntry = visit(child, resourcePath(currentPath, childName), childName, depth + 1);
			if (childEntry) children.push(childEntry);
			if (truncated) break;
		}
		if (children.length) current.children = children;
		return current;
	};
	if (isResourceTree(root.node)) {
		for (const [name, node] of Object.entries(root.node).sort(([left], [right]) =>
			left.localeCompare(right),
		)) {
			const current = visit(node, resourcePath(root.path, name), name, 1);
			if (current) entries.push(current);
			if (truncated) break;
		}
	} else {
		const current = visit(root.node, root.path, root.name ?? "", 0);
		if (current) entries.push(current);
	}
	return { entries, truncated };
}

/** Searches literal text in one file or every file below a folder. */
export function searchResources(
	data: PluginData,
	query: string,
	path: ResourcePath,
	options: SearchResourcesOptions = {},
): ResourceSearchResult {
	const context = options.context ?? 0;
	const limit = options.limit ?? 100;
	const offset = options.offset ?? 0;
	const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
	if (!Number.isInteger(context) || context < 0)
		throw new Error(`搜索上下文必须是非负整数：${context}`);
	validateLimit(limit);
	nonNegativeInteger(offset, "搜索偏移");
	if (maxDepth !== Number.POSITIVE_INFINITY) nonNegativeInteger(maxDepth, "最大深度");
	if (options.extensions?.some((extension) => !extension))
		throw new Error("扩展名不能为空。");
	const matcher = searchMatcher(query, options);
	const matches: ResourceSearchMatch[] = [];
	let skipped = 0;
	let truncated = false;
	const root = resolveNode(data.tree, path);
	const visit = (node: ResourceNode, currentPath: ResourcePath, depth: number) => {
		if (truncated) return;
		if (typeof node !== "string") {
			if (depth === maxDepth) return;
			for (const [name, child] of Object.entries(node).sort(([left], [right]) =>
				left.localeCompare(right),
			))
				visit(child, resourcePath(currentPath, name), depth + 1);
			return;
		}
		if (!hasExtension(currentPath, options.extensions)) return;
		const lines = node.split("\n");
		for (const [index, text] of lines.entries()) {
			if (!matcher.test(text)) continue;
			if (skipped < offset) {
				skipped += 1;
				continue;
			}
			if (matches.length === limit) {
				truncated = true;
				return;
			}
			matches.push({
				path: currentPath,
				line: index + 1,
				text,
				before: lines.slice(Math.max(0, index - context), index),
				after: lines.slice(index + 1, index + context + 1),
			});
		}
	};
	visit(root.node, root.path, 0);
	return { matches, truncated, nextOffset: truncated ? offset + matches.length : null };
}
