import { createPluginMediaContent } from "@/features/Plugin/editors/media/plugin-media";
import blankMetaSource from "../builtIn/blank/.pulsar-plugin.json?raw";
import coreMetaSource from "../builtIn/core/.pulsar-plugin.json?raw";
import defaultMetaSource from "../builtIn/default/.pulsar-plugin.json?raw";
import {
	createWorldDocument,
	createWorldFile,
	createWorldFolder,
	type WorldDocument,
	type WorldFileType,
	type WorldFolderNode,
	type WorldSlot,
	worldFileType,
} from "./world-types";

const rawFiles = import.meta.glob(
	"../builtIn/*/**/*.{md,json,js,vue,ts,txt,data}",
	{
		eager: true,
		query: "?raw",
		import: "default",
	},
) as Record<string, string>;
const assetUrls = import.meta.glob("../builtIn/*/**/*", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

type SourceMeta = {
	plugin: { id: string; name: string };
	nodes: Record<
		string,
		{
			id: string;
			icon?: string;
			treeOrder?: number;
			order?: number;
			insertion?: {
				slot: string;
				condition?: string;
				conditionEnabled?: boolean;
			};
		}
	>;
};

export function builtinSlots(): WorldSlot[] {
	return [
		{
			id: "role",
			name: "角色",
			icon: "user-round",
			allowedResourceTypes: [],
			selectionMode: "none",
		},
		{
			id: "user",
			name: "用户角色",
			parentId: "role",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "character",
			name: "系统角色",
			parentId: "role",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "context",
			name: "上下文位置",
			icon: "text-align-left",
			allowedResourceTypes: [],
			selectionMode: "none",
		},
		{
			id: "before_char",
			name: "角色之前",
			parentId: "context",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "after_char",
			name: "角色之后",
			parentId: "context",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "document",
			name: "顶部",
			parentId: "context",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "generation",
			name: "生成流程",
			icon: "workflow",
			allowedResourceTypes: [],
			selectionMode: "none",
		},
		{
			id: "generatePath",
			name: "主流程",
			parentId: "generation",
			icon: "play",
			description: "注册生成流程入口脚本。",
			allowedResourceTypes: ["javascript"],
			selectionMode: "single",
		},
		{
			id: "depth",
			name: "深度",
			icon: "list-numbers",
			allowedResourceTypes: [],
			selectionMode: "none",
		},
		...[0, 1, 2, 3, 4].map((depth) => ({
			id: `depth:${depth}`,
			name: String(depth),
			parentId: "depth",
			description:
				depth === 0
					? "将聊天消息插入到消息列表末尾。"
					: `将聊天消息插入到距末尾${depth}条消息的位置。`,
			allowedResourceTypes: ["chat"] as WorldFileType[],
			selectionMode: "none" as const,
		})),
		{
			id: "CTX_BUILD",
			name: "上下文构建",
			parentId: "generation",
			description: "注册生成流程可调用的上下文构建脚本。",
			allowedResourceTypes: ["javascript"],
			selectionMode: "single",
		},
		{
			id: "CTX_PROCESS_BEFORE_REGEX",
			name: "上下文处理器",
			parentId: "generation",
			description: "注册正则执行前上下文处理脚本。",
			allowedResourceTypes: ["javascript"],
			selectionMode: "none",
		},
		{
			id: "REGEX",
			name: "正则",
			parentId: "generation",
			icon: "regex",
			description: "注册可由生成流程读取的正则规则。",
			allowedResourceTypes: ["json"],
			selectionMode: "none",
		},
		{
			id: "resource",
			name: "资源",
			icon: "files",
			allowedResourceTypes: [],
			selectionMode: "none",
		},
		{
			id: "toolFunction",
			name: "工具",
			parentId: "document-library",
			icon: "wrench",
			description:
				"tools/<name>/prompt.md 自动进入上下文；同目录 tool.js 以函数名写入 ctx。",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "skill",
			name: "skill",
			parentId: "document-library",
			icon: "book-open",
			description: "注册可被 Agent 读取的技能文档。",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "document-library",
			name: "文档",
			icon: "file-text",
			allowedResourceTypes: [],
			selectionMode: "none",
		},
		{
			id: "COMMAND",
			name: "指令",
			parentId: "resource",
			icon: "terminal",
			description: "注册输入框可调用的 JavaScript、Markdown 和 Vue 命令。",
			allowedResourceTypes: ["javascript", "markdown", "component"],
			selectionMode: "none",
		},
		{
			id: "MODE",
			name: "模式",
			parentId: "resource",
			icon: "pencil-line",
			description: "注册包含进入与退出脚本的自定义输入模式。",
			allowedResourceTypes: ["json"],
			selectionMode: "none",
		},
		{
			id: "panel",
			name: "面板",
			icon: "sidebar",
			allowedResourceTypes: [],
			selectionMode: "none",
		},
		{
			id: "panel-top",
			name: "顶部面板",
			parentId: "panel",
			icon: "panel-top",
			description: "注册消息区上方的组件。",
			allowedResourceTypes: ["component"],
			selectionMode: "none",
		},
		{
			id: "panel-left",
			name: "左侧面板",
			parentId: "panel",
			icon: "panel-left",
			description: "注册左侧面板组件。",
			allowedResourceTypes: ["component"],
			selectionMode: "none",
		},
		{
			id: "panel-right",
			name: "右侧面板",
			parentId: "panel",
			icon: "panel-right",
			description: "注册右侧面板组件。",
			allowedResourceTypes: ["component"],
			selectionMode: "none",
		},
		{
			id: "topbar-left",
			name: "顶栏左侧",
			parentId: "panel",
			icon: "panel-top",
			description: "注册顶栏左侧组件。",
			allowedResourceTypes: ["component"],
			selectionMode: "none",
		},
		{
			id: "topbar-right",
			name: "顶栏右侧",
			parentId: "panel",
			icon: "panel-top",
			description: "注册顶栏右侧组件。",
			allowedResourceTypes: ["component"],
			selectionMode: "none",
		},
		{
			id: "background",
			name: "背景图片",
			parentId: "resource",
			icon: "image",
			description: "注册可供选择的背景媒体。",
			allowedResourceTypes: ["media"],
			selectionMode: "single",
		},
		{
			id: "chat",
			name: "生成入口",
			parentId: "generation",
			icon: "messages-square",
			description: "注册可供选择的聊天上下文入口文件。",
			allowedResourceTypes: ["chat"],
			selectionMode: "single",
		},
	];
}

function builtinSlotPaths() {
	const paths = new Map<string, string>();
	const slots = builtinSlots();
	const pending = new Map(slots.map((slot) => [slot.id, slot]));
	while (pending.size) {
		for (const [id, slot] of pending) {
			if (slot.parentId && !paths.has(slot.parentId)) continue;
			paths.set(
				id,
				`${slot.parentId ? paths.get(slot.parentId) : "/self/slot"}/$${id}`,
			);
			pending.delete(id);
		}
	}
	return paths;
}

/** Stable /self/slot contract path of a builtin global slot, e.g. `character`. */
export function builtinGlobalSlotPath(slotId: string): string | undefined {
	return builtinSlotPaths().get(slotId);
}

function folderFor(
	root: WorldFolderNode,
	id: string,
	name: string,
	treeOrder = 0,
) {
	const existing = root.children[id];
	if (existing?.type === "folder") return existing;
	const folder = createWorldFolder(name, { id, treeOrder });
	root.children[id] = folder;
	return folder;
}

function parseContent(name: string, sourceKey: string) {
	const type = worldFileType(name);
	if (type === "media")
		return createPluginMediaContent(assetUrls[sourceKey] ?? "");
	const source = rawFiles[sourceKey] ?? "";
	if (type === "json" || type === "chat" || type === "data")
		return JSON.parse(source);
	return source;
}

function appendBuiltin(root: WorldFolderNode, folder: string, source: string) {
	const meta = JSON.parse(source) as SourceMeta;
	const pluginRoot = folderFor(root, meta.plugin.id, meta.plugin.name);
	const localSlotRoot = folderFor(
		pluginRoot,
		`${meta.plugin.id}:localSlot`,
		"localSlot",
		-1,
	);
	const localSlotFor = (globalSlotId: string) => {
		const id = `${meta.plugin.id}:localSlot:${globalSlotId}`;
		const existing = localSlotRoot.children[id];
		if (existing?.type === "folder") return existing;
		const localSlot = createWorldFolder(globalSlotId, {
			id,
			parent: builtinSlotPaths().get(globalSlotId),
			treeOrder: Object.keys(localSlotRoot.children).length,
		});
		localSlotRoot.children[id] = localSlot;
		return localSlot;
	};
	const paths = Object.keys(meta.nodes)
		.filter((path) => path !== "/")
		.sort((a, b) => a.localeCompare(b));
	for (const path of paths) {
		const nodeMeta = meta.nodes[path]!;
		const parts = path.split("/").filter(Boolean);
		const name = parts[parts.length - 1]!;
		const sourceKey = `../builtIn/${folder}/${path}`;
		const isFile =
			Object.prototype.hasOwnProperty.call(rawFiles, sourceKey) ||
			Object.prototype.hasOwnProperty.call(assetUrls, sourceKey);
		let parent = pluginRoot;
		for (const [index, part] of parts.slice(0, -1).entries()) {
			const parentPath = parts.slice(0, index + 1).join("/");
			const parentMeta = meta.nodes[parentPath];
			parent = folderFor(
				parent,
				parentMeta?.id ?? `${meta.plugin.id}:${parentPath}`,
				part,
				parentMeta?.treeOrder ?? index,
			);
		}
		if (!isFile) {
			folderFor(parent, nodeMeta.id, name, nodeMeta.treeOrder ?? 0);
			continue;
		}
		const localSlot = nodeMeta.insertion?.slot
			? localSlotFor(nodeMeta.insertion.slot)
			: undefined;
		parent.children[nodeMeta.id] = createWorldFile(
			name,
			parseContent(name, sourceKey),
			{
				id: nodeMeta.id,
				icon: nodeMeta.icon,
				treeOrder: nodeMeta.treeOrder ?? 0,
				priority: nodeMeta.order ?? 100,
				resourceSelected: meta.plugin.id !== "builtin-blank-plugin",
				slot: localSlot
					? `/global/$${pluginRoot.id}/$${localSlotRoot.id}/$${localSlot.id}`
					: undefined,
				condition: nodeMeta.insertion?.condition,
				conditionEnabled: nodeMeta.insertion?.conditionEnabled,
			},
		);
	}
}

export function createBuiltinGlobalWorld() {
	const world = createWorldDocument("global", "global");
	appendBuiltin(world.root, "core", coreMetaSource);
	appendBuiltin(world.root, "blank", blankMetaSource);
	appendBuiltin(world.root, "default", defaultMetaSource);
	return world;
}

export function createLocalPluginWorld(localPluginId: string): WorldDocument {
	const world = createWorldDocument(`local:${localPluginId}`, "self");
	const slotRoot = createWorldFolder("slot", { id: "slot" });
	const slotFolders = new Map<string, WorldFolderNode>([["", slotRoot]]);
	const pendingSlots = new Map(builtinSlots().map((slot) => [slot.id, slot]));
	while (pendingSlots.size) {
		let created = false;
		for (const [id, slot] of pendingSlots) {
			const parent = slotFolders.get(slot.parentId ?? "");
			if (!parent) continue;
			const folder = createWorldFolder(slot.name ?? slot.id, {
				id: slot.id,
				icon: slot.icon,
				description: slot.description,
				selectionMode: slot.selectionMode,
				allowedResourceTypes: slot.allowedResourceTypes,
			});
			parent.children[slot.id] = folder;
			slotFolders.set(id, folder);
			pendingSlots.delete(id);
			created = true;
		}
		if (!created) throw new Error("内置插槽层级包含循环。");
	}
	world.root.children[slotRoot.id] = slotRoot;
	// 类型契约根：types/<类型|后缀>/wrapper|renderer|initer，允许覆盖既有包装或注册自定义后缀。
	const typesRoot = createWorldFolder("types", {
		id: "slot:types",
		icon: "stack",
		description:
			"按类型覆盖包装、渲染与初始内容；直接子文件夹名注册自定义后缀。",
		treeOrder: 1,
	});
	slotRoot.children[typesRoot.id] = typesRoot;
	const localSlotRoot = createWorldFolder("localSlot", {
		id: "localSlot",
		treeOrder: 1,
	});
	world.root.children[localSlotRoot.id] = localSlotRoot;
	world.root.children.definition = createWorldFile(
		"definition.package.json",
		{ schemaVersion: 1, name: "新角色", tags: [] },
		{ id: "definition", treeOrder: -2 },
	);
	world.root.children.avatar = createWorldFile("avatar.png", "", {
		id: "avatar",
		treeOrder: -1,
	});
	world.root.children.cover = createWorldFile("cover.png", "", {
		id: "cover",
		treeOrder: 0,
	});
	return world;
}
