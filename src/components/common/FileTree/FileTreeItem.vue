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
import type { GlideFileTreeNode } from '../types';

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
  emit('select', props.node);
  if (isFolder.value) {
    emit('toggle', props.node, !isOpen.value);
  } else {
    emit('open', props.node);
  }
};

// ── 文件夹开关高度与透明度平滑过渡动画 ──
const onFolderEnter = (el: Element) => {
  const h = el as HTMLElement;
  h.style.height = '0px';
  h.style.opacity = '0';
  h.style.transform = 'translateY(-4px)';
  void h.offsetHeight;
  h.style.transition = 'height 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 180ms ease, transform 180ms ease';
  h.style.height = `${h.scrollHeight}px`;
  h.style.opacity = '1';
  h.style.transform = 'translateY(0px)';
};

const onFolderAfterEnter = (el: Element) => {
  const h = el as HTMLElement;
  h.style.height = 'auto';
  h.style.transition = '';
  h.style.transform = '';
};

const onFolderLeave = (el: Element) => {
  const h = el as HTMLElement;
  h.style.height = `${h.scrollHeight}px`;
  h.style.opacity = '1';
  h.style.transform = 'translateY(0px)';
  void h.offsetHeight;
  h.style.transition = 'height 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease, transform 160ms ease';
  h.style.height = '0px';
  h.style.opacity = '0';
  h.style.transform = 'translateY(-4px)';
};
</script>

<template>
  <div class="glide-file-tree-node select-none">
    <!-- 行主体 (缩进由父级 ml-6 自然形成，使得节点 bounds 与高亮滑块完全对齐) -->
    <div
      :data-tree-node-id="node.id"
      :data-tree-type="node.type"
      class="relative z-[1] flex items-center justify-between gap-2 px-2 rounded-lg cursor-pointer transition-colors duration-100"
      :class="[
        isSelected ? 'text-foreground font-medium' : 'text-foreground/80 hover:text-foreground',
        node.disabled || disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
      ]"
      :style="{
        height: `${rowHeight}px`
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
            <span class="size-4 shrink-0 flex items-center justify-center transition-transform duration-150" :class="isOpen ? 'scale-105' : 'scale-100'">
              <component
                :is="node.icon || (isOpen ? FolderOpen : Folder)"
                class="size-4 transition-colors duration-150"
                :class="isOpen ? 'text-primary' : 'text-muted-foreground'"
              />
            </span>
          </template>
          <template v-else>
            <component
              :is="node.icon || fileIconInfo.icon"
              class="size-4"
              :class="fileIconInfo.color"
            />
          </template>
        </div>

        <!-- 节点名称 (使用 leading-normal 与 py-0.5 彻底消除 p/g/y 等字母下延 descender 被截断的问题) -->
        <span class="truncate text-sm tracking-tight leading-normal py-0.5">
          {{ node.name }}
        </span>
      </div>
    </div>

    <!-- 子目录渲染 (带有层级参考线与展开折叠高度过渡动效) -->
    <Transition
      name="tree-folder"
      @enter="onFolderEnter"
      @after-enter="onFolderAfterEnter"
      @leave="onFolderLeave"
    >
      <div
        v-if="isFolder && isOpen && node.children && node.children.length > 0"
        class="glide-file-tree-children relative ml-6 before:absolute before:-left-2 before:inset-y-0 before:w-px before:h-full before:bg-border overflow-hidden"
      >
        <FileTreeItem
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
    </Transition>
  </div>
</template>
