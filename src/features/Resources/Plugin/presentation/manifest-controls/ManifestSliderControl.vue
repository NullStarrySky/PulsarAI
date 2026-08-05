<script setup lang="ts">
import { Slider } from "@/components/ui/slider";

const props = withDefaults(defineProps<{
  modelValue: unknown;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}>(), { min: 0, max: 100, step: 1 });
const emit = defineEmits<{ "update:modelValue": [value: number] }>();
</script>

<template>
  <div class="flex w-full items-center gap-3 sm:w-72">
    <Slider
      class="min-w-0 flex-1"
      :model-value="[typeof modelValue === 'number' ? modelValue : props.min]"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', Number($event?.[0] ?? props.min))"
    />
    <span class="w-12 text-right font-mono text-xs text-muted-foreground">
      {{ typeof modelValue === "number" ? modelValue : props.min }}
    </span>
  </div>
</template>
