<script setup lang="ts">
import { computed, ref, useTemplateRef, watch, type HTMLAttributes } from "vue";
import { AccordionRoot } from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { useShape } from "../../../lib/shape-context";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import {
  provideAccordionGroup,
  type AccordionRect,
} from "./accordion-context";

const props = withDefaults(
  defineProps<{
    /** 把组内的行钉在尺寸阶梯的某一档（默认 36px，紧凑 28px——见 /docs/sizes）。
     *  省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    /** 打开的 item 染色什么。"item" 把行和面板画成一块，并在保持打开时维持。
     *  "trigger" 把填充限定在行内且仅悬停时显示，面板留在页面自己的表面上
     *  ——侧边栏行高亮而不给子树着色的方式。 @default "item" */
    highlight?: "trigger" | "item";
    type?: "single" | "multiple";
    /** 受控值（single: string；multiple: string[]）。 */
    modelValue?: string | string[];
    defaultValue?: string | string[];
    collapsible?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  { highlight: "item", type: "single", collapsible: true }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string | string[]): void;
}>();

const containerRef = useTemplateRef<HTMLDivElement>("containerRef");
const fullItemElements = new Map<number, HTMLElement>();
const openItemRects = ref<Map<number, AccordionRect>>(new Map());

const {
  activeIndex,
  setActiveIndex,
  itemRects,
  session,
  handlers,
  registerItem,
  measureItems,
} = useProximityHover(containerRef);

function registerFullItem(index: number, element: HTMLElement | null) {
  if (element) {
    fullItemElements.set(index, element);
  } else {
    fullItemElements.delete(index);
  }
}

function measureFullItems() {
  if (!containerRef.value) return;
  const next = new Map<number, AccordionRect>();
  // 使用 offset*（布局坐标）与邻近 hook 的项保持一致。
  // getBoundingClientRect 会返回已被祖先 transform 缩放过的视觉坐标；
  // 一旦作为 CSS 应用在同一个缩放容器里，overlay 会被二次缩放。
  fullItemElements.forEach((el, idx) => {
    next.set(idx, {
      top: el.offsetTop,
      left: el.offsetLeft,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  });
  // 没有移动时跳过状态更新（镜像邻近 hook 的 measureItems 守卫）
  const prev = openItemRects.value;
  let changed = prev.size !== next.size;
  if (!changed) {
    for (const [idx, r] of next) {
      const p = prev.get(idx);
      if (!p || p.top !== r.top || p.left !== r.left || p.width !== r.width || p.height !== r.height) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;
  openItemRects.value = next;
}

// ── 打开值（受控 / 非受控）─────────────────────────────────
const internalValue = ref<string | string[]>(
  props.type === "multiple"
    ? ((props.defaultValue as string[] | undefined) ?? [])
    : ((props.defaultValue as string | undefined) ?? "")
);

const isControlled = computed(() => props.modelValue !== undefined);
const currentValue = computed<string | string[]>(() =>
  isControlled.value ? (props.modelValue as string | string[]) : internalValue.value
);

const openValuesList = computed<string[]>(() => {
  const v = currentValue.value;
  if (props.type === "multiple") return Array.isArray(v) ? v : [];
  return v ? [v as string] : [];
});

// 以拼接后的字符串作为 key，让 Set（以及下方的组上下文）在打开值未变的
// 重渲染之间保持稳定。
const openValues = computed(() => new Set(openValuesList.value));

function handleValueChange(next: string | string[] | undefined) {
  if (!isControlled.value) internalValue.value = next ?? (props.type === "multiple" ? [] : "");
  emit("update:modelValue", next ?? (props.type === "multiple" ? [] : ""));
}

function remeasure() {
  measureItems();
  measureFullItems();
}

// 打开值变化时重测，让首帧就反映移动后的 trigger 位置。
watch(openValuesList, () => {
  measureItems();
  measureFullItems();
});

const focusedIndex = ref<number | null>(null);

const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] : null
);
// Dimming: reduce expanded BG opacity when hovering a non-expanded trigger
const expandedRects = computed<Map<number, AccordionRect>>(() => {
  if (props.highlight === "item") return openItemRects.value;
  const map = new Map<number, AccordionRect>();
  for (const idx of openItemRects.value.keys()) {
    if (idx === activeIndex.value) {
      const rect = itemRects.value[idx];
      if (rect) map.set(idx, rect);
    }
  }
  return map;
});

const isHoveringNonOpen = computed(
  () => activeIndex.value !== null && !openItemRects.value.has(activeIndex.value)
);
const shape = useShape();

let indexCounter = 0;
function claimIndex() {
  return indexCounter++;
}

provideAccordionGroup({
  registerItem,
  registerFullItem,
  claimIndex,
  activeIndex,
  grouped: true,
  remeasure,
  openValues,
  openItemRects,
});

const sizeToProvide = computed(() => props.size);
provideSize({ size: () => sizeToProvide.value });

function handleMouseMove(e: MouseEvent) {
  // 光标位于展开内容区域（item 触发器下方）时抑制邻近悬停。
  // 让触发器悬停只作用于触发器行本身。
  const container = containerRef.value;
  if (container) {
    const cRect = container.getBoundingClientRect();
    const layoutH = container.offsetHeight;
    const visualH = cRect.height;
    const scale = layoutH > 0 ? visualH / layoutH : 1;
    const localY = (e.clientY - cRect.top) / scale + container.scrollTop;
    for (const [idx, full] of openItemRects.value) {
      const trigger = itemRects.value[idx];
      if (!trigger) continue;
      const contentTop = trigger.top + trigger.height;
      const contentBottom = full.top + full.height;
      if (localY >= contentTop && localY <= contentBottom) {
        setActiveIndex(null);
        return;
      }
    }
  }
  handlers.onMouseMove(e);
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
  <AccordionRoot
    :type="type"
    :collapsible="collapsible"
    :model-value="type === 'multiple' ? (currentValue as string[]) : (currentValue as string)"
    :as-child="true"
    @update:model-value="handleValueChange"
  >
    <div
      ref="containerRef"
      :class="
        cn('relative flex flex-col gap-0.5 w-72 max-w-full', props.class)
      "
      @mouseenter="handlers.onMouseEnter"
      @mousemove="handleMouseMove"
      @mouseleave="handlers.onMouseLeave"
      @focus="handleFocus"
      @blur="handleBlur"
    >
      <!-- 展开项背景 -->
      <AnimatePresence>
        <motion.div
          v-for="[idx, rect] in expandedRects"
          :key="`expanded-${idx}`"
          :class="`absolute ${shape.bg} bg-accent/20 dark:bg-accent/12 pointer-events-none`"
          :initial="{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            opacity: 0,
          }"
          :animate="{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            opacity: isHoveringNonOpen ? 0.7 : 1,
          }"
          :exit="{ opacity: 0, transition: spring.moderate.exit }"
          :transition="{
            top: { duration: 0 },
            left: { duration: 0 },
            width: { duration: 0 },
            height: { duration: 0 },
            opacity: { duration: 0.12 },
          }"
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
  </AccordionRoot>
</template>
