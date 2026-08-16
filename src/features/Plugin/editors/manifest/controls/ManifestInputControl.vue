<script setup lang="ts">
import { Input } from "@/components/ui/input";

defineProps<{
  modelValue: unknown;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [value: string | number] }>();
</script>

<template>
  <Input
    class="w-full sm:w-72"
    :model-value="typeof modelValue === 'string' || typeof modelValue === 'number' ? modelValue : ''"
    :placeholder="placeholder"
    :type="type ?? 'text'"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    @update:model-value="
      $emit(
        'update:modelValue',
        type === 'number' && Number.isFinite(Number($event)) ? Number($event) : String($event),
      )
    "
  />
</template>
