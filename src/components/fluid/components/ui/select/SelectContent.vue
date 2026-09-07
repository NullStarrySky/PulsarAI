<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import {
  SelectPortal,
  SelectContent,
  SelectViewport,
} from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { spring, exitFallbackMs } from "../../../lib/springs";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { useShape } from "../../../lib/shape-context";
import { useForwardedEl } from "../../../lib/forwarded-el";
import Elevated from "../../../lib/Elevated.vue";
import { provideSelectContentContext, useSelectContext } from "./select-context";

const props = defineProps<{ class?: string }>();

const { open, value, unmount } = useSelectContext();
const shape = useShape();
const elevatedRef = ref<InstanceType<typeof Elevated> | null>(null);
const containerRef = useForwardedEl(elevatedRef);

const {
  activeIndex,
  setActiveIndex,
  itemRects,
  isMeasured,
  session,
  handlers,
  registerItem,
  measureItems,
} = useProximityHover(containerRef);

const focusedIndex = ref<number | null>(null);
const checkedIndex = ref<number | undefined>(undefined);

// 退出动画播放完后释放 reka 的 open 状态。motion.div 的 onAnimationComplete
// 是主信号；超时是后台标签页 rAF 停摆时的后备。popup 以 spring.fast 退出，
// 所以后备追踪该档的 exit 时长加安全缓冲。
watch(open, (o) => {
  if (o) return;
  const id = setTimeout(() => unmount(), exitFallbackMs(spring.fast));
  return () => clearTimeout(id);
});

// 每次打开或选中值改变时，测量项 rect 并同步 checkedIndex
watch(
  [open, value] as const,
  ([o, v]) => {
    if (!o) return;
    // 双 rAF：第一次等渲染提交，第二次等布局
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        measureItems();
        const container = containerRef.value;
        if (container) {
          const items = Array.from(
            container.querySelectorAll("[data-proximity-index]")
          ) as HTMLElement[];
          const el = items.find((item) => item.getAttribute("data-value") === v);
          if (el) {
            const pIndex = Number(el.getAttribute("data-proximity-index"));
            checkedIndex.value = !isNaN(pIndex) ? pIndex : undefined;
          } else {
            const idx = items.findIndex((item) => item.getAttribute("data-value") === v);
            checkedIndex.value = idx !== -1 ? idx : undefined;
          }
        }
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  },
  { immediate: true }
);

// 关闭开始时重置所有 overlay 索引。checkedIndex 否则落后 value 一次打开
// （选择一项会在上面的 effect 重新同步之前关闭 popup），而残留的
// activeIndex 更糟：popup 在退出动画期间保持挂载，重开时悬停 pill 还停在
// 上一次的行上并从那里弹向自动聚焦的行。以 `open`（视觉状态）为键，
// 与上面的停止同步测量的 effect 同步触发。
watch(open, (o) => {
  if (o) return;
  checkedIndex.value = undefined;
  setActiveIndex(null);
  focusedIndex.value = null;
});

const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] ?? null : null
);
const checkedRect = computed(() =>
  checkedIndex.value != null ? itemRects.value[checkedIndex.value] ?? null : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] ?? null : null
);

let indexCounter = 0;
function claimIndex() {
  return indexCounter++;
}

provideSelectContentContext({
  registerItem,
  claimIndex,
  activeIndex,
  checkedIndex,
  isMeasured,
  itemRects,
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
  if (!open.value) unmount();
}

function onPointerDownOutside(event: any) {
  const orig = event?.detail?.originalEvent ?? event;
  const target = (orig?.target ?? event?.target) as HTMLElement | null;
  if (target?.closest?.('[data-slot="select-trigger"], [data-reka-select-trigger]')) {
    event.preventDefault();
  }
}

onUnmounted(() => {
  /* no-op: hook 清理自己的 rAF */
});
</script>

<template>
  <SelectPortal>
    <SelectContent
      position="popper"
      side="bottom"
      align="start"
      :side-offset="6"
      class="z-50"
      @pointer-down-outside="onPointerDownOutside"
    >
      <motion.div
        :initial="{ opacity: 0, y: -4, scaleY: 0.96 }"
        :animate="
          open ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: -4, scaleY: 0.96 }
        "
        :transition="open ? spring.fast : spring.fast.exit"
        :style="{ transformOrigin: 'top center' }"
        :on-animation-complete="handleAnimationComplete"
      >
        <!-- Viewport 是滚动容器，并通过其内联 position: relative 成为
            邻近 overlay rect 锚定的 offsetParent。 -->
        <SelectViewport as-child>
          <Elevated
            ref="elevatedRef"
            :offset="2"
            :shadow-level="3"
            :class="
              `relative flex flex-col gap-0.5 overflow-y-auto ${shape.container} p-1 select-none outline-none ` +
              // min-w 追踪触发器（reka popper 提供的变量）；
              // ![scrollbar-width:thin] 让长列表保留可见滚动条。
              `min-w-[var(--reka-select-trigger-width)] max-h-[min(300px,var(--reka-select-content-available-height))] ![scrollbar-width:thin] ` +
              (props.class ?? '')
            "
            @mouseenter="handleMouseEnter"
            @mousemove="handlers.onMouseMove"
            @mouseleave="handlers.onMouseLeave"
            @focus="handleFocus"
            @blur="handleBlur"
          >
            <!-- 三个 overlay 在关闭开始时拆除而不是退出动画，因为关闭后仍挂载的
                overlay 会被重开时的 AnimatePresence 以旧 key 重新收养：
                initial 不会再跑，它保持之前行的位置并从那里动画到新的位置。
                popup 自己的淡出掩盖了它们的消失。 -->
            <div class="absolute inset-0 pointer-events-none">
              <!-- 选中背景 -->
              <template v-if="open">
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
              </template>

              <!-- 悬停背景 -->
              <template v-if="open">
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
              </template>

              <!-- 焦点环 -->
              <template v-if="open">
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
              </template>
            </div>

            <slot />
          </Elevated>
        </SelectViewport>
      </motion.div>
    </SelectContent>
  </SelectPortal>
</template>
