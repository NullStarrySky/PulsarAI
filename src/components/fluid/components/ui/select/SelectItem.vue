<script setup lang="ts">
import { computed, ref, useSlots, watch, type HTMLAttributes } from "vue";
import {
  SelectItem as SelectItemPrimitive,
  SelectItemText,
} from "reka-ui";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import type { IconComponent } from "../../../lib/icon-context";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { useSelectContext, useSelectContentContext } from "./select-context";

const props = withDefaults(
  defineProps<{
    icon?: IconComponent;
    index?: number;
    value: string;
    disabled?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  { disabled: false }
);

const selectCtx = useSelectContext();
const contentCtx = useSelectContentContext();
const internalRef = ref<HTMLDivElement | null>(null);
const shape = useShape();
const sizeClasses = useSize();
const compact = computed(() => sizeClasses.value.variant === "compact");
const hasMounted = ref(false);

const claimedIndex = ref<number>(props.index ?? -1);
if (claimedIndex.value === -1 && contentCtx?.claimIndex) {
  claimedIndex.value = contentCtx.claimIndex();
}
const resolvedIndex = computed(() => props.index ?? claimedIndex.value);

// 注册 value → label（触发器自渲染选中 label，见 select-context）。
// slot 文本在 setup 时静态可取。
const itemSlots = useSlots();
const itemLabel = computed(() => {
  const vnodes = itemSlots.default?.() ?? [];
  const first = vnodes.find((v) => typeof v.children === "string");
  return typeof first?.children === "string" ? first.children : props.value;
});
watch(
  () => [props.value, itemLabel.value] as const,
  ([v, l]) => selectCtx.registerLabel(v, l),
  { immediate: true }
);

// 向邻近悬停注册。依赖（稳定的）registerItem 而不是 content 上下文
const registerItem = contentCtx?.registerItem;
watch(
  [resolvedIndex, internalRef] as const,
  ([index, el], _prev, onCleanup) => {
    if (!registerItem || index < 0) return;
    registerItem(index, el);
    onCleanup(() => registerItem(index, null));
  },
  { immediate: true }
);

queueMicrotask(() => {
  hasMounted.value = true;
});

const isActive = computed(() => contentCtx?.activeIndex.value === resolvedIndex.value);
const isChecked = computed(() => selectCtx.value.value === props.value);
const skipAnimation = computed(() => !hasMounted.value);

function setItemRef(el: any) {
  internalRef.value = (el?.$el as HTMLDivElement | null) ?? el ?? null;
}

const itemClass = computed(() =>
  cn(
    // 固定高度让 item 文本上的 text-box trim 不会收缩行。
    // shrink-0：popup 是 max-height flex 列，没有它长列表会压缩行来适应
    // 而不是滚动。
    `relative z-10 flex ${sizeClasses.value.control} shrink-0 items-center ${sizeClasses.value.gap} ${shape.value.item} ${sizeClasses.value.itemPx} ${sizeClasses.value.text} cursor-pointer outline-none select-none`,
    "transition-[color] duration-80",
    isActive.value || isChecked.value ? "text-foreground" : "text-muted-foreground",
    props.disabled && "pointer-events-none opacity-50",
    props.class
  )
);
</script>

<template>
  <SelectItemPrimitive
    :ref="setItemRef"
    :value="value"
    :disabled="disabled"
    :data-proximity-index="resolvedIndex"
    :data-value="value"
    :class="itemClass"
  >
    <component
      :is="icon"
      v-if="icon"
      :size="sizeClasses.icon"
      :stroke-width="isActive || isChecked ? 2 : 1.5"
      class="shrink-0 transition-[color,stroke-width] duration-80"
    />

    <!-- 布局 class 放在 wrapper 上，ItemText → 触发器的移植只携带纯标签，
        不携带样式化的 span。不渲染 reka 内建的 ItemIndicator——
        下方的动画勾选标记以我们的上下文为键。 -->
    <!-- py-1/-my-1 让 truncate 的 overflow:hidden 不裁剪 trim 盒之外的
        上伸部/下伸部。 -->
    <span class="min-w-0 flex-1 truncate py-1 -my-1 [text-box:trim-both_cap_alphabetic]">
      <SelectItemText><slot /></SelectItemText>
    </span>

    <!-- 始终渲染的固定槽位，勾选出现/消失永不改变行的固有宽度——
        没有它，选中落定时整个 popup 会重新调整尺寸。 -->
    <span
      aria-hidden="true"
      :class="cn('shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')"
    >
      <AnimatePresence>
        <motion.svg
          v-if="isChecked"
          key="check"
          :width="sizeClasses.icon"
          :height="sizeClasses.icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          :stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-foreground"
          :initial="{ opacity: 1 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 1 }"
        >
          <motion.path
            d="M4 12L9 17L20 6"
            :initial="{ pathLength: skipAnimation ? 1 : 0 }"
            :animate="{
              pathLength: 1,
              transition: { duration: 0.08, ease: 'easeOut' },
            }"
            :exit="{
              pathLength: 0,
              transition: { duration: 0.04, ease: 'easeIn' },
            }"
          />
        </motion.svg>
      </AnimatePresence>
    </span>
  </SelectItemPrimitive>
</template>
