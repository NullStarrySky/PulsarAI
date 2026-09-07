<script setup lang="ts">
import { computed, ref, watch, type HTMLAttributes } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { useRadioGroupContext } from "./radio-group-context";

const props = withDefaults(
  defineProps<{
    label?: string;
    index?: number;
    selected?: boolean;
    value?: string;
    class?: HTMLAttributes["class"];
  }>(),
  {}
);

const emit = defineEmits<{
  (e: "select"): void;
}>();

defineOptions({ name: "RadioItem" });

const internalRef = ref<HTMLDivElement | null>(null);
const hasMounted = ref(false);
const radioGroupCtx = useRadioGroupContext();
const {
  registerItem,
  activeIndex,
  selectedIndex,
  selectedValue,
  emitValue,
  hasSelection,
} = radioGroupCtx;

const claimedIndex = ref<number>(props.index ?? -1);
if (claimedIndex.value === -1 && radioGroupCtx?.claimIndex) {
  claimedIndex.value = radioGroupCtx.claimIndex();
}
const resolvedIndex = computed(() => props.index ?? claimedIndex.value);

watch(
  [resolvedIndex, internalRef] as const,
  ([index, el], _prev, onCleanup) => {
    if (index < 0) return;
    registerItem(index, el);
    onCleanup(() => registerItem(index, null));
  },
  { immediate: true }
);

queueMicrotask(() => {
  hasMounted.value = true;
});

const isActive = computed(() => activeIndex.value === resolvedIndex.value);
const skipAnimation = computed(() => !hasMounted.value);
const shape = useShape();
const sizeClasses = useSize();
const compact = computed(() => sizeClasses.value.variant === "compact");

const isSelected = computed(() =>
  props.value !== undefined && selectedValue.value !== undefined
    ? selectedValue.value === props.value
    : (props.selected ?? selectedIndex.value === resolvedIndex.value)
);

function handleSelect() {
  if (props.value !== undefined) {
    emitValue(props.value);
  }
  emit("select");
}

function handleMousedown(e: MouseEvent) {
  // 点击 15px 的 radio 圆点会原生聚焦到隐藏原语（点击目标的最近可聚焦祖先），
  // 之后方向键导航死区：组的 keydown 处理器无法在行包裹层中找到目标。
  // 阻止原生焦点移动（click 仍会触发），把焦点落在行上。跳过真正可交互的
  // 子元素，避免劫持它们的焦点。
  const target = e.target as HTMLElement;
  const interactive = target.closest(
    'button:not([tabindex="-1"]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (interactive && interactive !== e.currentTarget) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).focus();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    handleSelect();
  }
}

function setRef(el: any) {
  internalRef.value = el?.$el ?? el;
}
</script>

<template>
  <div
    :ref="setRef"
    :data-proximity-index="resolvedIndex"
    :tabindex="isSelected ? 0 : !hasSelection && resolvedIndex === 0 ? 0 : -1"
    role="radio"
    :aria-checked="isSelected"
    :aria-label="label"
    :class="
      cn(
        `relative z-10 flex ${sizeClasses.control} items-center ${sizeClasses.gap} ${shape.item} ${sizeClasses.px} cursor-pointer outline-none whitespace-nowrap`,
        props.class
      )
    "
    @click="handleSelect"
    @mousedown="handleMousedown"
    @keydown="handleKeydown"
  >
    <!-- Radio 圆点 -->
    <div
      :class="
        cn(
          'relative shrink-0',
          compact ? 'h-[14px] w-[14px]' : 'h-[16px] w-[16px]'
        )
      "
    >
      <!-- 边框 -->
      <div
        :class="
          cn(
            'absolute inset-0 rounded-full border-solid transition-all duration-80',
            isSelected
              ? 'border-[1.5px] border-transparent'
              : isActive
                ? 'border-[1.5px] border-neutral-400 dark:border-neutral-500'
                : 'border-[1.5px] border-border'
          )
        "
      />
      <!-- 圆点 -->
      <AnimatePresence>
        <motion.div
          v-if="isSelected"
          class="absolute inset-0 flex items-center justify-center"
          :initial="{ opacity: skipAnimation ? 1 : 0, scale: skipAnimation ? 1 : 0.3 }"
          :animate="{ opacity: 1, scale: 1 }"
          :exit="{ opacity: 0, scale: 0.3, transition: { duration: 0.04 } }"
          :transition="spring.fast"
        >
          <div
            :class="
              cn(
                'rounded-full bg-foreground',
                compact ? 'h-[7px] w-[7px]' : 'h-[8px] w-[8px]'
              )
            "
          />
        </motion.div>
      </AnimatePresence>
    </div>

    <!-- 标签 -->
    <template v-if="$slots.default">
      <span
        :class="
          cn(
            'inline-flex items-center gap-1.5 transition-[color,font-variation-settings] duration-80',
            sizeClasses.text,
            isSelected || isActive ? 'text-foreground' : 'text-muted-foreground'
          )
        "
        :style="{
          fontVariationSettings: isSelected ? fontWeights.semibold : fontWeights.normal,
        }"
      >
        <slot />
      </span>
    </template>
    <span v-else-if="label" :class="cn('inline-grid', sizeClasses.text)">
      <span
        class="col-start-1 row-start-1 invisible [text-box:trim-both_cap_alphabetic]"
        :style="{ fontVariationSettings: fontWeights.semibold }"
        aria-hidden="true"
      >
        {{ label }}
      </span>
      <span
        :class="
          cn(
            'col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80 [text-box:trim-both_cap_alphabetic]',
            isSelected || isActive ? 'text-foreground' : 'text-muted-foreground'
          )
        "
        :style="{
          fontVariationSettings: isSelected ? fontWeights.semibold : fontWeights.normal,
        }"
      >
        {{ label }}
      </span>
    </span>
  </div>
</template>
