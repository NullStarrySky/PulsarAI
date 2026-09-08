<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import {
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
} from "reka-ui";
import { motion, AnimatePresence } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring, exitFallbackMs } from "../../../lib/springs";
import { useFluidHover } from "../../../hooks/use-fluid-hover";
import { useSelectionRuns, useMergeSplitBlocks } from "../../../hooks/use-merge-split";
import SelectionBackgrounds from "../../../hooks/SelectionBackgrounds.vue";
import { shapeMap } from "../../../lib/shape-context";
import { useForwardedEl } from "../../../lib/forwarded-el";
import Elevated from "../../../lib/Elevated.vue";
import { isDisabledRow, popupMotionClass } from "../../../lib/popup";
import FluidHoverHighlight from "../fluid-hover/FluidHoverHighlight.vue";
import {
  provideDropdownContext,
  provideDropdownSearchHost,
  useDropdownMenuContext,
  type SearchHandle,
} from "./dropdown-context";

const shape = shapeMap.rounded;

const props = withDefaults(
  defineProps<{
    /** 选中项的索引。驱动动画选中背景与向辅助技术播报的 radio-group 值。 */
    checkedIndex?: number;
    /** 多选模式选中项索引数组。 */
    checkedIndices?: number[];
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    sideOffset?: number;
    class?: string;
  }>(),
  { side: "bottom", align: "start", sideOffset: 6 }
);

const { open } = useDropdownMenuContext();
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

// Portal 生命周期
const mounted = ref(false);

watch(
  open,
  (o) => {
    if (o) mounted.value = true;
  },
  { immediate: true }
);

watch(open, (o) => {
  if (o) return;
  const id = setTimeout(() => (mounted.value = false), exitFallbackMs(spring.fast));
  return () => clearTimeout(id);
});

// popup 挂载后测量项
watch(
  [open, mounted] as const,
  ([o, m]) => {
    if (!o || !m) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        measureItems();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  },
  { immediate: true }
);

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

let indexCounter = 0;
function claimIndex() {
  return indexCounter++;
}

provideDropdownContext({
  registerItem,
  claimIndex,
  activeIndex,
  checkedIndex: props.checkedIndex,
  multiple: multiple.value,
  checkedIndices: props.checkedIndices,
  inMenu: true,
});

// ── DropdownSearch host ──
const searchHandleRef = ref<SearchHandle | null>(null);
function highlightFirst() {
  const container = containerRef.value;
  if (!container) return;
  const first = container.querySelector(
    '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])'
  );
  if (first) {
    const idx = first.getAttribute("data-proximity-index") ?? first.getAttribute("data-fluid-hover-index");
    if (idx != null) setActiveIndex(Number(idx));
  }
}

provideDropdownSearchHost({
  register: (handle) => {
    searchHandleRef.value = handle;
    return () => {
      searchHandleRef.value = null;
    };
  },
  open,
  highlightFirst,
});

function handleMouseEnter() {
  handlers.onMouseEnter();
  focusedIndex.value = null;
}

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

function handleAnimationComplete() {
  if (!open.value) mounted.value = false;
}

onUnmounted(() => {
  mounted.value = false;
});
</script>

<template>
  <template v-if="mounted">
    <DropdownMenuPortal force-mount>
      <DropdownMenuContent
        as-child
        force-mount
        :side="side"
        :align="align"
        :side-offset="sideOffset"
      >
        <motion.div
          :class="cn('z-50 outline-none', popupMotionClass)"
          :initial="{ opacity: 0, y: side === 'top' ? 4 : -4, scaleY: 0.96 }"
          :animate="
            open
              ? { opacity: 1, y: 0, scaleY: 1 }
              : { opacity: 0, y: side === 'top' ? 4 : -4, scaleY: 0.96 }
          "
          :transition="open ? spring.fast : spring.fast.exit"
          :style="{
            transformOrigin: side === 'top' ? 'bottom center' : 'top center',
          }"
          :on-animation-complete="handleAnimationComplete"
        >
          <Elevated
            ref="elevatedRef"
            :offset="2"
            :shadow-level="3"
            :class="
              cn(
                'relative flex flex-col gap-0.5 overflow-y-auto p-1 select-none outline-none',
                shape.container,
                'min-w-[var(--reka-dropdown-menu-trigger-width,10rem)] max-h-[min(480px,var(--reka-dropdown-menu-content-available-height,480px))]',
                props.class
              )
            "
            @mouseenter="handleMouseEnter"
            @mousemove="handlers.onMouseMove"
            @mouseleave="handlers.onMouseLeave"
            @focus="handleFocus"
            @blur="handleBlur"
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

            <!-- display: contents 让 items 保持为面板的直接 flex 子元素 -->
            <DropdownMenuRadioGroup
              :model-value="checkedIndex != null ? String(checkedIndex) : undefined"
              class="contents"
            >
              <slot />
            </DropdownMenuRadioGroup>
          </Elevated>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </template>
</template>
