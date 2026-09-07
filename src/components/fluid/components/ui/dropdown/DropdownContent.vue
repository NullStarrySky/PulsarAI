<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import {
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
} from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { spring, exitFallbackMs } from "../../../lib/springs";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { shapeMap } from "../../../lib/shape-context";
import { useForwardedEl } from "../../../lib/forwarded-el";
import Elevated from "../../../lib/Elevated.vue";
import { provideDropdownContext, useDropdownMenuContext } from "./dropdown-context";

const shape = shapeMap.rounded;

const props = withDefaults(
  defineProps<{
    /** 选中项的索引。驱动动画选中背景与向辅助技术播报的 radio-group 值。 */
    checkedIndex?: number;
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
} = useProximityHover(containerRef);

const focusedIndex = ref<number | null>(null);

// Portal 生命周期：`open` 翻转为 true 就挂载；关闭时保持挂载（forceMount），
// 直到退出动画结束。
const mounted = ref(false);

watch(
  open,
  (o) => {
    if (o) mounted.value = true;
  },
  { immediate: true }
);

// 延迟卸载的后备释放：motion.div 的 onAnimationComplete 是主信号，
// 但 rAF 驱动的动画回调在节流/后台标签页里可能停摆。popup 以 spring.fast
// 退出，后备定时器追踪该档的 exit 时长加安全缓冲。
watch(open, (o) => {
  if (o) return;
  const id = setTimeout(() => (mounted.value = false), exitFallbackMs(spring.fast));
  return () => clearTimeout(id);
});

// popup 挂载后测量项。
watch(
  [open, mounted] as const,
  ([o, m]) => {
    if (!o || !m) return;
    // 双 rAF：第一次等渲染提交，第二次等布局
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

const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] : null
);
const checkedRect = computed(() =>
  props.checkedIndex != null ? itemRects.value[props.checkedIndex] ?? null : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] : null
);

let indexCounter = 0;
function claimIndex() {
  return indexCounter++;
}

provideDropdownContext({
  registerItem,
  claimIndex,
  activeIndex,
  checkedIndex: props.checkedIndex,
  inMenu: true,
});

function handleMouseEnter() {
  handlers.onMouseEnter();
  focusedIndex.value = null;
}

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
          class="z-50 outline-none"
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
              `relative flex flex-col gap-0.5 overflow-y-auto ${shape.container} p-1 select-none outline-none ` +
              `min-w-[var(--reka-dropdown-menu-trigger-width)] max-h-[min(480px,var(--reka-dropdown-menu-content-available-height))] ` +
              (props.class ?? '')
            "
            @mouseenter="handleMouseEnter"
            @mousemove="handlers.onMouseMove"
            @mouseleave="handlers.onMouseLeave"
            @focus="handleFocus"
            @blur="handleBlur"
          >
            <!-- 选中背景 -->
            <AnimatePresence>
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

            <!-- 悬停背景 -->
            <AnimatePresence>
              <motion.div
                v-if="activeRect"
                :key="session"
                :class="`absolute ${shape.bg} bg-hover pointer-events-none`"
                :initial="{
                  opacity: 0,
                  top: checkedRect?.top ?? activeRect.top,
                  left: checkedRect?.left ?? activeRect.left,
                  width: checkedRect?.width ?? activeRect.width,
                  height: checkedRect?.height ?? activeRect.height,
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

            <!-- display: contents 让 items 保持为面板的直接 flex 子元素，
                邻近测量与 gap 布局照常工作，同时 group 提供 radio 值上下文。 -->
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
