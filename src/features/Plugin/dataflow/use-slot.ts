import { computed, toValue } from "vue";
import {
	globalSlotDefinitionFile,
	isSlotMeta,
	localSlotDefinitionFile,
	parseSlotDef,
	type SlotDef,
	type SlotMeta,
	slotMetaAt,
} from "../resources/types/slot";
import { normalizeResourcePath } from "./pulse";
import type { FileMeta, PluginData, ResourcePath } from "./types";
import { type FileApiOptions, useFileApi } from "./use-file-api";

export interface SlotResource {
	path: ResourcePath;
	name: string;
	meta: FileMeta;
}

export interface PluginSlot {
	path: ResourcePath;
	name: string;
	description?: string;
	icon?: string;
	selectionMode: SlotMeta["selectionMode"];
	resources: SlotResource[];
	selectedResources: SlotResource[];
	children: PluginSlot[];
}

export interface UseSlotOptions extends FileApiOptions {}

function fileName(path: string) {
	return path.slice(path.lastIndexOf("/") + 1);
}

function sourceRoot(path: ResourcePath) {
	const parts = path.split("/").filter(Boolean);
	return parts[0] === "global" && parts[1] ? `/global/${parts[1]}` : "/";
}

function localSlotDef(data: PluginData, source: ResourcePath) {
	const path =
		source === "/"
			? `/${localSlotDefinitionFile}`
			: `${source}/${localSlotDefinitionFile}`;
	const sourceFile = data.tree;
	const content = path
		.split("/")
		.filter(Boolean)
		.reduce<PluginData["tree"] | string | undefined>(
			(current, name) =>
				typeof current === "object" && current !== null
					? current[name]
					: undefined,
			sourceFile,
		);
	return parseSlotDef(typeof content === "string" ? content : undefined);
}

function walkFiles(
	tree: PluginData["tree"],
	path: ResourcePath,
	meta: PluginData["meta"],
	visit: (path: ResourcePath, meta: FileMeta) => void,
) {
	for (const [name, node] of Object.entries(tree)) {
		const childPath = path === "/" ? `/${name}` : `${path}/${name}`;
		if (typeof node === "string") {
			const file = meta[childPath];
			if (file) visit(childPath, file);
		} else walkFiles(node, childPath, meta, visit);
	}
}

function slotPath(definition: SlotDef, input: string) {
	if (input.startsWith("/")) return normalizeResourcePath(input);
	const matches: string[] = [];
	const visit = (node: SlotDef, prefix = "") => {
		for (const [name, child] of Object.entries(node)) {
			const path = `${prefix}/${name}`;
			if (isSlotMeta(child)) {
				if (name === input) matches.push(path);
			} else visit(child, path);
		}
	};
	visit(definition);
	if (matches.length === 1) return matches[0]!;
	if (matches.length > 1) throw new Error(`插槽名称不唯一：${input}`);
	throw new Error(`未知插槽：${input}`);
}

/** Reads slot contracts exclusively from global.slot.json and local.slot.json files. */
export function useSlot(options: UseSlotOptions) {
	const fileApi = useFileApi(options);
	const definition = computed(() => {
		const data = toValue(options.filetree);
		return parseSlotDef(
			typeof data?.tree[globalSlotDefinitionFile.slice(1)] === "string"
				? data.tree[globalSlotDefinitionFile.slice(1)]
				: undefined,
		);
	});
	const slots = computed<PluginSlot[]>(() => {
		const data = toValue(options.filetree);
		if (!data) return [];
		const resources = new Map<string, SlotResource[]>();
		walkFiles(data.tree, "/", data.meta, (path, meta) => {
			if (
				!meta.slot ||
				!slotMetaAt(definition.value, meta.slot) ||
				!slotMetaAt(localSlotDef(data, sourceRoot(path)), meta.slot)
			)
				return;
			const current = resources.get(meta.slot) ?? [];
			current.push({ path, name: fileName(path), meta });
			resources.set(meta.slot, current);
		});
		const build = (node: SlotDef, prefix = ""): PluginSlot[] =>
			Object.entries(node)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([name, child]) => {
					const path = `${prefix}/${name}`;
					const meta = isSlotMeta(child) ? child : null;
					const children = meta ? [] : build(child, path);
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
						name,
						description: meta?.description,
						icon: meta?.icon,
						selectionMode: meta?.selectionMode ?? "none",
						resources: allResources,
						selectedResources:
							meta?.selectionMode === "single"
								? selected.slice(0, 1)
								: selected,
						children,
					};
				});
		return build(definition.value);
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
		const path = slotPath(definition.value, input);
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
		const file = data?.meta[path];
		if (!data || !file) throw new Error(`不是资源文件：${path}`);
		const slot = file.slot ? get(file.slot) : null;
		if (selected && slot?.selectionMode === "single")
			for (const other of slot.resources)
				if (other.path !== path && other.meta.resourceSelected)
					fileApi.updateFileMeta(other.path, { resourceSelected: false });
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
			const file = toValue(options.filetree)?.meta[path];
			if (!file) throw new Error(`不是资源文件：${path}`);
			setSelected(path, !file.resourceSelected);
		},
		assign: (path: ResourcePath, slot?: ResourcePath) => {
			const data = toValue(options.filetree);
			if (
				slot &&
				(!data ||
					!slotMetaAt(definition.value, slot) ||
					!slotMetaAt(localSlotDef(data, sourceRoot(path)), slot))
			)
				throw new Error(`不是来源已声明的插槽：${slot}`);
			fileApi.updateFileMeta(path, { slot });
		},
	};
}
