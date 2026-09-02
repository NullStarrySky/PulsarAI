<script setup lang="ts">
import * as LucideIcons from "lucide-vue-next";
import {
	Check,
	ChevronRight,
	Circle,
	CircleCheck,
	File,
	Folder,
	FolderOpen,
	MoreHorizontal,
	Plus,
} from "lucide-vue-next";
import { type Component, computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { FileTreeAction, FileTreeNode } from "./FileTree.vue";
import FileTreeBranch from "./FileTreeBranch.vue";

const props = defineProps<{
	node: FileTreeNode;
	selectedId?: string;
	expanded: Set<string>;
}>();
const emit = defineEmits<{
	select: [node: FileTreeNode];
	toggle: [node: FileTreeNode];
	"toggle-resource": [node: FileTreeNode, selected: boolean];
	action: [node: FileTreeNode, action: FileTreeAction, value?: string];
}>();

const isFolder = computed(() => props.node.type === "folder");
const isExpanded = computed(() => props.expanded.has(props.node.id));
const children = computed(() => props.node.children ?? []);
const actions = computed(() =>
	Object.values(props.node.action ?? {}).filter(isVisibleAction),
);
const resourceMeta = computed(() => {
	if (!isFolder.value) return null;
	const childCount = children.value.length;
	const selectionMode = props.node.data?.selectionMode;
	if (!selectionMode || selectionMode === "none")
		return childCount ? `${childCount} 项` : "";
	const selected = children.value.filter((child) => child.resourceSelected);
	if (selectionMode === "multiple")
		return `${childCount} 项 · ${selected.length} 已选`;
	const selectedNode = selected[0];
	if (!selectedNode) return "未选择";
	const duplicateName = children.value.some(
		(child) => child !== selectedNode && child.name === selectedNode.name,
	);
	return duplicateName && selectedNode.prefix
		? `${selectedNode.prefix} · ${selectedNode.name}`
		: selectedNode.name;
});
const inputValues = ref<Record<string, string>>({});

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

function inputKey(action: FileTreeAction) {
	return `${props.node.id}:${action.id}`;
}

function inputValue(action: FileTreeAction) {
	return (
		inputValues.value[inputKey(action)] ??
		action.input?.value?.(props.node) ??
		""
	);
}

function setInputValue(action: FileTreeAction, value: string) {
	inputValues.value[inputKey(action)] = value;
}

function runAction(action: FileTreeAction, value?: string) {
	if (action.input) delete inputValues.value[inputKey(action)];
	emit("action", props.node, action, value);
}

function forwardAction(
	node: FileTreeNode,
	action: FileTreeAction,
	value?: string,
) {
	emit("action", node, action, value);
}
</script>

<template>
  <div class="file-tree-branch">
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <div
          class="file-tree-row group/tree-row"
          :class="{
            'is-selected': selectedId === node.id,
            'is-resource-selected': node.resourceSelected,
			'is-open': isExpanded,
          }"
        >
          <div
            class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            role="button"
            tabindex="0"
            @click="activate"
            @keydown.enter="activate"
            @keydown.space.prevent="activate"
          >
            <ChevronRight v-if="isFolder" class="size-3.5 shrink-0 transition-transform duration-200" :class="{ 'rotate-90': isExpanded }" />
            <span v-else class="w-3.5 shrink-0" />
            <component v-if="isFolder" :is="iconFor(isExpanded ? (node.openIcon ?? node.icon) : node.icon, isExpanded ? FolderOpen : Folder)" class="size-4 shrink-0" />
            <button
              v-else-if="node.selectableResource"
              type="button"
              class="file-tree-resource-toggle grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary"
              :aria-label="node.resourceSelected ? `取消选择 ${node.name}` : `选择 ${node.name}`"
              @click.stop="emit('toggle-resource', node, !node.resourceSelected)"
            >
              <CircleCheck v-if="node.resourceSelected" class="file-tree-select-indicator size-4" />
              <Circle v-else class="file-tree-select-indicator size-4" />
              <component :is="iconFor(node.icon, File)" class="file-tree-file-icon size-4" />
            </button>
            <component v-else :is="iconFor(node.icon, File)" class="size-4 shrink-0" />
            <span v-if="node.prefix" class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ node.prefix }}</span>
            <span class="min-w-0 truncate">{{ node.name }}</span>
			<span v-if="node.suffix" class="shrink-0 text-[10px] text-muted-foreground">· {{ node.suffix }}</span>
          </div>
          <span v-if="resourceMeta" class="file-tree-resource-meta" :title="resourceMeta">{{ resourceMeta }}</span>
          <div v-if="actions.length" class="file-tree-actions shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button type="button" class="file-tree-action-button" aria-label="更多操作" title="更多操作" @click.stop><MoreHorizontal class="size-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <template v-for="(action, index) in actions" :key="action.id">
                  <DropdownMenuSeparator v-if="action.separatorBefore && index" />
                  <DropdownMenuSub v-if="action.subActions?.length">
                    <DropdownMenuSubTrigger><component :is="iconFor(action.icon, Plus)" class="mr-2 size-4" />{{ action.name }}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem v-for="subAction in action.subActions.filter(matchesAction)" :key="subAction.id" @select="runAction(subAction)"><component :is="iconFor(subAction.icon, Plus)" class="mr-2 size-4" />{{ subAction.name }}</DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub v-else-if="action.input">
                    <DropdownMenuSubTrigger><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="w-60 p-2">
                      <div class="grid gap-2" @click.stop @keydown.stop>
                        <Input :model-value="inputValue(action)" :placeholder="action.input.placeholder" @update:model-value="setInputValue(action, String($event))" @keydown.enter.prevent="runAction(action, inputValue(action))" />
                        <Button size="sm" class="justify-center" @click="runAction(action, inputValue(action))">{{ action.input.submitLabel ?? '保存' }}</Button>
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub v-else-if="action.choices?.length">
                    <DropdownMenuSubTrigger><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem v-for="choice in action.choices" :key="choice.value" @select="runAction(action, choice.value)"><component :is="iconFor(choice.icon, MoreHorizontal)" class="mr-2 size-4" />{{ choice.name }}<Check v-if="action.selected?.(node, choice.value)" class="ml-auto size-4" /></DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem v-else @select="runAction(action)"><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</DropdownMenuItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
	  <ContextMenuContent v-if="actions.length">
        <template v-for="(action, index) in actions" :key="action.id">
          <ContextMenuSeparator v-if="action.separatorBefore && index" />
          <ContextMenuSub v-if="action.subActions?.length">
            <ContextMenuSubTrigger><component :is="iconFor(action.icon, Plus)" class="mr-2 size-4" />{{ action.name }}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem v-for="subAction in action.subActions.filter(matchesAction)" :key="subAction.id" @select="runAction(subAction)"><component :is="iconFor(subAction.icon, Plus)" class="mr-2 size-4" />{{ subAction.name }}</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub v-else-if="action.input">
            <ContextMenuSubTrigger><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</ContextMenuSubTrigger>
            <ContextMenuSubContent class="w-60 p-2">
              <div class="grid gap-2" @click.stop @keydown.stop>
                <Input :model-value="inputValue(action)" :placeholder="action.input.placeholder" @update:model-value="setInputValue(action, String($event))" @keydown.enter.prevent="runAction(action, inputValue(action))" />
                <Button size="sm" class="justify-center" @click="runAction(action, inputValue(action))">{{ action.input.submitLabel ?? '保存' }}</Button>
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub v-else-if="action.choices?.length">
            <ContextMenuSubTrigger><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem v-for="choice in action.choices" :key="choice.value" @select="runAction(action, choice.value)"><component :is="iconFor(choice.icon, MoreHorizontal)" class="mr-2 size-4" />{{ choice.name }}<Check v-if="action.selected?.(node, choice.value)" class="ml-auto size-4" /></ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem v-else @select="runAction(action)"><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenu>
    <div v-if="isFolder" class="file-tree-children" :class="{ 'is-open': isExpanded }">
      <div class="file-tree-children-wrap">
        <FileTreeBranch
          v-for="child in children"
          :key="child.id"
          :node="child"
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
.file-tree-branch {
	min-width: 0;
}

.file-tree-row {
	position: relative;
	display: flex;
	width: auto;
	min-width: 0;
	height: 34px;
	margin: 1px 6px;
	padding: 0 6px;
	align-items: center;
	gap: 7px;
	border-radius: 6px;
	color: var(--muted-foreground);
	font-size: 12px;
	line-height: 1.25;
	text-align: start;
	transition: background-color 130ms ease, color 130ms ease;
}

.file-tree-row:hover {
	background: color-mix(in oklab, var(--foreground) 4%, transparent);
	color: var(--foreground);
}

.file-tree-row.is-selected {
	background: color-mix(in oklab, var(--primary) 13%, transparent);
	color: var(--foreground);
}

.file-tree-row.is-selected::before {
	position: absolute;
	left: 0;
	top: 4px;
	bottom: 4px;
	width: 2px;
	border-radius: 999px;
	background: var(--primary);
	content: "";
}

.file-tree-row.is-selected :deep(.file-tree-resource-meta) {
	color: color-mix(in oklab, var(--foreground) 62%, transparent);
}

.file-tree-resource-toggle {
	position: relative;
	z-index: 1;
}

.file-tree-resource-toggle .file-tree-select-indicator {
	display: none;
}

.file-tree-row.is-resource-selected .file-tree-resource-toggle {
	color: var(--primary);
}

.file-tree-row.is-resource-selected .file-tree-resource-toggle .file-tree-file-icon {
	display: none;
}

.file-tree-row.is-resource-selected .file-tree-resource-toggle .file-tree-select-indicator {
	display: block;
	fill: var(--primary);
	stroke: var(--primary-foreground);
}

.file-tree-resource-meta {
	max-width: 8rem;
	overflow: hidden;
	color: color-mix(in oklab, var(--foreground) 44%, transparent);
	font-size: 10px;
	line-height: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.file-tree-actions {
	display: flex;
	align-items: center;
	gap: 2px;
}

.file-tree-action-button {
	display: grid;
	width: 20px;
	height: 22px;
	place-items: center;
	border-radius: 5px;
	color: color-mix(in oklab, var(--foreground) 54%, transparent);
	transition: background-color 130ms ease, color 130ms ease, opacity 150ms ease,
		transform 150ms ease;
}

.file-tree-action-button:hover,
.file-tree-action-button:focus-visible {
	background: color-mix(in oklab, var(--foreground) 8%, transparent);
	color: var(--foreground);
	outline: none;
}

.file-tree-children {
	display: grid;
	grid-template-rows: 0fr;
	opacity: 0;
	transition: grid-template-rows 260ms cubic-bezier(0.4, 0, 0.2, 1),
		opacity 180ms ease;
}

.file-tree-children.is-open {
	grid-template-rows: 1fr;
	opacity: 1;
}

.file-tree-children-wrap {
	position: relative;
	min-height: 0;
	overflow: hidden;
	padding-left: 14px;
}

.file-tree-children-wrap::before {
	position: absolute;
	left: 12px;
	top: 0;
	bottom: 0;
	width: 1px;
	background: color-mix(in oklab, var(--foreground) 10%, transparent);
	content: "";
}

@media (hover: hover) and (pointer: fine) {
	.file-tree-row:hover .file-tree-resource-meta {
		display: none;
	}

	.file-tree-actions {
		pointer-events: none;
		opacity: 0;
		transform: translateX(3px);
	}

	.file-tree-row:hover .file-tree-actions,
	.file-tree-actions:focus-within {
		pointer-events: auto;
		opacity: 1;
		transform: none;
	}

	.file-tree-row:hover:not(.is-resource-selected)
		.file-tree-resource-toggle
		.file-tree-file-icon {
		display: none;
	}

	.file-tree-row:hover:not(.is-resource-selected)
		.file-tree-resource-toggle
		.file-tree-select-indicator {
		display: block;
	}
}

@media (hover: none) {
	.file-tree-resource-toggle .file-tree-file-icon {
		display: none;
	}

	.file-tree-resource-toggle .file-tree-select-indicator {
		display: block;
	}
}

@media (prefers-reduced-motion: reduce) {
	.file-tree-children,
	.file-tree-action-button {
		transition: none;
	}
}
</style>
