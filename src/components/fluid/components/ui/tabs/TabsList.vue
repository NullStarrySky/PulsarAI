<script setup lang="ts">
import { computed, onMounted, ref, useSlots, watch, type VNode } from "vue";
import { TabsList as TabsListPrimitive } from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { useSurface } from "../../../lib/surface-context";
import { surfaceClasses } from "../../../lib/surface-classes";
import { flattenSlotVnodes } from "../../../lib/slot-utils";
import { provideTabsListContext, injectTabsValueOrder } from "./tabs-context";

const props = defineProps<{ class?: string }>();

const slots = useSlots();
const containerRef = ref<HTMLDivElement | null>(null);
const isMouseInside = ref(false);
const shape = useShape();
const sizeClasses = useSize();
const substrate = useSurface();
// 活动块抬升到 substrate 之上 3 层（静音轨道之上 1 层 + 2 层 pop）。
// 页面上（substrate 1）落在 surface 4——与原始设计一致。
// 对话框内（substrate 5）抬到 surface 8 而不是停在 4。
const indicatorLevel = computed(() => Math.min(substrate.value + 3, 8));
const valueOrderCtx = injectTabsValueOrder();
const setValueOrder = valueOrderCtx?.setValueOrder;
const optimisticIdx = ref<number | null>(null);

// 同步从 children 派生 value 顺序
function isTabItemVnode(v: VNode): boolean {
  const type = v.type as { __name?: string; name?: string } | string;
  return (
    typeof type !== "string" &&
    (type.name === "TabItem" || type.__name === "TabItem")
  );
}
const values = ref<string[]>([]);
function scanSlotValues() {
  const vals = flattenSlotVnodes(slots.default?.())
    .filter(isTabItemVnode)
    .map((v) => (v.props as { value?: string } | null)?.value)
    .filter((v): v is string => typeof v === "string");
  values.value = vals;
  setValueOrder?.(vals);
}
watch(() => slots.default, scanSlotValues, { immediate: true });

// ── 索引分配（挂载顺序）──
let nextIndex = 0;
function claimIndex(): number {
  return nextIndex++;
}

// ── 邻近悬停（x 轴）──
const {
  activeIndex: hoveredIndex,
  setActiveIndex: setHoveredIndex,
  itemRects,
  handlers,
  registerItem,
  measureItems,
} = useProximityHover(containerRef, { axis: "x" });

function registerTab(_index: number, _value: string, el: HTMLElement | null) {
  registerItem(_index, el);
}

// children 变化时测量（resize 由 useProximityHover 自己的容器
// ResizeObserver 覆盖）
watch(
  () => slots.default,
  () => measureItems()
);

onMounted(() => {
  measureItems();
  // 挂载后（子项已注册 value）把顺序上报给 Tabs 根
  scanSlotValues();
});

const focusedIndex = ref<number | null>(null);
const selectedValue = valueOrderCtx?.selectedValue;
const selectedIdx = computed(() =>
  selectedValue?.value !== undefined ? values.value.indexOf(selectedValue.value) : -1
);

watch(
  selectedIdx,
  (idx) => {
    optimisticIdx.value = idx >= 0 ? idx : null;
  },
  // React 版的 effect 首次挂载也会执行——首次渲染就要画出选中滑块。
  { immediate: true }
);

const activeSelectedIdx = optimisticIdx;
const selectedRect = computed(() =>
  activeSelectedIdx.value !== null ? itemRects.value[activeSelectedIdx.value] ?? null : null
);
const hoverRect = computed(() =>
  hoveredIndex.value !== null ? itemRects.value[hoveredIndex.value] ?? null : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] ?? null : null
);
const isHoveringSelected = computed(() => hoveredIndex.value === activeSelectedIdx.value);
const isHovering = computed(() => hoveredIndex.value !== null && !isHoveringSelected.value);

provideTabsListContext({
  registerTab,
  claimIndex,
  hoveredIndex,
  selectedValue: selectedValue as never,
  setOptimisticIdx: (index: number) => {
    optimisticIdx.value = index;
  },
});

function setListRef(el: any) {
  containerRef.value = (el?.$el as HTMLDivElement | null) ?? el ?? null;
}

function handleMouseMove(e: MouseEvent) {
  isMouseInside.value = true;
  handlers.onMouseMove(e);
}

function handleMouseLeave() {
  isMouseInside.value = false;
  handlers.onMouseLeave();
}

function handleFocus(e: FocusEvent) {
  const target = e.target as HTMLElement;
  const trigger = target.closest('[role="tab"]');
  if (!trigger) return;
  const indexAttr = trigger.getAttribute("data-proximity-index");
  if (indexAttr != null) {
    const idx = Number(indexAttr);
    setHoveredIndex(idx);
    focusedIndex.value = target.matches(":focus-visible") ? idx : null;
  }
}

function handleBlur(e: FocusEvent) {
  if (containerRef.value?.contains(e.relatedTarget as Node)) return;
  focusedIndex.value = null;
  if (isMouseInside.value) return;
  setHoveredIndex(null);
}
</script>

<template>
  <!-- segmentPad + segmentItem 加起来正好是阶梯的 control 高度
      （36px 默认，28px 紧凑），分段控件的外框与旁边的按钮、select、
      输入框对齐。 -->
  <TabsListPrimitive
    :ref="setListRef"
    :class="
      cn(
        'relative inline-flex select-none items-center gap-0.5 bg-muted',
        sizeClasses.segmentPad,
        shape.container,
        props.class
      )
    "
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @focus="handleFocus"
    @blur="handleBlur"
  >
    <!-- 活动段指示器 -->
    <motion.div
      v-if="selectedRect"
      :class="cn('pointer-events-none absolute', surfaceClasses(indicatorLevel), shape.bg)"
      :initial="false"
      :animate="{
        left: selectedRect.left,
        width: selectedRect.width,
        top: selectedRect.top,
        height: selectedRect.height,
        opacity: isHovering ? 0.85 : 1,
      }"
      :transition="{ ...spring.moderate, opacity: { duration: 0.08 } }"
    />

    <!-- 悬停指示器 -->
    <AnimatePresence>
      <motion.div
        v-if="hoverRect && !isHoveringSelected && selectedRect"
        :class="cn('pointer-events-none absolute bg-hover', shape.bg)"
        :initial="{
          left: selectedRect.left,
          width: selectedRect.width,
          top: selectedRect.top,
          height: selectedRect.height,
          opacity: 0,
        }"
        :animate="{
          left: hoverRect.left,
          width: hoverRect.width,
          top: hoverRect.top,
          height: hoverRect.height,
          opacity: 0.4,
        }"
        :exit="
          !isMouseInside && selectedRect
            ? {
                left: selectedRect.left,
                width: selectedRect.width,
                top: selectedRect.top,
                height: selectedRect.height,
                opacity: 0,
                transition: { ...spring.moderate, opacity: { duration: 0.06 } },
              }
            : { opacity: 0, transition: spring.fast.exit }
        "
        :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
      />
    </AnimatePresence>

    <!-- 焦点环 -->
    <AnimatePresence>
      <motion.div
        v-if="focusRect"
        :class="
          cn(
            'pointer-events-none absolute z-20 border border-[color:var(--focus-ring,#6B97FF)]',
            shape.focusRing
          )
        "
        :initial="false"
        :animate="{
          left: focusRect.left - 2,
          top: focusRect.top - 2,
          width: focusRect.width + 4,
          height: focusRect.height + 4,
        }"
        :exit="{ opacity: 0, transition: spring.fast.exit }"
        :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
      />
    </AnimatePresence>

    <slot />
  </TabsListPrimitive>
</template>
