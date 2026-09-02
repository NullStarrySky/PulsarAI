<script setup lang="ts">
import { Box, Braces, Folder, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import type {
	FileTreeAction,
	FileTreeActions,
	FileTreeNode,
} from "@/components/common/file-tree";
import { FileTree } from "@/components/common/file-tree";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import { useWorld, type WorldResource } from "./world-store";
import type { WorldFileNode, WorldFolderNode, WorldNode } from "./world-types";

const props = defineProps<{ packageId: string; conversationId?: string }>();
const emit = defineEmits<{
	select: [value: { file: WorldFileNode; path: string }];
	close: [];
}>();
const world = useWorld(
	computed(() => ({
		packageId: props.packageId,
		conversationId: props.conversationId,
		applyReplay: true,
	})),
);
const tab = ref<"assets" | "slots" | "sources">("assets");
const selected = ref("");
const expanded = ref<string[]>(["global", "self"]);
const clipboard = ref<{
	type: "cut" | "copy";
	path: string;
	nodeType: "file" | "folder";
} | null>(null);
const tabOptions = [
	{ value: "assets", label: "资源" },
	{ value: "slots", label: "插槽" },
	{ value: "sources", label: "来源" },
];
const fileKinds = [
	["markdown", "Markdown", ".md"],
	["chat", "聊天", ".chat.json"],
	["data", "数据", ".data.json"],
	["javascript", "JavaScript", ".js"],
	["json", "JSON", ".json"],
	["media", "媒体", ".png"],
	["text", "文本", ".txt"],
] as const;

type SlotKind = "regular" | "global-root" | "global" | "local-root" | "local";
const kindOf = (node: FileTreeNode): SlotKind =>
	node.data?.slotKind ?? "regular";
const hasPath = (node: FileTreeNode) => Boolean(node.data?.path);
const canManipulate = (node: FileTreeNode) =>
	hasPath(node) &&
	!node.data?.isRoot &&
	!["global-root", "local-root"].includes(kindOf(node));
const canCreateFile = (node: FileTreeNode) =>
	node.type === "folder" && kindOf(node) === "regular";
const canCreateFolder = (node: FileTreeNode) =>
	node.type === "folder" &&
	["regular", "global-root", "local-root"].includes(kindOf(node));
function canPaste(node: FileTreeNode) {
	if (!clipboard.value || node.type !== "folder" || node.data?.isRoot)
		return false;
	if (kindOf(node) === "global") return false;
	if (["global-root", "local-root", "local"].includes(kindOf(node)))
		return clipboard.value.nodeType === "folder";
	return true;
}
function isResourceSelected(resource: WorldResource) {
	const slot = world.slots.value.find((item) =>
		item.allResources.some((candidate) => candidate.path === resource.path),
	);
	return slot?.selectionMode === "single"
		? slot.resources.some((item) => item.path === resource.path)
		: resource.file.resourceSelected;
}
function nodeActions(): FileTreeActions {
	return {
		open: { id: "open", icon: "folder-open", name: "打开", type: "file" },
		"new-file": {
			id: "new-file",
			icon: "file-plus-2",
			name: "新建文件",
			type: canCreateFile,
			subActions: fileKinds.map(([id, name]) => ({
				id: `add-file:${id}`,
				icon: "file-plus-2",
				name: `${name} 文件`,
				type: canCreateFile,
			})),
		},
		"new-folder": {
			id: "new-folder",
			icon: "folder-plus",
			name: "新建文件夹",
			type: canCreateFolder,
		},
		cut: {
			id: "cut",
			icon: "scissors",
			name: "剪切",
			separatorBefore: true,
			type: canManipulate,
		},
		copy: { id: "copy", icon: "copy", name: "复制", type: canManipulate },
		paste: {
			id: "paste",
			icon: "clipboard-paste",
			name: "粘贴",
			type: canPaste,
		},
		"copy-path": {
			id: "copy-path",
			icon: "copy",
			name: "复制路径",
			separatorBefore: true,
			type: hasPath,
		},
		"copy-id-path": {
			id: "copy-id-path",
			icon: "copy",
			name: "复制 ID 路径",
			type: hasPath,
		},
		rename: {
			id: "rename",
			icon: "pencil",
			name: "重命名",
			separatorBefore: true,
			type: canManipulate,
			input: {
				placeholder: "名称",
				value: (node) => node.name,
				submitLabel: "重命名",
			},
		},
		delete: {
			id: "delete",
			icon: "trash-2",
			name: "删除",
			type: canManipulate,
		},
	};
}
function orderedChildren(folder: WorldFolderNode) {
	return Object.values(folder.children).sort(
		(left, right) =>
			left.treeOrder - right.treeOrder || left.name.localeCompare(right.name),
	);
}
function treeNode(
	scope: "global" | "self",
	node: WorldNode,
	names: string[],
	options: {
		isRoot?: boolean;
		sourceId?: string;
		globalSlotTree?: boolean;
		globalSlotRoot?: boolean;
		localSlotTree?: boolean;
		localSlotRoot?: boolean;
	} = {},
): FileTreeNode {
	const isRoot = options.isRoot ?? false;
	const nodeNames = isRoot ? names : [...names, node.name];
	const sourceId =
		scope === "global" && !isRoot ? (options.sourceId ?? node.id) : undefined;
	const path = isRoot
		? `/${scope}`
		: scope === "self"
			? `/self/$${node.id}`
			: `/global/$${sourceId}${sourceId === node.id ? "" : `/$${node.id}`}`;
	const globalSlotRoot =
		options.globalSlotRoot ??
		(scope === "self" && !isRoot && node.id === "slot");
	const globalSlotTree = options.globalSlotTree || globalSlotRoot;
	const localSlotRoot =
		options.localSlotRoot ?? (!isRoot && node.name === "localSlot");
	const localSlotTree = options.localSlotTree || localSlotRoot;
	const slotKind: SlotKind = globalSlotRoot
		? "global-root"
		: globalSlotTree
			? "global"
			: localSlotRoot
				? "local-root"
				: localSlotTree
					? "local"
					: "regular";
	const resource =
		node.type === "file"
			? world.resources.value.find(
					(item) => item.scope === scope && item.file.id === node.id,
				)
			: undefined;
	return {
		id: `${scope}:${node.id}`,
		name: node.name,
		type: node.type,
		icon: node.icon,
		...(node.type === "folder"
			? {
					openIcon: node.openIcon,
					children: orderedChildren(node).map((child) =>
						treeNode(scope, child, nodeNames, {
							sourceId,
							globalSlotTree,
							globalSlotRoot: false,
							localSlotTree,
							localSlotRoot: false,
						}),
					),
				}
			: {}),
		action: nodeActions(),
		data: {
			path,
			displayPath: `/${scope}${nodeNames.length ? `/${nodeNames.join("/")}` : ""}`,
			scope,
			file: node.type === "file" ? node : undefined,
			resource,
			slotKind,
			isRoot,
		},
	};
}
function resourceNode(
	resource: WorldResource,
	icon?: string,
	allowActions = true,
): FileTreeNode {
	return {
		id: `${resource.scope}:${resource.file.id}`,
		name: resource.file.name,
		type: "file",
		icon: icon ?? resource.file.icon,
		prefix: resource.sourceName,
		selectableResource: true,
		resourceSelected: isResourceSelected(resource),
		...(allowActions ? { action: nodeActions() } : {}),
		data: {
			path: resource.path,
			displayPath: resource.displayPath,
			file: resource.file,
			resource,
			slotKind: "regular" satisfies SlotKind,
			isRoot: false,
		},
	};
}
const assetNodes = computed<FileTreeNode[]>(() => {
	const value = world.world.value;
	return value
		? [
				treeNode("global", value.global.root, [], { isRoot: true }),
				treeNode("self", value.self.root, [], { isRoot: true }),
			]
		: [];
});
const slotNodes = computed<FileTreeNode[]>(() => [
	{
		id: "self:slot",
		name: "slot",
		type: "folder",
		action: nodeActions(),
		children: world.slots.value.map((slot) => ({
			id: `slot:${slot.id}`,
			name: slot.name,
			type: "folder" as const,
			icon: slot.icon,
			action: nodeActions(),
			children: slot.allResources.map((resource) =>
				resourceNode(resource, slot.icon),
			),
			data: {
				path: slot.path,
				displayPath: `/self/slot/${slot.name}`,
				slotKind: "global" satisfies SlotKind,
				selectionMode: slot.selectionMode,
				isRoot: false,
			},
		})),
		data: {
			path: "/self/slot",
			displayPath: "/self/slot",
			slotKind: "global-root" satisfies SlotKind,
			isRoot: false,
		},
	},
]);
function localSlotBranch(
	scope: "global" | "self",
	sourceName: string,
	prefix: string,
	localRoot: WorldFolderNode,
	folder: WorldFolderNode = localRoot,
	names: string[] = [localRoot.name],
): FileTreeNode {
	const path = `${prefix}/$${localRoot.id}${folder === localRoot ? "" : `/$${folder.id}`}`;
	const local = world.localSlots.value.find((slot) => slot.path === path);
	const icon = world.slots.value.find(
		(slot) => slot.path === local?.parent,
	)?.icon;
	return {
		id: `${scope}:local:${folder.id}`,
		name: folder.name,
		type: "folder",
		icon: folder.icon,
		children: [
			...orderedChildren(folder)
				.filter((child): child is WorldFolderNode => child.type === "folder")
				.map((child) =>
					localSlotBranch(scope, sourceName, prefix, localRoot, child, [
						...names,
						child.name,
					]),
				),
			...(local?.allResources ?? []).map((resource) =>
				resourceNode(resource, icon, false),
			),
		],
		data: {
			path,
			displayPath: `${scope === "self" ? "/self" : `/global/${sourceName}`}/${names.join("/")}`,
			slotKind: (folder === localRoot
				? "local-root"
				: "local") satisfies SlotKind,
			isRoot: false,
		},
	};
}
function sourceSlotBranch(
	scope: "global" | "self",
	sourceId: string,
	resources: WorldResource[],
): FileTreeNode {
	const paths = new Set(resources.map((resource) => resource.path));
	return {
		id: `${scope}:source:${sourceId}:slot`,
		name: "slot",
		type: "folder",
		children: world.slots.value
			.map((slot) => ({
				slot,
				resources: slot.allResources.filter((resource) =>
					paths.has(resource.path),
				),
			}))
			.filter(({ resources }) => resources.length)
			.map(({ slot, resources }) => ({
				id: `${scope}:source:${sourceId}:slot:${slot.id}`,
				name: slot.name,
				type: "folder" as const,
				icon: slot.icon,
				children: resources.map((resource) =>
					resourceNode(resource, slot.icon, false),
				),
				data: { selectionMode: slot.selectionMode, isRoot: true },
			})),
		data: { isRoot: true },
	};
}
const sourceNodes = computed<FileTreeNode[]>(() => {
	const value = world.world.value;
	if (!value) return [];
	const source = (
		scope: "global" | "self",
		root: WorldFolderNode,
		name: string,
		prefix: string,
	) => {
		const localRoot = Object.values(root.children).find(
			(node): node is WorldFolderNode =>
				node.type === "folder" && node.name === "localSlot",
		);
		const resources = world.resources.value.filter(
			(resource) =>
				resource.scope === scope &&
				resource.sourceName === (scope === "self" ? "本地" : name),
		);
		return {
			id: `${scope}:source:${root.id}`,
			name,
			type: "folder" as const,
			children: [
				sourceSlotBranch(scope, root.id, resources),
				...(localRoot ? [localSlotBranch(scope, name, prefix, localRoot)] : []),
			],
			data: { isRoot: true },
		};
	};
	return [
		...Object.values(value.global.root.children)
			.filter((node): node is WorldFolderNode => node.type === "folder")
			.map((node) => source("global", node, node.name, `/global/$${node.id}`)),
		source("self", value.self.root, "self", "/self"),
	];
});
const nodes = computed(() =>
	tab.value === "assets"
		? assetNodes.value
		: tab.value === "slots"
			? slotNodes.value
			: sourceNodes.value,
);
function activate(node: FileTreeNode) {
	selected.value = node.id;
	if (node.data.file && node.data.path)
		emit("select", { file: node.data.file, path: node.data.path });
}
async function createFile(path: string, kind: string) {
	const extension = fileKinds.find(([id]) => id === kind)?.[2] ?? ".txt";
	let index = 1;
	while (world.exists(`${path}/untitled-${index}${extension}`)) index += 1;
	await world.createFile(path, `untitled-${index}${extension}`, "");
}
async function createFolder(node: FileTreeNode, path: string) {
	const base = ["local-root", "local"].includes(kindOf(node))
		? "slot"
		: "folder";
	let index = 1;
	while (world.exists(`${path}/${base}-${index}`)) index += 1;
	const created = await world.createFolder(path, `${base}-${index}`);
	if (kindOf(node) === "global-root")
		await world.updateFolder(created, {
			selectionMode: "multiple",
			allowedResourceTypes: [
				"markdown",
				"chat",
				"data",
				"javascript",
				"json",
				"media",
				"component",
				"text",
			],
		});
}
function copyText(value: string) {
	void navigator.clipboard.writeText(value);
}
function toggleNode(node: FileTreeNode, value: boolean) {
	if (node.data.resource)
		void world.setSelected((node.data.resource as WorldResource).path, value);
}
async function runTreeAction(
	node: FileTreeNode,
	action: FileTreeAction,
	value?: string,
) {
	const path = String(node.data.path ?? "");
	if (!path) return;
	if (action.id === "open") return activate(node);
	if (action.id === "cut" || action.id === "copy") {
		clipboard.value = { type: action.id, path, nodeType: node.type };
		return;
	}
	if (action.id === "paste") {
		const current = clipboard.value;
		if (!current) return;
		if (current.type === "cut") {
			await world.moveTo(current.path, path);
			clipboard.value = null;
		} else await world.copy(current.path, path);
		return;
	}
	if (action.id.startsWith("add-file:"))
		return createFile(path, action.id.slice("add-file:".length));
	if (action.id === "new-folder") return createFolder(node, path);
	if (action.id === "copy-path")
		return copyText(String(node.data.displayPath ?? path));
	if (action.id === "copy-id-path") return copyText(path);
	if (action.id === "delete") return world.remove(path);
	if (action.id !== "rename") return;
	const name = value?.trim();
	if (!name || /[\\/]/.test(name) || name === node.name) return;
	if (node.type === "file") await world.updateFile(path, { name });
	else await world.updateFolder(path, { name });
}
</script>

<template>
  <aside class="absolute inset-y-0 left-0 z-20 flex h-full w-[min(20rem,calc(100%-2rem))] min-w-[min(16rem,calc(100%-2rem))] flex-col overflow-hidden border-r bg-card shadow-xl mobile:inset-0 mobile:z-30 mobile:w-full mobile:min-w-0">
    <header class="flex shrink-0 items-center gap-1.5 border-b px-1.5 py-1.5">
      <Segmented v-model="tab" mode="icon" :options="tabOptions" aria-label="World 视图">
        <template #option="{ option }">
          <Folder v-if="option.value === 'assets'" class="size-4" />
          <Braces v-else-if="option.value === 'slots'" class="size-4" />
          <Box v-else class="size-4" />
        </template>
      </Segmented>
      <Button variant="ghost" size="icon" class="ml-auto size-8" aria-label="关闭" @click="emit('close')"><X class="size-4" /></Button>
    </header>
    <FileTree v-model="selected" v-model:expanded="expanded" :nodes="nodes" :min-width="260" class="min-h-0 flex-1" @select="activate" @toggle-resource="toggleNode" @action="runTreeAction" />
  </aside>
</template>
