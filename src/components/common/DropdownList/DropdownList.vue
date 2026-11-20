<script setup lang="ts">
import {
  computed,
  onUnmounted,
  ref,
  useId,
  type HTMLAttributes
} from 'vue';
import List from '../List/List.vue';
import { GLIDE_SIZES, type GlideOption, type GlideSize } from '../types';

export interface DropdownListOption extends GlideOption {
  previewWidth?: number;
  previewHeight?: number;
  [key: string]: any;
}
export type GlideDropdownListOption = DropdownListOption;

export interface DropdownListProps {
  options?: (string | GlideDropdownListOption)[];
  items?: (string | GlideDropdownListOption)[];
  modelValue?: string | number | (string | number)[] | null;
  /** 预览浮层停靠侧: 'right' (默认) 或 'left' */
  side?: 'right' | 'left';
  /** 预览浮层垂直对齐策略: 'follow-item' 跟随项平移居中, 'top' 顶端对齐, 'center' 容器居中 */
  align?: 'follow-item' | 'top' | 'center';
  /** 首次触发预览的悬停延时 (ms)，默认 180ms，避免鼠标快速滑过时抖动 */
  hoverDelay?: number;
  /** 鼠标移出后的收起缓冲延时 (ms)，默认 150ms，允许光标斜切滑入预览浮层 */
  closeDelay?: number;
  /** 默认预览窗口宽度 */
  previewWidth?: number | string;
  /** 默认预览窗口高度 */
  previewHeight?: number | string;
  /** 列表与预览浮层的横向间距 (px) */
  gap?: number;
  /** 列表容器尺寸规范 */
  size?: GlideSize;
  /** 列表项行高覆盖 (px) */
  itemSize?: number;
  /** 圆角半径 */
  radius?: number;
  /** 高亮模式 */
  highlightMode?: 'both' | 'hover-only' | 'selected-only';
  /** 是否禁用 */
  disabled?: boolean;
  /** 外层容器 class */
  class?: HTMLAttributes['class'];
  className?: string;
  /** 列表包装区域 class */
  listClass?: string;
  /** 预览外壳 class */
  previewClass?: string;
}
export type GlideDropdownListProps = DropdownListProps;

const props = withDefaults(defineProps<DropdownListProps>(), {
  options: () => [],
  items: undefined,
  modelValue: undefined,
  side: 'right',
  align: 'follow-item',
  hoverDelay: 180,
  closeDelay: 150,
  previewWidth: 280,
  previewHeight: 180,
  gap: 8,
  size: 'md',
  itemSize: undefined,
  radius: 10,
  highlightMode: 'both',
  disabled: false,
  class: undefined,
  className: '',
  listClass: '',
  previewClass: ''
});

const emit = defineEmits<{
  'update:modelValue': [value: string | (string | number)[]];
  'select': [value: string, option: GlideDropdownListOption, index: number];
  'preview-change': [index: number, option: GlideDropdownListOption, direction: 'up' | 'down'];
  'preview-open': [index: number, option: GlideDropdownListOption];
  'preview-close': [];
}>();

const id = useId();
const containerRef = ref<HTMLDivElement | null>(null);
const shellRef = ref<HTMLDivElement | null>(null);
defineExpose({ el: containerRef, shell: shellRef });

// 归一化选项列表
const norm = (o: string | GlideDropdownListOption): GlideDropdownListOption =>
  typeof o === 'string' ? { value: o, label: o } : o;
const items = computed(() => {
  const raw = props.items ?? props.options ?? [];
  return raw.map(norm);
});

const resolvedSizeConfig = computed(() => GLIDE_SIZES[props.size] ?? GLIDE_SIZES.md);
const resolvedItemSize = computed(() => props.itemSize ?? resolvedSizeConfig.value.row);

// 预览状态
const isShellOpen = ref(false);
const prevIndex = ref(-1);
const currentIndex = ref(-1);
const currentItem = computed<GlideDropdownListOption | null>(() => {
  if (currentIndex.value >= 0 && currentIndex.value < items.value.length) {
    return items.value[currentIndex.value] ?? null;
  }
  return null;
});

// 计算相对移动方向：鼠标向上移动 (currentIndex < prevIndex) vs 向下移动 (currentIndex > prevIndex)
const direction = ref<'up' | 'down'>('down');
const transitionName = computed(() =>
  direction.value === 'up' ? 'glide-slide-up' : 'glide-slide-down'
);

// 外壳位置与变形尺寸 (Morphing Shell)
const shellY = ref(0);
const resolvedPreviewWidth = computed(() => {
  if (currentItem.value?.previewWidth) return currentItem.value.previewWidth;
  return typeof props.previewWidth === 'number' ? props.previewWidth : 280;
});
const resolvedPreviewHeight = computed(() => {
  if (currentItem.value?.previewHeight) return currentItem.value.previewHeight;
  return typeof props.previewHeight === 'number' ? props.previewHeight : 180;
});

// 定时器引用
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const clearTimers = () => {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
};

onUnmounted(() => {
  clearTimers();
});

// 计算预览外壳的垂直目标位置
const calculateShellY = (targetIndex: number) => {
  const container = containerRef.value;
  const padding = resolvedSizeConfig.value.pad;
  const itemHeight = resolvedItemSize.value;
  const gap = 2; // GlideList 默认 item gap
  const step = itemHeight + gap;

  const itemTop = padding + targetIndex * step;
  const pHeight = resolvedPreviewHeight.value;

  if (props.align === 'top') {
    return 0;
  }

  const containerH = container ? container.clientHeight : items.value.length * step + padding * 2;

  if (props.align === 'center') {
    return Math.max(0, (containerH - pHeight) / 2);
  }

  // 'follow-item': 将预览窗口垂直中心对齐项的垂直中心，并限制在容器内
  const idealY = itemTop + itemHeight / 2 - pHeight / 2;
  const minY = 0;
  const maxY = Math.max(0, containerH - pHeight);
  return Math.max(minY, Math.min(maxY, idealY));
};

// 激活特定项的预览
const activatePreview = (index: number) => {
  if (index < 0 || index >= items.value.length) return;
  const targetItem = items.value[index];
  if (!targetItem || targetItem.disabled || props.disabled) return;

  const oldIndex = currentIndex.value;

  if (oldIndex !== -1 && oldIndex !== index) {
    // 鼠标在项之间移动：判断方向
    direction.value = index < oldIndex ? 'up' : 'down';
  } else if (oldIndex === -1) {
    // 首次打开
    direction.value = 'down';
  }

  prevIndex.value = oldIndex;
  currentIndex.value = index;
  shellY.value = calculateShellY(index);

  if (!isShellOpen.value) {
    isShellOpen.value = true;
    emit('preview-open', index, targetItem);
  }
  emit('preview-change', index, targetItem, direction.value);
};

// 列表 hover 事件处理
const handleListHover = (index: number | null, option: GlideOption | null) => {
  if (index === null || !option || option.disabled || props.disabled) {
    // 鼠标离开选项：启动关闭定时器（缓冲延时）
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    if (isShellOpen.value && !closeTimer) {
      closeTimer = setTimeout(() => {
        closePreview();
      }, props.closeDelay);
    }
    return;
  }

  // 鼠标移入有效选项
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  if (isShellOpen.value) {
    // 关键点：预览已经打开，直接即时响应，重用外壳变形平移，延时为 0
    if (openTimer) clearTimeout(openTimer);
    activatePreview(index);
  } else {
    // 首次打开：防抖等待 hoverDelay
    if (openTimer) clearTimeout(openTimer);
    openTimer = setTimeout(() => {
      activatePreview(index);
    }, props.hoverDelay);
  }
};

const closePreview = () => {
  clearTimers();
  if (isShellOpen.value) {
    isShellOpen.value = false;
    emit('preview-close');
    // 延迟重置索引，以便退出动画平稳结束
    setTimeout(() => {
      if (!isShellOpen.value) {
        prevIndex.value = -1;
        currentIndex.value = -1;
      }
    }, 200);
  }
};

// 预览窗口的鼠标事件（允许用户光标滑入预览窗口内容并交互）
const onPreviewPointerEnter = () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
};

const onPreviewPointerLeave = () => {
  if (!closeTimer) {
    closeTimer = setTimeout(() => {
      closePreview();
    }, props.closeDelay);
  }
};

// 传递给底层的选中事件
const handleSelect = (val: string, opt: any, idx: number) => {
  emit('update:modelValue', val);
  emit('select', val, opt, idx);
};
</script>

<template>
  <div
    ref="containerRef"
    :id="id"
    class="relative inline-flex items-start select-none"
    :class="[className, props.class]"
  >
    <!-- 左侧/主体列表区域 -->
    <div
      class="glide-dropdown-list-wrapper relative z-10 shrink-0"
      :class="listClass"
      @pointerleave="handleListHover(null, null)"
    >
      <slot name="header" />

      <List
        :options="items"
        :model-value="modelValue"
        :size="size"
        :item-size="itemSize"
        :radius="radius"
        :highlight-mode="highlightMode"
        :disabled="disabled"
        @select="handleSelect"
        @hover="handleListHover"
      >
        <template #default="{ item, index, isSelected, isHovered, select }">
          <slot
            :item="item"
            :index="index"
            :is-selected="isSelected"
            :is-hovered="isHovered"
            :select="select"
          />
        </template>
      </List>

      <slot name="footer" />
    </div>

    <!-- 
      核心要点 1：单例预览外壳 (Morphing Preview Shell)
      在项之间移动时绝对不重新挂载，仅依靠 transform / width / height 的 CSS GPU 变换做平滑移动与变形！
    -->
    <Transition name="glide-shell-fade">
      <div
        v-if="isShellOpen"
        ref="shellRef"
        class="glide-dropdown-preview-shell absolute z-50 pointer-events-auto"
        :class="[
          side === 'right' ? 'glide-side-right' : 'glide-side-left',
          previewClass
        ]"
        :style="{
          top: '0px',
          left: side === 'right' ? `calc(100% + ${gap}px)` : undefined,
          right: side === 'left' ? `calc(100% + ${gap}px)` : undefined,
          transform: `translate3d(0, ${shellY}px, 0)`,
          width: `${resolvedPreviewWidth}px`,
          height: `${resolvedPreviewHeight}px`,
          borderRadius: `${radius + 2}px`
        }"
        @pointerenter="onPreviewPointerEnter"
        @pointerleave="onPreviewPointerLeave"
      >
        <!-- 预览视口裁剪容器 -->
        <div class="glide-preview-viewport relative size-full overflow-hidden rounded-[inherit] bg-popover/95 text-popover-foreground shadow-xl border border-border backdrop-blur-md">
          <!--
            核心要点 2：基于项相对位置的内容进出动画
            向上移动 (up): 旧内容向下消失，新内容从上方引入
            向下移动 (down): 旧内容向上消失，新内容从下方引入
          -->
          <Transition :name="transitionName">
            <div
              v-if="currentItem"
              :key="currentItem.value ?? currentIndex"
              class="glide-preview-content absolute inset-0 size-full overflow-y-auto"
            >
              <slot
                name="preview"
                :item="currentItem"
                :index="currentIndex"
                :direction="direction"
              >
                <!-- 默认回退预览内容 -->
                <div class="flex h-full flex-col justify-between p-4">
                  <div>
                    <div class="flex items-center justify-between gap-2 mb-1.5">
                      <div class="flex items-center gap-2 min-w-0">
                        <component
                          :is="currentItem.icon"
                          v-if="currentItem.icon"
                          class="size-4 shrink-0 text-primary"
                        />
                        <h4 class="text-sm font-semibold text-foreground truncate">
                          {{ currentItem.label }}
                        </h4>
                      </div>
                      <span
                        v-if="currentItem.tag"
                        class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0"
                      >
                        {{ currentItem.tag }}
                      </span>
                    </div>

                    <p class="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                      {{ currentItem.description || '当前项暂无详细说明。' }}
                    </p>
                  </div>

                  <div class="pt-3 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
                    <span>索引: #{{ currentIndex }}</span>
                    <span>方向: {{ direction === 'up' ? '↑ 向上移入' : '↓ 向下移入' }}</span>
                  </div>
                </div>
              </slot>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 
  1. 单例外壳变形平移过渡 (Morphing & Movement)
  在项之间切换时，transform (位置) 和 width/height (尺寸) 原生平滑插值，完全无需外部动画库
*/
.glide-dropdown-preview-shell {
  transition:
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1),
    width 240ms cubic-bezier(0.16, 1, 0.3, 1),
    height 240ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform, width, height;
}

/* 首次打开与完全收起的进入/离开过渡 */
.glide-shell-fade-enter-active,
.glide-shell-fade-leave-active {
  transition: opacity 160ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.glide-shell-fade-enter-from,
.glide-shell-fade-leave-to {
  opacity: 0;
}
.glide-side-right.glide-shell-fade-enter-from,
.glide-side-right.glide-shell-fade-leave-to {
  transform: translate3d(-8px, var(--shell-y, 0), 0) scale(0.97) !important;
}
.glide-side-left.glide-shell-fade-enter-from,
.glide-side-left.glide-shell-fade-leave-to {
  transform: translate3d(8px, var(--shell-y, 0), 0) scale(0.97) !important;
}

/* 
  2. 方向感应内容流转 (Directional Content Transition)
  向上移动 (glide-slide-up):
  - 旧内容向下消失: translateY(18px)
  - 新内容自上方引入: from translateY(-18px)
*/
.glide-slide-up-enter-active,
.glide-slide-up-leave-active {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
}
.glide-slide-up-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.glide-slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* 
  向下移动 (glide-slide-down):
  - 旧内容向上消失: translateY(-18px)
  - 新内容自下方引入: from translateY(18px)
*/
.glide-slide-down-enter-active,
.glide-slide-down-leave-active {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
}
.glide-slide-down-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.glide-slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
