<script setup lang="ts">
import { computed } from "vue";
import type { SizeVariant } from "../../../lib/size-context";
import SliderCompact, { type SliderValue } from "./SliderCompact.vue";
import SliderComfortable from "./SliderComfortable.vue";

const props = defineProps<{
  /** 标准受控值（v-model）。 */
  modelValue?: SliderValue;
  /** 受控值（向下兼容）。 */
  value?: SliderValue;
  defaultValue?: SliderValue;
  min?: number;
  max?: number;
  step?: number;
  steps?: number[];
  showSteps?: boolean;
  showValue?: boolean;
  valuePosition?: "left" | "right" | "top" | "bottom" | "tooltip";
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
  /** 默认档布局：轨道上的值点，或边到边的 scrubber。
   *  紧凑设计渲染时被忽略。 */
  variant?: "pips" | "scrubber";
  /** 把滑块钉在尺寸阶梯的某一档（见 /docs/sizes）。省略时跟随外围
   *  SizeProvider。 */
  size?: SizeVariant;
  class?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: SliderValue): void;
  (e: "update:value", value: SliderValue): void;
}>();

const boundValue = computed<SliderValue>(() => {
  if (props.modelValue !== undefined) return props.modelValue;
  if (props.value !== undefined) return props.value;
  return props.defaultValue ?? 0;
});

const isComfortable = computed(() => props.variant === "pips" || props.variant === "scrubber");

function handleUpdateValue(v: SliderValue) {
  let emitted: SliderValue = v;
  if (Array.isArray(props.modelValue) || Array.isArray(props.value)) {
    emitted = Array.isArray(v) ? v : [v];
  } else if (typeof props.modelValue === "number" || typeof props.value === "number") {
    emitted = Array.isArray(v) ? (v[0] ?? 0) : v;
  }
  emit("update:modelValue", emitted);
  emit("update:value", emitted);
}
</script>

<template>
  <SliderComfortable
    v-if="isComfortable"
    :value="Array.isArray(boundValue) ? (boundValue[0] ?? 0) : boundValue"
    :min="min"
    :max="max"
    :step="step"
    :variant="variant"
    :label="label"
    :format-value="formatValue"
    :disabled="disabled"
    :class="props.class"
    @update:value="handleUpdateValue"
  />
  <SliderCompact
    v-else
    :value="boundValue"
    :min="min"
    :max="max"
    :step="step"
    :steps="steps"
    :show-steps="showSteps"
    :show-value="showValue"
    :value-position="valuePosition"
    :format-value="formatValue"
    :label="label"
    :disabled="disabled"
    :track-class-name="trackClassName"
    :track-style="trackStyle"
    :fill-class-name="fillClassName"
    :fill-style="fillStyle"
    :hide-fill="hideFill"
    :thumb-color="thumbColor"
    :thumb-border-color="thumbBorderColor"
    :class="props.class"
    @update:value="handleUpdateValue"
  />
</template>
