<script setup lang="ts">
import * as LucideIcons from "lucide-vue-next";
import {
	ChevronRight,
	File,
	Folder,
	FolderOpen,
	MoreHorizontal,
	Plus,
} from "lucide-vue-next";
import { type Component, computed } from "vue";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import type { FileTreeAction, FileTreeNode } from "./FileTree.vue";
import FileTreeBranch from "./FileTreeBranch.vue";

const props = defineProps<{
	node: FileTreeNode;
	depth: number;
	selectedId?: string;
	expanded: Set<string>;
}>();
const emit = defineEmits<{
	select: [node: FileTreeNode];
	toggle: [node: FileTreeNode];
	"toggle-resource": [node: FileTreeNode, selected: boolean];
	action: [node: FileTreeNode, action: FileTreeAction];
}>();

const isFolder = computed(() => props.node.type === "folder");
const isExpanded = computed(() => props.expanded.has(props.node.id));
const children = computed(() => props.node.children ?? []);
const actions = computed(() =>
	Object.values(props.node.action ?? {}).filter(isVisibleAction),
);

function activate() {
	emit("select", props.node);
	if (isFolder.value) emit("toggle", props.node);
}

function iconFor(name: string | undefined, fallback: Component) {
	if (!name) return fallback;
	const key = name.replace(/(^|[-_\s])(\w)/g, (_, __, letter) =>
		letter.toUpperCase(),
	);
	return (LucideIcons as unknown as Record<string, Component>)[key] ?? fallback;
}

function toggleResource(node: FileTreeNode, selected: boolean) {
	emit("toggle-resource", node, selected);
}

function matchesAction(action: FileTreeAction) {
	if (!action.type) return true;
	if (typeof action.type === "function") return action.type(props.node);
	return action.type === props.node.type;
}

function isVisibleAction(
	action: FileTreeAction | undefined,
): action is FileTreeAction {
	return action !== undefined && matchesAction(action);
}

function runAction(action: FileTreeAction) {
	emit("action", props.node, action);
}

function forwardAction(node: FileTreeNode, action: FileTreeAction) {
	emit("action", node, action);
}
</script>

<template>
  <div class="file-tree-branch">
    <div
      class="file-tree-row group/tree-row"
      :class="{ 'is-selected': selectedId === node.id }"
      :style="{ paddingInlineStart: `${depth * 14 + 8}px` }"
    >
      <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 text-left" @click="activate">
        <ChevronRight v-if="isFolder" class="size-3.5 transition-transform duration-200" :class="{ 'rotate-90': isExpanded }" />
        <span v-else class="w-3.5" />
        <component v-if="isFolder" :is="iconFor(isExpanded ? (node.openIcon ?? node.icon) : node.icon, isExpanded ? FolderOpen : Folder)" class="size-4" />
        <component v-else :is="iconFor(node.icon, File)" class="size-4" />
        <span v-if="node.prefix" class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ node.prefix }}</span>
        <span class="min-w-0 truncate">{{ node.name }}</span>
      </button>
      <Switch
        v-if="node.selectableResource && !isFolder"
        :model-value="node.resourceSelected"
        class="shrink-0"
        @click.stop
        @update:model-value="emit('toggle-resource', node, Boolean($event))"
      />
      <DropdownMenu v-if="actions.length">
        <DropdownMenuTrigger as-child>
          <button type="button" class="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/tree-row:opacity-100 focus-visible:opacity-100" aria-label="文件操作" @click.stop><MoreHorizontal class="size-4" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <template v-for="action in actions" :key="action.id">
            <DropdownMenuSub v-if="action.subActions?.length">
              <DropdownMenuSubTrigger><component :is="iconFor(action.icon, Plus)" class="mr-2 size-4" />{{ action.name }}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem v-for="subAction in action.subActions.filter(matchesAction)" :key="subAction.id" @select="runAction(subAction)"><component :is="iconFor(subAction.icon, Plus)" class="mr-2 size-4" />{{ subAction.name }}</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem v-else @select="runAction(action)"><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div v-if="isFolder" class="file-tree-children" :class="{ 'is-open': isExpanded }">
      <div class="min-h-0 overflow-hidden">
        <FileTreeBranch
          v-for="child in children"
          :key="child.id"
          :node="child"
          :depth="depth + 1"
          :selected-id="selectedId"
          :expanded="expanded"
          @select="emit('select', $event)"
          @toggle="emit('toggle', $event)"
          @toggle-resource="toggleResource"
          @action="forwardAction"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree-row { display: flex; width: 100%; min-width: 0; align-items: center; gap: .375rem; border-radius: .375rem; padding-block: .35rem; padding-inline-end: .5rem; font-size: .875rem; color: hsl(var(--muted-foreground)); text-align: start; transition: background-color .16s ease, color .16s ease; }
.file-tree-row:hover, .file-tree-row.is-selected { background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); }
.file-tree-children { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 220ms cubic-bezier(.22, 1, .36, 1), opacity 220ms ease; }
.file-tree-children.is-open { grid-template-rows: 1fr; opacity: 1; }
@media (prefers-reduced-motion: reduce) { .file-tree-children { transition: none; } }
</style>
