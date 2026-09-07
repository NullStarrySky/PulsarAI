<script setup lang="ts">
import { computed, onMounted, ref, useSlots, watch, type VNode } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { useShape } from "../../../lib/shape-context";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { flattenSlotVnodes } from "../../../lib/slot-utils";
import { provideRadioGroupContext } from "./radio-group-context";

const props = withDefaults(
  defineProps<{
    selectedIndex?: number;
    /** 标准受控模式（v-model）。 */
    modelValue?: string;
    /** 值受控模式（向下兼容）：传 value 后组内 RadioItem 以 value 匹配选中。 */
    value?: string;
    defaultValue?: string;
    /** 把组的行钉在尺寸阶梯的某一档（默认 36px，紧凑 28px——见 /docs/sizes）。
     *  省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    class?: string;
  }>(),
  {}
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:value", value: string): void;
}>();

const slots = useSlots();
const containerRef = ref<HTMLDivElement | null>(null);

// ── 从 slot 内容读取子项 value / selected（供 value 模式解析选中索引）──
function isRadioItemVnode(v: VNode): boolean {
  const type = v.type as { __name?: string; name?: string } | string;
  return (
    typeof type !== "string" &&
    (type.name === "RadioItem" || type.__name === "RadioItem")
  );
}

const childValues = ref<string[]>([]);
const anyChildSelected = ref(false);

watch(
  () => slots.default,
  () => {
    const vnodes = flattenSlotVnodes(slots.default?.() ?? []).filter(isRadioItemVnode);
    childValues.value = vnodes
      .map((v) => (v.props as { value?: string } | null)?.value)
      .filter((v): v is string => typeof v === "string");
    anyChildSelected.value = vnodes.some(
      (v) => (v.props as { selected?: boolean } | null)?.selected === true
    );
  },
  { immediate: true }
);

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

const boundValue = computed(() =>
  props.modelValue !== undefined ? props.modelValue : props.value
);

const resolvedSelectedIndex = computed(() => {
  if (boundValue.value !== undefined) {
    return childValues.value.findIndex((v) => v === boundValue.value);
  }
  return props.selectedIndex ?? -1;
});

// 覆盖三种选中 API：value/modelValue、selectedIndex、逐项 selected。
const hasSelection = computed(
  () => resolvedSelectedIndex.value >= 0 || anyChildSelected.value
);

const activeRect = computed(() =>
  activeIndex.value !== null ? itemRects.value[activeIndex.value] : null
);
const focusRect = computed(() =>
  focusedIndex.value !== null ? itemRects.value[focusedIndex.value] : null
);
const selectedRect = computed(() =>
  resolvedSelectedIndex.value >= 0
    ? itemRects.value[resolvedSelectedIndex.value] ?? null
    : null
);
const shape = useShape();

watch(
  boundValue,
  () => measureItems()
);

let indexCounter = 0;
function claimIndex() {
  return indexCounter++;
}

provideRadioGroupContext({
  registerItem,
  claimIndex,
  activeIndex,
  selectedIndex: computed(() =>
    resolvedSelectedIndex.value >= 0 ? resolvedSelectedIndex.value : null
  ),
  selectedValue: boundValue,
  emitValue: (v: string) => {
    emit("update:modelValue", v);
    emit("update:value", v);
  },
  hasSelection,
});

provideSize({ size: () => props.size });

// 挂载即同步测量一轮（对齐 React 版的 useEffect measureItems；
// rAF 合并路径仍由 registerItem 驱动）。
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
  // 只作用于行包裹层。隐藏的 radio 原语也带 role="radio"，
  // 裸的 [role="radio"] 选择器每行会匹配两次，方向键会落在不可见控件上。
  const items = Array.from(
    containerRef.value?.querySelectorAll("[data-proximity-index]") ?? []
  ) as HTMLElement[];
  const currentIdx = items.indexOf(e.target as HTMLElement);
  if (currentIdx === -1) return;

  if (["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) {
    e.preventDefault();
    const next = ["ArrowDown", "ArrowRight"].includes(e.key)
      ? (currentIdx + 1) % items.length
      : (currentIdx - 1 + items.length) % items.length;
    items[next]?.focus();
    items[next]?.click();
  } else if (e.key === "Home") {
    e.preventDefault();
    items[0]?.focus();
    items[0]?.click();
  } else if (e.key === "End") {
    e.preventDefault();
    items[items.length - 1]?.focus();
    items[items.length - 1]?.click();
  }
}
</script>

<template>
  <div
    ref="containerRef"
    role="radiogroup"
    :class="cn('relative flex flex-col w-72 max-w-full select-none', props.class)"
    @mouseenter="handlers.onMouseEnter"
    @mousemove="handlers.onMouseMove"
    @mouseleave="handlers.onMouseLeave"
    @focus="handleFocus"
    @blur="handleBlur"
    @keydown="handleKeydown"
  >
    <!-- 选中背景 -->
    <motion.div
      v-if="selectedRect"
      :class="`absolute ${shape.bg} bg-active pointer-events-none`"
      :initial="false"
      :animate="{
        top: selectedRect.top,
        left: selectedRect.left,
        width: selectedRect.width,
        height: selectedRect.height,
        opacity: 1,
      }"
      :transition="{ ...spring.moderate, opacity: { duration: 0.08 } }"
    />

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
