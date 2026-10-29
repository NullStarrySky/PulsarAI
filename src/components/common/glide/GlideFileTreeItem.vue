<script setup lang="ts">
import { computed } from 'vue';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  File,
  FileText,
  Code,
  Braces,
  Sparkles,
  Palette
} from '@/lib/remix-icons';
import type { GlideFileTreeNode } from './types';

interface Props {
  node: GlideFileTreeNode;
  depth?: number;
  rowHeight?: number;
  selectedId?: string;
  expandedSet: Set<string>;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
  rowHeight: 32,
  selectedId: undefined,
  disabled: false
});

const emit = defineEmits<{
  'select': [node: GlideFileTreeNode];
  'toggle': [node: GlideFileTreeNode, expanded: boolean];
  'open': [node: GlideFileTreeNode];
}>();

const isFolder = computed(() => props.node.type === 'folder');
const isOpen = computed(() => isFolder.value && props.expandedSet.has(props.node.id));
const isSelected = computed(() => props.selectedId === props.node.id);

// 根据文件扩展名解析默认文件图标与配色
const resolveFileIcon = (name: string) => {
  if (name.endsWith('.vue')) return { icon: Sparkles, color: 'text-emerald-500' };
  if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js')) {
    return { icon: Code, color: 'text-sky-500' };
  }
  if (name.endsWith('.json')) return { icon: Braces, color: 'text-amber-500' };
  if (name.endsWith('.md')) return { icon: FileText, color: 'text-blue-400' };
  if (name.endsWith('.css') || name.endsWith('.scss')) {
    return { icon: Palette, color: 'text-purple-400' };
  }
  return { icon: File, color: 'text-muted-foreground' };
};

const fileIconInfo = computed(() => resolveFileIcon(props.node.name));

const handleRowClick = () => {
  if (props.disabled || props.node.disabled) return;
  if (isFolder.value) {
    emit('toggle', props.node, !isOpen.value);
  } else {
    emit('select', props.node);
    emit('open', props.node);
  }
};
</script>

<template>
  <div class="glide-file-tree-node select-none">
    <!-- 行主体 -->
    <div
      :data-tree-node-id="node.id"
      :data-tree-type="node.type"
      class="relative z-[1] flex items-center justify-between gap-2 px-2 rounded-lg cursor-pointer transition-colors duration-100"
      :class="[
        isSelected ? 'text-foreground font-medium' : 'text-foreground/80 hover:text-foreground',
        node.disabled || disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '',
        node.gitStatus === 'untracked' ? 'text-emerald-500 dark:text-emerald-400' : '',
        node.gitStatus === 'modified' ? 'text-amber-500 dark:text-amber-400' : '',
        node.gitStatus === 'deleted' ? 'text-rose-500 dark:text-rose-400 line-through' : '',
      ]"
      :style="{
        height: `${rowHeight}px`,
        paddingLeft: `${depth * 18 + 8}px`
      }"
      @click="handleRowClick"
    >
      <!-- 左侧图标与文本 -->
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <!-- 文件夹展开箭头 -->
        <span
          v-if="isFolder"
          class="size-4 shrink-0 grid place-items-center text-muted-foreground/70 transition-transform duration-200"
          :class="isOpen ? 'rotate-90' : 'rotate-0'"
        >
          <ChevronRight class="size-3.5" />
        </span>
        <span v-else class="size-4 shrink-0" />

        <!-- 文件夹 / 文件主图标 -->
        <div class="shrink-0 flex items-center">
          <template v-if="isFolder">
            <component
              :is="node.icon || (isOpen ? FolderOpen : Folder)"
              class="size-4"
              :class="isOpen ? 'text-primary' : 'text-muted-foreground'"
            />
          </template>
          <template v-else>
            <component
              :is="node.icon || fileIconInfo.icon"
              class="size-4"
              :class="node.gitStatus ? '' : fileIconInfo.color"
            />
          </template>
        </div>

        <!-- 节点名称 -->
        <span class="truncate text-sm tracking-tight leading-none">
          {{ node.name }}
        </span>

        <!-- 额外作者/描述 tag -->
        <span
          v-if="node.tag"
          class="text-[10px] px-1.5 py-0.2 rounded bg-muted/70 text-muted-foreground font-mono shrink-0"
        >
          {{ node.tag }}
        </span>
      </div>

      <!-- 右侧 Git 状态或自定义 Badge (对齐 components/files) -->
      <div class="shrink-0 flex items-center gap-1.5">
        <span
          v-if="node.badge"
          class="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-mono"
        >
          {{ node.badge }}
        </span>

        <!-- Git 状态标签 -->
        <template v-if="node.gitStatus">
          <span
            class="size-2 rounded-full shrink-0"
            :class="{
              'bg-emerald-500 ring-2 ring-emerald-500/20': node.gitStatus === 'untracked',
              'bg-amber-500 ring-2 ring-amber-500/20': node.gitStatus === 'modified',
              'bg-rose-500 ring-2 ring-rose-500/20': node.gitStatus === 'deleted'
            }"
            :title="node.gitStatus"
          />
          <span class="text-xs font-mono font-bold uppercase shrink-0">
            {{ node.gitStatus === 'untracked' ? 'U' : node.gitStatus === 'modified' ? 'M' : 'D' }}
          </span>
        </template>
      </div>
    </div>

    <!-- 子目录渲染 (对齐 components/files 的层级参考线) -->
    <div
      v-if="isFolder && isOpen && node.children && node.children.length > 0"
      class="glide-file-tree-children relative ml-6 before:absolute before:-left-2 before:inset-y-0 before:w-px before:h-full before:bg-border"
    >
      <GlideFileTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :row-height="rowHeight"
        :selected-id="selectedId"
        :expanded-set="expandedSet"
        :disabled="disabled"
        @select="emit('select', $event)"
        @toggle="(n, exp) => emit('toggle', n, exp)"
        @open="emit('open', $event)"
      />
    </div>
  </div>
</template>
