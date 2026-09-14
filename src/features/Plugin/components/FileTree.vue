<script setup lang="ts">
import { computed, ref } from "vue";
import { FluidHoverHighlight } from "@/components/fluid";
import { useFluidHover } from "@/components/fluid/hooks/use-fluid-hover";
import { ScrollArea } from "@/components/ui/scroll-area";
import FileTreeBranch from "./FileTreeBranch.vue";

type FileTreeActionTarget =
	| "file"
	| "folder"
	| ((node: FileTreeNode) => boolean);

export interface FileTreeAction {
	id: string;
	icon?: string;
	name: string;
	separatorBefore?: boolean;
	type?: FileTreeActionTarget;
	subActions?: FileTreeAction[];
	input?: {
		placeholder?: string;
		value?: (node: FileTreeNode) => string;
		submitLabel?: string;
	};
	choices?: Array<{ value: string; name: string; icon?: string }>;
	selected?: (node: FileTreeNode, value: string) => boolean;
}

export interface FileTreeActions {
	rename?: FileTreeAction;
	add?: FileTreeAction;
	[key: string]: FileTreeAction | undefined;
}

export interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	icon?: string;
	openIcon?: string;
	prefix?: string;
	suffix?: string;
	selectableResource?: boolean;
	resourceSelected?: boolean;
	selectionMode?: "none" | "single" | "multiple";
	disableRowOpen?: boolean;
	action?: FileTreeActions;
	children?: FileTreeNode[];
	/** Opaque feature data; the tree itself never interprets it. */
	data: any;
}

const props = withDefaults(
	defineProps<{
		nodes: FileTreeNode[];
		modelValue?: string;
		expanded?: string[];
		minWidth?: number;
	}>(),
	{ expanded: () => [], minWidth: 260 },
);
const emit = defineEmits<{
	"update:modelValue": [value: string];
	"update:expanded": [value: string[]];
	select: [node: FileTreeNode];
	open: [node: FileTreeNode];
	toggle: [node: FileTreeNode, expanded: boolean];
	"toggle-resource": [node: FileTreeNode, selected: boolean];
	action: [node: FileTreeNode, action: FileTreeAction, value?: string];
}>();

const expandedSet = computed(() => new Set(props.expanded));
const treeRef = ref<HTMLElement | null>(null);
let nextHoverIndex = 0;
const claimHoverIndex = () => nextHoverIndex++;
const {
	activeIndex: hoverIndex,
	itemRects: hoverRects,
	session: hoverSession,
	handlers: hoverHandlers,
	registerItem: registerHoverItem,
} = useFluidHover(treeRef, {
	isItemDisabled: (element) =>
		Boolean(element.closest(".file-tree-children:not(.is-open)")),
});
const hoverRect = computed(() =>
	hoverIndex.value === null
		? null
		: (hoverRects.value[hoverIndex.value] ?? null),
);

function select(node: FileTreeNode) {
	emit("update:modelValue", node.id);
	emit("select", node);
}

function toggle(node: FileTreeNode) {
	const expanded = !expandedSet.value.has(node.id);
	emit(
		"update:expanded",
		expanded
			? [...props.expanded, node.id]
			: props.expanded.filter((id) => id !== node.id),
	);
	emit("toggle", node, expanded);
}

function toggleResource(node: FileTreeNode, selected: boolean) {
	emit("toggle-resource", node, selected);
}

function runAction(node: FileTreeNode, action: FileTreeAction, value?: string) {
	emit("action", node, action, value);
}
</script>

<template>
  <ScrollArea class="min-h-0 max-h-full">
    <div
      ref="treeRef"
      class="file-tree relative min-h-0 p-1.5"
      :style="{ minWidth: `${minWidth}px` }"
      @mouseenter="hoverHandlers.onMouseEnter"
      @mousemove="hoverHandlers.onMouseMove"
      @mouseleave="hoverHandlers.onMouseLeave"
    >
      <FluidHoverHighlight :rect="hoverRect" :session="hoverSession" class="rounded-md" />
      <FileTreeBranch
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        :selected-id="modelValue"
        :expanded="expandedSet"
        :claim-hover-index="claimHoverIndex"
        :register-hover-item="registerHoverItem"
        @select="select"
        @open="emit('open', $event)"
        @toggle="toggle"
        @toggle-resource="toggleResource"
        @action="runAction"
      />
    </div>
  </ScrollArea>
</template>
