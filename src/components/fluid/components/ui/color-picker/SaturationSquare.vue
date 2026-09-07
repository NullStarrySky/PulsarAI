<script setup lang="ts">
import { computed, ref } from "vue";
import { cn } from "../../../lib/utils";
import { useShape } from "../../../lib/shape-context";
import { clamp01, hsvToRgb } from "./color-math";

// ─── SaturationSquare ────────────────────────────────────────────────────
// 饱和度 × 明度方区：底层是「黑→透明」与「白→纯色」两组渐变叠加；
// 拖拽更新 (s, v)。悬停显示幽灵光标圆环；支持方向键微调（Shift 大步）。

const props = defineProps<{
  h: number;
  s: number;
  v: number;
}>();

const emit = defineEmits<{
  (e: "change", s: number, v: number): void;
}>();

defineOptions({ name: "SaturationSquare" });

const SQUARE_HEIGHT = 156;

const refEl = ref<HTMLDivElement | null>(null);
const dragging = ref(false);
const focused = ref(false);
const hovered = ref(false);
const cursorPos = ref<{ x: number; y: number } | null>(null);
const shape = useShape();

function updateFromPointer(clientX: number, clientY: number) {
  const rect = refEl.value?.getBoundingClientRect();
  if (!rect) return;
  const x = clamp01((clientX - rect.left) / rect.width);
  const y = clamp01((clientY - rect.top) / rect.height);
  emit("change", x, 1 - y);
}

function updateCursorPos(clientX: number, clientY: number) {
  const rect = refEl.value?.getBoundingClientRect();
  if (!rect) return;
  cursorPos.value = {
    x: clamp01((clientX - rect.left) / rect.width) * 100,
    y: clamp01((clientY - rect.top) / rect.height) * 100,
  };
}

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  dragging.value = true;
  refEl.value?.setPointerCapture(e.pointerId);
  updateFromPointer(e.clientX, e.clientY);
}

function onPointerMove(e: PointerEvent) {
  updateCursorPos(e.clientX, e.clientY);
  if (!dragging.value) return;
  updateFromPointer(e.clientX, e.clientY);
}

function onPointerUp(e: PointerEvent) {
  dragging.value = false;
  if (refEl.value?.hasPointerCapture(e.pointerId)) {
    refEl.value?.releasePointerCapture(e.pointerId);
  }
}

function onKeyDown(e: KeyboardEvent) {
  const step = e.shiftKey ? 0.1 : 0.01;
  let nextS = props.s, nextV = props.v, handled = true;
  if (e.key === "ArrowLeft") nextS = clamp01(props.s - step);
  else if (e.key === "ArrowRight") nextS = clamp01(props.s + step);
  else if (e.key === "ArrowUp") nextV = clamp01(props.v + step);
  else if (e.key === "ArrowDown") nextV = clamp01(props.v - step);
  else handled = false;
  if (handled) {
    e.preventDefault();
    emit("change", nextS, nextV);
  }
}

const thumbColor = computed(() => {
  const c = hsvToRgb(props.h, props.s, props.v);
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
});

const innerRadius = computed(() =>
  shape.value.bg === "rounded-[20px]" ? "rounded-2xl" : shape.value.bg
);

const gradientStyle = computed(() => ({
  background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${props.h}, 100%, 50%))`,
}));
</script>

<template>
  <div
    ref="refEl"
    role="application"
    aria-label="饱和度与明度"
    tabindex="0"
    :class="cn('relative w-full cursor-none select-none touch-none outline-none', shape.bg)"
    :style="{
      height: `${SQUARE_HEIGHT}px`,
      boxShadow: focused ? '0 0 0 2px var(--focus-ring, #6B97FF)' : undefined,
    }"
    @focus="(e: FocusEvent) => { if ((e.currentTarget as HTMLElement).matches(':focus-visible')) focused = true; }"
    @blur="focused = false"
    @pointerenter="hovered = true"
    @pointerleave="
      () => {
        hovered = false;
        cursorPos = null;
      }
    "
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKeyDown"
  >
    <div
      :class="cn('absolute inset-0 overflow-hidden', innerRadius)"
      :style="gradientStyle"
    />
    <div
      class="pointer-events-none absolute rounded-full"
      :style="{
        left: `${s * 100}%`,
        top: `${(1 - v) * 100}%`,
        width: '18px',
        height: '18px',
        transform: 'translate(-50%, -50%)',
        border: '1px solid white',
        boxShadow: '0 0 0 1px rgba(0,0,0,1)',
        backgroundColor: thumbColor,
      }"
    />
    <div
      v-if="hovered && !dragging && cursorPos"
      class="pointer-events-none absolute rounded-full"
      :style="{
        left: `${cursorPos.x}%`,
        top: `${cursorPos.y}%`,
        width: '18px',
        height: '18px',
        transform: 'translate(-50%, -50%)',
        border: '2px solid rgba(255, 255, 255, 0.55)',
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.2)',
      }"
    />
  </div>
</template>
