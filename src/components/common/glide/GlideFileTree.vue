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
import GlideFileTreeItem from './GlideFileTreeItem.vue';
import type { GlideFileTreeNode } from './types';

export interface GlideFileTreeProps {
  nodes: GlideFileTreeNode[];
  modelValue?: string;
  expanded?: string[];
  defaultOpenAll?: boolean;
  rowHeight?: number;
  highlightMode?: 'both' | 'hover-only' | 'selected-only';
  disabled?: boolean;
  className?: string;
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<GlideFileTreeProps>(), {
  modelValue: undefined,
  expanded: () => [],
  defaultOpenAll: false,
  rowHeight: 32,
  highlightMode: 'both',
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
}>();

const id = useId();
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

// ─── Glide 高亮移动核心状态 ───────────────────────────────────────────────────
const hoverTop = ref(0);
const hoverVisible = ref(false);

const selectedTop = ref(0);
const selectedVisible = ref(false);

// 悬停跟踪 (Zero-DOM-overhead, 仅利用 offsetTop 相对位移)
const onPointerOver = (e: PointerEvent) => {
  if (props.disabled) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const row = target.closest<HTMLElement>('[data-tree-node-id]');
  const container = treeContainerRef.value;
  if (!row || !container) return;

  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  hoverTop.value = rowRect.top - containerRect.top + container.scrollTop;
  hoverVisible.value = true;
};

const onPointerLeave = () => {
  hoverVisible.value = false;
};

// 选中项滑块位置更新
const updateSelectedPill = () => {
  nextTick(() => {
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
      selectedTop.value = rowRect.top - containerRect.top + container.scrollTop;
      selectedVisible.value = true;
    } else {
      selectedVisible.value = false;
    }
  });
};

watch(() => props.modelValue, () => {
  updateSelectedPill();
});

// 监听容器 DOM 结构变化（折叠/展开导致列表项高度移动）时，自动平滑重定位选中滑块
let mutationObserver: MutationObserver | null = null;
onMounted(() => {
  if (treeContainerRef.value && typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(() => {
      updateSelectedPill();
    });
    mutationObserver.observe(treeContainerRef.value, {
      childList: true,
      subtree: true
    });
  }
});

onUnmounted(() => {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
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
  updateSelectedPill();
};

const handleOpen = (node: GlideFileTreeNode) => {
  emit('open', node);
};
</script>

<template>
  <div
    :id="id"
    class="glide-file-tree relative flex flex-col size-full overflow-hidden select-none"
    :class="[className, props.class]"
  >
    <ScrollArea class="size-full">
      <div
        ref="treeContainerRef"
        class="glide-file-tree-container relative p-2 min-w-full"
        @pointerover="onPointerOver"
        @pointerleave="onPointerLeave"
      >
        <!-- 
          Glide 移动悬停滑块 (Hover Pill)
          零 DOM 测算，基于 GPU 合成层 translate3d 原生平滑平移
        -->
        <span
          v-if="highlightMode !== 'selected-only'"
          class="glide-file-tree-hover-pill absolute left-2 right-2 pointer-events-none rounded-lg bg-accent/70 text-accent-foreground dark:bg-muted/70 border border-border/40 shadow-xs z-0"
          :style="{
            top: '0px',
            height: `${rowHeight}px`,
            transform: `translate3d(0, ${hoverTop}px, 0)`,
            opacity: hoverVisible ? 1 : 0
          }"
          aria-hidden="true"
        />

        <!-- 
          Glide 移动选中滑块 (Selected Pill)
          平滑吸附在当前选中的项背景，随展开/折叠自动形变平移
        -->
        <span
          v-if="highlightMode !== 'hover-only'"
          class="glide-file-tree-selected-pill absolute left-2 right-2 pointer-events-none rounded-lg bg-primary/15 text-primary z-0"
          :style="{
            top: '0px',
            height: `${rowHeight}px`,
            transform: `translate3d(0, ${selectedTop}px, 0)`,
            opacity: selectedVisible ? 1 : 0
          }"
          aria-hidden="true"
        />

        <!-- 树节点列表渲染 -->
        <GlideFileTreeItem
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
  </div>
</template>

<style scoped>
.glide-file-tree-hover-pill {
  transition:
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 140ms ease;
  will-change: transform, opacity;
}

.glide-file-tree-selected-pill {
  transition:
    transform 200ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 160ms ease;
  will-change: transform, opacity;
}
</style>
