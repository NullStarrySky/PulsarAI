import { normalizeResourcePath, resolveNode } from "../dataflow/pulse";
import {
	defaultFileMeta,
	defaultFolderMeta,
	type FileMeta,
	type PluginData,
	type ResourcePath,
	type ResourceTree,
} from "../dataflow/types";
import {
	generateProceduralAvatarDataUrl,
	generateProceduralCoverDataUrl,
} from "../shared/procedural-cover";

type BuiltinManifest = {
	plugin: { id: string };
	nodes: Record<
		string,
		{
			order?: number;
			insertion?: {
				slot: string;
				condition?: string;
				conditionEnabled?: boolean;
			};
		}
	>;
};

export interface SlotRegistration {
	id: string;
	name: string;
	parentId?: string;
	icon?: string;
	selectionMode: "none" | "single" | "multiple";
}

/**
 * The slot registry is materialized as ordinary folders below a local Plugin's
 * `/slot/`. IDs are only import-time shorthand; runtime code addresses the
 * resulting name paths.
 */
export const builtinSlotRegistry: readonly SlotRegistration[] = [
	{ id: "role", name: "角色", icon: "user-round", selectionMode: "none" },
	{ id: "user", name: "用户角色", parentId: "role", selectionMode: "none" },
	{
		id: "character",
		name: "系统角色",
		parentId: "role",
		selectionMode: "none",
	},
	{
		id: "context",
		name: "上下文位置",
		icon: "text-align-left",
		selectionMode: "none",
	},
	{
		id: "before_char",
		name: "角色之前",
		parentId: "context",
		selectionMode: "none",
	},
	{
		id: "after_char",
		name: "角色之后",
		parentId: "context",
		selectionMode: "none",
	},
	{ id: "document", name: "顶部", parentId: "context", selectionMode: "none" },
	{
		id: "generation",
		name: "生成流程",
		icon: "workflow",
		selectionMode: "none",
	},
	{
		id: "generatePath",
		name: "主流程",
		parentId: "generation",
		icon: "play",
		selectionMode: "single",
	},
	{
		id: "CTX_BUILD",
		name: "上下文构建",
		parentId: "generation",
		selectionMode: "single",
	},
	{
		id: "CTX_PROCESS_BEFORE_REGEX",
		name: "上下文处理器",
		parentId: "generation",
		selectionMode: "none",
	},
	{
		id: "REGEX",
		name: "正则",
		parentId: "generation",
		icon: "regex",
		selectionMode: "none",
	},
	{
		id: "DATA_INJECT",
		name: "数据注入",
		parentId: "generation",
		selectionMode: "none",
	},
	{
		id: "data_prompt",
		name: "数据提示",
		parentId: "generation",
		selectionMode: "none",
	},
	{
		id: "chat",
		name: "生成入口",
		parentId: "generation",
		icon: "messages-square",
		selectionMode: "single",
	},
	{ id: "depth", name: "深度", icon: "list-numbers", selectionMode: "none" },
	...Array.from({ length: 5 }, (_, depth) => ({
		id: `depth:${depth}`,
		name: String(depth),
		parentId: "depth",
		selectionMode: "none" as const,
	})),
	{ id: "resource", name: "资源", icon: "files", selectionMode: "none" },
	{
		id: "COMMAND",
		name: "指令",
		parentId: "resource",
		icon: "terminal",
		selectionMode: "none",
	},
	{
		id: "MODE",
		name: "模式",
		parentId: "resource",
		icon: "pencil-line",
		selectionMode: "none",
	},
	{
		id: "background",
		name: "背景图片",
		parentId: "resource",
		icon: "image",
		selectionMode: "single",
	},
	{
		id: "document-library",
		name: "文档",
		icon: "file-text",
		selectionMode: "none",
	},
	{
		id: "toolFunction",
		name: "工具",
		parentId: "document-library",
		icon: "wrench",
		selectionMode: "none",
	},
	{
		id: "skill",
		name: "skill",
		parentId: "document-library",
		icon: "book-open",
		selectionMode: "none",
	},
	{ id: "panel", name: "面板", icon: "sidebar", selectionMode: "none" },
	{
		id: "panel-top",
		name: "顶部面板",
		parentId: "panel",
		icon: "panel-top",
		selectionMode: "none",
	},
	{
		id: "panel-left",
		name: "左侧面板",
		parentId: "panel",
		icon: "panel-left",
		selectionMode: "none",
	},
	{
		id: "panel-right",
		name: "右侧面板",
		parentId: "panel",
		icon: "panel-right",
		selectionMode: "none",
	},
	{
		id: "topbar-left",
		name: "顶栏左侧",
		parentId: "panel",
		icon: "panel-top",
		selectionMode: "none",
	},
	{
		id: "topbar-right",
		name: "顶栏右侧",
		parentId: "panel",
		icon: "panel-top",
		selectionMode: "none",
	},
];

const slotById = new Map(builtinSlotRegistry.map((slot) => [slot.id, slot]));

function builtinSlotPath(id: string) {
	const names: string[] = [];
	let current = slotById.get(id);
	while (current) {
		names.unshift(current.name);
		current = current.parentId ? slotById.get(current.parentId) : undefined;
	}
	return names.length ? `/slot/${names.join("/")}` : `/slot/${id}`;
}

const builtinManifests = import.meta.glob("../builtIn/*/.pulsar-plugin.json", {
	eager: true,
	query: "?raw",
	import: "default",
}) as Record<string, string>;
const builtinTextFiles = import.meta.glob(
	"../builtIn/*/**/*.{md,json,js,vue,ts,txt,data,yaml,yml}",
	{ eager: true, query: "?raw", import: "default" },
) as Record<string, string>;
const builtinAssets = import.meta.glob("../builtIn/*/**/*", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

function set(target: object, key: string, value: unknown) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}

function ensureFolder(data: PluginData, path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") return data.tree;
	let tree = data.tree;
	let current = "";
	for (const name of normalized.slice(1).split("/")) {
		current += `/${name}`;
		const existing = tree[name];
		if (typeof existing === "string")
			throw new Error(`内置资源目录冲突：${current}`);
		if (!existing) {
			const next: ResourceTree = {};
			set(tree, name, next);
			set(data.meta, current, defaultFolderMeta());
			tree = next;
		} else {
			tree = existing;
		}
	}
	return tree;
}

function writeBuiltinFile(
	data: PluginData,
	path: ResourcePath,
	content: string,
	meta: FileMeta,
) {
	const normalized = normalizeResourcePath(path);
	const parent = ensureFolder(
		data,
		normalized.slice(0, normalized.lastIndexOf("/")) || "/",
	);
	set(parent, normalized.slice(normalized.lastIndexOf("/") + 1), content);
	set(data.meta, normalized, meta);
}

function localSlot(data: PluginData, slot: string) {
	const path = `/localSlot/${slot}`;
	ensureFolder(data, path);
	set(data.meta, path, {
		...defaultFolderMeta(),
		parent: builtinSlotPath(slot),
	});
	return path;
}

function materializeSlotRegistry(data: PluginData) {
	ensureFolder(data, "/slot");
	for (const slot of builtinSlotRegistry) {
		const path = builtinSlotPath(slot.id);
		ensureFolder(data, path);
		set(data.meta, path, { selectionMode: slot.selectionMode });
	}
}

function sourceKey(folder: string, path: string) {
	return `../builtIn/${folder}/${path.replace(/^\//, "")}`;
}

export function importBuiltinPlugin(
	folder: string,
	manifestSource: string,
): PluginData {
	const manifest = JSON.parse(manifestSource) as BuiltinManifest;
	const data: PluginData = { id: manifest.plugin.id, tree: {}, meta: {} };
	for (const path of Object.keys(manifest.nodes)
		.filter((path) => path !== "/")
		.sort((left, right) => left.localeCompare(right))) {
		const source = sourceKey(folder, path);
		const text = builtinTextFiles[source];
		const asset = builtinAssets[source];
		if (text === undefined && asset === undefined) {
			ensureFolder(data, `/${path}`);
			continue;
		}
		const definition = manifest.nodes[path]!;
		writeBuiltinFile(data, `/${path}`, text ?? asset ?? "", {
			...defaultFileMeta(),
			resourceSelected: manifest.plugin.id !== "builtin-blank-plugin",
			priority: definition.order ?? 100,
			...(definition.insertion
				? {
						slot: localSlot(data, definition.insertion.slot),
						condition: definition.insertion.condition,
						conditionEnabled: definition.insertion.conditionEnabled,
					}
				: {}),
		});
	}
	return data;
}

/** Built-ins are imported as ordinary source-local trees; no World-only shape survives. */
export function importBuiltinPlugins() {
	return Object.fromEntries(
		Object.entries(builtinManifests).map(([key, source]) => {
			const folder = key.split("/").at(-2);
			if (!folder) throw new Error(`无效的内置 Plugin 路径：${key}`);
			const data = importBuiltinPlugin(folder, source);
			return [data.id, data];
		}),
	);
}

/** New local Plugins start as an ordinary editable source tree. */
export function createLocalPluginData(id: string): PluginData {
	const data: PluginData = { id, tree: {}, meta: {} };
	materializeSlotRegistry(data);
	ensureFolder(data, "/localSlot");
	writeBuiltinFile(
		data,
		"/definition.package.json",
		JSON.stringify({ schemaVersion: 1, name: "新角色", tags: [] }, null, 2),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/avatar.png",
		generateProceduralAvatarDataUrl(id, "新角色"),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/cover.png",
		generateProceduralCoverDataUrl(id, "新角色"),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/config.json",
		JSON.stringify(
			{ temperature: 0.7, maxTokens: 2048, debugMode: false, promptPrefix: "" },
			null,
			2,
		),
		defaultFileMeta(),
	);
	return data;
}

export function readImportedFile(data: PluginData, path: ResourcePath) {
	const node = resolveNode(data.tree, path).node;
	if (typeof node !== "string") throw new Error(`不是文件：${path}`);
	return node;
}
