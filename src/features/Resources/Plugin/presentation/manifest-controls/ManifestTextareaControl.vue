<script setup lang="ts">
import { Textarea } from "@/components/ui/textarea";

defineProps<{ modelValue: unknown; placeholder?: string; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <Textarea
    class="w-full sm:w-72"
    :model-value="typeof modelValue === 'string' ? modelValue : ''"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', String($event))"
  />
</template>
