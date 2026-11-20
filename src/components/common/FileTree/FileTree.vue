<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  useId,
  watch,
  type HTMLAttributes
} from 'vue';
import { ScrollArea } from '@/components/ui/scroll-area';
import FileTreeItem from './FileTreeItem.vue';
import FileTreePreview from './FileTreePreview.vue';
import type { GlideFileTreeNode, FileTreeNode } from '../types';

export interface FileTreeProps {
  nodes: FileTreeNode[];
  modelValue?: string;
  expanded?: string[];
  defaultOpenAll?: boolean;
  rowHeight?: number;
  highlightMode?: 'both' | 'hover-only' | 'selected-only';
  /** 是否在悬停时于右侧开启文件/文件夹浮窗预览功能，默认 true */
  preview?: boolean;
  /** 预览窗口宽度，默认 340px */
  previewWidth?: number;
  /** 预览窗口高度，默认 360px */
  previewHeight?: number;
  disabled?: boolean;
  className?: string;
  class?: HTMLAttributes['class'];
}
export type GlideFileTreeProps = FileTreeProps;

const props = withDefaults(defineProps<FileTreeProps>(), {
  modelValue: undefined,
  expanded: () => [],
  defaultOpenAll: false,
  rowHeight: 32,
  highlightMode: 'both',
  preview: true,
  previewWidth: 340,
  previewHeight: 360,
  disabled: false,
  className: '',
  class: undefined
});

const emit = defineEmits<{
  'update:modelValue': [id: string];
  'update:expanded': [expanded: string[]];
  'select': [node: GlideFileTreeNode];
  'toggle': [node: GlideFileTreeNode, expanded: boolean];
  'open': [node: GlideFileTreeNode];
  'preview-change': [node: GlideFileTreeNode | null];
}>();

const id = useId();
const rootRef = ref<HTMLDivElement | null>(null);
const treeContainerRef = ref<HTMLDivElement | null>(null);

// 展开目录管理
const localExpanded = ref<string[]>([...props.expanded]);

watch(
  () => props.expanded,
  (val) => {
    localExpanded.value = [...val];
    updateSelectedPill();
  },
  { deep: true }
);

// 如果 defaultOpenAll，默认展开所有文件夹
onMounted(() => {
  if (props.defaultOpenAll && localExpanded.value.length === 0) {
    const allFolderIds: string[] = [];
    const traverse = (list: GlideFileTreeNode[]) => {
      for (const item of list) {
        if (item.type === 'folder') {
          allFolderIds.push(item.id);
          if (item.children) traverse(item.children);
        }
      }
    };
    traverse(props.nodes);
    localExpanded.value = allFolderIds;
    emit('update:expanded', allFolderIds);
  }
  updateSelectedPill();
});

const expandedSet = computed(() => new Set(localExpanded.value));

// 辅助：从节点树递归寻找指定 id 的 node
const findNodeById = (list: GlideFileTreeNode[], targetId: string): GlideFileTreeNode | null => {
  for (const n of list) {
    if (n.id === targetId) return n;
    if (n.children) {
      const found = findNodeById(n.children, targetId);
      if (found) return found;
    }
  }
  return null;
};

// ─── 悬停预览核心控制 ────────────────────────────────────────────────────────
// 仅在鼠标悬停时展示，不悬停时没有；预览窗口左上角与当前悬停项严格对齐
const hoveredNode = ref<GlideFileTreeNode | null>(null);
const isHovered = ref(false);
const isMouseOverPreview = ref(false);
const previewTop = ref(0);
const previewLeft = ref(0);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const clearCloseTimer = () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
};

const scheduleClose = () => {
  clearCloseTimer();
  closeTimer = setTimeout(() => {
    if (!isMouseOverPreview.value) {
      isHovered.value = false;
      hoveredNode.value = null;
      emit('preview-change', null);
    }
  }, 120);
};

// ─── Glide 高亮移动核心状态 (精确自适应各层级缩进与宽度) ───────────────────────
const hoverLeft = ref(0);
const hoverTop = ref(0);
const hoverWidth = ref(0);
const hoverHeight = ref(props.rowHeight);
const hoverVisible = ref(false);

const selectedLeft = ref(0);
const selectedTop = ref(0);
const selectedWidth = ref(0);
const selectedHeight = ref(props.rowHeight);
const selectedVisible = ref(false);

// 悬停跟踪 (精准根据实际行的 left 与 width 匹配缩进，同时更新右侧对齐预览浮窗)
const onPointerOver = (e: PointerEvent) => {
  if (props.disabled) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const row = target.closest<HTMLElement>('[data-tree-node-id]');
  const container = treeContainerRef.value;
  const root = rootRef.value;
  if (!row || !container || !root) {
    hoverVisible.value = false;
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  hoverLeft.value = rowRect.left - containerRect.left;
  hoverTop.value = rowRect.top - containerRect.top;
  hoverWidth.value = rowRect.width;
  hoverHeight.value = rowRect.height;
  hoverVisible.value = true;

  // 悬停预览：只在悬停项时显示，且左上角与项顶部一致
  if (props.preview) {
    const nodeId = row.getAttribute('data-tree-node-id');
    if (nodeId) {
      const node = findNodeById(props.nodes, nodeId);
      if (node) {
        clearCloseTimer();
        hoveredNode.value = node;
        const rootRect = root.getBoundingClientRect();
        // 预览窗口左上角与项严格对齐：
        // Y 轴相对 root 的 top 偏移为 rowRect.top - rootRect.top
        // X 轴位于文件树右侧加上一定间隙
        previewTop.value = Math.round(rowRect.top - rootRect.top);
        previewLeft.value = Math.round(rootRect.width + 12);
        isHovered.value = true;
        emit('preview-change', node);
      }
    }
  }
};

const onPointerLeave = () => {
  hoverVisible.value = false;
  if (props.preview) {
    scheduleClose();
  }
};

const onPreviewEnter = () => {
  clearCloseTimer();
  isMouseOverPreview.value = true;
};

const onPreviewLeave = () => {
  isMouseOverPreview.value = false;
  scheduleClose();
};

// 选中项滑块位置测量更新 (双重 RAF 确保在挂载或动画展开期间精确捕捉尺寸)
const updateSelectedPill = () => {
  const measure = () => {
    const container = treeContainerRef.value;
    if (!props.modelValue || !container) {
      selectedVisible.value = false;
      return;
    }
    const row = container.querySelector<HTMLElement>(
      `[data-tree-node-id="${props.modelValue}"]`
    );
    if (row) {
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      if (rowRect.width > 0) {
        selectedLeft.value = rowRect.left - containerRect.left;
        selectedTop.value = rowRect.top - containerRect.top;
        selectedWidth.value = rowRect.width;
        selectedHeight.value = rowRect.height || props.rowHeight;
        selectedVisible.value = true;
        return;
      }
    }
    selectedVisible.value = false;
  };

  nextTick(() => {
    measure();
    requestAnimationFrame(measure);
  });
};

watch(
  () => props.modelValue,
  () => {
    updateSelectedPill();
  },
  { immediate: true }
);

// 监听容器 DOM 与高度变化，折叠展开过渡期间平滑刷新选中滑块及当前悬停预览浮窗
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let viewportEl: HTMLElement | null = null;

const onScrollHandler = () => {
  updateSelectedPill();
  if (hoveredNode.value && rootRef.value && treeContainerRef.value) {
    const row = treeContainerRef.value.querySelector<HTMLElement>(
      `[data-tree-node-id="${hoveredNode.value.id}"]`
    );
    if (row) {
      const rootRect = rootRef.value.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      previewTop.value = Math.round(rowRect.top - rootRect.top);
    }
  }
};

onMounted(() => {
  if (treeContainerRef.value) {
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        updateSelectedPill();
      });
      mutationObserver.observe(treeContainerRef.value, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateSelectedPill();
      });
      resizeObserver.observe(treeContainerRef.value);
    }

    viewportEl = treeContainerRef.value.parentElement;
    viewportEl?.addEventListener('scroll', onScrollHandler, { passive: true });
  }

  setTimeout(() => updateSelectedPill(), 50);
});

onUnmounted(() => {
  mutationObserver?.disconnect();
  resizeObserver?.disconnect();
  viewportEl?.removeEventListener('scroll', onScrollHandler);
  clearCloseTimer();
});

// 节点交互事件分发
const handleSelect = (node: GlideFileTreeNode) => {
  emit('update:modelValue', node.id);
  emit('select', node);
};

const handleToggle = (node: GlideFileTreeNode, expanded: boolean) => {
  const next = expanded
    ? [...localExpanded.value, node.id]
    : localExpanded.value.filter((id) => id !== node.id);
  localExpanded.value = next;
  emit('update:expanded', next);
  emit('toggle', node, expanded);

  // 在动画过程中连续微调滑块位置，保证过渡平滑
  let count = 0;
  const loop = () => {
    updateSelectedPill();
    if (++count < 16) {
      requestAnimationFrame(loop);
    }
  };
  requestAnimationFrame(loop);
};

const handleOpen = (node: GlideFileTreeNode) => {
  emit('open', node);
};
</script>

<template>
  <div
    ref="rootRef"
    :id="id"
    class="glide-file-tree relative flex flex-col size-full overflow-visible select-none"
    :class="[className, props.class]"
  >
    <!-- 左侧可滚动的树主体 -->
    <ScrollArea class="size-full">
      <div
        ref="treeContainerRef"
        class="glide-file-tree-container relative p-2 min-w-full"
        @pointerover="onPointerOver"
        @pointerleave="onPointerLeave"
      >
        <!-- 
          Glide 移动悬停滑块 (Hover Pill)
          零 DOM 测算，自适应每一层缩进坐标与宽度，GPU translate3d 原生平滑平移
        -->
        <span
          v-if="highlightMode !== 'selected-only'"
          class="glide-file-tree-hover-pill absolute top-0 left-0 pointer-events-none rounded-lg bg-accent/60 text-accent-foreground dark:bg-muted/60 z-0"
          :style="{
            transform: `translate3d(${hoverLeft}px, ${hoverTop}px, 0)`,
            width: `${hoverWidth}px`,
            height: `${hoverHeight}px`,
            opacity: hoverVisible ? 1 : 0
          }"
          aria-hidden="true"
        />

        <!-- 
          Glide 移动选中滑块 (Selected Pill)
          与缩进严格配合，纯粹背景平移，无外层边框干扰
        -->
        <span
          v-if="highlightMode !== 'hover-only'"
          class="glide-file-tree-selected-pill absolute top-0 left-0 pointer-events-none rounded-lg bg-primary/15 text-primary z-0"
          :style="{
            transform: `translate3d(${selectedLeft}px, ${selectedTop}px, 0)`,
            width: `${selectedWidth}px`,
            height: `${selectedHeight}px`,
            opacity: selectedVisible ? 1 : 0
          }"
          aria-hidden="true"
        />

        <!-- 树节点列表渲染 -->
        <FileTreeItem
          v-for="node in nodes"
          :key="node.id"
          :node="node"
          :depth="0"
          :row-height="rowHeight"
          :selected-id="modelValue"
          :expanded-set="expandedSet"
          :disabled="disabled"
          @select="handleSelect"
          @toggle="handleToggle"
          @open="handleOpen"
        />
      </div>
    </ScrollArea>

    <!-- 
      悬停联动预览小窗口：
      1. 仅在鼠标悬停时才渲染展示，不悬停时不展示；
      2. 预览窗口的左上角 (previewTop, previewLeft) 严格与悬停项顶部对齐；
      3. 文件夹提供子项预览，底部带等宽数字滚轴 <1/x>，支持滚轮滚动切换。
    -->
    <Transition name="glide-preview-fade">
      <div
        v-if="preview && isHovered && hoveredNode"
        class="glide-file-tree-hover-preview absolute z-50 pointer-events-auto"
        :style="{
          top: `${previewTop}px`,
          left: `${previewLeft}px`,
          width: `${previewWidth}px`,
          height: `${previewHeight}px`,
          transition: 'top 120ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease'
        }"
        @pointerenter="onPreviewEnter"
        @pointerleave="onPreviewLeave"
      >
        <FileTreePreview
          :node="hoveredNode"
          :open="true"
          :width="previewWidth"
          :height="previewHeight"
          :floating="false"
          class="size-full shadow-2xl border border-border/80"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.glide-file-tree-hover-pill {
  transition:
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    width 160ms cubic-bezier(0.23, 1, 0.32, 1),
    height 160ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 140ms ease;
  will-change: transform, width, height, opacity;
}

.glide-file-tree-selected-pill {
  transition:
    transform 200ms cubic-bezier(0.23, 1, 0.32, 1),
    width 200ms cubic-bezier(0.23, 1, 0.32, 1),
    height 200ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 160ms ease;
  will-change: transform, width, height, opacity;
}

/* 悬停预览浮窗进出过渡 */
.glide-preview-fade-enter-active,
.glide-preview-fade-leave-active {
  transition: opacity 120ms ease, transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.glide-preview-fade-enter-from,
.glide-preview-fade-leave-to {
  opacity: 0;
  transform: translateX(8px) scale(0.98);
}
</style>
