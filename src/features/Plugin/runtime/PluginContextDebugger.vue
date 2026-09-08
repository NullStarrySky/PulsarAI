<script setup lang="ts">
import { RefreshCw } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/fluid";
import { createWorldSelfApi } from "./self-api";
import type { PluginLogEntry } from "./logger";

const props = defineProps<{ open: boolean; path: string; localPluginId: string; conversationId?: string }>();
const logs = ref<PluginLogEntry[]>([]);
const result = ref("");
const running = ref(false);
const failure = ref("");
const title = computed(() => props.path.split("/").pop() || "上下文调试器");

function display(value: unknown) {
	if (typeof value === "string") return value;
	try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

async function refresh() {
	running.value = true;
	failure.value = "";
	const api = createWorldSelfApi(props.path, { localPluginId: props.localPluginId, conversationId: props.conversationId });
	try {
		result.value = display(await api.parse(props.path, { conversationId: props.conversationId, logger: api.logger }));
		logs.value = [...api.logger.logs];
	} catch (error) {
		failure.value = error instanceof Error ? error.message : String(error);
		logs.value = [...api.logger.logs];
	} finally { running.value = false; }
}

watch(() => [props.open, props.path] as const, ([open]) => { if (open) void refresh(); }, { immediate: true });
</script>

<template>
  <section v-if="open" class="flex min-h-0 flex-1 flex-col border-l bg-background">
    <header class="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
      <div class="min-w-0"><p class="truncate text-xs font-semibold">上下文调试 · {{ title }}</p><p class="text-[10px] text-muted-foreground">记录 import/read、条件、宏与递归结果</p></div>
      <Button size="sm" variant="outline" :disabled="running" @click="refresh"><RefreshCw class="size-3.5" />重新运行</Button>
    </header>
    <div class="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">
      <p v-if="failure" class="mb-3 whitespace-pre-wrap text-destructive">{{ failure }}</p>
      <ol class="space-y-1">
        <li v-for="(entry, index) in logs" :key="`${entry.timestamp}-${index}`" class="whitespace-pre-wrap" :style="{ paddingLeft: `${entry.depth * 14}px` }">
          <span class="mr-1 text-muted-foreground">[{{ entry.type }}]</span>{{ entry.message }}
        </li>
      </ol>
      <div class="mt-4 border-t pt-3"><p class="mb-1 text-[10px] text-muted-foreground">最终结果</p><pre class="whitespace-pre-wrap break-words">{{ result }}</pre></div>
    </div>
  </section>
</template>
