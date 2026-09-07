<script setup lang="ts">
import { computed } from "vue";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/fluid";

const props = defineProps<{
	updates?: unknown[];
}>();

const updatesList = computed(() => props.updates ?? []);
const formattedJson = computed(() =>
	JSON.stringify(updatesList.value, null, 2),
);
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <div class="group flex cursor-help items-center gap-3 py-1 text-[11px] text-muted-foreground select-none">
          <span class="h-px flex-1 bg-border" />
          <span class="rounded-full border border-dashed px-2.5 py-0.5 transition-colors group-hover:border-primary/50 group-hover:text-foreground">
            World 更新 · {{ updatesList.length }} 条原语
          </span>
          <span class="h-px flex-1 bg-border" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" class="max-h-80 max-w-[min(42rem,calc(100vw-2rem))] overflow-auto p-3 text-left font-mono text-[11px] leading-relaxed">
        <pre class="overflow-auto whitespace-pre-wrap">{{ formattedJson }}</pre>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
