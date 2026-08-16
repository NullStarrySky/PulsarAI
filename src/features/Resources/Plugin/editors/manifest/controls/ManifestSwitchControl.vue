<script setup lang="ts">
import { Switch } from "@/components/ui/switch";

defineProps<{ modelValue: unknown; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <Switch
    :model-value="Boolean(modelValue)"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', Boolean($event))"
  />
</template>
