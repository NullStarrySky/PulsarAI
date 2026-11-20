<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue';
import { GLIDE_SIZES, type GlideOption, type GlideOrientation, type GlideSize } from '../types';

export interface ListProps {
  options?: (string | GlideOption)[];
  items?: (string | GlideOption)[];
  modelValue?: string | number | (string | number)[] | null;
  /** 当没有 modelValue 时，可通过 selectedIndex 强制指定单选选中项 */
  selectedIndex?: number;
  /** 模式: 'both' 同时支持选中滑块与悬停滑块; 'hover-only' 仅悬停滑块; 'selected-only' 仅选中滑块 */
  highlightMode?: 'both' | 'hover-only' | 'selected-only' | 'none';
  orientation?: GlideOrientation;
  size?: GlideSize;
  /** 控件类型：'control' (默认36px) 或 'tab' (分段tab为28px) */
  itemType?: 'control' | 'tab';
  /** 自定义行高（垂直）或列宽（水平），若不传则从 size 和 itemType 自动对齐 Fluid 规范 */
  itemSize?: number;
  gap?: number;
  padding?: number;
  radius?: number;
  glideDuration?: number;
  rememberPosition?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  activeClass?: string;
  hoverClass?: string;
  /** 是否在横向模式下使用百分比等分（100% / N） */
  equalWidth?: boolean;
}

export type GlideListProps = ListProps;

const props = withDefaults(defineProps<ListProps>(), {
  options: () => [],
  items: undefined,
  modelValue: undefined,
  selectedIndex: undefined,
  highlightMode: 'both',
  orientation: 'vertical',
  size: 'md',
  itemType: 'control',
  itemSize: undefined,
  gap: 2,
  padding: 4,
  radius: 8,
  glideDuration: 200,
  rememberPosition: false,
  disabled: false,
  ariaLabel: 'List',
  className: '',
  activeClass: '',
  hoverClass: '',
  equalWidth: true
});

const emit = defineEmits<{
  'update:modelValue': [value: string | (string | number)[]];
  'select': [value: string, option: GlideOption, index: number];
  'hover': [index: number | null, option: GlideOption | null];
}>();

const id = useId();
const listRef = ref<HTMLDivElement | null>(null);
const selectedPillRef = ref<HTMLSpanElement | null>(null);
const hoverPillRef = ref<HTMLSpanElement | null>(null);

const norm = (o: string | GlideOption): GlideOption => (typeof o === 'string' ? { value: o, label: o } : o);
const items = computed(() => {
  const raw = props.items ?? props.options ?? [];
  return raw.map(norm);
});

const resolvedSizeConfig = computed(() => GLIDE_SIZES[props.size] ?? GLIDE_SIZES.md);
// 严格对齐 Fluid: Tab 项为 segmentItem (28px), 列表行/控件项为 row (36px)
const resolvedItemSize = computed(() => {
  if (props.itemSize !== undefined) return props.itemSize;
  return props.itemType === 'tab' ? resolvedSizeConfig.value.segmentItem : resolvedSizeConfig.value.row;
});
const step = computed(() => resolvedItemSize.value + props.gap);

const isHorizontal = computed(() => props.orientation === 'horizontal');
const isMultiSelect = computed(() => Array.isArray(props.modelValue));

// 多选场景下的选中索引集合 (已排序)
const selectedIndices = computed<number[]>(() => {
  if (Array.isArray(props.modelValue)) {
    const valSet = new Set(props.modelValue.map(String));
    const indices: number[] = [];
    items.value.forEach((it, idx) => {
      if (valSet.has(it.value)) indices.push(idx);
    });
    return indices;
  }
  return [];
});

const selectedIndicesSet = computed(() => new Set(selectedIndices.value));

// 单选场景下的选中索引
const computedSelectedIndex = computed(() => {
  if (props.selectedIndex !== undefined && props.selectedIndex >= 0) {
    return props.selectedIndex;
  }
  if (props.modelValue !== undefined && props.modelValue !== null && !Array.isArray(props.modelValue)) {
    const val = String(props.modelValue);
    return items.value.findIndex(it => it.value === val);
  }
  return -1;
});

// ── 多选连续连片渲染：基于常驻切片机制 (Permanent Slices) ───────────────────
// 每项拥有静态专属的背景切片节点（永久 key，绝不销毁/重挂），彻底消灭中间项断开时的重绘闪烁！
const getMultiSliceStyle = (i: number) => {
  const isChecked = selectedIndicesSet.value.has(i);
  const prevChecked = selectedIndicesSet.value.has(i - 1);
  const nextChecked = selectedIndicesSet.value.has(i + 1);

  const top = props.padding + i * step.value;
  // 若相邻下一项也被选中，则高度延展 gap 像素，无缝衔接消除接缝
  const height = nextChecked ? resolvedItemSize.value + props.gap : resolvedItemSize.value;

  const tl = prevChecked ? 0 : props.radius;
  const tr = prevChecked ? 0 : props.radius;
  const br = nextChecked ? 0 : props.radius;
  const bl = nextChecked ? 0 : props.radius;

  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `${props.padding}px`,
    right: `${props.padding}px`,
    borderTopLeftRadius: `${tl}px`,
    borderTopRightRadius: `${tr}px`,
    borderBottomRightRadius: `${br}px`,
    borderBottomLeftRadius: `${bl}px`,
    borderTopWidth: prevChecked ? '0px' : '1px',
    borderBottomWidth: nextChecked ? '0px' : '1px',
    borderLeftWidth: '1px',
    borderRightWidth: '1px',
    borderStyle: 'solid',
    opacity: isChecked ? 1 : 0,
    transition: `opacity 150ms ease, border-radius ${props.glideDuration}ms cubic-bezier(0.23, 1, 0.32, 1), height ${props.glideDuration}ms cubic-bezier(0.23, 1, 0.32, 1), border-top-width 150ms ease, border-bottom-width 150ms ease`
  };
};

// ── 悬停与单选滑块位移 ───────────────────────────────────────────────────
const hoverIndex = ref<number | null>(null);
let scrub: { id: number; start: number } | null = null;

const getTransformForIndex = (idx: number) => {
  if (isHorizontal.value) {
    if (props.equalWidth) {
      return `translateX(calc(${idx} * (100% + ${props.gap}px)))`;
    }
    return `translateX(${idx * step.value}px)`;
  }
  return `translateY(${idx * step.value}px)`;
};

// 单选高亮滑块
watch(
  [computedSelectedIndex, step, isHorizontal, () => props.highlightMode],
  ([idx]) => {
    if (props.highlightMode === 'hover-only' || isMultiSelect.value) return;
    const p = selectedPillRef.value;
    if (!p) return;
    if (idx < 0 || idx >= items.value.length) {
      p.style.opacity = '0';
      return;
    }
    p.style.transform = getTransformForIndex(idx);
    p.style.opacity = '1';
  },
  { flush: 'post', immediate: true }
);

// 悬停高亮滑块
let hoverInitialized = false;

watch(
  [hoverIndex, step, isHorizontal, () => props.highlightMode],
  ([idx]) => {
    if (props.highlightMode === 'selected-only') return;
    const p = hoverPillRef.value;
    if (!p) return;

    if (idx === null || idx < 0 || idx >= items.value.length) {
      p.style.opacity = '0';
      return;
    }

    if (!hoverInitialized) {
      hoverInitialized = true;
      const originIdx = computedSelectedIndex.value >= 0 ? computedSelectedIndex.value : idx;
      p.style.transition = 'none';
      p.style.transform = getTransformForIndex(originIdx);
      p.style.opacity = '0';
      void p.offsetHeight;
      p.style.transition = `transform ${props.glideDuration}ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease`;
    }

    p.style.transform = getTransformForIndex(idx);
    p.style.opacity = '1';
  },
  { flush: 'post', immediate: true }
);

const select = (index: number) => {
  const item = items.value[index];
  if (!item || item.disabled || props.disabled) return;

  if (isMultiSelect.value) {
    const curArr = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
    const valSet = new Set(curArr.map(String));
    if (valSet.has(item.value)) {
      valSet.delete(item.value);
    } else {
      valSet.add(item.value);
    }
    const nextArr = Array.from(valSet);
    emit('update:modelValue', nextArr);
    emit('select', item.value, item, index);
  } else {
    emit('update:modelValue', item.value);
    emit('select', item.value, item, index);
  }
};

const indexAtPosition = (pos: number) => {
  const s = scrub;
  if (!s) return null;
  const offset = pos - s.start - props.padding;
  let i: number;
  if (isHorizontal.value && props.equalWidth && listRef.value) {
    const listWidth = listRef.value.clientWidth - props.padding * 2;
    const itemW = listWidth / items.value.length;
    i = Math.floor(offset / itemW);
  } else {
    i = Math.floor(offset / step.value);
  }
  return i >= 0 && i < items.value.length ? i : null;
};

const onPointerDown = (e: PointerEvent) => {
  if (e.button !== 0 || props.disabled) return;
  const el = listRef.value;
  if (!el) return;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // ignore
  }
  const rect = el.getBoundingClientRect();
  scrub = {
    id: e.pointerId,
    start: isHorizontal.value ? rect.left : rect.top
  };
  const idx = indexAtPosition(isHorizontal.value ? e.clientX : e.clientY);
  hoverIndex.value = idx;
  emit('hover', idx, idx !== null ? items.value[idx] ?? null : null);
};

const onPointerMove = (e: PointerEvent) => {
  if (!scrub || scrub.id !== e.pointerId) return;
  const idx = indexAtPosition(isHorizontal.value ? e.clientX : e.clientY);
  if (idx !== hoverIndex.value) {
    hoverIndex.value = idx;
    emit('hover', idx, idx !== null ? items.value[idx] ?? null : null);
  }
};

const onPointerUp = (e: PointerEvent) => {
  if (!scrub || scrub.id !== e.pointerId) return;
  const idx = indexAtPosition(isHorizontal.value ? e.clientX : e.clientY);
  scrub = null;
  if (idx !== null) {
    select(idx);
  }
  if (!props.rememberPosition) {
    hoverIndex.value = null;
    emit('hover', null, null);
  }
};

const onPointerOver = (e: PointerEvent) => {
  if (e.pointerType === 'touch' || scrub) return;
  const row = (e.target as HTMLElement).closest<HTMLElement>('[data-glide-index]');
  if (!row) return;
  const idx = Number(row.dataset.glideIndex);
  if (!Number.isNaN(idx) && idx !== hoverIndex.value) {
    hoverIndex.value = idx;
    emit('hover', idx, items.value[idx] ?? null);
  }
};

const onPointerLeave = () => {
  if (!scrub && !props.rememberPosition) {
    hoverIndex.value = null;
    emit('hover', null, null);
  }
};

const onKeyDown = (e: KeyboardEvent) => {
  if (props.disabled) return;
  const n = items.value.length;
  if (n === 0) return;
  const cur = hoverIndex.value ?? Math.max(0, computedSelectedIndex.value);

  const prevKey = isHorizontal.value ? 'ArrowLeft' : 'ArrowUp';
  const nextKey = isHorizontal.value ? 'ArrowRight' : 'ArrowDown';

  if (e.key === nextKey || e.key === prevKey) {
    e.preventDefault();
    const nextIdx = e.key === nextKey ? (cur + 1) % n : (cur - 1 + n) % n;
    hoverIndex.value = nextIdx;
    emit('hover', nextIdx, items.value[nextIdx] ?? null);
  } else if (e.key === 'Home') {
    e.preventDefault();
    hoverIndex.value = 0;
    emit('hover', 0, items.value[0] ?? null);
  } else if (e.key === 'End') {
    e.preventDefault();
    hoverIndex.value = n - 1;
    emit('hover', n - 1, items.value[n - 1] ?? null);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (hoverIndex.value !== null) {
      select(hoverIndex.value);
    }
  }
};

onMounted(() => {
  if (selectedPillRef.value && computedSelectedIndex.value >= 0) {
    selectedPillRef.value.style.transform = getTransformForIndex(computedSelectedIndex.value);
    selectedPillRef.value.style.opacity = '1';
  }
});

defineExpose({
  select,
  setHoverIndex: (i: number | null) => {
    hoverIndex.value = i;
  },
  items
});
</script>

<template>
  <div
    ref="listRef"
    role="listbox"
    :aria-label="ariaLabel"
    :tabindex="disabled ? -1 : 0"
    class="relative select-none outline-none touch-none"
    :class="[
      isHorizontal ? 'flex items-center' : 'grid',
      className
    ]"
    :style="{
      padding: `${padding}px`,
      gap: `${gap}px`
    }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @lostpointercapture="onPointerUp"
    @pointerover="onPointerOver"
    @pointerleave="onPointerLeave"
    @keydown="onKeyDown"
  >
    <!-- 多选连续高亮背景块 (常驻节点切片设计：绝对零闪烁、平滑合成分裂) -->
    <template v-if="isMultiSelect && highlightMode !== 'hover-only'">
      <span
        v-for="(_, i) in items"
        :key="`multi-slice-${i}`"
        class="absolute pointer-events-none z-0"
        :class="activeClass || 'bg-primary/10 text-primary dark:bg-primary/20 border-primary/25'"
        :style="getMultiSliceStyle(i)"
        aria-hidden="true"
      />
    </template>

    <!-- 单选选中态背景滑块 (Selected Pill) -->
    <span
      v-if="!isMultiSelect && highlightMode !== 'hover-only'"
      ref="selectedPillRef"
      class="absolute pointer-events-none opacity-0 z-0"
      :class="[
        activeClass || 'bg-primary/15 text-primary dark:bg-primary/20',
        'motion-reduce:transition-none'
      ]"
      :style="{
        top: `${padding}px`,
        bottom: isHorizontal ? `${padding}px` : undefined,
        left: `${padding}px`,
        right: isHorizontal ? undefined : `${padding}px`,
        height: isHorizontal ? undefined : `${resolvedItemSize}px`,
        width: isHorizontal ? (equalWidth ? `calc((100% - ${padding * 2}px - ${(items.length - 1) * gap}px) / ${items.length})` : `${resolvedItemSize}px`) : undefined,
        borderRadius: `${radius}px`,
        transition: `transform ${glideDuration}ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease`
      }"
      aria-hidden="true"
    />

    <!-- 悬停态背景滑块 (Hover Pill) -->
    <span
      v-if="highlightMode !== 'selected-only'"
      ref="hoverPillRef"
      class="absolute pointer-events-none opacity-0 z-0"
      :class="[
        hoverClass || 'bg-accent/80 text-accent-foreground dark:bg-muted/70 shadow-xs border border-border/40',
        'motion-reduce:transition-none'
      ]"
      :style="{
        top: `${padding}px`,
        bottom: isHorizontal ? `${padding}px` : undefined,
        left: `${padding}px`,
        right: isHorizontal ? undefined : `${padding}px`,
        height: isHorizontal ? undefined : `${resolvedItemSize}px`,
        width: isHorizontal ? (equalWidth ? `calc((100% - ${padding * 2}px - ${(items.length - 1) * gap}px) / ${items.length})` : `${resolvedItemSize}px`) : undefined,
        borderRadius: `${radius}px`,
        transition: `transform ${glideDuration}ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease`
      }"
      aria-hidden="true"
    />

    <!-- 选项节点渲染 -->
    <template v-for="(it, i) in items" :key="it.value || i">
      <div
        :id="`${id}-${i}`"
        role="option"
        :data-glide-index="i"
        :aria-selected="isMultiSelect ? selectedIndices.includes(i) : i === computedSelectedIndex"
        :aria-disabled="it.disabled || disabled"
        class="relative z-[1] flex items-center cursor-pointer transition-colors duration-100"
        :class="[
          isHorizontal ? (equalWidth ? 'flex-1 justify-center' : 'shrink-0') : 'w-full',
          it.disabled || disabled ? 'opacity-40 pointer-events-none cursor-not-allowed' : ''
        ]"
        :style="{
          height: `${resolvedItemSize}px`,
          fontSize: `${resolvedSizeConfig.font}px`,
          borderRadius: `${radius}px`
        }"
        @click="select(i)"
      >
        <slot
          :item="it"
          :index="i"
          :is-selected="isMultiSelect ? selectedIndices.includes(i) : i === computedSelectedIndex"
          :is-hovered="i === hoverIndex"
          :select="() => select(i)"
        >
          <div class="flex items-center gap-2 px-2.5 w-full">
            <component :is="it.icon" v-if="it.icon" class="size-4 shrink-0 text-muted-foreground" />
            <span class="flex-1 truncate font-medium">{{ it.label }}</span>
            <span v-if="it.tag" class="shrink-0 text-[11px] opacity-60">{{ it.tag }}</span>
          </div>
        </slot>
      </div>
    </template>
  </div>
</template>
