<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-vue-next";
import type { ThinkingStep, ToolCallResult, ToolCallStep } from "./conversation-types";

const props = defineProps<{
  steps: Array<ThinkingStep | ToolCallStep | ToolCallResult>;
  working?: boolean;
}>();

const open = ref(true);
const expandedRows = ref(new Set<number>());
const rows = computed(() => props.steps.map((step) => step.type === "thinking"
  ? { id: step.id, title: "思考", detail: step.message, mono: false }
  : {
      id: step.toolCallId,
      title: step.type === "tool-call" ? step.toolName : `${step.toolName} · 完成`,
      detail: JSON.stringify(step, null, 2),
      mono: true,
    }));

function toggleRow(index: number) {
  if (expandedRows.value.has(index)) expandedRows.value.delete(index);
  else expandedRows.value.add(index);
}
</script>

<template>
  <section v-if="rows.length" class="mb-2 flex w-full max-w-2xl flex-col gap-1.5 text-xs">
    <button type="button" class="flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-accent hover:text-accent-foreground" @click="open = !open">
      <Sparkles class="size-4 shrink-0 text-muted-foreground" />
      <span v-if="working" class="font-medium text-foreground animate-pulse">Thinking</span>
      <span v-else class="font-medium text-muted-foreground">Agent 过程（{{ rows.length }}）</span>
      <ChevronDown class="size-3.5 text-muted-foreground transition-transform duration-200" :class="open && 'rotate-180'" />
    </button>
    <div class="grid transition-all duration-300 ease-out" :class="open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'">
      <div class="overflow-hidden">
        <div class="relative ml-2.5 flex flex-col gap-1.5 border-l border-border py-1 pl-3">
          <button v-for="(row, index) in rows" :key="`${row.id}:${index}`" type="button" class="flex flex-col gap-1 rounded-md border border-transparent p-1.5 text-left transition-colors hover:bg-accent/60" :class="expandedRows.has(index) && 'border-border/60 bg-muted/50'" @click="toggleRow(index)">
            <span class="flex w-full items-center gap-2">
              <Loader2 v-if="working && index === rows.length - 1" class="size-3.5 shrink-0 animate-spin text-primary" />
              <Check v-else class="size-3.5 shrink-0 text-primary stroke-[2.5]" />
              <span class="min-w-0 flex-1" :class="[row.mono ? 'font-mono text-[11px]' : 'font-medium', expandedRows.has(index) ? 'whitespace-pre-wrap break-words' : 'truncate']">{{ row.title }}</span>
              <ChevronRight class="size-3.5 shrink-0 text-muted-foreground transition-transform" :class="expandedRows.has(index) && 'rotate-90'" />
            </span>
            <pre v-if="expandedRows.has(index)" class="mt-1.5 max-h-60 overflow-y-auto whitespace-pre-wrap break-all rounded border border-border/50 bg-background/80 p-2 font-mono text-[11px] leading-relaxed">{{ row.detail }}</pre>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
