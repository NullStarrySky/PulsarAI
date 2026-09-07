<script setup lang="ts">
import * as LucideIcons from "lucide-vue-next";
import {
	Check,
	ChevronRight,
	ExternalLink,
	File,
	Folder,
	FolderOpen,
	MoreHorizontal,
	Plus,
} from "lucide-vue-next";
import { type Component, computed, nextTick, ref } from "vue";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/fluid";
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
	open: [node: FileTreeNode];
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
	const selectionMode = props.node.data?.selectionMode;
	if (!selectionMode || selectionMode === "none")
		return "";
	const selected = children.value.filter((child) => child.resourceSelected);
	if (selectionMode === "multiple")
		return selected.length ? `${selected.length} 已选` : "";
	const selectedNode = selected[0];
	if (!selectedNode) return "";
	const duplicateName = children.value.some(
		(child) => child !== selectedNode && child.name === selectedNode.name,
	);
	return duplicateName && selectedNode.prefix
		? `${selectedNode.prefix} · ${selectedNode.name}`
		: selectedNode.name;
});

const isRenaming = ref(false);
const renameDraft = ref("");
const renameInputRef = ref<HTMLInputElement | null>(null);

function startRename() {
	renameDraft.value = props.node.name;
	isRenaming.value = true;
	nextTick(() => {
		if (renameInputRef.value) {
			renameInputRef.value.focus();
			const dot = props.node.type === "file" ? props.node.name.lastIndexOf(".") : -1;
			if (dot > 0) renameInputRef.value.setSelectionRange(0, dot);
			else renameInputRef.value.select();
		}
	});
}

function commitRename() {
	if (!isRenaming.value) return;
	isRenaming.value = false;
	const name = renameDraft.value.trim();
	if (name && name !== props.node.name) {
		const renameAct = props.node.action?.rename ?? { id: "rename", name: "重命名" };
		emit("action", props.node, renameAct, name);
	}
}

function cancelRename() {
	isRenaming.value = false;
}

function activate() {
	if (isRenaming.value) return;
	emit("select", props.node);
	if (isFolder.value) {
		emit("toggle", props.node);
	} else if (props.node.selectableResource) {
		toggleResource(props.node, !props.node.resourceSelected);
	} else if (!props.node.disableRowOpen) {
		emit("open", props.node);
	}
}

function handleRowClick(e: MouseEvent) {
	if (isRenaming.value) return;
	const target = e.target as HTMLElement | null;
	if (target?.closest(".file-tree-actions, .file-tree-resource-toggle, .file-tree-open-button, input, button")) {
		return;
	}
	activate();
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

const inputValues = ref<Record<string, string>>({});
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
	if (action.id === "rename") {
		startRename();
		return;
	}
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
          class="file-tree-row group/tree-row cursor-pointer select-none"
          :class="{
            'is-selected': selectedId === node.id,
            'is-resource-selected': node.resourceSelected,
            'is-open': isExpanded,
          }"
          @click="handleRowClick"
        >
          <!-- Inline Rename Input -->
          <div v-if="isRenaming" class="flex h-full min-w-0 flex-1 items-center gap-1.5 py-0.5" @click.stop>
            <input
              ref="renameInputRef"
              v-model="renameDraft"
              class="h-7 w-full rounded border border-primary/60 bg-background px-2 font-mono text-xs text-foreground outline-none ring-1 ring-primary/40"
              @blur="commitRename"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="cancelRename"
            />
          </div>

          <!-- Normal Row Content -->
          <div
            v-else
            class="flex h-full min-w-0 flex-1 self-stretch items-center gap-1.5 text-left"
            role="button"
            tabindex="0"
            @keydown.enter="activate"
            @keydown.space.prevent="activate"
          >
            <ChevronRight v-if="isFolder" class="size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200" :class="{ 'rotate-90': isExpanded }" />
            <span v-else class="w-3.5 shrink-0" />

            <!-- Folder Icon -->
            <component
              v-if="isFolder"
              :is="iconFor(isExpanded ? (node.openIcon ?? node.icon) : node.icon, isExpanded ? FolderOpen : Folder)"
              class="size-4 shrink-0 text-muted-foreground/80"
            />

            <!-- Selectable Resource (Slot File): Radio or Checkbox -->
            <template v-else-if="node.selectableResource">
              <!-- Single selection: Radio Item style -->
              <button
                v-if="node.selectionMode === 'single'"
                type="button"
                class="file-tree-resource-toggle relative grid size-4 shrink-0 place-items-center cursor-pointer outline-none"
                :aria-label="node.resourceSelected ? `已选中 ${node.name}` : `选择 ${node.name}`"
                @click.stop="toggleResource(node, !node.resourceSelected)"
              >
                <div
                  class="size-3.5 rounded-full border transition-all duration-100"
                  :class="node.resourceSelected ? 'border-primary' : 'border-muted-foreground/50 group-hover/tree-row:border-foreground/70'"
                />
                <div
                  v-if="node.resourceSelected"
                  class="absolute size-2 rounded-full bg-primary"
                />
              </button>

              <!-- Multiple selection: Checkbox Item style -->
              <button
                v-else
                type="button"
                class="file-tree-resource-toggle relative grid size-4 shrink-0 place-items-center cursor-pointer outline-none"
                :aria-label="node.resourceSelected ? `已选中 ${node.name}` : `选择 ${node.name}`"
                @click.stop="toggleResource(node, !node.resourceSelected)"
              >
                <div
                  class="size-3.5 rounded-[4px] border transition-all duration-100 flex items-center justify-center"
                  :class="node.resourceSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50 group-hover/tree-row:border-foreground/70'"
                >
                  <Check v-if="node.resourceSelected" class="size-2.5 stroke-[3]" />
                </div>
              </button>
            </template>

            <!-- Regular File (Local / Global Tab): File Icon -->
            <component v-else :is="iconFor(node.icon, File)" class="size-4 shrink-0 text-muted-foreground/80" />

            <!-- Resource Prefix (e.g. Source Name) -->
            <span v-if="node.prefix" class="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{{ node.prefix }}</span>
            <span class="min-w-0 truncate">{{ node.name }}</span>
            <span v-if="node.suffix" class="shrink-0 text-[10px] text-muted-foreground">· {{ node.suffix }}</span>
          </div>

          <!-- Resource Meta / Badge -->
          <span v-if="resourceMeta" class="file-tree-resource-meta" :title="resourceMeta">{{ resourceMeta }}</span>

          <!-- Folder Items Count -->
          <span
            v-if="isFolder && children.length"
            class="file-tree-count text-[10px] tabular-nums font-mono text-muted-foreground/60 rounded bg-muted/50 px-1 py-0.5 shrink-0"
          >
            {{ children.length }}
          </span>

          <!-- Open file button for slot items -->
          <button
            v-if="node.selectableResource || node.disableRowOpen"
            type="button"
            class="file-tree-open-button shrink-0 grid size-5 place-items-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
            title="在编辑器中打开"
            aria-label="在编辑器中打开"
            @click.stop="emit('open', node)"
          >
            <ExternalLink class="size-3.5" />
          </button>

          <!-- Ellipsis Actions Menu -->
          <div v-if="actions.length" class="file-tree-actions shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button type="button" class="file-tree-action-button" aria-label="更多操作" title="更多操作" @click.stop><MoreHorizontal class="size-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <template v-for="(action, index) in actions" :key="action.id">
                  <DropdownMenuSeparator v-if="action.separatorBefore && index" />
                  <DropdownMenuSub v-if="action.subActions?.length">
                    <DropdownMenuSubTrigger :icon="iconFor(action.icon, Plus)" :label="action.name" />
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        v-for="subAction in action.subActions.filter(matchesAction)"
                        :key="subAction.id"
                        :icon="iconFor(subAction.icon, Plus)"
                        :label="subAction.name"
                        @select="runAction(subAction)"
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub v-else-if="action.input">
                    <DropdownMenuSubTrigger :icon="iconFor(action.icon, MoreHorizontal)" :label="action.name" />
                    <DropdownMenuSubContent class="w-60 p-2">
                      <div class="grid gap-2" @click.stop @keydown.stop>
                        <Input :model-value="inputValue(action)" :placeholder="action.input.placeholder" @update:model-value="setInputValue(action, String($event))" @keydown.enter.prevent="runAction(action, inputValue(action))" />
                        <Button size="sm" class="justify-center" @click="runAction(action, inputValue(action))">{{ action.input.submitLabel ?? '保存' }}</Button>
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub v-else-if="action.choices?.length">
                    <DropdownMenuSubTrigger :icon="iconFor(action.icon, MoreHorizontal)" :label="action.name" />
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        v-for="choice in action.choices"
                        :key="choice.value"
                        :icon="iconFor(choice.icon, MoreHorizontal)"
                        :label="choice.name"
                        :checked="action.selected?.(node, choice.value)"
                        @select="runAction(action, choice.value)"
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    v-else
                    :class="action.id === 'delete' ? 'text-destructive focus:text-destructive' : ''"
                    :icon="iconFor(action.icon, MoreHorizontal)"
                    :label="action.name"
                    @select="runAction(action)"
                  />
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
          <ContextMenuItem v-else :class="action.id === 'delete' ? 'text-destructive focus:text-destructive' : ''" @select="runAction(action)">
            <component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />
            <span class="truncate">{{ action.name }}</span>
          </ContextMenuItem>
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
          @open="emit('open', $event)"
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

.file-tree-open-button {
	pointer-events: none;
	opacity: 0;
	transition: opacity 130ms ease, color 130ms ease, background-color 130ms ease;
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

	.file-tree-actions,
	.file-tree-open-button {
		pointer-events: none;
		opacity: 0;
	}

	.file-tree-row:hover .file-tree-actions,
	.file-tree-actions:focus-within,
	.file-tree-row:hover .file-tree-open-button {
		pointer-events: auto;
		opacity: 1;
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
