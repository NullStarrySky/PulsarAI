<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  DropdownMenuPortal,
  DropdownMenuSubContent as DropdownMenuSubContentPrimitive,
} from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { spring } from "../../../lib/springs";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { shapeMap } from "../../../lib/shape-context";
import { useForwardedEl } from "../../../lib/forwarded-el";
import Elevated from "../../../lib/Elevated.vue";
import { provideDropdownContext } from "./dropdown-context";

const shape = shapeMap.rounded;

const props = withDefaults(
  defineProps<{
    sideOffset?: number;
    alignOffset?: number;
    class?: string;
  }>(),
  { sideOffset: 4, alignOffset: -4 }
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
} = useProximityHover(containerRef);

const focusedIndex = ref<number | null>(null);

let indexCounter = 0;
function claimIndex() {
  return indexCounter++;
}

provideDropdownContext({
  registerItem,
  claimIndex,
  activeIndex,
  inMenu: true,
});

const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] ?? null : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] ?? null : null
);

watch(
  containerRef,
  (el) => {
    if (!el) return;
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
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuSubContentPrimitive
      as-child
      :side-offset="sideOffset"
      :align-offset="alignOffset"
      :class="`z-50 ${shape.container}`"
    >
      <motion.div
        :initial="{ opacity: 0, scale: 0.96, x: -4 }"
        :animate="{ opacity: 1, scale: 1, x: 0 }"
        :exit="{ opacity: 0, scale: 0.96, x: -4 }"
        :transition="spring.fast"
      >
        <Elevated
          ref="elevatedRef"
          :offset="2"
          :shadow-level="3"
          :class="
            `relative flex flex-col gap-0.5 ${shape.container} p-1 select-none outline-none min-w-[150px] ` +
            (props.class ?? '')
          "
          @mouseenter="handleMouseEnter"
          @mousemove="handlers.onMouseMove"
          @mouseleave="handlers.onMouseLeave"
          @focus="handleFocus"
          @blur="handleBlur"
        >
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
        </Elevated>
      </motion.div>
    </DropdownMenuSubContentPrimitive>
  </DropdownMenuPortal>
</template>
