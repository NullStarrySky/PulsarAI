<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
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
import {
  THUMB_SIZE,
  THUMB_SIZE_REST,
  TRACK_BG_HEIGHT,
  DOT_SIZE,
  TRACK_INSET,
  valueToPixel,
  nearestStepIndex,
  pixelToValue,
} from "./slider-engine";
import { ValueDisplay, TooltipValue } from "./SliderValueParts";

export type SliderValue = number | number[];
export type ValuePosition = "left" | "right" | "top" | "bottom" | "tooltip";

const props = withDefaults(
  defineProps<{
    value: SliderValue;
    min?: number;
    max?: number;
    step?: number;
    /** 离散允许值列表，如 [0.1, 0.5, 0.7, 1.1, 1.3]。
     *  设置后缩略块只吸附到这些值（沿轨道按比例定位），方向键走列表。
     *  `min`/`max` 取自列表两端，`step` 被忽略。 */
    steps?: number[];
    showSteps?: boolean;
    showValue?: boolean;
    valuePosition?: ValuePosition;
    formatValue?: (v: number) => string;
    label?: string;
    disabled?: boolean;
    trackClassName?: string;
    trackStyle?: Record<string, unknown>;
    fillClassName?: string;
    fillStyle?: Record<string, unknown>;
    hideFill?: boolean;
    thumbColor?: string;
    thumbBorderColor?: string;
    class?: string;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    showSteps: false,
    showValue: false,
    valuePosition: "left",
    formatValue: (v: number) => String(v),
    disabled: false,
    hideFill: false,
  }
);

const emit = defineEmits<{
  (e: "update:value", value: SliderValue): void;
}>();

const isRange = computed(() => Array.isArray(props.value) && props.value.length > 1);
const values = computed<number[]>(() => {
  if (Array.isArray(props.value)) {
    return props.value.length > 0 ? [...props.value] : [0];
  }
  return [typeof props.value === "number" ? props.value : 0];
});
const shape = useShape();

// 非均匀步进模式：排序去重后的允许值列表。
const stepValues = computed<number[] | null>(() => {
  if (!props.steps || props.steps.length === 0) return null;
  const parsed = Array.from(new Set(props.steps)).sort((a, b) => a - b);
  return parsed.length > 1 ? parsed : null;
});
const min = computed(() => (stepValues.value ? stepValues.value[0] : props.min));
const max = computed(() =>
  stepValues.value ? stepValues.value[stepValues.value.length - 1] : props.max
);

// ── Refs ──
const trackRef = ref<HTMLDivElement | null>(null);
let trackWidth = 0;
let dragging = false;
let activeDragThumb = 0;

// ── 状态 ──
const isHovered = ref(false);
const isPressed = ref(false);
const editingIndex = ref<number | null>(null);
const hoverPreview = ref<{
  left: number;
  width: number;
  snappedValue: number;
  cursorX: number;
} | null>(null);
const focusedThumb = ref<number | null>(null);
const showHoverTooltip = ref(false);
let hoverDelayTimer: ReturnType<typeof setTimeout> | null = null;

// 100ms 延迟后显示悬停 tooltip
watch(isHovered, (hoveredNow) => {
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer);
    hoverDelayTimer = null;
  }
  if (hoveredNow) {
    hoverDelayTimer = setTimeout(() => (showHoverTooltip.value = true), 100);
  } else {
    showHoverTooltip.value = false;
  }
});

onUnmounted(() => {
  if (hoverDelayTimer) clearTimeout(hoverDelayTimer);
});

// ── Motion values ──
const motionX0 = useMotionValue(0);
const motionX1 = useMotionValue(0);

// 填充的派生 motion values
const fillLeft = useTransform(motionX0, (x) =>
  isRange.value ? x + THUMB_SIZE / 2 - TRACK_INSET : 0
);
const fillWidthSingle = useTransform(motionX0, (x) => x + THUMB_SIZE / 2 - TRACK_INSET);
const fillWidthRange = useTransform([motionX0, motionX1] as [MotionValue<number>, MotionValue<number>], (xs) => {
  const [x0, x1] = xs as unknown as [number, number];
  return x1 - x0;
});
const fillWidth = computed(() => (isRange.value ? fillWidthRange : fillWidthSingle));

// 步进点遮罩（隐藏填充侧的点）
const stepDotsMaskSingle = useTransform(motionX0, (x) => {
  const edge = x + THUMB_SIZE / 2;
  return `linear-gradient(to right, transparent ${edge}px, black ${edge + 2}px)`;
});
const stepDotsMaskRange = useTransform([motionX0, motionX1] as [MotionValue<number>, MotionValue<number>], (xs) => {
  const [x0, x1] = xs as unknown as [number, number];
  const left = x0 + THUMB_SIZE / 2;
  const right = x1 + THUMB_SIZE / 2;
  return `linear-gradient(to right, black ${left - 2}px, transparent ${left}px, transparent ${right}px, black ${right + 2}px)`;
});
const stepDotsMask = computed(() => (isRange.value ? stepDotsMaskRange : stepDotsMaskSingle));

// ── 悬停预览计算 ──
function computeHoverPreview(cursorX: number, width: number) {
  // cursorX 与 width 是布局空间（offsetWidth 相对），不受祖先 CSS transform 影响。
  const usable = width - THUMB_SIZE;
  const rawPx = cursorX - THUMB_SIZE / 2;
  const clampedPx = Math.max(0, Math.min(usable, rawPx));
  const rawVal =
    usable > 0 ? (clampedPx / usable) * (max.value - min.value) + min.value : min.value;
  const snappedVal = stepValues.value
    ? stepValues.value[nearestStepIndex(rawVal, stepValues.value)]
    : Math.max(
        min.value,
        Math.min(max.value, Math.round((rawVal - min.value) / props.step) * props.step + min.value)
      );
  const snappedPercent =
    max.value === min.value ? 0 : (snappedVal - min.value) / (max.value - min.value);
  const snappedX = THUMB_SIZE / 2 + snappedPercent * usable;

  // 找最近的缩略块中心
  const c0 = motionX0.get() + THUMB_SIZE / 2;
  const c1 = motionX1.get() + THUMB_SIZE / 2;
  const nearestIdx = isRange.value
    ? Math.abs(snappedX - c0) <= Math.abs(snappedX - c1)
      ? 0
      : 1
    : 0;
  const nearest = nearestIdx === 0 ? c0 : c1;

  // 极值处把悬停条延伸到轨道边缘，避免缺口
  const edgeX = snappedVal === min.value ? 0 : snappedVal === max.value ? width : snappedX;
  const left = Math.min(nearest, edgeX);
  const widthAbs = Math.abs(edgeX - nearest);
  hoverPreview.value = { left, width: widthAbs, snappedValue: snappedVal, cursorX: snappedX };
}

function handleTrackAreaMouseMove(e: MouseEvent) {
  if (dragging) return;
  const trackEl = trackRef.value;
  if (!trackEl) return;
  const trackRect = trackEl.getBoundingClientRect();
  const layoutWidth = trackEl.offsetWidth;
  if (layoutWidth <= 0 || trackRect.width <= 0) return;
  const scale = trackRect.width / layoutWidth;
  const layoutX = (e.clientX - trackRect.left) / scale;
  const clamped = Math.max(0, Math.min(layoutWidth, layoutX));
  computeHoverPreview(clamped, layoutWidth);
}

function handleTrackAreaLeave() {
  isHovered.value = false;
  hoverPreview.value = null;
}

// ── 首次同步（绘制前）──
let initialSyncDone = false;
const ready = ref(false);
onMounted(() => {
  const el = trackRef.value;
  if (!el || initialSyncDone) return;
  const w = el.offsetWidth;
  trackWidth = w;
  const px0 = valueToPixel(values.value[0], min.value, max.value, w);
  motionX0.set(px0);
  if (isRange.value && values.value[1] !== undefined) {
    const px1 = valueToPixel(values.value[1], min.value, max.value, w);
    motionX1.set(px1);
  }
  initialSyncDone = true;
  ready.value = true;
});

// ── 轨道宽度测量（仅 resize）──
let trackResizeObserver: ResizeObserver | null = null;
onMounted(() => {
  const el = trackRef.value;
  if (!el) return;
  trackResizeObserver = new ResizeObserver(([entry]) => {
    const w = entry.contentRect.width;
    trackWidth = w;
    if (!dragging && initialSyncDone) {
      const v = values.value;
      const px0 = valueToPixel(v[0], min.value, max.value, w);
      animate(motionX0, px0, spring.moderate);
      if (isRange.value && v[1] !== undefined) {
        const px1 = valueToPixel(v[1], min.value, max.value, w);
        animate(motionX1, px1, spring.moderate);
      }
    }
  });
  trackResizeObserver.observe(el);
});
onUnmounted(() => trackResizeObserver?.disconnect());

// ── 值变化时同步 motion values（键盘、程序化）──
watch(
  () => [values.value.join(","), min.value, max.value] as const,
  () => {
    if (!initialSyncDone) return;
    if (dragging) return;
    const tw = trackWidth;
    if (tw <= 0) return;
    const v = values.value;
    const px0 = valueToPixel(v[0], min.value, max.value, tw);
    animate(motionX0, px0, spring.moderate);
    if (isRange.value && v[1] !== undefined) {
      const px1 = valueToPixel(v[1], min.value, max.value, tw);
      animate(motionX1, px1, spring.moderate);
    }
  }
);

// ── 防止 range 交叉 ──
function clampForRange(px: number, thumbIndex: number): number {
  if (!isRange.value) return px;
  if (thumbIndex === 0) {
    return Math.min(px, motionX1.get() - THUMB_SIZE * 0.5);
  }
  return Math.max(px, motionX0.get() + THUMB_SIZE * 0.5);
}

// ── 发出值变化 ──
function emitChange(thumbIndex: number, newValue: number) {
  if (isRange.value) {
    const newValues: [number, number] = [...(props.value as [number, number])];
    newValues[thumbIndex] = newValue;
    emit("update:value", newValues);
  } else {
    emit("update:value", newValue);
  }
}

// ── 轨道指针处理器 ──
function handlePointerDown(e: PointerEvent) {
  if (props.disabled) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  const trackEl = trackRef.value;
  if (!trackEl) return;
  const trackRect = trackEl.getBoundingClientRect();
  const layoutWidth = trackEl.offsetWidth;
  if (layoutWidth <= 0 || trackRect.width <= 0) return;
  // 把光标归一化到布局空间，与 motionX（渲染为 CSS 像素 transform）匹配，
  // 即使祖先有 CSS scale。
  const scale = trackRect.width / layoutWidth;
  const localX = (e.clientX - trackRect.left) / scale - THUMB_SIZE / 2;
  const clamped = Math.max(0, Math.min(layoutWidth - THUMB_SIZE, localX));

  // 判断拖哪个缩略块
  if (isRange.value) {
    const dist0 = Math.abs(clamped - motionX0.get());
    const dist1 = Math.abs(clamped - motionX1.get());
    activeDragThumb = dist0 <= dist1 ? 0 : 1;
  } else {
    activeDragThumb = 0;
  }

  dragging = true;
  isPressed.value = true;

  const motionX = activeDragThumb === 0 ? motionX0 : motionX1;

  // 立即吸附到步进网格
  const snappedValue = pixelToValue(
    clamped,
    min.value,
    max.value,
    props.step,
    layoutWidth,
    stepValues.value
  );
  const snappedPx = valueToPixel(snappedValue, min.value, max.value, layoutWidth);

  const finalPx = clampForRange(snappedPx, activeDragThumb);
  // 弹簧动画到点击位置
  animate(motionX, finalPx, spring.moderate);

  const finalValue = pixelToValue(
    finalPx,
    min.value,
    max.value,
    props.step,
    layoutWidth,
    stepValues.value
  );
  emitChange(activeDragThumb, finalValue);

  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function handlePointerMove(e: PointerEvent) {
  if (!dragging) return;
  e.stopPropagation();
  const trackEl = trackRef.value;
  if (!trackEl) return;
  const trackRect = trackEl.getBoundingClientRect();
  const layoutWidth = trackEl.offsetWidth;
  if (layoutWidth <= 0 || trackRect.width <= 0) return;
  const scale = trackRect.width / layoutWidth;
  const localX = (e.clientX - trackRect.left) / scale - THUMB_SIZE / 2;
  const clamped = Math.max(0, Math.min(layoutWidth - THUMB_SIZE, localX));

  const motionX = activeDragThumb === 0 ? motionX0 : motionX1;

  // 拖拽期间吸附到步进网格
  const snappedValue = pixelToValue(
    clamped,
    min.value,
    max.value,
    props.step,
    layoutWidth,
    stepValues.value
  );
  const snappedPx = valueToPixel(snappedValue, min.value, max.value, layoutWidth);
  const finalPx = clampForRange(snappedPx, activeDragThumb);
  motionX.set(finalPx);

  const finalValue = pixelToValue(
    finalPx,
    min.value,
    max.value,
    props.step,
    layoutWidth,
    stepValues.value
  );
  emitChange(activeDragThumb, finalValue);
}

function handlePointerUp() {
  if (!dragging) return;
  dragging = false;
  isPressed.value = false;
  hoverPreview.value = null;

  // 弹簧落到最终量化位置
  const tw = trackWidth;
  const motionX = activeDragThumb === 0 ? motionX0 : motionX1;
  const currentPx = motionX.get();
  const snapped = pixelToValue(
    currentPx,
    min.value,
    max.value,
    props.step,
    tw,
    stepValues.value
  );
  const snappedPx = valueToPixel(snapped, min.value, max.value, tw);
  animate(motionX, snappedPx, spring.moderate);
}

// ── reka 键盘处理器（steps 模式下以索引运行）──
function handleRadixChange(newValues: number[] | undefined) {
  if (!newValues || dragging) return;
  const mapped = stepValues.value
    ? newValues.map((i) => stepValues.value![Math.round(i)])
    : newValues;
  if (isRange.value) {
    emit("update:value", mapped as [number, number]);
  } else {
    emit("update:value", mapped[0]);
  }
}

// ── 点击编辑 ──
function handleStartEdit(index: number) {
  editingIndex.value = index;
}

function handleCommitEdit(index: number, v: number) {
  emitChange(index, v);
  editingIndex.value = null;
}

function handleCancelEdit() {
  editingIndex.value = null;
}

// ── 步进点 ──
const stepDots = computed(() => {
  if (!props.showSteps) return [];
  if (stepValues.value) {
    return stepValues.value.map((v) => ({
      value: v,
      percent: max.value === min.value ? 0 : (v - min.value) / (max.value - min.value),
    }));
  }
  return Array.from(
    { length: Math.round((max.value - min.value) / props.step) + 1 },
    (_, i) => {
      const v = min.value + i * props.step;
      return { value: v, percent: (v - min.value) / (max.value - min.value) };
    }
  );
});

// ── tooltip 交互状态 ──
const isInteracting = computed(() => isHovered.value || isPressed.value);

// ── 每缩略块可访问名称 ──
function thumbAriaLabel(index: number): string | undefined {
  if (!isRange.value) return props.label;
  if (!props.label) return index === 0 ? "Minimum" : "Maximum";
  return index === 0 ? `${props.label} minimum` : `${props.label} maximum`;
}

// ── 隐形 reka slider 的值 ──
const radixValue = computed(() =>
  stepValues.value
    ? values.value.map((v) => nearestStepIndex(v, stepValues.value!))
    : values.value
);
const radixMin = computed(() => (stepValues.value ? 0 : min.value));
const radixMax = computed(() =>
  stepValues.value ? stepValues.value.length - 1 : max.value
);
const radixStep = computed(() => (stepValues.value ? 1 : props.step));

const rootClass = computed(() =>
  cn(
    "flex w-full select-none touch-none overflow-visible",
    props.valuePosition === "left" || props.valuePosition === "right"
      ? "mb-2 flex-row items-center gap-2"
      : "flex-col",
    props.disabled && "pointer-events-none opacity-50",
    props.class
  )
);

const trackAreaStyle = computed(() => ({
  height: `${
    props.valuePosition === "left" || props.valuePosition === "right"
      ? THUMB_SIZE + 16
      : THUMB_SIZE + (props.valuePosition === "tooltip" ? 16 : 0)
  }px`,
  paddingTop: props.valuePosition === "tooltip" ? "16px" : "0",
}));

const visualTrackStyle = computed(() => ({
  height: `${THUMB_SIZE + 16}px`,
  opacity: ready.value ? 1 : 0,
}));

function handleThumbFocus(index: number, e: FocusEvent) {
  if ((e.currentTarget as HTMLElement).matches(":focus-visible")) {
    focusedThumb.value = index;
  }
}

function handleThumbBlur(index: number) {
  focusedThumb.value = focusedThumb.value === index ? null : focusedThumb.value;
}
</script>

<template>
  <div :class="rootClass">
    <!-- 顶部 / 左侧值 -->
    <ValueDisplay
      v-if="showValue && (valuePosition === 'top' || valuePosition === 'left')"
      :values="values"
      :editing-index="editingIndex"
      :min="min"
      :max="max"
      :step="step"
      :step-values="stepValues"
      :format-value="formatValue"
      :label="label"
      :is-range="isRange"
      :is-interacting="isInteracting"
      @start-edit="handleStartEdit"
      @commit-edit="handleCommitEdit"
      @cancel-edit="handleCancelEdit"
    />

    <!-- 轨道区域 -->
    <div
      class="relative flex-1 overflow-visible"
      :style="trackAreaStyle"
      @pointerenter="isHovered = true"
      @pointerleave="handleTrackAreaLeave"
      @mousemove="handleTrackAreaMouseMove"
    >
      <!-- tooltip 值 -->
      <template v-if="showValue && valuePosition === 'tooltip'">
        <AnimatePresence>
          <TooltipValue
            v-if="isInteracting"
            key="tooltip-0"
            :value="values[0]"
            :format-value="formatValue"
            :motion-x="motionX0"
          />
          <TooltipValue
            v-if="isInteracting && isRange && values[1] !== undefined"
            key="tooltip-1"
            :value="values[1]"
            :format-value="formatValue"
            :motion-x="motionX1"
          />
        </AnimatePresence>
      </template>

      <!-- reka Slider——不可见，提供 ARIA + 键盘导航 -->
      <SliderRoot
        :model-value="radixValue"
        :min="radixMin"
        :max="radixMax"
        :step="radixStep"
        :disabled="disabled"
        class="pointer-events-none absolute inset-0 opacity-0"
        :style="{ height: `${THUMB_SIZE}px` }"
        @update:model-value="handleRadixChange"
      >
        <SliderTrack class="h-full w-full">
          <SliderRange />
        </SliderTrack>
        <SliderThumb
          :aria-label="thumbAriaLabel(0)"
          :aria-valuetext="stepValues ? formatValue(values[0]) : undefined"
          class="block outline-none"
          :style="{ width: `${THUMB_SIZE}px`, height: `${THUMB_SIZE}px` }"
          @focus="handleThumbFocus(0, $event)"
          @blur="handleThumbBlur(0)"
        />
        <SliderThumb
          v-if="isRange"
          :aria-label="thumbAriaLabel(1)"
          :aria-valuetext="stepValues ? formatValue(values[1]) : undefined"
          class="block outline-none"
          :style="{ width: `${THUMB_SIZE}px`, height: `${THUMB_SIZE}px` }"
          @focus="handleThumbFocus(1, $event)"
          @blur="handleThumbBlur(1)"
        />
      </SliderRoot>

      <!-- 带指针处理器的视觉轨道 -->
      <div
        ref="trackRef"
        class="relative w-full cursor-ew-resize py-2"
        :style="visualTrackStyle"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
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
        <!-- 悬停值 tooltip -->
        <AnimatePresence>
          <motion.div
            v-if="hoverPreview && showHoverTooltip && !isPressed && valuePosition !== 'tooltip'"
            key="hover-tooltip"
            class="pointer-events-none absolute z-20 -translate-x-1/2"
            :initial="{ opacity: 0, y: 4 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, y: 4, transition: spring.fast.exit }"
            :transition="spring.fast"
            :style="{ left: `${hoverPreview.cursorX}px`, top: '-20px' }"
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

        <!-- 轨道背景 -->
        <motion.div
          :class="cn('absolute overflow-hidden rounded-full border border-border', trackClassName)"
          :initial="false"
          :animate="{
            height: TRACK_BG_HEIGHT,
            top: 8 + (THUMB_SIZE - TRACK_BG_HEIGHT) / 2,
          }"
          :transition="spring.fast"
          :style="{
            left: `${TRACK_INSET}px`,
            right: `${TRACK_INSET}px`,
            backgroundColor: 'transparent',
            ...trackStyle,
          }"
        >
          <!-- 填充区间 -->
          <motion.div
            v-if="!hideFill"
            :class="cn('absolute h-full bg-selected/50 dark:bg-accent/40', fillClassName)"
            :style="({ left: fillLeft, width: fillWidth, ...fillStyle } as any)"
          />

          <!-- 悬停预览 -->
          <motion.div
            class="pointer-events-none absolute z-[2] h-full"
            :initial="false"
            :animate="{
              opacity: hoverPreview && !isPressed ? 1 : 0,
            }"
            :transition="{ opacity: { duration: 0.15 } }"
            :style="{
              left: `${hoverPreview ? hoverPreview.left - TRACK_INSET : 0}px`,
              width: `${hoverPreview ? hoverPreview.width : 0}px`,
              borderRadius:
                hoverPreview && hoverPreview.cursorX > hoverPreview.left
                  ? '0 9999px 9999px 0'
                  : '9999px 0 0 9999px',
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
            }"
          />
        </motion.div>

        <!-- 步进点——加遮罩，填充侧被隐藏 -->
        <motion.div
          v-if="stepDots.length > 0"
          class="pointer-events-none absolute left-0 right-0"
          :style="({
            top: `${8 + (THUMB_SIZE - TRACK_BG_HEIGHT) / 2}px`,
            height: `${TRACK_BG_HEIGHT}px`,
            WebkitMaskImage: stepDotsMask,
            maskImage: stepDotsMask,
          } as any)"
        >
          <div
            v-for="dot in stepDots"
            :key="dot.value"
            class="pointer-events-none absolute flex items-center justify-center"
            :style="{
              left: `calc(${THUMB_SIZE / 2}px + ${dot.percent} * (100% - ${THUMB_SIZE}px))`,
              top: '50%',
              width: 0,
              height: 0,
            }"
          >
            <motion.div
              class="flex-shrink-0 rounded-full"
              :initial="false"
              :animate="{
                width: isHovered ? DOT_SIZE * 1.25 : DOT_SIZE,
                height: isHovered ? DOT_SIZE * 1.25 : DOT_SIZE,
              }"
              :transition="spring.moderate"
              :style="{
                backgroundColor: 'var(--muted-foreground)',
                opacity: 0.3,
              }"
            />
          </div>
        </motion.div>

        <!-- 视觉缩略块 0 -->
        <motion.span
          class="pointer-events-none absolute left-0 top-1/2 z-10 flex items-center justify-center"
          :initial="false"
          :style="{
            width: `${THUMB_SIZE}px`,
            height: `${THUMB_SIZE}px`,
            marginTop: `${-THUMB_SIZE / 2}px`,
            x: motionX0,
          }"
        >
          <motion.span
            class="block rounded-full"
            :initial="false"
            :animate="{ width: THUMB_SIZE_REST, height: THUMB_SIZE_REST }"
            :transition="spring.fast"
            :style="{
              backgroundColor: thumbColor ?? 'white',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              border: thumbBorderColor ? `1px solid ${thumbBorderColor}` : undefined,
            }"
          />
          <!-- 焦点环 -->
          <motion.span
            class="pointer-events-none absolute rounded-full border border-[color:var(--focus-ring,#6B97FF)]"
            :initial="false"
            :animate="{
              opacity: focusedThumb === 0 ? 1 : 0,
              width: THUMB_SIZE + 4,
              height: THUMB_SIZE + 4,
            }"
            :transition="spring.fast"
          />
        </motion.span>

        <!-- 视觉缩略块 1（range 模式） -->
        <motion.span
          v-if="isRange"
          class="pointer-events-none absolute left-0 top-1/2 z-10 flex items-center justify-center"
          :initial="false"
          :style="{
            width: `${THUMB_SIZE}px`,
            height: `${THUMB_SIZE}px`,
            marginTop: `${-THUMB_SIZE / 2}px`,
            x: motionX1,
          }"
        >
          <motion.span
            class="block rounded-full"
            :initial="false"
            :animate="{ width: THUMB_SIZE_REST, height: THUMB_SIZE_REST }"
            :transition="spring.fast"
            :style="{
              backgroundColor: thumbColor ?? 'white',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              border: thumbBorderColor ? `1px solid ${thumbBorderColor}` : undefined,
            }"
          />
          <motion.span
            class="pointer-events-none absolute rounded-full border border-[color:var(--focus-ring,#6B97FF)]"
            :initial="false"
            :animate="{
              opacity: focusedThumb === 1 ? 1 : 0,
              width: THUMB_SIZE + 4,
              height: THUMB_SIZE + 4,
            }"
            :transition="spring.fast"
          />
        </motion.span>
      </div>
    </div>

    <!-- 底部 / 右侧值 -->
    <ValueDisplay
      v-if="showValue && (valuePosition === 'bottom' || valuePosition === 'right')"
      :values="values"
      :editing-index="editingIndex"
      :min="min"
      :max="max"
      :step="step"
      :step-values="stepValues"
      :format-value="formatValue"
      :label="label"
      :is-range="isRange"
      :is-interacting="isInteracting"
      @start-edit="handleStartEdit"
      @commit-edit="handleCommitEdit"
      @cancel-edit="handleCancelEdit"
    />
  </div>
</template>
