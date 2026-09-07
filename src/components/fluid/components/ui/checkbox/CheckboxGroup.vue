<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { useMergeSplitBlocks, type Run } from "../../../hooks/use-merge-split";
import SelectionBackgrounds from "../../../hooks/SelectionBackgrounds.vue";
import { useShape } from "../../../lib/shape-context";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { provideCheckboxGroupContext } from "./checkbox-group-context";

const props = withDefaults(
  defineProps<{
    /** 当前勾选的行索引集合。 */
    checkedIndices: Set<number>;
    /** 把组的行钉在尺寸阶梯的某一档（默认 36px，紧凑 28px——见 /docs/sizes）。
     *  省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    class?: string;
  }>(),
  {}
);

const containerRef = useTemplateRef<HTMLDivElement>("containerRef");

const {
  activeIndex,
  setActiveIndex,
  itemRects,
  session,
  handlers,
  registerItem,
  measureItems,
} = useProximityHover(containerRef);

// ── 把连续的勾选索引归并为带稳定 ID 的 run ────────────────
// 稳定 ID 让 motion 跨渲染 morph 选中块而不是退出+重进；
// 分组逻辑与 React 版一致：在求值时同步 prev 映射。
let groupIdCounter = 0;
const prevGroupMap = new Map<number, number>();

const checkedGroups = computed<Run[]>(() => {
  const runs: { start: number; end: number }[] = [];
  const sortedChecked = [...props.checkedIndices].sort((a, b) => a - b);
  for (const idx of sortedChecked) {
    const last = runs[runs.length - 1];
    if (last && idx === last.end + 1) {
      last.end = idx;
    } else {
      runs.push({ start: idx, end: idx });
    }
  }

  // 分配稳定 ID：任一成员与上一帧重叠就复用原 ID。
  const usedIds = new Set<number>();
  const newGroupMap = new Map<number, number>();
  const withIds = runs.map((run) => {
    let stableId: number | null = null;
    for (let i = run.start; i <= run.end; i++) {
      const prevId = prevGroupMap.get(i);
      if (prevId !== undefined && !usedIds.has(prevId)) {
        stableId = prevId;
        break;
      }
    }
    const id = stableId ?? ++groupIdCounter;
    usedIds.add(id);
    for (let i = run.start; i <= run.end; i++) {
      newGroupMap.set(i, id);
    }
    return { ...run, id };
  });
  prevGroupMap.clear();
  for (const [k, v] of newGroupMap) prevGroupMap.set(k, v);
  return withIds;
});

const focusedIndex = ref<number | null>(null);

const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] ?? null : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] ?? null : null
);
const shape = useShape();

// 选中背景块：连续勾选项合并成一块；一个未勾选行桥接/切开两段时
// 播放 merge/split 边界动画——见 useMergeSplitBlocks。
const blocks = useMergeSplitBlocks(checkedGroups, itemRects, shape.value.mergedRadius);

let indexCounter = 0;
function claimIndex() {
  return indexCounter++;
}

provideCheckboxGroupContext({ registerItem, claimIndex, activeIndex });

provideSize({ size: () => props.size });

// 挂载即同步测量一轮（对齐 React 版的 useEffect measureItems）。
onMounted(() => measureItems());

function handleFocus(e: FocusEvent) {
  const target = e.target as HTMLElement;
  const indexAttr = target
    .closest("[data-proximity-index]")
    ?.getAttribute("data-proximity-index");
  if (indexAttr != null) {
    const idx = Number(indexAttr);
    setActiveIndex(idx);
    focusedIndex.value = target.matches(":focus-visible") ? idx : null;
  }
}

function handleBlur(e: FocusEvent) {
  // 焦点移到组内其他项时不清除悬停
  if (containerRef.value?.contains(e.relatedTarget as Node)) return;
  focusedIndex.value = null;
  setActiveIndex(null);
}

function handleKeydown(e: KeyboardEvent) {
  // 只作用于行包裹层。内部 checkbox 原语也带 role="checkbox"，
  // 裸的 [role="checkbox"] 选择器每行会匹配两次，方向键会跳到隐藏控件上。
  const items = Array.from(
    containerRef.value?.querySelectorAll("[data-proximity-index]") ?? []
  ) as HTMLElement[];
  const currentIdx = items.indexOf(e.target as HTMLElement);
  if (currentIdx === -1) return;

  if (["ArrowDown", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
    const next =
      e.key === "ArrowDown"
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

const groupClass = computed(() =>
  cn("relative flex flex-col w-72 max-w-full select-none", props.class)
);
</script>

<template>
  <div
    ref="containerRef"
    role="group"
    :class="groupClass"
    @mouseenter="handlers.onMouseEnter"
    @mousemove="handlers.onMouseMove"
    @mouseleave="handlers.onMouseLeave"
    @focus="handleFocus"
    @blur="handleBlur"
    @keydown="handleKeydown"
  >
    <!-- 选中背景（连续勾选项合并）：正常一段 run 一块；merge/split 进行中
        则画成两个相邻半块——见 useMergeSplitBlocks。 -->
    <SelectionBackgrounds :blocks="blocks" />

    <!-- 悬停背景 -->
    <AnimatePresence>
      <motion.div
        v-if="activeRect"
        :key="session"
        :class="`absolute ${shape.bg} bg-hover pointer-events-none`"
        :initial="{
          opacity: 0,
          top: activeRect.top,
          left: activeRect.left,
          width: activeRect.width,
          height: activeRect.height,
        }"
        :animate="{
          opacity: 1,
          top: activeRect.top,
          left: activeRect.left,
          width: activeRect.width,
          height: activeRect.height,
        }"
        :exit="{ opacity: 0, transition: spring.fast.exit }"
        :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
      />
    </AnimatePresence>

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
  </div>
</template>
