<script setup lang="ts">
import { Check, ChevronRight, Loader2, Sparkles } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useMessageScrollerContext } from "@/components/ui/message-scroller/useMessageScroller";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import type {
	ThinkingStep,
	ToolCallResult,
	ToolCallStep,
} from "./conversation-types";

const props = defineProps<{
	steps: Array<ThinkingStep | ToolCallStep | ToolCallResult>;
	working?: boolean;
	startedAt?: string;
	elapsedMs?: number;
}>();
const emit = defineEmits<{ interaction: [] }>();

const open = ref(true);
const expandedRows = ref(new Set<number>());
const elapsedTenths = ref(0);
const appearance = useAppearanceStore();
const { userScrollIntent } = useMessageScrollerContext();
const loadingPatterns = {
	drive: {
		delays: [90, 180, 270, 0, 90, 180, 90, 180, 270],
		duration: 650,
		round: false,
	},
	dots: {
		delays: [90, 180, 270, 0, 90, 180, 90, 180, 270],
		duration: 650,
		round: true,
	},
	orbit: {
		delays: [0, 110, 220, 770, null, 330, 660, 550, 440],
		duration: 950,
		round: false,
	},
} as const;
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
const loadingPattern = computed(
	() => loadingPatterns[appearance.agentLoadingStyle],
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
function toggleOpen() {
	userScrollIntent();
	emit("interaction");
	open.value = !open.value;
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
    <button type="button" class="flex w-fit items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground" :aria-expanded="open" @click="toggleOpen">
      <ChevronRight class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200" :class="open && 'rotate-90'" />
      <span v-if="working" aria-hidden="true" class="grid shrink-0 grid-cols-3 gap-px">
        <i v-for="(delay, index) in loadingPattern.delays" :key="index" class="agent-loader-pixel size-1 bg-primary" :class="loadingPattern.round ? 'rounded-full' : 'rounded-[1px]'" :style="delay === null ? { animation: 'none', opacity: 0.07 } : { animationDelay: `${delay}ms`, animationDuration: `${loadingPattern.duration}ms` }" />
      </span>
      <Sparkles v-else class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="font-medium" :class="working ? 'agent-loading-label' : 'text-muted-foreground'">思考了 {{ elapsed }}</span>
    </button>
    <div class="grid transition-all duration-300 ease-out" :class="open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'">
      <div class="overflow-hidden">
        <TransitionGroup name="agent-step" tag="div" class="relative ml-3 flex flex-col gap-1 border-l border-border/80 py-1 pl-3">
          <button v-for="(row, index) in rows" :key="`${row.id}:${index}`" type="button" class="group/step flex flex-col gap-1 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-accent/60" :class="expandedRows.has(index) && 'border-border/60 bg-muted/50'" @click="toggleRow(index)">
            <span class="flex min-w-0 items-center gap-2">
              <span class="relative flex size-3.5 shrink-0 items-center justify-center text-primary">
                <Loader2 v-if="working && index === rows.length - 1" class="size-3.5 animate-spin transition-opacity group-hover/step:opacity-0" :class="expandedRows.has(index) && 'opacity-0'" />
                <Check v-else class="size-3.5 stroke-[2.5] transition-opacity group-hover/step:opacity-0" :class="expandedRows.has(index) && 'opacity-0'" />
                <ChevronRight class="absolute size-3.5 text-muted-foreground opacity-0 transition-[opacity,transform] duration-150 group-hover/step:opacity-100" :class="expandedRows.has(index) ? 'rotate-90 opacity-100' : ''" />
              </span>
              <span class="shrink-0 text-[11px] font-medium text-foreground">{{ row.title }}</span>
              <span class="inline-flex h-5 min-w-0 flex-1 items-center truncate rounded-md bg-muted/70 px-1.5 text-[11px] text-muted-foreground shadow-sm" :class="row.mono && 'font-mono'">{{ row.chip }}</span>
            </span>
            <div class="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]" :class="expandedRows.has(index) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'">
              <div class="min-h-0 overflow-hidden">
                <div v-if="row.input !== undefined || row.output !== undefined" class="mt-1 grid gap-2 mobile:grid-cols-1 sm:grid-cols-2">
                  <section class="min-w-0 overflow-hidden rounded-md border border-border/70 bg-background/60">
                    <header class="border-b border-border/70 px-2 py-1 text-[10px] font-medium text-muted-foreground">输入</header>
                    <ScrollArea class="h-40"><pre class="whitespace-pre-wrap break-all p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{{ formatStepValue(row.input) }}</pre></ScrollArea>
                  </section>
                  <section class="min-w-0 overflow-hidden rounded-md border border-border/70 bg-background/60">
                    <header class="border-b border-border/70 px-2 py-1 text-[10px] font-medium text-muted-foreground">输出</header>
                    <ScrollArea class="h-40"><pre class="whitespace-pre-wrap break-all p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{{ formatStepValue(row.output) }}</pre></ScrollArea>
                  </section>
                </div>
                <pre v-else class="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap break-all border-l border-border/70 py-0.5 pl-3 text-[11px] leading-relaxed text-muted-foreground" :class="row.mono ? 'font-mono' : 'font-sans'">{{ row.detail }}</pre>
              </div>
            </div>
          </button>
        </TransitionGroup>
      </div>
    </div>
  </section>
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
