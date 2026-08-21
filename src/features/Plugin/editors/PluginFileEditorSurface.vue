<script setup lang="ts">
import PluginResourceRenderer from "@/features/Plugin/resources/PluginResourceRenderer.vue";
import type { Plugin, PluginFile } from "@/features/Plugin/tree/plugin-types";

defineProps<{ plugin: Plugin; file: PluginFile; path: string; modelValue: string; mode: "preview" | "source" }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <PluginResourceRenderer :file="file" :model-value="modelValue" :preview="mode === 'preview'" @update:model-value="emit('update:modelValue', $event)" />
</template>
