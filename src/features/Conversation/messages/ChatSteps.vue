<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, ChevronDown, Loader2 } from "lucide-vue-next";
import type { ThinkingStep, ToolCallResult, ToolCallStep } from "./conversation-types";

const props = defineProps<{
  steps: Array<ThinkingStep | ToolCallStep | ToolCallResult>;
  working?: boolean;
}>();

const open = ref(true);
const rows = computed(() => props.steps.map((step) => step.type === "thinking"
  ? { id: step.id, title: "思考", detail: step.message }
  : {
      id: step.toolCallId,
      title: step.type === "tool-call" ? step.toolName : `${step.toolName} · 完成`,
      detail: JSON.stringify(step, null, 2),
    }));
</script>

<template>
  <section v-if="rows.length" class="mb-2 text-sm">
    <button type="button" class="flex items-center gap-2 text-muted-foreground" @click="open = !open">
      <Loader2 v-if="working" class="size-3.5 animate-spin" />
      <Check v-else class="size-3.5" />
      Agent 过程（{{ rows.length }}）
      <ChevronDown class="size-3.5 transition-transform" :class="!open && '-rotate-90'" />
    </button>
    <div v-if="open" class="mt-2 border-l pl-3">
      <details v-for="(row, index) in rows" :key="`${row.id}:${index}`" class="py-1">
        <summary class="cursor-pointer text-xs text-muted-foreground">{{ row.title }}</summary>
        <pre class="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{{ row.detail }}</pre>
      </details>
    </div>
  </section>
</template>
