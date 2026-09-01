<script setup lang="ts">
import { computed } from "vue";
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
	type?: FileTreeActionTarget;
	subActions?: FileTreeAction[];
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
	selectableResource?: boolean;
	resourceSelected?: boolean;
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
	toggle: [node: FileTreeNode, expanded: boolean];
	"toggle-resource": [node: FileTreeNode, selected: boolean];
	action: [node: FileTreeNode, action: FileTreeAction];
}>();

const expandedSet = computed(() => new Set(props.expanded));

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

function runAction(node: FileTreeNode, action: FileTreeAction) {
	emit("action", node, action);
}
</script>

<template>
  <ScrollArea class="h-full min-h-0">
    <div class="file-tree min-h-full p-1.5" :style="{ minWidth: `${minWidth}px` }">
      <FileTreeBranch
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        :depth="0"
        :selected-id="modelValue"
        :expanded="expandedSet"
        @select="select"
        @toggle="toggle"
        @toggle-resource="toggleResource"
        @action="runAction"
      />
    </div>
  </ScrollArea>
</template>
