import DiffMatchPatch from "diff-match-patch";
import { toRaw } from "vue";
import {
	applyPulse,
	clonePluginData,
	isResourceTree,
	normalizeResourcePath,
	parentPath,
	parsePluginPath,
	resolveNode,
} from "./pulse";
import {
	defaultFileMeta,
	type FileMeta,
	type MetaEdit,
	type PluginData,
	type Pulse,
	type RECAL,
	type Recalculate,
	type ResourceNode,
	type ResourceTree,
} from "./types";

const dmp = new DiffMatchPatch();
const own = (object: object, key: string) => Object.hasOwn(object, key);
const child = (parent: string, name: string) =>
	parent === "/" ? `/${name}` : `${parent}/${name}`;
const within = (path: string, root: string) =>
	path === root || path.startsWith(`${root}/`);
function set(target: object, key: string, value: unknown) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}
function walk(node: ResourceNode, path: string, visit: (path: string) => void) {
	visit(path);
	if (isResourceTree(node))
		for (const [name, value] of Object.entries(node))
			walk(value, child(path, name), visit);
}
function fileMeta(data: PluginData, path: string | null): FileMeta {
	return { ...defaultFileMeta(), ...(path === null ? {} : data.meta[path]) };
}
function metaEdit(before: FileMeta, after: FileMeta): MetaEdit | null {
	const patch: MetaEdit = { set: {}, unset: [] };
	for (const key of new Set([
		...Object.keys(before),
		...Object.keys(after),
	]) as Set<keyof FileMeta>) {
		if (after[key] === undefined) {
			if (before[key] !== undefined) patch.unset.push(key);
		} else if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
			set(patch.set, key, structuredClone(toRaw(after[key])));
	}
	return Object.keys(patch.set).length || patch.unset.length ? patch : null;
}

/** Materialize against immutable input. Ancestor inheritance is overridden by explicit children. */
function materialize(base: PluginData, delta: Recalculate) {
	const data = clonePluginData(base);
	const origins = new Map<string, string | null>();
	walk(base.tree, "/", (path) => origins.set(path, path));
	const entries = Object.entries(delta).sort(
		([a], [b]) =>
			a.split("/").length - b.split("/").length || a.localeCompare(b),
	);
	for (const [path, entry] of entries) {
		if (path === "/" || normalizeResourcePath(path) !== path)
			throw new Error(`无效的重放目标路径：${path}`);
		const parent = resolveNode(data.tree, parentPath(path)!).node;
		if (!isResourceTree(parent))
			throw new Error(`重放目标父节点不是目录：${path}`);
		const name = path.slice(path.lastIndexOf("/") + 1);
		for (const key of origins.keys())
			if (within(key, path)) origins.delete(key);
		for (const key of Object.keys(data.meta))
			if (within(key, path)) delete data.meta[key];
		if ("delete" in entry) {
			delete parent[name];
			continue;
		}
		if (entry.from !== null && normalizeResourcePath(entry.from) !== entry.from)
			throw new Error(`无效的重放来源路径：${entry.from}`);
		const source =
			entry.from === null
				? entry.kind === "folder"
					? {}
					: ""
				: resolveNode(base.tree, entry.from).node;
		if (entry.kind === "folder") {
			if (!isResourceTree(source))
				throw new Error(`重放来源不是目录：${entry.from}`);
			set(parent, name, structuredClone(toRaw(source)));
			walk(source, path, (target) =>
				origins.set(
					target,
					entry.from === null
						? null
						: `${entry.from}${target.slice(path.length)}`,
				),
			);
			if (entry.from !== null)
				for (const [key, meta] of Object.entries(base.meta)) {
					if (within(key, entry.from))
						set(
							data.meta,
							`${path}${key.slice(entry.from.length)}`,
							structuredClone(toRaw(meta)),
						);
				}
		} else {
			if (typeof source !== "string")
				throw new Error(`重放来源不是文件：${entry.from}`);
			if (
				entry.edit?.some(
					([op, text]) => ![-1, 0, 1].includes(op) || typeof text !== "string",
				)
			)
				throw new Error(`无效的文本差量：${path}`);
			if (entry.edit !== null && dmp.diff_text1(entry.edit) !== source)
				throw new Error(`重放基线内容已改变：${path}`);
			set(
				parent,
				name,
				entry.edit === null ? source : dmp.diff_text2(entry.edit),
			);
			const meta = fileMeta(base, entry.from);
			if (entry.meta_edit) {
				Object.assign(meta, entry.meta_edit.set);
				for (const key of entry.meta_edit.unset) delete meta[key];
			}
			set(data.meta, path, structuredClone(toRaw(meta)));
			origins.set(path, entry.from);
		}
	}
	return { data, origins };
}

export function replayRecalculate(
	base: PluginData,
	delta: Recalculate,
): PluginData {
	return materialize(base, delta).data;
}

export function replayPluginData(
	base: PluginData,
	groups: readonly Recalculate[],
) {
	return groups.reduce(
		(data, delta) =>
			Object.keys(delta).length ? replayRecalculate(data, delta) : data,
		clonePluginData(base),
	);
}

/** Build a sparse final-tree overlay; folder origins cover unchanged descendants. */
function describe(
	base: PluginData,
	data: PluginData,
	origins: Map<string, string | null>,
): Recalculate {
	const result: Recalculate = {};
	function folder(
		current: ResourceTree,
		inherited: ResourceTree,
		path: string,
		inheritedFrom: string | null,
	) {
		for (const name of Object.keys(inherited))
			if (!own(current, name)) set(result, child(path, name), { delete: true });
		for (const [name, node] of Object.entries(current)) {
			const target = child(path, name);
			const from = origins.get(target) ?? null;
			const previous = own(inherited, name) ? inherited[name] : undefined;
			const expectedFrom =
				inheritedFrom === null ? null : child(inheritedFrom, name);
			if (isResourceTree(node)) {
				if (isResourceTree(previous) && from === expectedFrom)
					folder(node, previous, target, from);
				else {
					set(result, target, { kind: "folder", from });
					const source = from === null ? {} : resolveNode(base.tree, from).node;
					if (!isResourceTree(source)) throw new Error(`目录来源失效：${from}`);
					folder(node, source, target, from);
				}
			} else {
				const source = from === null ? "" : resolveNode(base.tree, from).node;
				if (typeof source !== "string")
					throw new Error(`文件来源失效：${from}`);
				const meta = metaEdit(fileMeta(base, from), fileMeta(data, target));
				if (
					typeof previous === "string" &&
					from === expectedFrom &&
					source === node &&
					meta === null
				)
					continue;
				set(result, target, {
					kind: "file",
					from,
					edit:
						source === node
							? null
							: dmp.diff_main(source, node).map(([op, text]) => [op, text]),
					meta_edit: meta,
				});
			}
		}
	}
	folder(data.tree, base.tree, "/", "/");
	return result;
}

/** Apply in memory first, then compare final content with its original provenance. */
export function updateRecalculate(
	base: PluginData,
	delta: Recalculate,
	pulse: Pulse,
): Recalculate {
	const { data, origins } = materialize(base, delta);
	applyPulse(data, pulse);
	if (pulse.kind === "node.move" || pulse.kind === "node.copy") {
		const from = normalizeResourcePath(pulse.from),
			to = normalizeResourcePath(pulse.to);
		const moved = [...origins].filter(([path]) => within(path, from));
		if (pulse.kind === "node.move")
			for (const [path] of moved) origins.delete(path);
		for (const [path, origin] of moved)
			origins.set(`${to}${path.slice(from.length)}`, origin);
	} else if (pulse.kind === "node.remove") {
		const path = normalizeResourcePath(pulse.path);
		for (const key of origins.keys())
			if (within(key, path)) origins.delete(key);
	}
	// New nodes deliberately have no baseline origin, including delete/recreate.
	return describe(base, data, origins);
}

export function emptyRecal(): RECAL {
	return { self: {}, global: {} };
}
export function recalSize(recal: RECAL | undefined): number {
	return recal
		? Object.keys(recal.self).length +
				Object.values(recal.global).reduce(
					(sum, delta) => sum + Object.keys(delta).length,
					0,
				)
		: 0;
}

/** Extract a source from the merged baseline without retaining any mounted paths. */
function sourceData(merged: PluginData, folder: string | null): PluginData {
	const data = clonePluginData(merged);
	if (folder === null) {
		delete data.tree.global;
		for (const path of Object.keys(data.meta))
			if (within(path, "/global")) delete data.meta[path];
	} else {
		const mount = `/global/${folder}`;
		const tree = resolveNode(data.tree, mount).node;
		if (!isResourceTree(tree))
			throw new Error(`Plugin 来源不是目录：${folder}`);
		data.tree = tree;
		data.meta = Object.fromEntries(
			Object.entries(data.meta)
				.filter(([path]) => within(path, mount))
				.map(([path, meta]) => [path.slice(mount.length), meta]),
		);
	}
	return data;
}

export function updateRecal(
	base: PluginData,
	recal: RECAL,
	pulse: Pulse,
): RECAL {
	const path = parsePluginPath("path" in pulse ? pulse.path : pulse.to);
	const folder = path.scope === "local" ? null : path.folder;
	let localPulse: Pulse;
	if (pulse.kind === "node.move" || pulse.kind === "node.copy") {
		const from = parsePluginPath(pulse.from);
		if (
			from.scope !== path.scope ||
			(from.scope === "global" && from.folder !== folder)
		)
			throw new Error("移动或复制不能跨 Plugin 来源。");
		localPulse = { ...pulse, from: from.path, to: path.path };
	} else localPulse = { ...pulse, path: path.path };
	const source = sourceData(base, folder);
	const current =
		folder === null
			? recal.self
			: own(recal.global, folder)
				? recal.global[folder]!
				: {};
	const delta = updateRecalculate(source, current, localPulse);
	if (folder === null) return { ...recal, self: delta };
	const global = { ...recal.global };
	if (Object.keys(delta).length) set(global, folder, delta);
	else delete global[folder];
	return { ...recal, global };
}
