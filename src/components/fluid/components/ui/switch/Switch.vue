<script setup lang="ts">
import { computed, ref, watch, useId, onMounted, type HTMLAttributes } from "vue";
import { motion, useMotionValue, animate } from "motion-v";
import { SwitchRoot, SwitchThumb } from "reka-ui";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useSize, type SizeVariant } from "../../../lib/size-context";
import { usePropPassed } from "../../../lib/prop-passed";

const props = withDefaults(
  defineProps<{
    label?: string;
    checked?: boolean;
    modelValue?: boolean;
    defaultChecked?: boolean;
    onToggle?: () => void;
    disabled?: boolean;
    thumbTransition?: object;
    /** 把开关钉在尺寸阶梯的某一档（见 /docs/sizes）。省略时跟随外围
     *  SizeProvider。兼容 "sm" 别名对应 compact。 */
    size?: SizeVariant | "sm";
    class?: HTMLAttributes["class"];
  }>(),
  { disabled: false }
);

const emit = defineEmits<{
  (e: "update:checked", value: boolean): void;
  (e: "update:modelValue", value: boolean): void;
}>();

const checkedPassed = usePropPassed("checked");
const modelValuePassed = usePropPassed("modelValue");
const isControlled = computed(() => checkedPassed || modelValuePassed);
const internalChecked = ref(props.defaultChecked ?? false);
const isChecked = computed(() => {
  if (modelValuePassed) return !!props.modelValue;
  if (checkedPassed) return !!props.checked;
  return internalChecked.value;
});

function doToggle() {
  const next = !isChecked.value;
  if (!isControlled.value) internalChecked.value = next;
  emit("update:checked", next);
  emit("update:modelValue", next);
  props.onToggle?.();
}

// 每档阶梯的轨道/缩略块几何。悬停 pill 延展与按压压扁随缩略块缩小，
// 紧凑开关保持同样的手感。
const METRICS = {
  default: {
    trackWidth: 34,
    trackHeight: 20,
    thumbSize: 16,
    pillExtend: 2,
    pressExtend: 4,
    pressShrink: 4,
  },
  compact: {
    trackWidth: 28,
    trackHeight: 16,
    thumbSize: 12,
    pillExtend: 2,
    pressExtend: 3,
    pressShrink: 3,
  },
} as const;

const THUMB_OFFSET = 2;
const DRAG_DEAD_ZONE = 2;

const labelId = useId();
const hasMounted = ref(false);
const hovered = ref(false);
const pressed = ref(false);

onMounted(() => {
  hasMounted.value = true;
});
const sizeClasses = useSize(() => (props.size === "sm" ? "compact" : props.size));
const m = computed(() => METRICS[sizeClasses.value.variant]);
const thumbTravel = computed(
  () => m.value.trackWidth - m.value.thumbSize - THUMB_OFFSET * 2
);

// 拖拽 ref（不用状态以避免拖拽期间的重渲染）
let dragging = false;
let didDrag = false;
const pointerStart = ref<{ clientX: number; originX: number } | null>(null);

// 缩略块 x 轴的 motion value
const motionX = useMotionValue(isChecked.value ? THUMB_OFFSET + thumbTravel.value : THUMB_OFFSET);

// 计算缩略块形状
const thumbWidth = computed(() =>
  pressed.value
    ? m.value.thumbSize + m.value.pressExtend
    : hovered.value
      ? m.value.thumbSize + m.value.pillExtend
      : m.value.thumbSize
);
const thumbHeight = computed(() =>
  pressed.value ? m.value.thumbSize - m.value.pressShrink : m.value.thumbSize
);
const thumbY = computed(() =>
  pressed.value ? THUMB_OFFSET + m.value.pressShrink / 2 : THUMB_OFFSET
);
const extraWidth = computed(() => thumbWidth.value - m.value.thumbSize);
const thumbX = computed(() =>
  isChecked.value ? THUMB_OFFSET + thumbTravel.value - extraWidth.value : THUMB_OFFSET
);

// 缩略块形状变化（悬停/按压/选中）且未在拖拽时同步 motionX
watch(
  thumbX,
  () => {
    if (dragging) return;
    if (!hasMounted.value) {
      motionX.set(thumbX.value);
    } else {
      animate(motionX, thumbX.value, props.thumbTransition ?? spring.moderate);
    }
  },
  { immediate: true }
);

// ── 指针处理器 ──────────────────────────────────────────

function handlePointerDown(e: PointerEvent) {
  if (props.disabled) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  pressed.value = true;
  dragging = false;
  didDrag = false;
  pointerStart.value = {
    clientX: e.clientX,
    originX: motionX.get(),
  };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function handlePointerMove(e: PointerEvent) {
  if (!pointerStart.value) return;
  const delta = e.clientX - pointerStart.value.clientX;

  if (!dragging) {
    if (Math.abs(delta) < DRAG_DEAD_ZONE) return;
    dragging = true;
  }

  const dragMin = THUMB_OFFSET;
  const pressedThumbWidth = m.value.thumbSize + m.value.pressExtend;
  const dragMax = m.value.trackWidth - THUMB_OFFSET - pressedThumbWidth;
  const rawX = pointerStart.value.originX + delta;
  motionX.set(Math.max(dragMin, Math.min(dragMax, rawX)));
}

function handlePointerUp() {
  if (!pointerStart.value) return;
  pressed.value = false;

  if (dragging) {
    didDrag = true;
    dragging = false;

    const currentX = motionX.get();
    const dragMin = THUMB_OFFSET;
    const pressedThumbWidth = m.value.thumbSize + m.value.pressExtend;
    const dragMax = m.value.trackWidth - THUMB_OFFSET - pressedThumbWidth;
    const midpoint = (dragMin + dragMax) / 2;

    const shouldBeOn = currentX > midpoint;

    if (shouldBeOn !== isChecked.value) {
      doToggle();
    } else {
      // 弹回当前静止位置（未按压）
      const snapTarget = isChecked.value
        ? THUMB_OFFSET + thumbTravel.value
        : THUMB_OFFSET;
      animate(motionX, snapTarget, props.thumbTransition ?? spring.moderate);
    }

    requestAnimationFrame(() => {
      didDrag = false;
    });
  }

  pointerStart.value = null;
}

function handlePointerCancel() {
  if (!pointerStart.value) return;
  pressed.value = false;

  if (dragging) {
    dragging = false;
    // 手势被系统取消——不切换，直接弹回
    const snapTarget = isChecked.value ? THUMB_OFFSET + thumbTravel.value : THUMB_OFFSET;
    animate(motionX, snapTarget, props.thumbTransition ?? spring.moderate);
  }

  pointerStart.value = null;
}

function handleRootClick() {
  if (props.disabled || didDrag) return;
  doToggle();
}

function handlePointerEnter(e: PointerEvent) {
  if (e.pointerType === "mouse") hovered.value = true;
}

function handleSwitchChange() {
  if (didDrag) return;
  doToggle();
}

const hasLabelOrSlot = computed(() => !!props.label);

const rootClass = computed(() =>
  cn(
    "relative z-10 flex cursor-pointer select-none items-center touch-none",
    hasLabelOrSlot.value
      ? cn(
          sizeClasses.value.gap,
          sizeClasses.value.px,
          sizeClasses.value.variant === "compact" ? "py-1" : "py-2"
        )
      : "inline-flex",
    props.disabled && "pointer-events-none opacity-50",
    props.class
  )
);
</script>

<template>
  <div
    :class="rootClass"
    @pointerenter="handlePointerEnter"
    @pointerleave="hovered = false"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @click="handleRootClick"
  >
    <!-- 开关 -->
    <SwitchRoot
      :model-value="isChecked"
      :aria-labelledby="label ? labelId : undefined"
      :disabled="disabled"
      tabindex="0"
      :class="
        cn(
          'relative shrink-0 cursor-pointer rounded-full outline-none',
          'transition-colors duration-80',
          'focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'
        )
      "
      :style="{
        width: `${m.trackWidth}px`,
        height: `${m.trackHeight}px`,
        backgroundColor: isChecked
          ? hovered
            ? '#5C89F2'
            : '#6B97FF'
          : hovered
            ? 'color-mix(in oklab, var(--accent), rgb(var(--overlay)) 10%)'
            : 'var(--accent)',
      }"
      @update:model-value="handleSwitchChange"
      @click.stop
    >
      <SwitchThumb as-child>
        <motion.span
          class="absolute left-0 top-0 block rounded-full bg-white shadow-sm"
          :initial="false"
          :style="{ x: motionX }"
          :animate="{
            y: thumbY,
            width: thumbWidth,
            height: thumbHeight,
          }"
          :transition="
            hasMounted ? (thumbTransition ?? spring.moderate) : { duration: 0 }
          "
        />
      </SwitchThumb>
    </SwitchRoot>

    <!-- 标签（可选） -->
    <template v-if="$slots.default">
      <span
        :class="
          cn(
            'transition-[color] duration-80',
            sizeClasses.text,
            isChecked ? 'text-foreground' : 'text-muted-foreground'
          )
        "
      >
        <slot />
      </span>
    </template>
    <span
      v-else-if="label"
      :id="labelId"
      :class="
        cn(
          '[text-box:trim-both_cap_alphabetic] transition-[color] duration-80',
          sizeClasses.text,
          isChecked ? 'text-foreground' : 'text-muted-foreground'
        )
      "
    >
      {{ label }}
    </span>
  </div>
</template>
