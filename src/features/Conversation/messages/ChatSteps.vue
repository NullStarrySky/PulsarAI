<script setup lang="ts">
import { Sparkles } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
	ThinkingIndicator,
	ThinkingStep,
	ThinkingSteps,
	ThinkingStepsContent,
	ThinkingStepsHeader,
} from "@/components/fluid";
import { useMessageScrollerContext } from "@/components/ui/message-scroller/useMessageScroller";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
	ThinkingStep as MessageThinkingStep,
	ToolCallResult,
	ToolCallStep,
} from "./message-types";

const props = defineProps<{
	steps: Array<MessageThinkingStep | ToolCallStep | ToolCallResult>;
	working?: boolean;
	startedAt?: string;
	elapsedMs?: number;
}>();
const emit = defineEmits<{ interaction: [] }>();

const open = ref(true);
const expandedRows = ref(new Set<number>());
const elapsedTenths = ref(0);
const { userScrollIntent } = useMessageScrollerContext();
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
const rows = computed(() =>
	props.steps.map((step) =>
		step.type === "thinking"
			? {
					id: step.id,
					title: "思考",
					chip: oneLine(step.message, "正在整理思路…"),
					detail: step.message,
					mono: false,
					input: undefined,
					output: undefined,
				}
			: {
					id: step.toolCallId,
					title: step.type === "tool-call" ? "调用" : "完成",
					chip: oneLine(step.toolName, "codeAct"),
					detail: JSON.stringify(step, null, 2),
					mono: true,
					input: step.input,
					output: step.type === "tool-result" ? step.output : undefined,
				},
	),
);
const elapsed = computed(() => {
	const seconds = elapsedTenths.value / 10;
	return seconds < 60
		? `${seconds.toFixed(1)}s`
		: `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`;
});

function elapsedTenthsNow(working: boolean) {
	if (Number.isFinite(props.elapsedMs))
		return Math.max(0, Math.floor((props.elapsedMs ?? 0) / 100));
	const startedAt = Date.parse(props.startedAt ?? "");
	return working && Number.isFinite(startedAt)
		? Math.max(0, Math.floor((Date.now() - startedAt) / 100))
		: 0;
}

watch(
	() => [props.working, props.startedAt, props.elapsedMs] as const,
	([working]) => {
		if (elapsedTimer) clearInterval(elapsedTimer);
		elapsedTimer = null;
		elapsedTenths.value = elapsedTenthsNow(Boolean(working));
		if (!working) return;
		elapsedTimer = setInterval(() => {
			elapsedTenths.value = elapsedTenthsNow(true);
		}, 100);
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	if (elapsedTimer) clearInterval(elapsedTimer);
});

function toggleRow(index: number) {
	userScrollIntent();
	emit("interaction");
	if (expandedRows.value.has(index)) expandedRows.value.delete(index);
	else expandedRows.value.add(index);
}

function handleHeaderClick() {
	userScrollIntent();
	emit("interaction");
}

function oneLine(value: string, fallback: string) {
	const text = value.replace(/\s+/g, " ").trim();
	return text.length > 72 ? `${text.slice(0, 72)}...` : text || fallback;
}

function formatStepValue(value: unknown) {
	if (value === undefined) return "等待返回…";
	if (typeof value === "string") return value;
	try {
		return unescapeDisplayText(JSON.stringify(value, null, 2) ?? "null");
	} catch {
		return String(value);
	}
}

function unescapeDisplayText(value: string) {
	return value
		.split("\\r\\n")
		.join("\n")
		.split("\\n")
		.join("\n")
		.split("\\t")
		.join("\t");
}
</script>

<template>
  <section v-if="rows.length" class="mb-2 flex w-full max-w-2xl flex-col gap-1 text-xs">
    <ThinkingSteps v-model:open="open" class="w-full">
      <ThinkingStepsHeader class="rounded-lg px-2 py-1 text-xs" @click="handleHeaderClick">
        <span class="inline-flex items-center gap-2">
          <Sparkles v-if="!working" class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="font-medium" :class="working ? 'agent-loading-label' : 'text-muted-foreground'">
            思考了 {{ elapsed }}
          </span>
        </span>
      </ThinkingStepsHeader>
      <ThinkingStepsContent class="pt-1">
        <ThinkingStep
          v-for="(row, index) in rows"
          :key="`${row.id}:${index}`"
          :label="row.title"
          :description="row.chip"
          :status="working && index === rows.length - 1 ? 'active' : 'complete'"
          :is-last="index === rows.length - 1"
          class="cursor-pointer"
          @click="toggleRow(index)"
        >
          <div v-if="expandedRows.has(index)" class="mt-1">
            <div v-if="row.input !== undefined || row.output !== undefined" class="grid gap-2 mobile:grid-cols-1 sm:grid-cols-2">
              <section class="min-w-0 overflow-hidden rounded-md border border-border/70 bg-background/60">
                <header class="border-b border-border/70 px-2 py-1 text-[10px] font-medium text-muted-foreground">输入</header>
                <ScrollArea class="h-40"><pre class="whitespace-pre-wrap break-all p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{{ formatStepValue(row.input) }}</pre></ScrollArea>
              </section>
              <section class="min-w-0 overflow-hidden rounded-md border border-border/70 bg-background/60">
                <header class="border-b border-border/70 px-2 py-1 text-[10px] font-medium text-muted-foreground">输出</header>
                <ScrollArea class="h-40"><pre class="whitespace-pre-wrap break-all p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{{ formatStepValue(row.output) }}</pre></ScrollArea>
              </section>
            </div>
            <pre v-else class="max-h-60 overflow-y-auto whitespace-pre-wrap break-all border-l border-border/70 py-0.5 pl-3 text-[11px] leading-relaxed text-muted-foreground" :class="row.mono ? 'font-mono' : 'font-sans'">{{ row.detail }}</pre>
          </div>
        </ThinkingStep>
      </ThinkingStepsContent>
    </ThinkingSteps>
  </section>
  <div v-else-if="working" class="mb-2">
    <ThinkingIndicator size="compact" class="px-1 py-1" />
  </div>
</template>

<style scoped>
.agent-loader-pixel {
  animation: agent-pixel-on 650ms ease-in-out infinite;
  opacity: 0.15;
}

.agent-loading-label {
  background: linear-gradient(90deg, var(--muted-foreground) 35%, var(--foreground) 50%, var(--muted-foreground) 65%);
  background-clip: text;
  background-size: 200% 100%;
  color: transparent;
  animation: agent-label-shimmer 1.4s linear infinite;
}

@keyframes agent-pixel-on {
  50% { opacity: 1; }
}

@keyframes agent-label-shimmer {
  to { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .agent-loader-pixel,
  .agent-loading-label { animation: none; }
}

.agent-step-enter-active,
.agent-step-leave-active {
  transition: opacity 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

.agent-step-enter-from,
.agent-step-leave-to {
  opacity: 0;
  transform: translateY(0.25rem);
}

</style>
