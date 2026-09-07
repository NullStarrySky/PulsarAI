<script setup lang="ts">
import { computed, ref, watch, type VNode } from "vue";
import { TabsRoot, TabsList as TabsListPrimitive } from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useShape } from "../../../lib/shape-context";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { provideTabsSubtleContext } from "./tabs-subtle-context";

// ─── TabsSubtle ───────────────────────────────────────────────────────────
// 无外框的图标 tabs：独立的选中/悬停 pill 直接叠在 tab 上，磁吸邻近高亮。
// `activeLabel` 模式下只有选中的 tab 展开文字标签（宽度弹簧动画），要求
// 每个 tab 提供图标。index 受控（selectedIndex / onSelect），键盘为手动
// 激活：方向键移动焦点，Enter/Space 选中。

const props = withDefaults(
  defineProps<{
    /** 当前选中的 tab 索引（受控）。 */
    selectedIndex: number;
    /** 面板联动 id 前缀（TabsSubtlePanel 在组件树别处渲染时必传）。 */
    idPrefix?: string;
    /** 为 true 时只有选中的 tab 显示文字标签。要求 tab 带图标。 */
    activeLabel?: boolean;
    /** 把 tabs 钉在尺寸阶梯的某一档（默认 36px，紧凑 28px——见
     *  /docs/sizes）。省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    class?: string;
  }>(),
  { activeLabel: false }
);

const emit = defineEmits<{
  (e: "select", index: number): void;
}>();

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "TabsSubtle" });

const containerRef = ref<HTMLDivElement | null>(null);
const isMouseInside = ref(false);
const shape = useShape();

const {
  activeIndex: hoveredIndex,
  setActiveIndex: setHoveredIndex,
  itemRects: tabRects,
  handlers,
  registerItem,
  measureItems: measureTabs,
} = useProximityHover(containerRef, { axis: "x" });

// children 变化时重测；单项 resize（activeLabel 标签展开）由
// useProximityHover 的项观察器覆盖。
watch(() => slots.default, () => measureTabs());

function registerTab(index: number, element: HTMLElement | null) {
  registerItem(index, element);
}

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

const focusedIndex = ref<number | null>(null);

function handleFocus(e: FocusEvent) {
  const target = e.target as HTMLElement;
  const trigger = target.closest("[data-proximity-index]");
  const indexAttr = trigger?.getAttribute("data-proximity-index");
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

// reka 的 Tabs 值是字符串；索引 ⇄ 值映射在这里完成。
const valueOf = (index: number) => `t-${index}`;
const selectedIndex = computed(() => Math.max(0, props.selectedIndex));

const selectedRect = computed(() => tabRects.value[selectedIndex.value] ?? null);
const hoverRect = computed(() =>
  hoveredIndex.value !== null ? (tabRects.value[hoveredIndex.value] ?? null) : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? (tabRects.value[focusedIndex.value] ?? null) : null
);
const isHoveringSelected = computed(() => hoveredIndex.value === selectedIndex.value);
const isHovering = computed(() => hoveredIndex.value !== null && !isHoveringSelected.value);

provideTabsSubtleContext({
  registerTab,
  hoveredIndex,
  selectedIndex,
  activeLabel: props.activeLabel,
  idPrefix: props.idPrefix,
});

// size prop 把内部每个 tab 钉在阶梯的一档。
provideSize({ size: () => props.size });
</script>

<template>
  <TabsRoot
    :model-value="valueOf(selectedIndex)"
    activation-mode="manual"
    @update:model-value="(v: string | number) => emit('select', Number(String(v).slice(2)))"
  >
    <!-- -mx-1 px-1 / -my-1 py-1 给 2px 外扩的焦点环留出不被
        overflow-x-auto 裁掉的空间。max-width 补偿负 margin：
        fit-content 父级按 margin box（窄 8px）计算，普通 max-w-full
        会把列表夹小 8px，裁掉首尾 tab 的焦点环。 -->
    <TabsListPrimitive
      :ref="setListRef"
      :class="
        cn(
          'no-scrollbar relative flex max-w-[calc(100%_+_8px)] select-none items-center gap-0.5 overflow-x-auto -mx-1 px-1 -my-1 py-1',
          props.class
        )
      "
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
      @focus="handleFocus"
      @blur="handleBlur"
    >
      <!-- 选中 pill -->
      <motion.div
        v-if="selectedRect"
        :class="cn('pointer-events-none absolute bg-active', shape.bg)"
        :initial="false"
        :animate="{
          left: selectedRect.left,
          width: selectedRect.width,
          top: selectedRect.top,
          height: selectedRect.height,
          opacity: isHovering ? 0.8 : 1,
        }"
        :transition="{ ...spring.moderate, opacity: { duration: 0.08 } }"
      />

      <!-- 悬停 pill -->
      <AnimatePresence>
        <motion.div
          v-if="hoverRect && !isHoveringSelected && selectedRect"
          :class="cn('pointer-events-none absolute bg-active', shape.bg)"
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
  </TabsRoot>
</template>
