<script setup lang="ts">
import {
  computed,
  onUnmounted,
  ref,
  useId,
  watch,
  type HTMLAttributes
} from 'vue';
import { Settings, X } from '@/lib/remix-icons';

export interface CollapsibleButtonItem {
  value: string;
  label: string;
  icon: any;
  description?: string;
  tag?: string;
  disabled?: boolean;
  [key: string]: any;
}
export type GlideCollapsibleButtonItem = CollapsibleButtonItem;

export interface CollapsibleButtonGroupProps {
  items: (string | CollapsibleButtonItem)[];
  modelValue?: string;
  defaultValue?: string;
  /** 展开方向: 'right' | 'left' | 'down' | 'up' */
  expandDirection?: 'right' | 'left' | 'down' | 'up';
  /** 悬停菜单展开方向: 'top' | 'bottom' | 'left' | 'right' */
  menuDirection?: 'top' | 'bottom' | 'left' | 'right';
  /** 单个按钮尺寸 (px)，默认 36px */
  size?: number;
  /** 按钮之间的间距 (px) */
  gap?: number;
  /** 悬停触发菜单延时 (ms) */
  hoverDelay?: number;
  /** 悬停菜单收起缓冲延时 (ms) */
  closeDelay?: number;
  /** 悬停菜单宽度 (px) */
  menuWidth?: number;
  /** 自定义折叠触发器图标 */
  triggerIcon?: any;
  /** 触发器提示文字 */
  triggerLabel?: string;
  /** 展开状态控制 (v-model:open) */
  open?: boolean;
  defaultOpen?: boolean;
  disabled?: boolean;
  class?: HTMLAttributes['class'];
  className?: string;
}
export type GlideCollapsibleButtonGroupProps = CollapsibleButtonGroupProps;

const props = withDefaults(defineProps<CollapsibleButtonGroupProps>(), {
  modelValue: undefined,
  defaultValue: undefined,
  expandDirection: 'right',
  menuDirection: undefined,
  size: 36,
  gap: 4,
  hoverDelay: 160,
  closeDelay: 140,
  menuWidth: 220,
  triggerIcon: undefined,
  triggerLabel: '设置导航',
  open: undefined,
  defaultOpen: false,
  disabled: false,
  class: undefined,
  className: ''
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:open': [open: boolean];
  'select': [value: string, item: GlideCollapsibleButtonItem, index: number];
}>();

const id = useId();
const rootRef = ref<HTMLDivElement | null>(null);
defineExpose({ el: rootRef });

// 归一化 items
const norm = (o: string | GlideCollapsibleButtonItem): GlideCollapsibleButtonItem =>
  typeof o === 'string'
    ? { value: o, label: o, icon: Settings }
    : o;

const list = computed(() => props.items.map(norm));

// 展开状态管理
const isControlled = computed(() => props.open !== undefined);
const internalOpen = ref(props.defaultOpen);
const isExpanded = computed(() => (isControlled.value ? Boolean(props.open) : internalOpen.value));

const toggleExpand = () => {
  if (props.disabled) return;
  const next = !isExpanded.value;
  if (!isControlled.value) {
    internalOpen.value = next;
  }
  emit('update:open', next);
  if (!next) {
    closeMenu();
  }
};

// 当前选中 Tab 值
const activeVal = ref<string>(
  props.modelValue ?? props.defaultValue ?? list.value[0]?.value ?? ''
);

watch(
  () => props.modelValue,
  (val) => {
    if (val !== undefined) activeVal.value = val;
  }
);

const activeIndex = computed(() =>
  list.value.findIndex((it) => it.value === activeVal.value)
);

const activeItem = computed(() =>
  activeIndex.value !== -1 ? list.value[activeIndex.value] : null
);

// 选择 Tab
const selectItem = (item: GlideCollapsibleButtonItem, index: number) => {
  if (item.disabled || props.disabled) return;
  activeVal.value = item.value;
  emit('update:modelValue', item.value);
  emit('select', item.value, item, index);
};

// ─── 悬停菜单核心 (单例外壳复用与平移变形) ──────────────────────────────────
const isHoverMenuOpen = ref(false);
const hoveredIndex = ref<number | null>(null);
const prevHoveredIndex = ref<number | null>(null);

const hoveredItem = computed<GlideCollapsibleButtonItem | null>(() => {
  if (hoveredIndex.value !== null && hoveredIndex.value >= 0 && hoveredIndex.value < list.value.length) {
    return list.value[hoveredIndex.value] ?? null;
  }
  return null;
});

// 计算内容切换流动方向：'forward' vs 'backward'
const direction = ref<'forward' | 'backward'>('forward');
const contentTransition = computed(() =>
  direction.value === 'forward' ? 'glide-menu-forward' : 'glide-menu-backward'
);

// 智能默认菜单展开方向
const resolvedMenuDirection = computed(() => {
  if (props.menuDirection) return props.menuDirection;
  if (props.expandDirection === 'up') return 'top';
  if (props.expandDirection === 'down') return 'bottom';
  return 'bottom';
});

// 计算外壳当前吸附的目标偏移量 (X / Y)
const menuOffset = computed(() => {
  if (hoveredIndex.value === null) return { x: 0, y: 0 };
  const idx = hoveredIndex.value;
  const step = props.size + props.gap;

  // 触发按钮占用了前导 offset (size + gap)
  const triggerOffset = props.size + props.gap;

  if (props.expandDirection === 'right') {
    return { x: triggerOffset + idx * step, y: 0 };
  }
  if (props.expandDirection === 'left') {
    return { x: -(triggerOffset + (idx + 1) * step), y: 0 };
  }
  if (props.expandDirection === 'down') {
    return { x: 0, y: triggerOffset + idx * step };
  }
  if (props.expandDirection === 'up') {
    return { x: 0, y: -(triggerOffset + (idx + 1) * step) };
  }
  return { x: 0, y: 0 };
});

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const clearTimers = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
};

onUnmounted(() => {
  clearTimers();
});

const onButtonPointerEnter = (idx: number) => {
  if (props.disabled) return;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  const oldIdx = hoveredIndex.value;
  if (oldIdx !== null && oldIdx !== idx) {
    direction.value = idx > oldIdx ? 'forward' : 'backward';
  }

  if (isHoverMenuOpen.value) {
    // 关键点：菜单已打开，在按钮之间滑动延时为 0，单例外壳平滑滑动平移
    prevHoveredIndex.value = oldIdx;
    hoveredIndex.value = idx;
  } else {
    // 首次移入：悬停防抖
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      prevHoveredIndex.value = oldIdx;
      hoveredIndex.value = idx;
      isHoverMenuOpen.value = true;
    }, props.hoverDelay);
  }
};

const onButtonPointerLeave = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (isHoverMenuOpen.value && !closeTimer) {
    closeTimer = setTimeout(() => {
      closeMenu();
    }, props.closeDelay);
  }
};

const onMenuPointerEnter = () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
};

const onMenuPointerLeave = () => {
  if (!closeTimer) {
    closeTimer = setTimeout(() => {
      closeMenu();
    }, props.closeDelay);
  }
};

const closeMenu = () => {
  clearTimers();
  isHoverMenuOpen.value = false;
  setTimeout(() => {
    if (!isHoverMenuOpen.value) {
      hoveredIndex.value = null;
      prevHoveredIndex.value = null;
    }
  }, 180);
};

// 方向轴判断
const isHorizontal = computed(
  () => props.expandDirection === 'right' || props.expandDirection === 'left'
);
</script>

<template>
  <div
    ref="rootRef"
    :id="id"
    class="glide-collapsible-button-group relative inline-flex items-center select-none"
    :class="[className, props.class]"
  >
    <!-- 整体包裹药丸容器 (背景、阴影、边框) -->
    <div
      class="glide-button-bar relative flex items-center rounded-full bg-card/90 backdrop-blur-md border border-border/80 shadow-md p-1 transition-all duration-300"
      :class="[
        expandDirection === 'down' ? 'flex-col' : '',
        expandDirection === 'up' ? 'flex-col-reverse' : '',
        expandDirection === 'left' ? 'flex-row-reverse' : '',
        expandDirection === 'right' ? 'flex-row' : ''
      ]"
    >
      <!-- 
        1. 核心圆形 Trigger 按钮
        看起来是一个普通的圆形 icon 按钮；点击后自身图标平滑过渡为 X/折叠图标
      -->
      <button
        type="button"
        :title="isExpanded ? '收起' : triggerLabel"
        :aria-expanded="isExpanded"
        class="glide-trigger-button relative shrink-0 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        :class="[
          isExpanded
            ? 'bg-muted/80 text-foreground hover:bg-muted'
            : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs'
        ]"
        :style="{
          width: `${size}px`,
          height: `${size}px`
        }"
        @click="toggleExpand"
      >
        <div class="relative size-full grid place-items-center">
          <!-- 默认/设置图标：展开时顺时针旋转90度并缩放淡出 -->
          <component
            :is="triggerIcon || (activeItem ? activeItem.icon : Settings)"
            class="size-4.5 absolute transition-all duration-300 ease-out"
            :class="
              isExpanded
                ? 'opacity-0 rotate-90 scale-75'
                : 'opacity-100 rotate-0 scale-100'
            "
          />
          <!-- 折叠/X 图标：展开时从逆时针90度旋转平滑进入 -->
          <X
            class="size-4.5 absolute transition-all duration-300 ease-out"
            :class="
              isExpanded
                ? 'opacity-100 rotate-0 scale-100'
                : 'opacity-0 -rotate-90 scale-75'
            "
          />
        </div>
      </button>

      <!-- 
        2. 展开的 Tabs 选项按钮组
        平滑从 Trigger 一侧伸缩展开
      -->
      <div
        class="glide-tabs-track relative flex items-center transition-all duration-300 overflow-hidden"
        :class="[
          isHorizontal ? 'flex-row' : 'flex-col',
          expandDirection === 'left' ? 'flex-row-reverse' : '',
          expandDirection === 'up' ? 'flex-col-reverse' : ''
        ]"
        :style="{
          maxWidth: isHorizontal ? (isExpanded ? `${list.length * (size + gap) + 8}px` : '0px') : undefined,
          maxHeight: !isHorizontal ? (isExpanded ? `${list.length * (size + gap) + 8}px` : '0px') : undefined,
          opacity: isExpanded ? 1 : 0,
          marginLeft: isExpanded && expandDirection === 'right' ? `${gap}px` : undefined,
          marginRight: isExpanded && expandDirection === 'left' ? `${gap}px` : undefined,
          marginTop: isExpanded && expandDirection === 'down' ? `${gap}px` : undefined,
          marginBottom: isExpanded && expandDirection === 'up' ? `${gap}px` : undefined,
          gap: `${gap}px`
        }"
      >
        <!-- 
          Glide 选中高亮滑块 (Selected Pill)
          跟随选中的 Tab 进行平滑弹性平移
        -->
        <span
          v-if="activeIndex !== -1 && isExpanded"
          class="glide-tab-selected-pill absolute top-0 left-0 rounded-full bg-primary/20 text-primary pointer-events-none z-0"
          :style="{
            width: `${size}px`,
            height: `${size}px`,
            transform: isHorizontal
              ? `translate3d(${activeIndex * (size + gap)}px, 0, 0)`
              : `translate3d(0, ${activeIndex * (size + gap)}px, 0)`,
            transition: 'transform 220ms cubic-bezier(0.23, 1, 0.32, 1)'
          }"
          aria-hidden="true"
        />

        <!-- 各 Tab 图标按钮 -->
        <button
          v-for="(item, idx) in list"
          :key="item.value"
          type="button"
          :title="item.label"
          :disabled="item.disabled || disabled"
          class="glide-tab-button relative z-[1] shrink-0 rounded-full flex items-center justify-center transition-colors focus:outline-none"
          :class="[
            item.value === activeVal
              ? 'text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          ]"
          :style="{
            width: `${size}px`,
            height: `${size}px`
          }"
          @click="selectItem(item, idx)"
          @pointerenter="onButtonPointerEnter(idx)"
          @pointerleave="onButtonPointerLeave"
        >
          <component :is="item.icon" class="size-4 shrink-0" />
        </button>
      </div>
    </div>

    <!-- 
      3. 悬停菜单 (重用单例外壳，随鼠标悬停滑块变形平移，绝不销毁并创建)
      在 menuDirection 指定的方向打开
    -->
    <Transition name="glide-shell-fade">
      <div
        v-if="isHoverMenuOpen && isExpanded && hoveredItem"
        class="glide-collapsible-menu-shell absolute z-50 pointer-events-auto"
        :style="{
          top: resolvedMenuDirection === 'bottom' ? 'calc(100% + 10px)' : undefined,
          bottom: resolvedMenuDirection === 'top' ? 'calc(100% + 10px)' : undefined,
          left: resolvedMenuDirection === 'right' ? 'calc(100% + 10px)' : '0px',
          right: resolvedMenuDirection === 'left' ? 'calc(100% + 10px)' : undefined,
          width: `${menuWidth}px`,
          transform: `translate3d(${menuOffset.x}px, ${menuOffset.y}px, 0)`,
          transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms ease'
        }"
        @pointerenter="onMenuPointerEnter"
        @pointerleave="onMenuPointerLeave"
      >
        <div class="relative overflow-hidden rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-xl text-popover-foreground">
          <!-- 内容基于左右切换流动过渡 -->
          <Transition :name="contentTransition">
            <div
              :key="hoveredItem.value"
              class="glide-menu-content p-3.5 space-y-1.5"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <div class="p-1 rounded-md bg-primary/10 text-primary shrink-0">
                    <component :is="hoveredItem.icon" class="size-3.5" />
                  </div>
                  <span class="text-xs font-semibold text-foreground truncate">
                    {{ hoveredItem.label }}
                  </span>
                </div>
                <span
                  v-if="hoveredItem.tag"
                  class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground shrink-0"
                >
                  {{ hoveredItem.tag }}
                </span>
              </div>

              <p class="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                {{ hoveredItem.description || '点击切换至此项设置。' }}
              </p>

              <div class="pt-1.5 border-t border-border/40 text-[10px] text-primary/80 flex items-center justify-between">
                <span>Tab: {{ hoveredItem.value }}</span>
                <span v-if="hoveredItem.value === activeVal" class="text-emerald-500 font-medium">● 当前已选中</span>
                <span v-else class="text-muted-foreground">点击激活</span>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 悬停菜单外壳淡入淡出 */
.glide-shell-fade-enter-active,
.glide-shell-fade-leave-active {
  transition: opacity 150ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.glide-shell-fade-enter-from,
.glide-shell-fade-leave-to {
  opacity: 0;
  transform: translate3d(var(--menu-x, 0), var(--menu-y, 0), 0) scale(0.96);
}

/* 内部内容切换平移动画 */
.glide-menu-forward-enter-active,
.glide-menu-forward-leave-active,
.glide-menu-backward-enter-active,
.glide-menu-backward-leave-active {
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease;
}

.glide-menu-forward-enter-from {
  opacity: 0;
  transform: translateX(14px);
}
.glide-menu-forward-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}
.glide-menu-forward-leave-active,
.glide-menu-backward-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
}

.glide-menu-backward-enter-from {
  opacity: 0;
  transform: translateX(-14px);
}
.glide-menu-backward-leave-to {
  opacity: 0;
  transform: translateX(14px);
}
</style>
