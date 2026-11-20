<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch
} from 'vue';
import { animate, useReducedMotion, type AnimationPlaybackControls } from 'motion-v';
import { cn } from '@/lib/utils';

// Drag detection & rubber band constants
const CLICK_THRESHOLD = 3;
const DEAD_ZONE = 32;
const MAX_CURSOR_RANGE = 200;
const MAX_STRETCH = 8;

// Layout offsets used by the "handle dodges label/value" calculation
const HANDLE_BUFFER = 8;
const LABEL_OFFSET = 12 + 4;
const VALUE_OFFSET = 12 - 8;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function decimalsForStep(step: number): number {
  const s = step.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

function roundValue(val: number, step: number): number {
  const raw = Math.round(val / step) * step;
  return parseFloat(raw.toFixed(decimalsForStep(step)));
}

// Magnetic snap to the nearest decile when within 3.125% of it
function snapToDecile(rawValue: number, min: number, max: number): number {
  const normalized = (rawValue - min) / (max - min);
  const nearest = Math.round(normalized * 10) / 10;
  if (Math.abs(normalized - nearest) <= 0.03125) {
    return min + nearest * (max - min);
  }
  return rawValue;
}

import type { SliderProps } from './types';

const props = withDefaults(defineProps<SliderProps>(), {
  label: '',
  modelValue: undefined,
  value: undefined,
  defaultValue: undefined,
  min: 0,
  max: 100,
  step: 1,
  formatValue: undefined,
  showValue: true,
  hideFill: false,
  trackStyle: undefined,
  thumbColor: undefined,
  thumbBorderColor: undefined,
  disabled: false,
  class: undefined,
  className: '',
  ariaLabel: undefined
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
  'update:value': [value: number];
  'change': [value: number];
}>();

const shouldReduceMotion = useReducedMotion();

// Resolve active value
const innerValue = ref<number>(
  props.modelValue ?? props.value ?? props.defaultValue ?? props.min
);

const currentValue = computed(() => {
  return props.modelValue ?? props.value ?? innerValue.value;
});

const percentage = computed(() => {
  const range = props.max - props.min;
  if (range <= 0) return 0;
  return clamp(((currentValue.value - props.min) / range) * 100, 0, 100);
});

// UI & interaction state
const wrapperRef = ref<HTMLDivElement | null>(null);
const trackRef = ref<HTMLDivElement | null>(null);
const labelRef = ref<HTMLSpanElement | null>(null);
const valueRef = ref<HTMLSpanElement | null>(null);

const isInteracting = ref(false);
const isDragging = ref(false);
const isHovered = ref(false);
const keyboardFocusRing = ref(false);

const pointerDownPos = ref<{ x: number; y: number } | null>(null);
const isClick = ref(true);
const pendingPointerFocus = ref(false);
const wrapperRect = ref<DOMRect | null>(null);
const scale = ref(1);

// Animated values
const fillPercent = ref(percentage.value);
const rubberStretch = ref(0);
let fillAnim: AnimationPlaybackControls | null = null;
let rubberAnim: AnimationPlaybackControls | null = null;

// Keep fillPercent in sync with props when not dragging
watch(percentage, (newPct) => {
  if (!isInteracting.value && !fillAnim) {
    fillPercent.value = newPct;
  }
});

const isActive = computed(() => isInteracting.value || isHovered.value);

const displayValue = computed(() => {
  if (props.formatValue) return props.formatValue(currentValue.value);
  return currentValue.value.toFixed(decimalsForStep(props.step));
});

// Dodge calculation
const dodge = ref({ left: 38, right: 72 });
const valueDodge = computed(() => {
  if (!props.label && !props.showValue) return false;
  return fillPercent.value < dodge.value.left || fillPercent.value > dodge.value.right;
});

const handleOpacity = computed(() => {
  if (props.thumbColor) return 1; // Always visible if custom thumb color specified
  if (!isActive.value) return 0;
  if (valueDodge.value) return 0.15;
  if (isDragging.value) return 0.85;
  return 0.55;
});

const positionToValue = (clientX: number): number => {
  const rect = wrapperRect.value;
  if (!rect) return props.min;

  const sceneX = (clientX - rect.left) / scale.value;
  const nativeWidth = wrapperRef.value?.offsetWidth ?? rect.width;
  const pct = clamp(sceneX / nativeWidth, 0, 1);

  return clamp(props.min + pct * (props.max - props.min), props.min, props.max);
};

const percentFromValue = (v: number): number => {
  const range = props.max - props.min;
  if (range <= 0) return 0;
  return clamp(((v - props.min) / range) * 100, 0, 100);
};

const emitValue = (val: number) => {
  innerValue.value = val;
  emit('update:modelValue', val);
  emit('update:value', val);
  emit('change', val);
};

const animateFillTo = (targetPercent: number) => {
  fillAnim?.stop();
  fillAnim = null;

  if (shouldReduceMotion.value) {
    fillPercent.value = targetPercent;
    return;
  }

  fillAnim = animate(fillPercent.value, targetPercent, {
    type: 'spring',
    stiffness: 320,
    damping: 26,
    mass: 0.8,
    onUpdate: (latest) => {
      fillPercent.value = latest;
    },
    onComplete: () => {
      fillAnim = null;
    }
  });
};

const computeRubberStretch = (clientX: number, sign: number): number => {
  const rect = wrapperRect.value;
  if (!rect) return 0;

  const distancePast = sign < 0 ? rect.left - clientX : clientX - rect.right;
  const overflow = Math.max(0, distancePast - DEAD_ZONE);

  return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1));
};

const onPointerDown = (e: PointerEvent) => {
  if (props.disabled) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

  pointerDownPos.value = { x: e.clientX, y: e.clientY };
  isClick.value = true;
  isInteracting.value = true;
  pendingPointerFocus.value = true;
  keyboardFocusRing.value = false;

  trackRef.value?.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    pendingPointerFocus.value = false;
  });

  const wrapper = wrapperRef.value;
  if (wrapper) {
    const rect = wrapper.getBoundingClientRect();
    wrapperRect.value = rect;
    scale.value = rect.width / wrapper.offsetWidth || 1;
  }
};

const onPointerMove = (e: PointerEvent) => {
  if (!isInteracting.value || !pointerDownPos.value || props.disabled) return;

  const dx = e.clientX - pointerDownPos.value.x;
  const dy = e.clientY - pointerDownPos.value.y;

  if (isClick.value && Math.hypot(dx, dy) > CLICK_THRESHOLD) {
    isClick.value = false;
    isDragging.value = true;
  }

  if (isClick.value) return;

  const rect = wrapperRect.value;
  if (rect && !shouldReduceMotion.value) {
    if (e.clientX < rect.left) {
      rubberStretch.value = computeRubberStretch(e.clientX, -1);
    } else if (e.clientX > rect.right) {
      rubberStretch.value = computeRubberStretch(e.clientX, 1);
    } else {
      rubberStretch.value = 0;
    }
  }

  const rawVal = positionToValue(e.clientX);
  fillAnim?.stop();
  fillAnim = null;

  const snapped = roundValue(rawVal, props.step);
  fillPercent.value = percentFromValue(snapped);
  emitValue(snapped);
};

const onPointerUp = (e: PointerEvent) => {
  if (!isInteracting.value || props.disabled) return;

  try {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {
    // Ignore if already released
  }

  if (isClick.value) {
    const rawVal = positionToValue(e.clientX);
    const discreteSteps = (props.max - props.min) / props.step;
    const snapped =
      discreteSteps <= 10
        ? clamp(props.min + Math.round((rawVal - props.min) / props.step) * props.step, props.min, props.max)
        : snapToDecile(rawVal, props.min, props.max);

    const rounded = roundValue(snapped, props.step);
    animateFillTo(percentFromValue(rounded));
    emitValue(rounded);
  }

  if (!shouldReduceMotion.value && rubberStretch.value !== 0) {
    rubberAnim?.stop();
    rubberAnim = animate(rubberStretch.value, 0, {
      type: 'spring',
      stiffness: 400,
      damping: 28,
      onUpdate: (v) => {
        rubberStretch.value = v;
      },
      onComplete: () => {
        rubberAnim = null;
      }
    });
  } else {
    rubberStretch.value = 0;
  }

  isInteracting.value = false;
  isDragging.value = false;
  pointerDownPos.value = null;
};

const onKeyDown = (e: KeyboardEvent) => {
  if (props.disabled) return;
  const arrowStep = e.shiftKey ? props.step * 10 : props.step;
  let next: number | null = null;

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = currentValue.value + arrowStep;
      break;
    case 'ArrowLeft':
    case 'ArrowDown':
      next = currentValue.value - arrowStep;
      break;
    case 'Home':
      next = props.min;
      break;
    case 'End':
      next = props.max;
      break;
    default:
      return;
  }

  e.preventDefault();
  keyboardFocusRing.value = true;

  const snapped = roundValue(clamp(next, props.min, props.max), props.step);
  animateFillTo(percentFromValue(snapped));
  emitValue(snapped);
};

// Measure label & value to update dodge boundaries
let resizeObserver: ResizeObserver | null = null;
const measureDodge = () => {
  const wrapper = wrapperRef.value;
  if (!wrapper) return;
  const trackWidth = wrapper.offsetWidth;
  if (trackWidth <= 0) return;

  const labelEl = labelRef.value;
  const valEl = valueRef.value;

  const left = labelEl ? ((LABEL_OFFSET + labelEl.offsetWidth + HANDLE_BUFFER) / trackWidth) * 100 : 38;
  const right = valEl ? ((trackWidth - VALUE_OFFSET - valEl.offsetWidth - HANDLE_BUFFER) / trackWidth) * 100 : 72;

  dodge.value = { left, right };
};

onMounted(() => {
  nextTick(() => {
    measureDodge();
    if (typeof ResizeObserver !== 'undefined' && wrapperRef.value) {
      resizeObserver = new ResizeObserver(measureDodge);
      resizeObserver.observe(wrapperRef.value);
      if (labelRef.value) resizeObserver.observe(labelRef.value);
      if (valueRef.value) resizeObserver.observe(valueRef.value);
    }
  });
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  fillAnim?.stop();
  rubberAnim?.stop();
});

const discreteSteps = computed(() => (props.max - props.min) / props.step);
const hashMarkCount = computed(() => (discreteSteps.value <= 10 ? Math.max(0, discreteSteps.value - 1) : 9));
const hashMarkPct = (i: number) => {
  return discreteSteps.value <= 10
    ? (((i + 1) * props.step) / (props.max - props.min)) * 100
    : (i + 1) * 10;
};
</script>

<template>
  <div
    ref="wrapperRef"
    data-slot="elastic-slider"
    :class="cn(
      'relative h-9 select-none w-full',
      disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
      props.class,
      className
    )"
  >
    <div
      ref="trackRef"
      role="slider"
      :tabindex="disabled ? -1 : 0"
      data-slot="elastic-slider-track"
      :data-active="isActive"
      :data-focus-visible="keyboardFocusRing"
      :aria-label="ariaLabel ?? label"
      aria-orientation="horizontal"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="currentValue"
      :aria-valuetext="displayValue"
      class="group/elastic-slider absolute inset-0 cursor-pointer touch-none overflow-hidden rounded-lg bg-muted outline-none transition-[box-shadow] duration-150 data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-ring/50 data-[focus-visible=true]:ring-offset-1 data-[focus-visible=true]:ring-offset-background"
      :style="[
        trackStyle,
        {
          width: rubberStretch !== 0 ? `calc(100% + ${Math.abs(rubberStretch)}px)` : '100%',
          transform: rubberStretch < 0 ? `translateX(${rubberStretch}px)` : undefined
        }
      ]"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @focus="() => { if (!pendingPointerFocus) keyboardFocusRing = true; }"
      @blur="() => keyboardFocusRing = false"
      @keydown="onKeyDown"
      @mouseenter="() => isHovered = true"
      @mouseleave="() => isHovered = false"
    >
      <!-- Discrete hash marks -->
      <div
        v-if="!hideFill && !trackStyle"
        data-slot="elastic-slider-hash-marks"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0"
      >
        <div
          v-for="(_, i) in hashMarkCount"
          :key="i"
          class="absolute top-1/2 h-2 w-px -translate-y-1/2 -translate-x-1/2 rounded-full transition-colors duration-200 bg-transparent group-data-[active=true]/elastic-slider:bg-muted-foreground/30"
          :style="{ left: `${hashMarkPct(i)}%` }"
        />
      </div>

      <!-- Active fill bar -->
      <div
        v-if="!hideFill"
        data-slot="elastic-slider-fill"
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 left-0 transition-colors bg-muted-foreground/15 group-data-[active=true]/elastic-slider:bg-muted-foreground/25"
        :style="{ width: `${fillPercent}%` }"
      />

      <!-- Handle thumb with dodging opacity / scaling -->
      <div
        data-slot="elastic-slider-handle"
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 h-5 w-1 rounded-full transition-[opacity,transform] duration-150"
        :class="[
          thumbColor ? '' : 'bg-foreground',
          valueDodge && isActive ? 'scale-y-75' : 'scale-y-100',
          isActive ? 'scale-x-100' : 'scale-x-[0.3]'
        ]"
        :style="{
          left: `max(4px, calc(${fillPercent}% - 8px))`,
          transform: 'translateY(-50%)',
          backgroundColor: thumbColor,
          border: thumbBorderColor ? `1px solid ${thumbBorderColor}` : undefined,
          opacity: handleOpacity
        }"
      />

      <!-- Label inside track -->
      <span
        v-if="label"
        ref="labelRef"
        data-slot="elastic-slider-label"
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 inline-flex items-center text-xs font-medium text-muted-foreground transition-colors"
      >
        {{ label }}
      </span>

      <!-- Display value inside track -->
      <span
        v-if="showValue"
        ref="valueRef"
        data-slot="elastic-slider-value"
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs font-medium text-muted-foreground transition-colors group-data-[active=true]/elastic-slider:text-foreground"
      >
        {{ displayValue }}
      </span>
    </div>
  </div>
</template>
