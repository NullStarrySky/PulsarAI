<script setup lang="ts">
import { computed } from "vue";
import {
  compilePluginVueFile,
} from "@/features/Resources/Plugin/application/plugin-vue-runtime";
import type {
  Plugin,
  PluginFile,
} from "@/features/Resources/Plugin/domain/plugin-types";

const props = defineProps<{
  plugin: Plugin;
  file: PluginFile;
  source: string;
}>();

const runtime = computed(() =>
  compilePluginVueFile(props.plugin, {
    ...props.file,
    content: props.source,
  }),
);
</script>

<template>
  <div class="h-full overflow-y-auto bg-muted/35 p-5 mobile:p-3">
    <div
      v-if="runtime.component"
      class="mx-auto min-h-40 max-w-4xl rounded-xl border bg-background p-6 shadow-sm mobile:p-4"
    >
      <component :is="runtime.component">
        <div class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          默认对话内容插槽
        </div>
      </component>
    </div>
    <div
      v-if="runtime.diagnostics.length"
      class="mx-auto mt-3 max-w-4xl rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
    >
      <p v-for="message in runtime.diagnostics" :key="message">{{ message }}</p>
    </div>
  </div>
</template>
