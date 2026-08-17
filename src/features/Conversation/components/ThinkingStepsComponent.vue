<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2, Sparkles } from "lucide-vue-next";

export interface StepRow {
  primary: string;
  secondary?: string;
  input?: string;
  output?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
}

const props = withDefaults(
  defineProps<{
    variant?: "Steps" | "Reasoning" | "Search" | "Coding";
    activeText?: string;
    doneText?: string;
    query?: string;
    rows?: StepRow[];
    working?: boolean;
    hasMainText?: boolean;
  }>(),
  {
    variant: "Steps",
    working: false,
    hasMainText: false,
  }
);

const expanded = ref(true);
const userToggled = ref(false);
const expandedRows = ref<Set<number>>(new Set());

watch(
  [() => props.working, () => props.hasMainText],
  ([working, hasMainText]) => {
    if (userToggled.value) return;
    if (working && !hasMainText) {
      expanded.value = true;
    } else if (hasMainText) {
      expanded.value = false;
    }
  },
  { immediate: true }
);

function handleHeaderClick(event: MouseEvent) {
  userToggled.value = true;
  const button = event.currentTarget as HTMLElement | null;
  const oldTop = button?.getBoundingClientRect().top ?? null;
  const scrollParent = button?.closest('.overflow-y-auto, [data-radix-scroll-area-viewport]') as HTMLElement | null;
  const oldScrollTop = scrollParent?.scrollTop;

  expanded.value = !expanded.value;

  if (button && scrollParent && oldTop !== null && oldScrollTop !== undefined) {
    requestAnimationFrame(() => {
      const newTop = button.getBoundingClientRect().top;
      const delta = newTop - oldTop;
      scrollParent.scrollTop = oldScrollTop + delta;
    });
  }
}

function toggleRow(idx: number) {
  if (expandedRows.value.has(idx)) {
    expandedRows.value.delete(idx);
  } else {
    expandedRows.value.add(idx);
  }
}

const defaultVariantConfig = computed(() => {
  switch (props.variant) {
    case "Reasoning":
      return { active: "Thinking", done: "Thought process", rows: props.rows ?? [] };
    case "Search":
      return { active: "Searching the web", done: "Searched the web", rows: props.rows ?? [] };
    case "Coding":
      return { active: "Running tools", done: "Ran tools", rows: props.rows ?? [] };
    default:
      return { active: "Thinking", done: "Thought completed", rows: props.rows ?? [] };
  }
});

const activeLabel = computed(() => props.activeText || defaultVariantConfig.value.active);
const doneLabel = computed(() => props.doneText || defaultVariantConfig.value.done);
const displayRows = computed(() => props.rows || defaultVariantConfig.value.rows);

function hasExpandableDetail(row: StepRow): boolean {
  return Boolean(
    (row.input && row.input.trim()) ||
    (row.output && row.output.trim()) ||
    (row.secondary && row.secondary.trim())
  );
}
</script>

<template>
  <div class="flex flex-col gap-1.5 w-full max-w-2xl text-xs">
    <!-- Header toggle -->
    <button
      type="button"
      :aria-expanded="expanded"
      class="flex w-fit items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-accent hover:text-accent-foreground text-left"
      @click="handleHeaderClick"
    >
      <Sparkles class="size-4 shrink-0 text-muted-foreground" />
      <span
        v-if="working"
        class="font-medium bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-clip-text text-transparent animate-pulse"
      >
        {{ activeLabel }}
      </span>
      <span v-else class="font-medium text-muted-foreground">
        {{ doneLabel }}
      </span>
      <ChevronDown
        class="size-3.5 text-muted-foreground transition-transform duration-200"
        :class="{ 'rotate-180': expanded }"
      />
    </button>

    <!-- Expandable Content -->
    <div
      class="grid transition-all duration-300 ease-out"
      :class="expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="overflow-hidden">
        <div class="relative ml-2.5 border-l border-border pl-3 py-1 flex flex-col gap-1.5">
          <!-- Search Query header -->
          <div v-if="query" class="flex items-center gap-2 text-muted-foreground pb-1">
            <span class="font-medium text-foreground">Query:</span>
            <span>{{ query }}</span>
          </div>

          <!-- Rows -->
          <div
            v-for="(row, idx) in displayRows"
            :key="`${row.primary}:${idx}`"
            class="flex flex-col gap-1 rounded-md p-1.5 transition-colors border border-transparent"
            :class="[
              expandedRows.has(idx) && hasExpandableDetail(row) ? 'bg-muted/50 border-border/60' : '',
              hasExpandableDetail(row) ? 'cursor-pointer hover:bg-accent/60' : '',
            ]"
            @click="hasExpandableDetail(row) && toggleRow(idx)"
          >
            <div class="flex items-center gap-2 w-full">
              <!-- Step status icon -->
              <template v-if="working && idx === displayRows.length - 1">
                <Loader2 class="size-3.5 shrink-0 animate-spin text-primary" />
              </template>
              <template v-else>
                <Check class="size-3.5 shrink-0 text-primary stroke-[2.5]" />
              </template>

              <!-- Primary text -->
              <component
                :is="row.href ? 'a' : 'span'"
                :href="row.href"
                target="_blank"
                rel="noreferrer"
                class="min-w-0 flex-1 font-medium text-left leading-snug"
                :class="[
                  row.href ? 'hover:underline text-primary' : 'text-foreground',
                  row.mono ? 'font-mono text-[11px]' : '',
                  hasExpandableDetail(row) && !expandedRows.has(idx) ? 'truncate' : 'whitespace-pre-wrap break-words',
                ]"
                @click.stop="row.href && null"
              >
                {{ row.primary }}
              </component>

              <!-- Secondary summary if not expanded -->
              <span
                v-if="row.secondary && !expandedRows.has(idx) && !(row.input || row.output)"
                class="shrink-0 max-w-48 truncate text-[11px] text-muted-foreground font-mono"
              >
                {{ row.secondary }}
              </span>

              <!-- Diff counters -->
              <span v-if="row.add !== undefined" class="shrink-0 font-mono text-[10px]">
                <span class="text-emerald-500">+{{ row.add }}</span>
                <span class="text-rose-500 ml-1">−{{ row.del }}</span>
              </span>

              <ChevronRight
                v-if="hasExpandableDetail(row)"
                class="size-3.5 shrink-0 text-muted-foreground transition-transform"
                :class="{ 'rotate-90': expandedRows.has(idx) }"
              />
              <ExternalLink v-else-if="row.href" class="size-3 shrink-0 text-muted-foreground" />
            </div>

            <!-- Expanded split screen (左右分屏) for tool call parameters & result -->
            <div
              v-if="expandedRows.has(idx) && (row.input || row.output)"
              class="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-2 w-full"
            >
              <div class="flex flex-col gap-1 rounded border border-border/60 bg-background/90 p-2 font-mono text-[11px]">
                <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">调用参数 (Input)</span>
                <pre class="max-h-60 overflow-y-auto whitespace-pre-wrap break-all leading-snug text-foreground">{{ row.input || '无参数' }}</pre>
              </div>
              <div class="flex flex-col gap-1 rounded border border-border/60 bg-background/90 p-2 font-mono text-[11px]">
                <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">执行结果 (Output)</span>
                <pre class="max-h-60 overflow-y-auto whitespace-pre-wrap break-all leading-snug text-foreground">{{ row.output || '结果准备中…' }}</pre>
              </div>
            </div>

            <!-- Single full-width detail if only secondary is present -->
            <div
              v-else-if="expandedRows.has(idx) && row.secondary"
              class="mt-1.5 rounded bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-all border border-border/50 max-h-60 overflow-y-auto"
            >
              {{ row.secondary }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
