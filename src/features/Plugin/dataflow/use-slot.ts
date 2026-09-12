import { computed, toValue } from "vue";
import { builtinSlotRegistry } from "../utils/import-converter";
import { isResourceTree, normalizeResourcePath, parentPath } from "./pulse";
import type {
	FileMeta,
	FolderMeta,
	PluginData,
	ResourceMeta,
	ResourcePath,
} from "./types";
import { type FileApiOptions, useFileApi } from "./use-file-api";

export interface SlotResource {
	path: ResourcePath;
	name: string;
	meta: FileMeta;
}

export interface PluginSlot {
	path: ResourcePath;
	name: string;
	icon?: string;
	selectionMode: FolderMeta["selectionMode"];
	resources: SlotResource[];
	selectedResources: SlotResource[];
	children: PluginSlot[];
}

export interface UseSlotOptions extends FileApiOptions {}

function fileName(path: string) {
	return path.slice(path.lastIndexOf("/") + 1);
}

function walkFiles(
	tree: PluginData["tree"],
	path: ResourcePath,
	visit: (path: ResourcePath, meta: FileMeta) => void,
	meta: PluginData["meta"],
) {
	for (const [name, node] of Object.entries(tree)) {
		const childPath = path === "/" ? `/${name}` : `${path}/${name}`;
		if (typeof node === "string") {
			const file = meta[childPath];
			if (file && "priority" in file) visit(childPath, file);
			continue;
		}
		walkFiles(node, childPath, visit, meta);
	}
}

function registryIcon(path: ResourcePath) {
	const name = fileName(path);
	return builtinSlotRegistry.find((slot) => slot.name === name)?.icon;
}

function resolveSlotPath(data: PluginData, input: string) {
	if (input.startsWith("/")) return normalizeResourcePath(input);
	const registered = builtinSlotRegistry.find(
		(slot) => slot.id === input || slot.name === input,
	);
	if (registered) {
		const parts: string[] = [];
		let current: (typeof builtinSlotRegistry)[number] | undefined = registered;
		while (current) {
			parts.unshift(current.name);
			current = current.parentId
				? builtinSlotRegistry.find((slot) => slot.id === current?.parentId)
				: undefined;
		}
		return `/slot/${parts.join("/")}`;
	}
	const matches = Object.keys(data.meta).filter((path) => {
		const meta = data.meta[path];
		return Boolean(meta && "selectionMode" in meta && fileName(path) === input);
	});
	if (matches.length === 1) return matches[0]!;
	if (matches.length > 1) throw new Error(`插槽名称不唯一：${input}`);
	throw new Error(`未知插槽：${input}`);
}

function directSlotPath(data: PluginData, path: ResourcePath) {
	const seen = new Set<string>();
	let current: string | null = path;
	while (current && !seen.has(current)) {
		seen.add(current);
		const meta: ResourceMeta | undefined = data.meta[current];
		if (meta && "selectionMode" in meta && current.startsWith("/slot/"))
			return current;
		if (meta && "parent" in meta && meta.parent) {
			current = meta.parent;
			continue;
		}
		current = parentPath(current);
	}
	return null;
}

/**
 * Resolves the local `/slot/` contract and every source-local `localSlot/`
 * contribution against one replayed file tree.
 */
export function useSlot(options: UseSlotOptions) {
	const fileApi = useFileApi(options);
	const slots = computed<PluginSlot[]>(() => {
		const data = toValue(options.filetree);
		if (!data) return [];
		const resources = new Map<string, SlotResource[]>();
		walkFiles(
			data.tree,
			"/",
			(path, meta) => {
				if (!meta.slot) return;
				const slotPath = directSlotPath(data, meta.slot);
				if (!slotPath) return;
				const current = resources.get(slotPath) ?? [];
				current.push({ path, name: fileName(path), meta });
				resources.set(slotPath, current);
			},
			data.meta,
		);

		const build = (path: ResourcePath): PluginSlot | null => {
			const meta = data.meta[path];
			if (!meta || !("selectionMode" in meta)) return null;
			const children: PluginSlot[] = [];
			const folder =
				path === "/slot"
					? data.tree.slot
					: path
							.slice("/slot/".length)
							.split("/")
							.reduce<PluginData["tree"] | string | undefined>(
								(current, name) =>
									isResourceTree(current) ? current[name] : undefined,
								data.tree.slot,
							);
			if (isResourceTree(folder)) {
				for (const name of Object.keys(folder).sort((left, right) =>
					left.localeCompare(right),
				)) {
					const child = build(`${path}/${name}`);
					if (child) children.push(child);
				}
			}
			const allResources = (resources.get(path) ?? []).sort(
				(left, right) =>
					left.meta.priority - right.meta.priority ||
					left.path.localeCompare(right.path),
			);
			const selected = allResources.filter(
				(resource) => resource.meta.resourceSelected,
			);
			return {
				path,
				name: fileName(path),
				icon: registryIcon(path),
				selectionMode: meta.selectionMode,
				resources: allResources,
				selectedResources:
					meta.selectionMode === "single" ? selected.slice(0, 1) : selected,
				children,
			};
		};
		if (!isResourceTree(data.tree.slot)) return [];
		return Object.keys(data.tree.slot)
			.sort((left, right) => left.localeCompare(right))
			.flatMap((name) => build(`/slot/${name}`) ?? []);
	});
	const flatSlots = computed(() => {
		const result: PluginSlot[] = [];
		const visit = (slot: PluginSlot) => {
			result.push(slot);
			for (const child of slot.children) visit(child);
		};
		for (const slot of slots.value) visit(slot);
		return result;
	});
	function get(input: string) {
		const data = toValue(options.filetree);
		if (!data) return null;
		const path = resolveSlotPath(data, input);
		return flatSlots.value.find((slot) => slot.path === path) ?? null;
	}
	function paths(input: string) {
		return get(input)?.selectedResources.map((resource) => resource.path) ?? [];
	}
	function fileNames(input: string) {
		return get(input)?.selectedResources.map((resource) => resource.name) ?? [];
	}
	function setSelected(path: ResourcePath, selected: boolean) {
		const data = toValue(options.filetree);
		if (!data) throw new Error("Plugin 资源尚未加载。");
		const file = data.meta[path];
		if (!file || !("priority" in file))
			throw new Error(`不是资源文件：${path}`);
		const slotPath = file.slot ? directSlotPath(data, file.slot) : null;
		const slot = slotPath ? get(slotPath) : null;
		if (selected && slot?.selectionMode === "single") {
			for (const other of slot.resources) {
				if (other.path !== path && other.meta.resourceSelected)
					fileApi.updateFileMeta(other.path, { resourceSelected: false });
			}
		}
		fileApi.updateFileMeta(path, { resourceSelected: selected });
	}
	return {
		...fileApi,
		tree: slots,
		slots: flatSlots,
		get,
		paths,
		fileNames,
		select: (path: ResourcePath) => setSelected(path, true),
		unselect: (path: ResourcePath) => setSelected(path, false),
		toggle: (path: ResourcePath) => {
			const data = toValue(options.filetree);
			const file = data?.meta[path];
			if (!file || !("priority" in file))
				throw new Error(`不是资源文件：${path}`);
			setSelected(path, !file.resourceSelected);
		},
		assign: (path: ResourcePath, localSlotPath?: ResourcePath) => {
			if (localSlotPath) {
				const data = toValue(options.filetree);
				if (!data || !directSlotPath(data, localSlotPath))
					throw new Error(`不是已注册的来源插槽：${localSlotPath}`);
			}
			fileApi.updateFileMeta(path, { slot: localSlotPath });
		},
	};
}
