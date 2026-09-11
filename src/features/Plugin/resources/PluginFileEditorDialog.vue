<script setup lang="ts">
import {
	Crosshair,
	Eye,
	FileText,
	GripVertical,
	SlidersHorizontal,
	X,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button, Switch, TabItem, Tabs, TabsList } from "@/components/fluid";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useFloatingSurface } from "@/features/UI/FloatingSurface";
import type { PluginData, Pulse } from "../dataflow";
import { useOpenedFile, useSlot } from "../dataflow";
import PluginResourceConditionEditor from "./PluginResourceConditionEditor.vue";
import PluginResourceRenderer from "./PluginResourceRenderer.vue";

const props = withDefaults(
	defineProps<{
		open: boolean;
		path: string;
		filetree: PluginData | null;
		applyPulse: (pulse: Pulse) => void;
		zIndex?: number;
		initialOffset?: { x: number; y: number };
	}>(),
	{ zIndex: 100, initialOffset: () => ({ x: 0, y: 0 }) },
);
const emit = defineEmits<{
	"update:open": [value: boolean];
	focus: [];
	locate: [path: string];
}>();
const files = useOpenedFile({
	filetree: () => props.filetree,
	applyPulse: props.applyPulse,
});
const slots = useSlot({
	filetree: () => props.filetree,
	applyPulse: props.applyPulse,
});
const current = files.file(props.path);
const draft = ref("");
const preview = ref(true);
watch(
	current,
	(value) => {
		draft.value = value?.content ?? "";
	},
	{ immediate: true },
);
const dialog = ref<HTMLElement | null>(null);
const floating = useFloatingSurface({
	surfaceId: `plugin-file:${props.path}`,
	open: computed(() => props.open),
	element: dialog,
	initialSize: { width: 760, height: 720 },
	minSize: { width: 420, height: 420 },
	zIndex: props.zIndex,
});
function write(value: string) {
	draft.value = value;
	files.write(props.path, value);
}
function patch(patch: Record<string, unknown>) {
	files.updateFileMeta(props.path, patch);
}
</script>

<template>
  <Teleport to="body"><div v-if="open && current" class="pointer-events-none fixed inset-0 z-50"><section ref="dialog" :style="floating.style.value" class="pointer-events-auto absolute flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" @mousedown="emit('focus')"><header data-floating-drag-handle class="flex min-h-14 shrink-0 items-center gap-2 border-b bg-muted/30 px-3"><GripVertical class="size-4 text-muted-foreground/50" /><FileText class="size-4 text-primary" /><span class="min-w-0 flex-1 truncate text-xs font-semibold">{{ path.split('/').at(-1) }}</span><Tabs v-if="current.type !== 'media'" :model-value="preview ? 'preview' : 'source'" size="compact" @update:model-value="preview = $event === 'preview'"><TabsList><TabItem value="preview" class="h-6 px-2 text-[11px]"><Eye class="mr-1 size-3" />渲染</TabItem><TabItem value="source" class="h-6 px-2 text-[11px]">源码</TabItem></TabsList></Tabs><Switch size="sm" :model-value="current.meta?.resourceSelected !== false" @update:model-value="slots.toggle(path)" /><Button variant="ghost" size="icon-sm" class="size-7" title="在资源树中定位" @click="emit('locate', path)"><Crosshair class="size-3.5" /></Button><Popover><PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="size-7" title="插入条件"><SlidersHorizontal class="size-3.5" /></Button></PopoverTrigger><PopoverContent class="w-[min(30rem,calc(100vw-2rem))] p-0"><PluginResourceConditionEditor :model-value="current.meta?.condition ?? ''" :enabled="current.meta?.conditionEnabled !== false" @update:model-value="patch({ condition: $event || undefined })" @update:enabled="patch({ conditionEnabled: $event })" /></PopoverContent></Popover><Button variant="ghost" size="icon-sm" class="size-7" @click="emit('update:open', false)"><X class="size-4" /></Button></header><main class="min-h-0 flex-1"><PluginResourceRenderer :file="{ path, content: draft, ...(current.meta ?? { resourceSelected: true, priority: 100 }) }" :model-value="draft" :preview="preview" class="h-full" @update:model-value="write" /></main></section></div></Teleport>
</template>
