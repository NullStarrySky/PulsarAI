<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";

// ─── ColorInput ──────────────────────────────────────────────────────────
// 通道输入。scrubbable=true 时支持指针水平拖动连续调值（光标捕获，
// 移动实时提交）——替代 Base UI NumberField 的 ScrubArea；点击（无拖动）
// 进入编辑态。否则是草稿式文本输入（hex 等）：失焦或 Enter 提交，
// Escape 还原。方向键 ±nudge（Shift 大步）。

const props = withDefaults(
  defineProps<{
    value: string;
    ariaLabel: string;
    width?: string;
    align?: "left" | "center" | "right";
    prefix?: string;
    inputMode?: "numeric" | "decimal" | "text";
    nudgeStep?: number;
    nudgeShiftStep?: number;
    hasPercent?: boolean;
    decimals?: number;
    scrubbable?: boolean;
    min?: number;
    max?: number;
    /** true 且带 min/max 时回绕（取模）而不是钳制——色相角度用。 */
    wrap?: boolean;
    class?: string;
  }>(),
  {
    align: "left",
    inputMode: "text",
    hasPercent: false,
    scrubbable: false,
    wrap: false,
  }
);

const emit = defineEmits<{
  (e: "commit", next: string): void;
}>();

defineOptions({ name: "ColorInput", inheritAttrs: false });

const shape = useShape();
const sizeClasses = useSize();
const compact = computed(() => sizeClasses.value.variant === "compact");
const inputRef = ref<HTMLInputElement | null>(null);

function formatNumber(n: number) {
  return props.decimals != null ? n.toFixed(props.decimals) : String(Math.round(n));
}

function bound(n: number) {
  let out = n;
  if (props.wrap && props.min != null && props.max != null) {
    const range = props.max - props.min;
    out = ((((out - props.min) % range) + range) % range) + props.min;
  } else {
    if (props.min != null) out = Math.max(props.min, out);
    if (props.max != null) out = Math.min(props.max, out);
  }
  return out;
}

function commitNumber(n: number) {
  const formatted = formatNumber(bound(n));
  const withSuffix = props.hasPercent ? `${formatted}%` : formatted;
  emit("commit", withSuffix);
}

function nudge(direction: 1 | -1, shift: boolean) {
  const baseStep = shift ? (props.nudgeShiftStep ?? 10) : (props.nudgeStep ?? 1);
  const cur = parseFloat(props.value.replace("%", ""));
  if (Number.isNaN(cur)) return;
  commitNumber(cur + direction * baseStep);
}

// ── 草稿模式（非 scrub）──
const draft = ref(props.value);
const interacting = ref(false);
watch(
  () => props.value,
  (v) => {
    if (!interacting.value) draft.value = v;
  }
);

function commitDraft() {
  if (draft.value !== props.value) {
    if (props.inputMode !== "text") {
      const numeric = parseFloat(draft.value.replace("%", ""));
      if (!Number.isNaN(numeric) && (props.min != null || props.max != null)) {
        commitNumber(numeric);
        return;
      }
    }
    emit("commit", draft.value);
  } else draft.value = props.value;
}

// ── scrub 模式 ──
const isScrubNumeric = computed(() => props.scrubbable && props.inputMode !== "text");
const editing = ref(false);
let scrubbing = false;
let moved = false;
let startValue = 0;
let startPointerX = 0;

const numeric = computed(() => {
  if (!isScrubNumeric.value) return NaN;
  return parseFloat(props.value.replace("%", ""));
});

function displayValue(): string {
  if (!isScrubNumeric.value) return props.value;
  const n = numeric.value;
  if (Number.isNaN(n)) return props.value;
  return props.hasPercent ? `${formatNumber(n)}%` : formatNumber(n);
}

function onScrubPointerDown(e: PointerEvent) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  scrubbing = true;
  moved = false;
  startValue = numeric.value;
  startPointerX = e.clientX;
  inputRef.value?.setPointerCapture(e.pointerId);
}

function onScrubPointerMove(e: PointerEvent) {
  if (!scrubbing) return;
  if (Math.abs(e.clientX - startPointerX) > 2) moved = true;
  if (!moved) return;
  const step = e.shiftKey ? (props.nudgeShiftStep ?? 10) / 10 : (props.nudgeStep ?? 1) / 10;
  commitNumber(startValue + (e.clientX - startPointerX) * step);
}

function onScrubPointerUp() {
  if (!scrubbing) return;
  scrubbing = false;
  if (!moved) {
    // 无拖动的按压 = 进入编辑态（聚焦 + 全选）。
    editing.value = true;
    draft.value = displayValue();
    requestAnimationFrame(() => {
      inputRef.value?.focus();
      inputRef.value?.select();
    });
  } else {
    inputRef.value?.blur();
  }
}

function onInputFocus(e: FocusEvent) {
  if (props.scrubbable) {
    if (scrubbing) return;
    editing.value = true;
    draft.value = displayValue();
  } else {
    interacting.value = true;
  }
  (e.currentTarget as HTMLInputElement).select();
}

function onInputBlur() {
  if (props.scrubbable) {
    editing.value = false;
    if (draft.value !== displayValue()) commitDraft();
  } else {
    interacting.value = false;
    commitDraft();
  }
}

function onKeyDownInner(e: KeyboardEvent) {
  if (e.key === "Enter") {
    (e.currentTarget as HTMLInputElement).blur();
  } else if (e.key === "Escape") {
    draft.value = props.value;
    (e.currentTarget as HTMLInputElement).blur();
  } else if (
    (props.nudgeStep != null || props.nudgeShiftStep != null) &&
    (e.key === "ArrowUp" || e.key === "ArrowDown")
  ) {
    e.preventDefault();
    nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
  }
}

const wrapperClass = computed(() =>
  cn(
    "flex select-none items-center bg-transparent px-2 transition-colors duration-80 hover:bg-hover active:bg-active focus-within:ring-1 focus-within:ring-[color:var(--focus-ring,#6B97FF)]",
    sizeClasses.value.control,
    props.scrubbable && !editing.value && "cursor-ew-resize",
    shape.value.input,
    props.class
  )
);

const inputClass = computed(() =>
  cn(
    "min-w-0 flex-1 bg-transparent tabular-nums font-mono text-foreground outline-none",
    sizeClasses.value.text,
    props.align === "center" && "text-center",
    props.align === "right" && "text-right",
    props.scrubbable && !editing.value && "pointer-events-none"
  )
);

const display = computed(() => (props.scrubbable ? displayValue() : draft.value));
</script>

<template>
  <div
    :class="wrapperClass"
    :style="{ width: props.width }"
    v-bind="props.scrubbable
      ? {
          onPointerdown: onScrubPointerDown,
          onPointermove: onScrubPointerMove,
          onPointerup: onScrubPointerUp,
          onPointercancel: onScrubPointerUp,
        }
      : {}"
  >
    <span
      v-if="prefix"
      :class="
        cn('mr-1 select-none text-muted-foreground', compact ? 'text-[11px]' : 'text-[12px]')
      "
    >
      {{ prefix }}
    </span>
    <input
      ref="inputRef"
      :value="display"
      :input-mode="inputMode"
      :aria-label="ariaLabel"
      :class="inputClass"
      :style="{ fontVariationSettings: fontWeights.medium }"
      @input="
        props.scrubbable
          ? (draft = ($event.target as HTMLInputElement).value)
          : (draft = ($event.target as HTMLInputElement).value)
      "
      @focus="onInputFocus"
      @blur="onInputBlur"
      @keydown="onKeyDownInner"
    />
  </div>
</template>
