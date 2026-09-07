<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import {
  motion,
  type MotionValue,
  useMotionValue,
  useTransform,
  animate,
  AnimatePresence,
} from "motion-v";
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from "reka-ui";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { PIP_SIZE } from "./slider-engine";

export type ComfortableVariant = "pips" | "scrubber";

const props = withDefaults(
  defineProps<{
    value: number;
    min?: number;
    max?: number;
    step?: number;
    variant?: ComfortableVariant;
    label?: string;
    formatValue?: (v: number) => string;
    disabled?: boolean;
    class?: string;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    variant: "pips",
    formatValue: (v: number) => String(v),
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:value", value: number): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
// motion-v 的 motion 组件 ref 暴露组件实例而非 DOM 元素——解包 $el，
// 否则 getValueFromX / computeHoverPreview 里的 getBoundingClientRect 抛错，
// 拖拽与悬停预览全挂。
function setContainerRef(el: unknown) {
  const el2 = el as { $el?: HTMLDivElement } | HTMLDivElement | null;
  containerRef.value =
    el2 && typeof (el2 as HTMLDivElement).getBoundingClientRect === "function"
      ? (el2 as HTMLDivElement)
      : ((el2 as { $el?: HTMLDivElement } | null)?.$el ?? null);
}
let dragging = false;
let handleDragging = false;
const isHovered = ref(false);
const isPressed = ref(false);
const isFocused = ref(false);
const hoverPreview = ref<{
  left: number;
  width: number;
  snappedValue: number;
  cursorX: number;
} | null>(null);
const showHoverTooltip = ref(false);
let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null;
const shape = useShape();

// 100ms 延迟后显示悬停 tooltip
watch(isHovered, (v) => {
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer);
    hoverDelayTimer = null;
  }
  if (v) {
    hoverDelayTimer = setTimeout(() => (showHoverTooltip.value = true), 100);
  } else {
    showHoverTooltip.value = false;
  }
});

onUnmounted(() => {
  if (hoverDelayTimer) clearTimeout(hoverDelayTimer);
});

const pipSteps = computed(() =>
  Array.from(
    { length: Math.round((props.max - props.min) / props.step) + 1 },
    (_, i) => props.min + i * props.step
  )
);
const pipCount = computed(() => pipSteps.value.length);

// 填充 motion value
const fillPercent = useMotionValue(
  props.max === props.min
    ? 0
    : Math.max(0, Math.min(1, (props.value - props.min) / (props.max - props.min)))
);
// 值在 min 时的小偏移，让手柄线保持可见
const zeroTarget = computed(() => (props.variant === "pips" ? 8 : 17));
const zeroOffset = useMotionValue(props.value === props.min ? zeroTarget.value : 0);

const fillWidthStyle = useTransform(fillPercent, (p) => `${p * 100}%`);
const handleLeftStyle = useTransform(
  [fillPercent, zeroOffset] as [MotionValue<number>, MotionValue<number>],
  (xs) => {
    const [p, zo] = xs as unknown as [number, number];
    return `calc(${p * 100}% - 8px + ${zo}px)`;
  }
);
const handleLineLeftStyle = useTransform(
  [fillPercent, zeroOffset] as [MotionValue<number>, MotionValue<number>],
  (xs) => {
    const [p, zo] = xs as unknown as [number, number];
    return `calc(${p * 100}% - 9px + ${zo}px)`;
  }
);
// pips 专用：按 px-3（12px）内边距偏移，让填充边缘与活动 pip 中心对齐
const pipsFillWidthStyle = useTransform(
  [fillPercent, zeroOffset] as [MotionValue<number>, MotionValue<number>],
  (xs) => {
    const [p, zo] = xs as unknown as [number, number];
    return `calc(${p * 100}% + ${20 - 20 * p - zo * 2.5}px)`;
  }
);
const pipsHandleLineLeftStyle = useTransform(
  fillPercent,
  (p) => `calc(${p * 100}% + ${11 - 24 * p}px)`
);
const pipsMaskStyle = useTransform(
  [fillPercent, zeroOffset] as [MotionValue<number>, MotionValue<number>],
  (xs) => {
    const [p, zo] = xs as unknown as [number, number];
    const offset = 20 - 20 * p - zo * 2.5;
    return `linear-gradient(to right, transparent calc(${p * 100}% + ${offset}px), black calc(${p * 100}% + ${offset + 2}px))`;
  }
);

// ── 悬停预览计算 ──
function computeHoverPreview(clientX: number) {
  const el = containerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  // 使用 clientWidth（padding box）——CSS % 与绝对 left/width 相对它
  const w = el.clientWidth;
  if (w <= 0 || rect.width <= 0) return;
  // 把光标归一化到布局空间
  const scale = rect.width / el.offsetWidth;
  const borderLeftLayout = (el.offsetWidth - w) / 2;
  const visualX = clientX - rect.left;
  const layoutX = visualX / scale - borderLeftLayout;
  const clamped = Math.max(0, Math.min(w, layoutX));

  // 吸附到最近步进值
  let snappedVal: number;
  if (props.variant === "pips") {
    if (pipCount.value <= 1) return;
    const index = Math.max(
      0,
      Math.min(pipCount.value - 1, Math.round((clamped / w) * (pipCount.value - 1)))
    );
    snappedVal = pipSteps.value[index];
  } else {
    const raw = props.min + (clamped / w) * (props.max - props.min);
    snappedVal = Math.max(
      props.min,
      Math.min(props.max, Math.round((raw - props.min) / props.step) * props.step + props.min)
    );
  }
  const snappedPercent =
    props.max === props.min ? 0 : (snappedVal - props.min) / (props.max - props.min);
  const snappedX = snappedPercent * w;

  // 当前手柄位置——pips 模式匹配视觉填充边缘偏移
  const currentPercent = fillPercent.get();
  let handleX: number;
  if (props.variant === "pips") {
    const zo = zeroOffset.get();
    handleX = currentPercent * w + (20 - 20 * currentPercent - zo * 2.5);
  } else {
    handleX = currentPercent * w;
  }

  // 极值处把悬停条延伸到容器边缘，避免缺口
  const edgeX =
    snappedVal === props.min ? 0 : snappedVal === props.max ? w : snappedX;
  const left = Math.min(handleX, edgeX);
  const width = Math.abs(edgeX - handleX);
  hoverPreview.value = { left, width, snappedValue: snappedVal, cursorX: snappedX };
}

function handleMouseMove(e: MouseEvent) {
  if (props.disabled || dragging || handleDragging) return;
  computeHoverPreview(e.clientX);
}

// 程序化值变化时同步填充
watch(
  () => [props.value, props.variant] as const,
  () => {
    if (dragging || handleDragging) return;
    const percent =
      props.max === props.min
        ? 0
        : Math.max(0, Math.min(1, (props.value - props.min) / (props.max - props.min)));
    animate(fillPercent, percent, spring.fast);
    animate(zeroOffset, props.value === props.min ? zeroTarget.value : 0, spring.fast);
  }
);

function getValueFromX(clientX: number): number {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) return props.min;
  const x = clientX - rect.left;
  const clamped = Math.max(0, Math.min(rect.width, x));
  if (props.variant === "pips") {
    if (pipCount.value <= 1) return props.min;
    const index = Math.max(
      0,
      Math.min(pipCount.value - 1, Math.round((clamped / rect.width) * (pipCount.value - 1)))
    );
    return pipSteps.value[index];
  }
  const raw = props.min + (clamped / rect.width) * (props.max - props.min);
  const snapped = Math.round((raw - props.min) / props.step) * props.step + props.min;
  return Math.max(props.min, Math.min(props.max, snapped));
}

function setFillFromValue(newVal: number, immediate = false) {
  const newPercent = Math.max(
    0,
    Math.min(1, (newVal - props.min) / (props.max - props.min))
  );
  if (immediate) fillPercent.set(newPercent);
  else animate(fillPercent, newPercent, spring.fast);
  animate(zeroOffset, newVal === props.min ? zeroTarget.value : 0, spring.fast);
}

function handlePointerDown(e: PointerEvent) {
  if (props.disabled) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  dragging = true;
  isPressed.value = true;
  const newVal = getValueFromX(e.clientX);
  emit("update:value", newVal);
  setFillFromValue(newVal, props.variant === "scrubber");
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function handlePointerMove(e: PointerEvent) {
  if (!dragging) return;
  const newVal = getValueFromX(e.clientX);
  emit("update:value", newVal);
  setFillFromValue(newVal, props.variant === "scrubber");
}

function handlePointerUp() {
  dragging = false;
  isPressed.value = false;
  hoverPreview.value = null;
}

// 拖拽手柄（scrubber）的指针处理器——直接光标位置
function handleResizePointerDown(e: PointerEvent) {
  if (props.disabled) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  handleDragging = true;
  isPressed.value = true;
  const newVal = getValueFromX(e.clientX);
  emit("update:value", newVal);
  setFillFromValue(newVal, true);
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function handleResizePointerMove(e: PointerEvent) {
  if (!handleDragging) return;
  const newVal = getValueFromX(e.clientX);
  emit("update:value", newVal);
  setFillFromValue(newVal, true);
}

function handleResizePointerUp() {
  handleDragging = false;
  isPressed.value = false;
  hoverPreview.value = null;
}

function handleRadixChange(newValues: number[] | undefined) {
  if (!newValues) return;
  emit("update:value", newValues[0]);
}

const isActive = computed(() => isHovered.value || isFocused.value);

function handleThumbFocus(e: FocusEvent) {
  if ((e.currentTarget as HTMLElement).matches(":focus-visible")) {
    isFocused.value = true;
  }
}

function handleThumbBlur() {
  isFocused.value = false;
}

const boxClass = computed(() =>
  cn(
    "relative h-8 w-full select-none touch-none overflow-hidden border border-border outline-offset-2",
    props.variant === "scrubber" ? "flex cursor-ew-resize items-center gap-3 px-4" : "cursor-ew-resize",
    shape.value.bg,
    props.disabled && "pointer-events-none opacity-50",
    props.class
  )
);

const handleLineColor = computed(() =>
  isFocused.value
    ? "var(--foreground)"
    : isHovered.value
      ? "color-mix(in srgb, var(--foreground) 50%, transparent)"
      : "color-mix(in srgb, var(--foreground) 25%, transparent)"
);

const activeColor = computed(() =>
  isActive.value ? "var(--foreground)" : "var(--muted-foreground)"
);
</script>

<template>
  <div
    class="relative w-full touch-none"
    @pointerenter="
      () => {
        if (!disabled) isHovered = true;
      }
    "
    @pointerleave="
      () => {
        if (!disabled) {
          isHovered = false;
          hoverPreview = null;
        }
      }
    "
    @mousemove="handleMouseMove"
  >
    <!-- 扩大的命中区域——每边超出 8px -->
    <div
      class="absolute cursor-ew-resize"
      :style="{ left: '-8px', right: '-8px', top: 0, bottom: 0 }"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    />
    <!-- 悬停值 tooltip——在 overflow-hidden 容器之外 -->
    <AnimatePresence>
      <motion.div
        v-if="hoverPreview && showHoverTooltip && !isPressed"
        key="hover-tooltip"
        class="pointer-events-none absolute z-20 -translate-x-1/2"
        :initial="{ opacity: 0, y: 4 }"
        :animate="{ opacity: 1, y: 0 }"
        :exit="{ opacity: 0, y: 4, transition: spring.fast.exit }"
        :transition="spring.fast"
        :style="{ left: `${hoverPreview.cursorX}px`, top: '-30px' }"
      >
        <span
          :class="
            cn(
              'whitespace-nowrap bg-foreground px-2 py-1 text-[12px] tabular-nums text-background',
              shape.bg
            )
          "
          :style="{ fontVariationSettings: fontWeights.medium }"
        >
          {{ formatValue(hoverPreview.snappedValue) }}
        </span>
      </motion.div>
    </AnimatePresence>

    <motion.div
      :ref="setContainerRef"
      :class="boxClass"
      :initial="false"
      :animate="{
        outline: isFocused
          ? '1px solid var(--focus-ring, #6B97FF)'
          : '1px solid transparent',
      }"
      :transition="spring.fast"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    >
      <!-- 不可见的 reka slider 提供键盘导航 + a11y -->
      <SliderRoot
        :model-value="[value]"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        class="pointer-events-none absolute inset-0 opacity-0 [&_*]:pointer-events-none"
        @update:model-value="handleRadixChange"
      >
        <SliderTrack class="h-full w-full">
          <SliderRange />
        </SliderTrack>
        <SliderThumb
          :aria-label="label"
          class="block outline-none"
          @focus="handleThumbFocus"
          @blur="handleThumbBlur"
        />
      </SliderRoot>

      <!-- 悬停预览 -->
      <motion.div
        class="pointer-events-none absolute inset-y-0 z-[3]"
        :initial="false"
        :animate="{ opacity: hoverPreview && !isPressed ? 1 : 0 }"
        :transition="{ opacity: { duration: 0.15 } }"
        :style="{
          left: `${hoverPreview ? hoverPreview.left : 0}px`,
          width: `${hoverPreview ? hoverPreview.width : 0}px`,
          backgroundColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
        }"
      />

      <!-- Pips：点层 — z-[1] -->
      <motion.div
        v-if="variant === 'pips'"
        class="pointer-events-none absolute inset-0 z-[1] flex items-center justify-between px-3"
        :style="({
          WebkitMaskImage: pipsMaskStyle,
          maskImage: pipsMaskStyle,
        } as any)"
      >
        <div
          v-for="pipValue in pipSteps"
          :key="pipValue"
          class="relative flex items-center justify-center"
          :style="{ width: `${PIP_SIZE}px`, height: `${PIP_SIZE}px` }"
        >
          <motion.div
            class="rounded-full"
            :initial="false"
            :animate="{
              backgroundColor: pipValue === value ? 'var(--foreground)' : 'var(--muted-foreground)',
              opacity: pipValue === value ? 1 : 0.3,
            }"
            :transition="spring.fast"
            :style="{ width: `${PIP_SIZE}px`, height: `${PIP_SIZE}px` }"
          />
        </div>
      </motion.div>

      <!-- Pips：标签 + 值的背景层 — z-[2]（遮挡文本后面的点） -->
      <div
        v-if="variant === 'pips'"
        class="pointer-events-none absolute inset-0 z-[2] flex items-center px-2"
        aria-hidden="true"
      >
        <span
          v-if="label"
          class="select-none bg-background px-2 text-[13px] text-transparent"
        >
          {{ label }}
        </span>
        <span
          class="ml-auto select-none bg-background px-2 text-[13px] tabular-nums text-transparent"
          :style="{ minWidth: `${String(formatValue(max)).length}ch` }"
        >
          {{ formatValue(value) }}
        </span>
      </div>

      <!-- Pips：填充 — z-[3] -->
      <motion.div
        v-if="variant === 'pips'"
        class="pointer-events-none absolute bottom-0 left-0 top-0 z-[3]"
        :style="{
          width: pipsFillWidthStyle,
          backgroundColor: 'var(--active)',
        }"
      />

      <!-- Pips：手柄线 — z-[3] -->
      <motion.div
        v-if="variant === 'pips'"
        class="pointer-events-none absolute z-[3] rounded-full"
        :initial="false"
        :animate="{
          top: isActive ? 7 : 8,
          bottom: isActive ? 7 : 8,
          backgroundColor: handleLineColor,
        }"
        :transition="spring.fast"
        :style="{
          left: pipsHandleLineLeftStyle,
          width: '2px',
        }"
      />

      <!-- Pips：标签 + 值文本层 — z-[4] -->
      <div
        v-if="variant === 'pips'"
        class="pointer-events-none absolute inset-0 z-[4] flex items-center px-2"
      >
        <motion.span
          v-if="label"
          class="px-2 text-[13px]"
          :initial="false"
          :animate="{ color: activeColor }"
          :transition="spring.fast"
        >
          {{ label }}
        </motion.span>
        <motion.span
          class="ml-auto px-2 text-[13px] tabular-nums"
          :initial="false"
          :animate="{ color: activeColor }"
          :transition="spring.fast"
          :style="{
            minWidth: `${String(formatValue(max)).length}ch`,
            textAlign: 'right',
          }"
        >
          {{ formatValue(value) }}
        </motion.span>
      </div>

      <!-- Scrubber：填充 -->
      <motion.div
        v-if="variant === 'scrubber'"
        class="pointer-events-none absolute bottom-0 left-0 top-0"
        :style="{
          width: fillWidthStyle,
          backgroundColor: 'var(--active)',
        }"
      />

      <!-- Scrubber：手柄线 -->
      <motion.div
        v-if="variant === 'scrubber'"
        class="pointer-events-none absolute z-10 rounded-full"
        :initial="false"
        :animate="{
          top: isActive ? 7 : 8,
          bottom: isActive ? 7 : 8,
          backgroundColor: handleLineColor,
        }"
        :transition="spring.fast"
        :style="{
          left: handleLineLeftStyle,
          width: '2px',
        }"
      />

      <!-- Scrubber：标签 -->
      <motion.span
        v-if="variant === 'scrubber' && label"
        class="z-10 shrink-0 text-[13px]"
        :initial="false"
        :animate="{ color: activeColor }"
        :transition="spring.fast"
      >
        {{ label }}
      </motion.span>

      <!-- Scrubber：flex-1 占位 + 值 -->
      <template v-if="variant === 'scrubber'">
        <div class="flex-1" />
        <motion.span
          class="z-10 shrink-0 text-right text-[13px] tabular-nums"
          :initial="false"
          :animate="{ color: activeColor }"
          :transition="spring.fast"
          :style="{ minWidth: `${String(formatValue(max)).length}ch` }"
        >
          {{ formatValue(value) }}
        </motion.span>
      </template>

      <!-- 拖拽手柄（仅 scrubber） -->
      <motion.div
        v-if="variant === 'scrubber'"
        class="absolute bottom-0 top-0 z-20 w-2 cursor-ew-resize"
        :style="{ left: handleLeftStyle }"
        @pointerdown="handleResizePointerDown"
        @pointermove="handleResizePointerMove"
        @pointerup="handleResizePointerUp"
        @pointercancel="handleResizePointerUp"
      />
    </motion.div>
  </div>
</template>
