<script setup lang="ts">
import { Box, Braces, Folder, Globe, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import type {
	FileTreeAction,
	FileTreeActions,
	FileTreeNode,
} from "@/components/common/file-tree";
import { FileTree } from "@/components/common/file-tree";
import { Button, Tabs, TabsList, TabItem } from "@/components/fluid";
import { applyStImportPlan } from "@/features/Migrations/SillyTavern/import/st-import-apply";
import {
	readStResourceFile,
	tryBuildStImportPlan,
} from "@/features/Migrations/SillyTavern/import/st-import-plan";
import { createPluginMediaContent } from "@/features/Plugin/editors/media/plugin-media";
import { mediaLink, writeMedia } from "@/features/Media/media-link";
import { useLocalStorage } from "@vueuse/core";
import { host } from "@/host";
import { locateRequest } from "./file-editor-manager";
import { useWorld, type WorldResource } from "./world-store";
import type { WorldFileNode, WorldFolderNode, WorldNode } from "./world-types";

const props = defineProps<{ localPluginId: string; conversationId?: string }>();
const emit = defineEmits<{
	select: [value: { file: WorldFileNode; path: string }];
	close: [];
}>();

const world = useWorld(
	computed(() => ({
		localPluginId: props.localPluginId,
		conversationId: props.conversationId,
		applyReplay: true,
	})),
);

type TreeTab = "local" | "global" | "slots" | "sources";
const tab = useLocalStorage<TreeTab>("pulsar:asset-tree-tab", "local");
const selected = useLocalStorage<string>("pulsar:asset-tree-selected", "");
const expanded = useLocalStorage<string[]>("pulsar:asset-tree-expanded", []);
const initializedTabs = new Set<TreeTab>();
const importing = ref(false);

const clipboard = ref<{
	type: "cut" | "copy";
	path: string;
	nodeType: "file" | "folder";
} | null>(null);

interface FileKind {
	id: string;
	name: string;
	extension: string;
	icon: string;
}

const fileKinds: FileKind[] = [
	{ id: "markdown", name: "Markdown", extension: ".md", icon: "file-text" },
	{ id: "chat", name: "聊天", extension: ".chat.json", icon: "message-square" },
	{ id: "data", name: "数据", extension: ".data.json", icon: "database" },
	{ id: "javascript", name: "JavaScript", extension: ".js", icon: "code" },
	{ id: "json", name: "JSON", extension: ".json", icon: "braces" },
	{ id: "component", name: "Vue 组件", extension: ".vue", icon: "component" },
	{ id: "media", name: "媒体", extension: ".png", icon: "image" },
	{ id: "text", name: "文本", extension: ".txt", icon: "file-text" },
];

type SlotKind =
	| "regular"
	| "global-root"
	| "global"
	| "local-root"
	| "local"
	| "type-root"
	| "type";

const kindOf = (node: FileTreeNode): SlotKind =>
	node.data?.slotKind ?? "regular";
const hasPath = (node: FileTreeNode) => Boolean(node.data?.path);
const canManipulate = (node: FileTreeNode) =>
	hasPath(node) &&
	!node.data?.isRoot &&
	!["global-root", "local-root", "type-root"].includes(kindOf(node));
const canCreateFile = (node: FileTreeNode) =>
	node.type === "folder" && ["regular", "type"].includes(kindOf(node));
const canCreateFolder = (node: FileTreeNode) =>
	node.type === "folder" &&
	[
		"regular",
		"global-root",
		"global",
		"local-root",
		"type-root",
		"type",
	].includes(kindOf(node));

function canPaste(node: FileTreeNode) {
	if (!clipboard.value || node.type !== "folder") return false;
	if (node.data?.isRoot && kindOf(node) !== "regular") return false;
	if (kindOf(node) === "global") return false;
	if (["global-root", "local-root", "local", "type-root"].includes(kindOf(node)))
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
			subActions: fileKinds.map((kind) => ({
				id: `add-file:${kind.id}`,
				icon: kind.icon,
				name: `${kind.name} 文件`,
				type: canCreateFile,
			})),
		},
		"new-folder": {
			id: "new-folder",
			icon: "folder-plus",
			name: "新建文件夹",
			type: canCreateFolder,
		},
		"import-resource": {
			id: "import-resource",
			icon: "download",
			name: "导入资源",
			type: canCreateFile,
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
			icon: "link",
			name: "复制路径",
			separatorBefore: true,
			type: hasPath,
		},
		"copy-id-path": {
			id: "copy-id-path",
			icon: "fingerprint",
			name: "复制 ID 路径",
			type: hasPath,
		},
		rename: {
			id: "rename",
			icon: "pencil",
			name: "重命名",
			separatorBefore: true,
			type: canManipulate,
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
		typeContractTree?: boolean;
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
	const typeContractRoot = globalSlotTree && node.name === "types";
	const typeContractTree = options.typeContractTree || typeContractRoot;
	const slotKind: SlotKind = globalSlotRoot
		? "global-root"
		: typeContractRoot
			? "type-root"
			: typeContractTree
				? "type"
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
		selectableResource: false,
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
							typeContractTree,
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
	selectable = false,
	disableRowOpen = false,
): FileTreeNode {
	const slot = world.slots.value.find((item) =>
		item.allResources.some((item) => item.path === resource.path),
	);
	const selectionMode = slot?.selectionMode ?? "none";
	return {
		id: `${resource.scope}:${resource.file.id}`,
		name: resource.file.name,
		type: "file",
		icon: icon ?? resource.file.icon,
		prefix: resource.sourceName,
		disableRowOpen,
		...(selectable && selectionMode !== "none"
			? {
					selectableResource: true,
					resourceSelected: isResourceSelected(resource),
					selectionMode,
				}
			: {
					selectableResource: false,
				}),
		action: allowActions ? nodeActions() : undefined,
		data: {
			path: resource.path,
			displayPath: resource.displayPath,
			file: resource.file,
			resource,
			slotKind: "regular" as SlotKind,
			isRoot: false,
		},
	};
}

const assetRoots = computed(() => {
	const value = world.world.value;
	if (!value) return { local: [], global: [] };
	return {
		local: [treeNode("self", value.self.root, [], { isRoot: true })],
		global: [treeNode("global", value.global.root, [], { isRoot: true })],
	};
});

function slotNode(slot: (typeof world.slots.value)[number]): FileTreeNode {
	const id = `slot:${slot.id}`;
	const childSlots = world.slots.value.filter(
		(child) => child.parent === slot.path,
	);
	const resources = slot.allResources;
	return {
		id,
		name: slot.name,
		type: "folder",
		icon: slot.icon,
		action: nodeActions(),
		children: [
			...childSlots.map(slotNode),
			...resources.map((res) => resourceNode(res, slot.icon, false, true, true)),
		],
		data: {
			path: slot.path,
			displayPath: `/self/slot/${slot.name}`,
			slotKind: "global" as SlotKind,
			selectionMode: slot.selectionMode,
			isRoot: false,
		},
	};
}

const slotNodes = computed<FileTreeNode[]>(() => {
	const children = world.slots.value.filter((slot) => !slot.parent);
	return [
		{
			id: "self:slot",
			name: "slot",
			type: "folder",
			action: nodeActions(),
			children: children.map(slotNode),
			data: {
				path: "/self/slot",
				displayPath: "/self/slot",
				slotKind: "global-root" as SlotKind,
				isRoot: false,
			},
		},
	];
});

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
				: "local") as SlotKind,
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
	const slotGroups = world.slots.value
		.map((slot) => ({
			slot,
			resources: slot.allResources.filter((resource) =>
				paths.has(resource.path),
			),
		}))
		.filter(({ resources: groupResources }) => groupResources.length);
	return {
		id: `${scope}:source:${sourceId}:slot`,
		name: "slot",
		type: "folder",
		children: slotGroups.map(({ slot, resources: groupResources }) => ({
			id: `${scope}:source:${sourceId}:slot:${slot.id}`,
			name: slot.name,
			type: "folder" as const,
			icon: slot.icon,
			children: groupResources.map((resource) =>
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

const nodes = computed(() => {
	switch (tab.value) {
		case "local":
			return assetRoots.value.local;
		case "global":
			return assetRoots.value.global;
		case "slots":
			return slotNodes.value;
		case "sources":
			return sourceNodes.value;
		default:
			return [];
	}
});

watch(
	[nodes, tab],
	([currentNodes, currentTab]) => {
		if (initializedTabs.has(currentTab) || currentNodes.length === 0) return;
		initializedTabs.add(currentTab);
		if (currentNodes.length === 1 && currentNodes[0]?.type === "folder") {
			const rootId = currentNodes[0].id;
			if (!expanded.value.includes(rootId)) {
				expanded.value = [...expanded.value, rootId];
			}
		}
	},
);

function findAncestorFolderIds(treeNodes: FileTreeNode[], targetId: string, ancestors: string[] = []): string[] | null {
	for (const n of treeNodes) {
		if (n.id === targetId) return ancestors;
		if (n.children?.length) {
			const found = findAncestorFolderIds(n.children, targetId, [...ancestors, n.id]);
			if (found) return found;
		}
	}
	return null;
}

watch(locateRequest, (req) => {
	if (!req) return;
	const { path, file } = req;
	const targetTab: TreeTab = path.startsWith("/self") ? "local" : "global";
	tab.value = targetTab;
	const targetId = path.startsWith("/self") ? `self:${file.id}` : `global:${file.id}`;
	selected.value = targetId;

	setTimeout(() => {
		const currentNodes = targetTab === "local" ? assetRoots.value.local : assetRoots.value.global;
		const ancestors = findAncestorFolderIds(currentNodes, targetId);
		if (ancestors?.length) {
			expanded.value = [...new Set([...expanded.value, ...ancestors])];
		}
	}, 50);
});

function openFile(node: FileTreeNode) {
	selected.value = node.id;
	if (node.data?.file && node.data?.path) {
		emit("select", { file: node.data.file, path: node.data.path });
	}
}

function activate(node: FileTreeNode) {
	selected.value = node.id;
	if (tab.value === "slots") {
		if (node.selectableResource) {
			toggleNode(node, !node.resourceSelected);
		}
		return;
	}
}

async function createFile(path: string, kind: string) {
	const extension = fileKinds.find((item) => item.id === kind)?.extension ?? ".txt";
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
	const created =
		kindOf(node) === "global"
			? await world.createChildSlot(path, `${base}-${index}`)
			: await world.createFolder(path, `${base}-${index}`);
	if (kindOf(node) === "global-root") {
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
}

async function importResource(path: string) {
	if (importing.value) return;
	importing.value = true;
	try {
		const picked = await host.dialog.open({
			title: "导入资源",
			multiple: false,
			directory: false,
			properties: ["openFile"],
		});
		if (typeof picked !== "string") return;
		const fileName = picked.replace(/\\/g, "/").split("/").pop() ?? picked;
		const type = world.worldFileType(fileName);
		const stFile = /\.(png|json)$/i.test(fileName)
			? await readStResourceFile(picked)
			: undefined;
		const plan = stFile ? tryBuildStImportPlan(fileName, stFile) : undefined;
		if (plan) {
			const result = await applyStImportPlan(world, plan, path);
			if (result.diagnostics.length) {
				toast.warning(`已转换 SillyTavern 资源，${result.diagnostics.length} 条提示。`);
			} else {
				toast.success("已转换 SillyTavern 资源。");
			}
			return;
		}

		let content: unknown;
		if (type === "media") {
			const binary = stFile?.base64
				? { base64: stFile.base64, mediaType: stFile.mediaType ?? "application/octet-stream" }
				: await host.migration.invoke<{ base64: string; mediaType: string }>("readBinary", { path: picked });
			const bytes = Uint8Array.from(atob(binary.base64), (character) =>
				character.charCodeAt(0),
			);
			content = createPluginMediaContent(
				mediaLink((await writeMedia(bytes, binary.mediaType, "assets")).id),
				binary.mediaType.startsWith("video/") ? "video" : "image",
			);
		} else {
			try {
				content = stFile?.text ?? await host.migration.invoke<string>("readText", { path: picked });
			} catch {
				const binary = await host.migration.invoke<{ base64: string; mediaType: string }>("readBinary", { path: picked });
				content = `data:${binary.mediaType};base64,${binary.base64}`;
			}
		}
		let destination = fileName;
		const dot = destination.lastIndexOf(".");
		const stem = dot > 0 ? destination.slice(0, dot) : destination;
		const suffix = dot > 0 ? destination.slice(dot) : "";
		for (let index = 2; world.exists(`${path}/${destination}`); index += 1) {
			destination = `${stem}-${index}${suffix}`;
		}
		await world.createFile(path, destination, content);
		toast.success(`已导入 ${destination}。`);
	} catch (error) {
		toast.error(error instanceof Error ? error.message : "导入失败");
	} finally {
		importing.value = false;
	}
}

function copyText(value: string) {
	void navigator.clipboard.writeText(value);
}

function toggleNode(node: FileTreeNode, val: boolean) {
	if (node.data?.resource) {
		void world.setSelected((node.data.resource as WorldResource).path, val);
	}
}

async function runTreeAction(
	node: FileTreeNode,
	action: FileTreeAction,
	value?: string,
) {
	const path = String(node.data?.path ?? "");
	if (!path) return;
	if (action.id === "open") return activate(node);
	if (action.id === "cut" || action.id === "copy") {
		clipboard.value = { type: action.id, path, nodeType: node.type };
		return;
	}
	if (action.id === "paste") {
		const current = clipboard.value;
		if (!current) return;
		const targetPath =
			node.type === "file"
				? path.slice(0, path.lastIndexOf("/")) || "/self"
				: path;
		if (current.type === "cut") {
			await world.moveTo(current.path, targetPath);
			clipboard.value = null;
		} else {
			await world.copy(current.path, targetPath);
		}
		return;
	}
	if (action.id.startsWith("add-file:"))
		return createFile(path, action.id.slice("add-file:".length));
	if (action.id === "new-folder") return createFolder(node, path);
	if (action.id === "import-resource") return importResource(path);
	if (action.id === "copy-path")
		return copyText(String(node.data?.displayPath ?? path));
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
      <Tabs v-model="tab" size="compact" aria-label="World 视图">
        <TabsList>
          <TabItem value="local" title="本地" class="size-7 p-0">
            <Folder class="size-4" />
          </TabItem>
          <TabItem value="global" title="全局" class="size-7 p-0">
            <Globe class="size-4" />
          </TabItem>
          <TabItem value="slots" title="插槽" class="size-7 p-0">
            <Box class="size-4" />
          </TabItem>
          <TabItem value="sources" title="来源" class="size-7 p-0">
            <Braces class="size-4" />
          </TabItem>
        </TabsList>
      </Tabs>
      <Button variant="ghost" size="icon" class="ml-auto size-8" aria-label="关闭" @click="emit('close')"><X class="size-4" /></Button>
    </header>
    <FileTree
      v-model="selected"
      v-model:expanded="expanded"
      :nodes="nodes"
      :min-width="260"
      class="min-h-0 flex-1"
      @select="activate"
      @open="openFile"
      @toggle-resource="toggleNode"
      @action="runTreeAction"
    />
  </aside>
</template>
