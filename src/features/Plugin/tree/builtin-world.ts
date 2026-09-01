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
			insertion?: { slot: string; condition?: string };
		}
	>;
};

export function builtinSlots(): WorldSlot[] {
	return [
		{
			id: "generatePath",
			icon: "play",
			description: "注册生成流程入口脚本。",
			allowedResourceTypes: ["javascript"],
			selectionMode: "single",
		},
		{
			id: "character",
			icon: "user-round",
			description: "汇集角色定义文档。",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "user",
			description: "汇集用户扮演角色的信息说明。",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "before_char",
			description: "插入到角色定义之前的补充文档。",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "after_char",
			description: "插入到角色定义之后的补充文档。",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "document",
			icon: "file-text",
			description: "汇集可直接进入上下文的普通文档。",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		...[0, 1, 2, 3, 4].map((depth) => ({
			id: `depth:${depth}`,
			description:
				depth === 0
					? "将聊天消息插入到消息列表末尾。"
					: `将聊天消息插入到距末尾${depth}条消息的位置。`,
			allowedResourceTypes: ["chat"] as WorldFileType[],
			selectionMode: "none" as const,
		})),
		{
			id: "CTX_BUILD",
			icon: "workflow",
			description: "注册生成流程可调用的上下文构建脚本。",
			allowedResourceTypes: ["javascript"],
			selectionMode: "single",
		},
		{
			id: "CTX_PROCESS_BEFORE_REGEX",
			description: "注册正则执行前上下文处理脚本。",
			allowedResourceTypes: ["javascript"],
			selectionMode: "none",
		},
		{
			id: "REGEX",
			icon: "regex",
			description: "注册可由生成流程读取的正则规则。",
			allowedResourceTypes: ["json"],
			selectionMode: "none",
		},
		{
			id: "DATA_INJECT",
			icon: "database",
			description: "注册仅由生成流程读取的 .data.json。",
			allowedResourceTypes: ["data"],
			selectionMode: "none",
		},
		{
			id: "data_prompt",
			description: "注册仅由上下文构建读取的 .chat.json 数据说明。",
			allowedResourceTypes: ["chat"],
			selectionMode: "none",
		},
		{
			id: "toolFunction",
			icon: "wrench",
			description:
				"tools/<name>/prompt.md 自动进入上下文；同目录 tool.js 以函数名写入 ctx。",
			allowedResourceTypes: ["markdown"],
			selectionMode: "none",
		},
		{
			id: "COMMAND",
			icon: "terminal",
			description: "注册输入框可调用的 JavaScript、Markdown 和 Vue 命令。",
			allowedResourceTypes: ["javascript", "markdown", "component"],
			selectionMode: "none",
		},
		{
			id: "LEFTPANEL",
			icon: "panel-left",
			description: "注册左侧面板组件。",
			allowedResourceTypes: ["component"],
			selectionMode: "none",
		},
		{
			id: "RIGHTPANEL",
			icon: "panel-right",
			description: "注册右侧面板组件。",
			allowedResourceTypes: ["component"],
			selectionMode: "none",
		},
		{
			id: "background",
			icon: "image",
			description: "注册可供选择的背景媒体。",
			allowedResourceTypes: ["media"],
			selectionMode: "single",
		},
		{
			id: "chat",
			icon: "messages-square",
			description: "注册可供选择的聊天上下文入口文件。",
			allowedResourceTypes: ["chat"],
			selectionMode: "single",
		},
	];
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
		parent.children[nodeMeta.id] = createWorldFile(
			name,
			parseContent(name, sourceKey),
			{
				id: nodeMeta.id,
				icon: nodeMeta.icon,
				treeOrder: nodeMeta.treeOrder ?? 0,
				priority: nodeMeta.order ?? 100,
				resourceSelected: meta.plugin.id !== "builtin-blank-plugin",
				slot: nodeMeta.insertion?.slot
					? `/self/slot/${nodeMeta.insertion.slot}`
					: undefined,
				condition: nodeMeta.insertion?.condition,
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

export function createPackageWorld(packageId: string): WorldDocument {
	const world = createWorldDocument(`package:${packageId}`, "self");
	const slotRoot = createWorldFolder("slot", { id: "slot" });
	for (const slot of builtinSlots()) {
		slotRoot.children[slot.id] = createWorldFolder(slot.id, {
			id: slot.id,
			icon: slot.icon,
			description: slot.description,
			selectionMode: slot.selectionMode,
			allowedResourceTypes: slot.allowedResourceTypes,
		});
	}
	world.root.children[slotRoot.id] = slotRoot;
	return world;
}
