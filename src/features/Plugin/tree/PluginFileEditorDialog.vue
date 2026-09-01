<script setup lang="ts">
import interact from "interactjs";
import { FileText, SlidersHorizontal, X } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import {
	computed,
	nextTick,
	onBeforeUnmount,
	ref,
	watch,
} from "vue";
import { Button } from "@/components/ui/button";
import {
	NumberField,
	NumberFieldContent,
	NumberFieldDecrement,
	NumberFieldIncrement,
	NumberFieldInput,
} from "@/components/ui/number-field";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import PluginResourceConditionEditor from "@/features/Plugin/resources/PluginResourceConditionEditor.vue";
import PluginResourceRenderer from "@/features/Plugin/resources/PluginResourceRenderer.vue";
import { useWorld } from "./world-store";
import type { WorldFileNode } from "./world-types";

const props = defineProps<{
	open: boolean;
	file: WorldFileNode | null;
	path: string;
	packageId: string;
	conversationId?: string;
}>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const world = useWorld(
	computed(() => ({
		packageId: props.packageId,
		conversationId: props.conversationId,
		applyReplay: true,
	})),
);
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);
const draft = ref("");
const slot = ref("none");
const priority = ref(100);
const condition = ref("");
const dialog = ref<HTMLElement | null>(null);
const frame = ref({ x: 0, y: 0, width: 760, height: 720 });
let dialogInteractable: ReturnType<typeof interact> | null = null;

const slotOptions = computed(() => {
	if (!props.file) return [];
	const type = world.worldFileType(props.file.name);
	return world.slots.value.filter((item) =>
		item.allowedResourceTypes.includes(type),
	);
});
const selectedSlotTitle = computed(
	() =>
		slotOptions.value.find((item) => item.path === slot.value)?.name ??
		"不属于插槽",
);
const dialogStyle = computed(() => ({
	width: `${frame.value.width}px`,
	height: `${frame.value.height}px`,
	transform: `translate(${frame.value.x}px, ${frame.value.y}px)`,
}));

function resetFrame() {
	const margin = 16;
	const maxWidth = Math.max(320, window.innerWidth - margin);
	const maxHeight = Math.max(320, window.innerHeight - margin);
	const width = isMobileLayout.value ? maxWidth : Math.min(760, maxWidth);
	const height = isMobileLayout.value ? maxHeight : Math.min(720, maxHeight);
	frame.value = {
		x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
		y: Math.max(8, Math.round((window.innerHeight - height) / 2)),
		width,
		height,
	};
}

function teardownInteraction() {
	dialogInteractable?.unset();
	dialogInteractable = null;
}

function setupInteraction() {
	teardownInteraction();
	if (!dialog.value || isMobileLayout.value) return;
	dialogInteractable = interact(dialog.value)
		.draggable({
			allowFrom: ".plugin-file-drag-handle",
			ignoreFrom:
				".plugin-file-control, button, [role='button'], input, select, textarea",
			modifiers: [
				interact.modifiers.restrictRect({
					restriction: "parent",
					elementRect: { left: 0, right: 1, top: 0, bottom: 1 },
				}),
			],
			listeners: {
				move(event) {
					frame.value = {
						...frame.value,
						x: frame.value.x + event.dx,
						y: frame.value.y + event.dy,
					};
				},
			},
		})
		.resizable({
			edges: { left: true, right: true, top: true, bottom: true },
			margin: 8,
			modifiers: [
				interact.modifiers.restrictEdges({ outer: "parent" }),
				interact.modifiers.restrictSize({ min: { width: 420, height: 420 } }),
			],
			listeners: {
				move(event) {
					const delta = event.deltaRect ?? { left: 0, top: 0 };
					frame.value = {
						x: frame.value.x + delta.left,
						y: frame.value.y + delta.top,
						width: event.rect.width,
						height: event.rect.height,
					};
				},
			},
		});
}

function restoreDraft() {
	if (!props.file) return;
	draft.value =
		typeof props.file.content === "string"
			? props.file.content
			: JSON.stringify(props.file.content ?? null, null, 2);
	slot.value = props.file.slot ?? "none";
	priority.value = props.file.priority;
	condition.value = props.file.condition ?? "";
}

async function saveContent(value: string) {
	if (!props.file) return;
	draft.value = value;
	const type = world.worldFileType(props.file.name);
	let content: unknown = value;
	if (["json", "chat", "data"].includes(type)) {
		try {
			content = JSON.parse(value);
		} catch {
			content = value;
		}
	}
	await world.updateFile(props.path, { content });
}

async function updateSlot(value: unknown) {
	slot.value = String(value ?? "none");
	await world.updateFile(props.path, {
		slot: slot.value === "none" ? undefined : slot.value,
	});
}

async function updatePriority(value: number | undefined) {
	priority.value = Number.isFinite(value) ? Number(value) : 100;
	await world.updateFile(props.path, { priority: priority.value });
}

async function updateCondition(value: string) {
	condition.value = value;
	await world.updateFile(props.path, { condition: value.trim() || undefined });
}

watch(
	() => [props.file?.id, props.open] as const,
	async () => {
		teardownInteraction();
		if (!props.open) return;
		restoreDraft();
		resetFrame();
		await nextTick();
		setupInteraction();
	},
	{ immediate: true },
);
watch(isMobileLayout, async () => {
	if (!props.open) return;
	resetFrame();
	await nextTick();
	setupInteraction();
});
onBeforeUnmount(teardownInteraction);
</script>

<template>
  <Teleport to="body">
    <div v-if="open && file" class="pointer-events-none fixed inset-0 z-50">
      <section ref="dialog" :style="dialogStyle" class="plugin-file-dialog pointer-events-auto absolute left-0 top-0 flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <header class="plugin-file-drag-handle relative z-10 flex min-h-12 shrink-0 cursor-move items-center gap-2 border-b bg-card px-3 mobile:cursor-default">
          <FileText class="size-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1"><h2 class="truncate text-sm font-medium">{{ file.name }}</h2><p class="truncate text-[11px] text-muted-foreground">{{ path }}</p></div>
          <div class="plugin-file-control flex shrink-0 items-center gap-1.5" @mousedown.stop @pointerdown.stop>
            <Select :model-value="slot" @update:model-value="updateSlot">
              <SelectTrigger class="h-8 w-36 text-xs" aria-label="所属插槽"><SelectValue>{{ selectedSlotTitle }}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不属于插槽</SelectItem>
                <SelectItem v-for="item in slotOptions" :key="item.path" :value="item.path">{{ item.name }}</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger as-child><Button :variant="condition ? 'secondary' : 'outline'" size="sm" class="h-8" title="插入条件"><SlidersHorizontal />条件</Button></PopoverTrigger>
              <PopoverContent align="end" class="w-lg max-w-[calc(100vw-2rem)] p-3"><PluginResourceConditionEditor :model-value="condition" @update:model-value="updateCondition" /></PopoverContent>
            </Popover>
            <NumberField :model-value="priority" :step="1" class="w-28" @update:model-value="updatePriority">
              <NumberFieldContent><NumberFieldDecrement /><NumberFieldInput aria-label="插槽优先级" class="h-8 text-xs" /><NumberFieldIncrement /></NumberFieldContent>
            </NumberField>
            <Button variant="ghost" size="icon-sm" aria-label="关闭文件编辑器" @click="emit('update:open', false)"><X /></Button>
          </div>
        </header>
        <main class="relative z-0 min-h-0 flex-1 p-3 mobile:p-2">
          <div class="h-full min-h-0 overflow-hidden rounded-xl border bg-background/40">
            <PluginResourceRenderer v-if="file" :file="file" :path="path" :model-value="draft" :preview="true" class="h-full" @update:model-value="saveContent" />
          </div>
        </main>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.plugin-file-drag-handle { touch-action: none; user-select: none; }
@media (max-width: 767px) { .plugin-file-dialog { inset: .5rem; width: auto !important; height: auto !important; transform: none !important; } }
</style>
