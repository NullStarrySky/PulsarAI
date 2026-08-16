<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  modelValue: string;
  options: SegmentedOption[];
  variant?: "filled" | "outlined" | "borderless";
  class?: string;
}>(), {
  variant: "filled",
  class: "",
});

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const variantClass = computed(() => {
  if (props.variant === "outlined") return "border bg-background p-1";
  if (props.variant === "borderless") return "bg-transparent p-0";
  return "bg-muted/70 p-1";
});
</script>

<template>
  <div
    role="radiogroup"
    :class="cn('inline-flex max-w-full items-center gap-0.5 rounded-lg text-sm', variantClass, props.class)"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :disabled="option.disabled"
      :class="cn(
        'min-h-7 min-w-0 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        modelValue === option.value
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )"
      @click="emit('update:modelValue', option.value)"
    >
      <slot name="option" :option="option">{{ option.label }}</slot>
    </button>
  </div>
</template>
