<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useFluidHover } from "../../../hooks/use-fluid-hover";
import { useSelectionRuns, useMergeSplitBlocks } from "../../../hooks/use-merge-split";
import SelectionBackgrounds from "../../../hooks/SelectionBackgrounds.vue";
import { shapeMap } from "../../../lib/shape-context";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { useForwardedEl } from "../../../lib/forwarded-el";
import Elevated from "../../../lib/Elevated.vue";
import { isDisabledRow } from "../../../lib/popup";
import FluidHoverHighlight from "../fluid-hover/FluidHoverHighlight.vue";
import { provideDropdownContext } from "./dropdown-context";

// Dropdown 选择退出全局 pill/rounded 形状上下文——无论 UI 其他部分是什么
// 形状，弹出层表面用更小的 "rounded" 圆角都更干净。
const shape = shapeMap.rounded;

const props = withDefaults(
  defineProps<{
    /** 单选选中项的索引。驱动动画选中背景。 */
    checkedIndex?: number;
    /** 多选模式选中项索引数组。多个连续项自动合并背景。 */
    checkedIndices?: number[];
    /** 把面板的行钉在尺寸阶梯的某一档（默认 36px，紧凑 28px——见 /docs/sizes）。
     *  省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    class?: string;
  }>(),
  {}
);

const elevatedRef = ref<InstanceType<typeof Elevated> | null>(null);
const containerRef = useForwardedEl(elevatedRef);

const {
  activeIndex,
  setActiveIndex,
  itemRects,
  session,
  handlers,
  registerItem,
  measureItems,
} = useFluidHover(containerRef, { isItemDisabled: isDisabledRow });

const focusedIndex = ref<number | null>(null);

const multiple = computed(() => props.checkedIndices != null);
const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] ?? null : null
);
const checkedRect = computed(() =>
  !multiple.value && props.checkedIndex != null
    ? itemRects.value[props.checkedIndex] ?? null
    : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] ?? null : null
);

// 多选合并块
const runs = useSelectionRuns(() => props.checkedIndices ?? []);
const blocks = useMergeSplitBlocks(runs, itemRects, shape.bgRadius);

provideDropdownContext({
  registerItem,
  activeIndex,
  checkedIndex: props.checkedIndex,
  multiple: multiple.value,
  checkedIndices: props.checkedIndices,
});

provideSize({ size: () => props.size });

onMounted(() => measureItems());

function handleFocus(e: FocusEvent) {
  const target = e.target as HTMLElement;
  const indexAttr = target
    .closest("[data-proximity-index], [data-fluid-hover-index]")
    ?.getAttribute("data-proximity-index") ?? target.closest("[data-fluid-hover-index]")?.getAttribute("data-fluid-hover-index");
  if (indexAttr != null) {
    const idx = Number(indexAttr);
    setActiveIndex(idx);
    focusedIndex.value = target.matches(":focus-visible") ? idx : null;
  }
}

function handleBlur(e: FocusEvent) {
  if (containerRef.value?.contains(e.relatedTarget as Node)) return;
  focusedIndex.value = null;
  setActiveIndex(null);
}

function handleKeydown(e: KeyboardEvent) {
  const items = Array.from(
    containerRef.value?.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]') ?? []
  ) as HTMLElement[];
  const currentIdx = items.indexOf(e.target as HTMLElement);
  if (currentIdx === -1) return;

  if (["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) {
    e.preventDefault();
    const next = ["ArrowDown", "ArrowRight"].includes(e.key)
      ? (currentIdx + 1) % items.length
      : (currentIdx - 1 + items.length) % items.length;
    items[next]?.focus();
  } else if (e.key === "Home") {
    e.preventDefault();
    items[0]?.focus();
  } else if (e.key === "End") {
    e.preventDefault();
    items[items.length - 1]?.focus();
  }
}

const panelClass = computed(() =>
  cn(
    `relative flex flex-col gap-0.5 w-72 max-w-full ${shape.container} p-1 select-none`,
    props.class
  )
);
</script>

<template>
  <Elevated
    ref="elevatedRef"
    :offset="2"
    :shadow-level="3"
    role="group"
    :class="panelClass"
    @mouseenter="handlers.onMouseEnter"
    @mousemove="handlers.onMouseMove"
    @mouseleave="handlers.onMouseLeave"
    @focus="handleFocus"
    @blur="handleBlur"
    @keydown="handleKeydown"
  >
    <!-- 多选合并背景 -->
    <SelectionBackgrounds v-if="multiple" :blocks="blocks" />

    <!-- 单选选中背景 -->
    <AnimatePresence v-else>
      <motion.div
        v-if="checkedRect"
        :class="`absolute ${shape.bg} bg-active pointer-events-none`"
        :initial="false"
        :animate="{
          top: checkedRect.top,
          left: checkedRect.left,
          width: checkedRect.width,
          height: checkedRect.height,
          opacity: 1,
        }"
        :exit="{ opacity: 0, transition: spring.moderate.exit }"
        :transition="{ ...spring.moderate, opacity: { duration: 0.08 } }"
      />
    </AnimatePresence>

    <!-- 悬停背景 (FluidHoverHighlight) -->
    <FluidHoverHighlight
      :rect="activeRect"
      :session="session"
      :from="checkedRect"
      :class="shape.bg"
    />

    <!-- 焦点环 -->
    <AnimatePresence>
      <motion.div
        v-if="focusRect"
        :class="`absolute ${shape.focusRing} pointer-events-none z-20 border border-[color:var(--focus-ring,#6B97FF)]`"
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
  </Elevated>
</template>
