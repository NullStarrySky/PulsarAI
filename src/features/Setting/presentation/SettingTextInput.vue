<script setup lang="ts">
import { Input } from "@/components/ui/input";

defineProps<{
  modelValue?: string;
  placeholder?: string;
  type?: string;
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <Input
    class="w-72 mobile:w-full"
    :model-value="modelValue"
    :placeholder="placeholder"
    :type="type ?? 'text'"
    @update:model-value="$emit('update:modelValue', String($event))"
  />
</template>
