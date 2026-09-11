<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ThinkingIndicator, ThinkingStep, ThinkingSteps, ThinkingStepsContent, ThinkingStepsHeader } from "@/components/fluid";
import type { ThinkingStep as MessageThinkingStep, ToolCallResult, ToolCallStep } from "../dataflow/types";

const props = defineProps<{ steps: Array<MessageThinkingStep | ToolCallStep | ToolCallResult>; working?: boolean; startedAt?: string }>();
const open = ref(true);
const elapsed = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
const rows = computed(() => props.steps.map(step => step.type === "thinking" ? { id: step.id, label: "思考", description: step.message } : { id: step.toolCallId, label: step.type === "tool-call" ? "调用" : "完成", description: step.toolName }));
function refreshElapsed() { const started = Date.parse(props.startedAt ?? ""); elapsed.value = Number.isFinite(started) ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : 0; }
watch(() => [props.working, props.startedAt], ([working]) => { if (timer) clearInterval(timer); refreshElapsed(); if (working) timer = setInterval(refreshElapsed, 1000); }, { immediate: true });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <ThinkingSteps v-if="rows.length" v-model:open="open" class="mb-2 w-full max-w-2xl text-xs">
    <ThinkingStepsHeader class="rounded-lg px-2 py-1"><span class="font-medium text-muted-foreground">{{ props.working ? `思考中 ${elapsed}s` : '思考过程' }}</span></ThinkingStepsHeader>
    <ThinkingStepsContent class="pt-1"><ThinkingStep v-for="row in rows" :key="row.id" :label="row.label" :description="row.description" :status="props.working ? 'active' : 'complete'" /></ThinkingStepsContent>
  </ThinkingSteps>
  <ThinkingIndicator v-else-if="props.working" size="compact" class="mb-2" />
</template>
