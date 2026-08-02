<script setup lang="ts">
import { Checkbox } from "@/components/ui/checkbox";

defineProps<{ modelValue: unknown; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <Checkbox
    :model-value="Boolean(modelValue)"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', Boolean($event))"
  />
</template>
