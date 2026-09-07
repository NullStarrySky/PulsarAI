<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { shapeMap } from "../../../lib/shape-context";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { useForwardedEl } from "../../../lib/forwarded-el";
import Elevated from "../../../lib/Elevated.vue";
import { provideDropdownContext } from "./dropdown-context";

// Dropdown 选择退出全局 pill/rounded 形状上下文——无论 UI 其他部分是什么
// 形状，弹出层表面用更小的 "rounded" 圆角都更干净（这个尺度下厚重的 pill
// 起泡会扭曲感知的内边距，并产生角部阴影不对称）。
const shape = shapeMap.rounded;

const props = withDefaults(
  defineProps<{
    /** 选中项的索引。驱动动画选中背景。 */
    checkedIndex?: number;
    /** 把面板的行钉在尺寸阶梯的某一档（默认 36px，紧凑 28px——见 /docs/sizes）。
     *  省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    /** 覆盖阴影层级，传 0 可去除阴影。默认 3。 */
    shadowLevel?: number;
    class?: string;
  }>(),
  { shadowLevel: 3 }
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

const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] : null
);
const checkedRect = computed(() =>
  props.checkedIndex != null ? itemRects.value[props.checkedIndex] ?? null : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] : null
);

provideDropdownContext({ registerItem, activeIndex, checkedIndex: props.checkedIndex });

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
  if (containerRef.value?.contains(e.relatedTarget as Node)) return;
  focusedIndex.value = null;
  setActiveIndex(null);
}

function handleKeydown(e: KeyboardEvent) {
  const items = Array.from(
    containerRef.value?.querySelectorAll('[role="menuitem"], [role="menuitemradio"]') ?? []
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
  <!-- 始终渲染的面板——无触发器、定位或关闭逻辑。因为它静态位于页面中，
      不冒充 popup 菜单语义：容器是普通的 role="group"（传 aria-label 命名）。
      真正的 role="menu" 在下方的弹出 DropdownContent 上。 -->
  <Elevated
    ref="elevatedRef"
    :offset="2"
    :shadow-level="props.shadowLevel"
    role="group"
    :class="panelClass"
    @mouseenter="handlers.onMouseEnter"
    @mousemove="handlers.onMouseMove"
    @mouseleave="handlers.onMouseLeave"
    @focus="handleFocus"
    @blur="handleBlur"
    @keydown="handleKeydown"
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

    <slot />
  </Elevated>
</template>
