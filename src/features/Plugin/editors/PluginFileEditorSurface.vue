<script setup lang="ts">
import PluginResourceRenderer from "@/features/Plugin/resources/PluginResourceRenderer.vue";
import type { Plugin, PluginFile } from "@/features/Plugin/tree/plugin-types";

defineProps<{ plugin: Plugin; file: PluginFile; path: string; modelValue: string; mode: "preview" | "source" }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <div class="h-full min-h-0 overflow-hidden bg-transparent">
    <PluginResourceRenderer :file="file" :model-value="modelValue" :preview="mode === 'preview'" @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>

<style scoped>
:deep(.conversation-composer-editor),
:deep(.conversation-composer-editor > div),
:deep(.milkdown) {
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  background: transparent !important;
}

:deep(.milkdown) {
  display: flex;
  flex-direction: column;
}

:deep(.milkdown .ProseMirror) {
  min-height: 0 !important;
  max-height: none !important;
  flex: 1 1 0;
  overflow-y: auto;
  padding: 1rem;
}
</style>
