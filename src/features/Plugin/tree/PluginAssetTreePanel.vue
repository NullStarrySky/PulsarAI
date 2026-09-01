<script setup lang="ts">
import interact from "interactjs";
import { Box, Braces, FilePlus2, Folder, X } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
} from "vue";
import type {
	FileTreeAction,
	FileTreeActions,
	FileTreeNode,
} from "@/components/common/file-tree";
import { FileTree } from "@/components/common/file-tree";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import { useWorld, type WorldResource } from "./world-store";
import type { WorldFileNode, WorldNode } from "./world-types";

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
const panel = ref<HTMLElement | null>(null);
const panelOffset = ref({ x: 0, y: 0 });
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);
let panelInteractable: ReturnType<typeof interact> | null = null;
const tabOptions = [
	{ value: "assets", label: "资源" },
	{ value: "slots", label: "插槽" },
	{ value: "sources", label: "来源" },
];

const panelStyle = computed(() => ({
	transform: isMobileLayout.value
		? "none"
		: `translate(${panelOffset.value.x}px, ${panelOffset.value.y}px)`,
}));

function isSlotPath(path: string | undefined) {
	return Boolean(
		path && (path === "/self/slot" || path.startsWith("/self/slot/")),
	);
}

function isSlotDefinitionPath(path: string | undefined) {
	if (!path?.startsWith("/self/slot/")) return false;
	return !path.slice("/self/slot/".length).includes("/");
}

function isResourceSelected(resource: WorldResource) {
	const slot = world.slots.value.find(
		(item) => item.path === resource.file.slot,
	);
	return slot?.selectionMode === "single"
		? slot.resources.some((item) => item.path === resource.path)
		: resource.file.resourceSelected;
}

function folderActions(): FileTreeActions {
	return {
		rename: {
			id: "rename",
			icon: "pencil",
			name: "重命名",
			type: (node) => !isSlotPath(node.data.path),
			input: {
				placeholder: "名称",
				value: (node) => node.name,
				submitLabel: "重命名",
			},
		},
		add: {
			id: "add",
			icon: "folder-plus",
			name: "新建",
			type: (node) =>
				node.type === "folder" &&
				(!isSlotPath(node.data.path) || node.data.path === "/self/slot"),
			subActions: [
				{
					id: "add-file",
					icon: "file-plus-2",
					name: "资源文件",
					type: (node) => node.type === "folder" && !isSlotPath(node.data.path),
				},
				{
					id: "add-folder",
					icon: "folder-plus",
					name: "文件夹",
					type: (node) => node.type === "folder" && !isSlotPath(node.data.path),
				},
				{
					id: "add-slot",
					icon: "braces",
					name: "插槽文件夹",
					type: (node) => node.data.path === "/self/slot",
				},
			],
		},
		"slot-description": {
			id: "slot-description",
			icon: "text",
			name: "描述",
			type: (node) => isSlotDefinitionPath(node.data.path),
			input: {
				placeholder: "描述",
				value: (node) => String(node.data.description ?? ""),
			},
		},
		"slot-selection-mode": {
			id: "slot-selection-mode",
			icon: "list-checks",
			name: "选择方式",
			type: (node) => isSlotDefinitionPath(node.data.path),
			choices: [
				{ value: "none", name: "不参与选择" },
				{ value: "single", name: "单选" },
				{ value: "multiple", name: "多选" },
			],
			selected: (node, value) => node.data.selectionMode === value,
		},
	};
}

const fileActions: FileTreeActions = {
	rename: {
		id: "rename",
		icon: "pencil",
		name: "重命名",
		type: "file",
		input: {
			placeholder: "名称",
			value: (node) => node.name,
			submitLabel: "重命名",
		},
	},
};

function treeNode(
	scope: "global" | "self",
	node: WorldNode,
	path: string[],
	isRoot = false,
): FileTreeNode {
	const nodePath = isRoot ? path : [...path, node.name];
	const resourcePath = `/${scope}${nodePath.length ? `/${nodePath.join("/")}` : ""}`;
	const resource =
		node.type === "file"
			? world.resources.value.find((item) => item.path === resourcePath)
			: undefined;
	return {
		id: `${scope}:${node.id}`,
		name: node.name,
		type: node.type,
		icon: node.icon,
		...(node.type === "folder"
			? {
					openIcon: node.openIcon,
					action: folderActions(),
					children: Object.values(node.children)
						.sort(
							(left, right) =>
								left.treeOrder - right.treeOrder ||
								left.name.localeCompare(right.name),
						)
						.map((child) => treeNode(scope, child, nodePath)),
				}
			: {}),
		...(resource
			? {
					selectableResource: true,
					resourceSelected: isResourceSelected(resource),
				}
			: {}),
		...(node.type === "file" ? { action: fileActions } : {}),
		data:
			node.type === "file"
				? { file: node, path: resourcePath, resource }
				: {
						path: resourcePath,
						description: node.description,
						selectionMode: node.selectionMode,
					},
	};
}

const assetNodes = computed<FileTreeNode[]>(() => {
	const value = world.world.value;
	if (!value) return [];
	return [
		treeNode("global", value.global.root, [], true),
		treeNode("self", value.self.root, [], true),
	];
});

const slotNodes = computed<FileTreeNode[]>(() =>
	world.slots.value.map((slot) => ({
		id: `slot:${slot.path}`,
		name: slot.name,
		type: "folder",
		icon: slot.icon,
		action: folderActions(),
		children: slot.allResources.map((resource) => ({
			id: `${resource.scope}:${resource.file.id}`,
			name: resource.file.name,
			type: "file" as const,
			icon: resource.file.icon || slot.icon,
			prefix: resource.sourceName,
			selectableResource: true,
			resourceSelected: isResourceSelected(resource),
			data: { file: resource.file, path: resource.path, resource },
		})),
		data: {
			path: slot.path,
			description: slot.description,
			selectionMode: slot.selectionMode,
		},
	})),
);

const sourceNodes = computed<FileTreeNode[]>(() => {
	const definitions = new Map(
		world.slots.value.map((slot) => [slot.path, slot]),
	);
	const groups = new Map<string, WorldResource[]>();
	for (const resource of world.resources.value) {
		if (!resource.file.slot || !definitions.has(resource.file.slot)) continue;
		const key = `${resource.scope}:${resource.sourceName}`;
		groups.set(key, [...(groups.get(key) ?? []), resource]);
	}
	return [...groups].map(([key, resources]) => ({
		id: `source:${key}`,
		name: resources[0]?.sourceName ?? "未命名来源",
		type: "folder" as const,
		data: {},
		children: [
			...new Map(
				resources.map((resource) => [
					resource.file.slot!,
					definitions.get(resource.file.slot!),
				]),
			),
		].map(([slotId, slot]) => ({
			id: `source:${key}:slot:${slotId}`,
			name: slot?.name ?? String(slotId),
			type: "folder" as const,
			icon: slot?.icon,
			data: {},
			children: resources
				.filter((resource) => resource.file.slot === slotId)
				.map((resource) => ({
					id: `source:${key}:file:${resource.file.id}`,
					name: resource.file.name,
					type: "file" as const,
					icon: resource.file.icon || slot?.icon,
					selectableResource: true,
					resourceSelected: isResourceSelected(resource),
					data: { file: resource.file, path: resource.path, resource },
				})),
		})),
	}));
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

async function createFile() {
	const root = "/self";
	let index = 1;
	while (world.exists(`${root}/untitled-${index}.md`)) index += 1;
	await world.write(`${root}/untitled-${index}.md`, "");
}

async function createSlot() {
	let index = world.slots.value.length + 1;
	while (world.exists(`/self/slot/slot-${index}`)) index += 1;
	await world.mkdir(`/self/slot/slot-${index}`);
	await world.updateFolder(`/self/slot/slot-${index}`, {
		description: "新插槽",
		selectionMode: "multiple",
		allowedResourceTypes: ["markdown"],
	});
}

async function toggle(resource: WorldResource, selected: boolean) {
	await world.setSelected(resource.path, selected);
}

function toggleNode(node: FileTreeNode, selected: boolean) {
	if (node.data.resource)
		void toggle(node.data.resource as WorldResource, selected);
}

async function runTreeAction(
	node: FileTreeNode,
	action: FileTreeAction,
	value?: string,
) {
	const path = String(node.data.path ?? "");
	if (!path) return;
	if (action.id === "add-file") {
		let index = 1;
		while (world.exists(`${path}/untitled-${index}.md`)) index += 1;
		await world.write(`${path}/untitled-${index}.md`, "");
		return;
	}
	if (action.id === "add-folder") {
		let index = 1;
		while (world.exists(`${path}/folder-${index}`)) index += 1;
		await world.mkdir(`${path}/folder-${index}`);
		return;
	}
	if (action.id === "add-slot") {
		await createSlot();
		return;
	}
	if (action.id === "slot-description" && isSlotDefinitionPath(path)) {
		await world.updateFolder(path, {
			description: value?.trim() || undefined,
		});
		return;
	}
	if (action.id === "slot-selection-mode" && isSlotDefinitionPath(path)) {
		if (value !== "none" && value !== "single" && value !== "multiple") return;
		await world.updateFolder(path, { selectionMode: value });
		return;
	}
	if (action.id !== "rename" || isSlotPath(path)) return;
	const nextName = value?.trim();
	if (!nextName || /[\\/]/.test(nextName)) return;
	const pathParts = path.split("/");
	const currentName = pathParts[pathParts.length - 1];
	if (nextName === currentName) return;
	const parent = path.split("/").slice(0, -1).join("/");
	await world.move(path, `${parent}/${nextName}`);
}

async function setupDrag() {
	teardownDrag();
	if (isMobileLayout.value) return;
	await nextTick();
	if (!panel.value) return;
	panelInteractable = interact(panel.value).draggable({
		allowFrom: ".asset-panel-drag-handle",
		ignoreFrom:
			"button, input, textarea, select, [role='radio'], [role='menuitem']",
		listeners: {
			move(event) {
				panelOffset.value = {
					x: panelOffset.value.x + event.dx,
					y: panelOffset.value.y + event.dy,
				};
			},
		},
	});
}

function teardownDrag() {
	panelInteractable?.unset();
	panelInteractable = null;
}

onMounted(setupDrag);
onBeforeUnmount(teardownDrag);
watch(isMobileLayout, () => {
	panelOffset.value = { x: 0, y: 0 };
	void setupDrag();
});
</script>

<template>
  <aside ref="panel" :style="panelStyle" class="absolute bottom-4 right-4 top-4 z-30 flex min-h-0 w-[min(28rem,calc(100%-2rem))] min-w-[min(20rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl transition-shadow mobile:inset-0 mobile:w-full mobile:min-w-0 mobile:rounded-none">
    <header class="asset-panel-drag-handle flex shrink-0 items-center gap-2 border-b px-2 py-2 cursor-grab active:cursor-grabbing">
      <Segmented v-model="tab" :options="tabOptions" aria-label="World 视图">
        <template #option="{ option }">
          <Folder v-if="option.value === 'assets'" class="size-4" />
          <Braces v-else-if="option.value === 'slots'" class="size-4" />
          <Box v-else class="size-4" />
        </template>
      </Segmented>
      <div class="ml-auto flex items-center gap-1">
        <Button v-if="tab !== 'sources'" variant="ghost" size="icon" class="size-8" :aria-label="tab === 'slots' ? '新建插槽' : '新建资源'" @click="tab === 'slots' ? createSlot() : createFile()"><FilePlus2 class="size-4" /></Button>
        <Button variant="ghost" size="icon" class="size-8" aria-label="关闭" @click="emit('close')"><X class="size-4" /></Button>
      </div>
    </header>
    <FileTree v-model="selected" v-model:expanded="expanded" :nodes="nodes" :min-width="320" class="min-h-0 flex-1" @select="activate" @toggle-resource="toggleNode" @action="runTreeAction" />
  </aside>
</template>
