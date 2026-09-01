<script setup lang="ts">
import { Switch } from "@/components/ui/switch";

defineProps<{
	modelValue: boolean;
}>();

defineEmits<{
	"update:modelValue": [value: boolean];
}>();
</script>

<template>
  <Switch :model-value="modelValue" @update:model-value="$emit('update:modelValue', Boolean($event))" />
</template>
