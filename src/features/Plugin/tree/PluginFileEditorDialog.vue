<script setup lang="ts">
import interact from "interactjs";
import {
	FileText,
	GripVertical,
	Minus,
	Plus,
	SlidersHorizontal,
	X,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
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
const conditionEnabled = ref(true);
const dialog = ref<HTMLElement | null>(null);
const frame = ref({ x: 0, y: 0, width: 760, height: 720 });
let dialogInteractable: ReturnType<typeof interact> | null = null;

const slotOptions = computed(() => {
	if (!props.file) return [];
	const type = world.worldFileType(props.file.name);
	return world.localSlots.value.filter((item) =>
		!item.parent ||
			world.slots.value
				.find((globalSlot) => globalSlot.path === item.parent)
				?.allowedResourceTypes.includes(type),
	);
});
const selectedSlot = computed(() =>
	slotOptions.value.find((item) => item.path === slot.value),
);
const selectedSlotTitle = computed(() =>
	selectedSlot.value
		? `${selectedSlot.value.sourceName} · ${selectedSlot.value.name}`
		: "不属于插槽",
);
const conditionLabel = computed(() =>
	condition.value.trim() ? "已配置条件" : "配置条件",
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
	conditionEnabled.value = props.file.conditionEnabled !== false;
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
function adjustPriority(delta: number) {
	void updatePriority(priority.value + delta);
}

async function updateCondition(value: string) {
	condition.value = value;
	await world.updateFile(props.path, { condition: value.trim() || undefined });
}
async function updateConditionEnabled(value: boolean) {
	conditionEnabled.value = value;
	await world.updateFile(props.path, { conditionEnabled: value });
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
      <section ref="dialog" :style="dialogStyle" class="plugin-file-dialog pointer-events-auto absolute left-0 top-0 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl">
        <header class="plugin-file-drag-handle relative z-10 flex min-h-14 shrink-0 cursor-move items-center gap-2.5 border-b bg-muted/30 px-3 mobile:cursor-default">
          <GripVertical class="size-4 shrink-0 text-muted-foreground/60" />
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText class="size-4" /></span>
          <div class="min-w-0 flex-1"><h2 class="truncate text-sm font-semibold tracking-tight">{{ file.name }}</h2><p class="truncate text-[10px] text-muted-foreground">{{ path }}</p></div>
          <div class="plugin-file-control flex shrink-0 items-center gap-1" @mousedown.stop @pointerdown.stop>
            <Popover>
              <PopoverTrigger as-child><Button :variant="condition ? 'secondary' : 'ghost'" size="sm" class="h-8 gap-1.5 px-2.5 text-xs" title="插入条件"><SlidersHorizontal class="size-3.5" />{{ conditionLabel }}</Button></PopoverTrigger>
              <PopoverContent align="end" :side-offset="8" class="w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-border/80 p-0 shadow-xl"><PluginResourceConditionEditor :model-value="condition" :enabled="conditionEnabled" @update:enabled="updateConditionEnabled" @update:model-value="updateCondition" /></PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon-sm" class="rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="关闭文件编辑器" @click="emit('update:open', false)"><X class="size-4" /></Button>
          </div>
        </header>
        <main class="relative z-0 min-h-0 flex-1">
          <PluginResourceRenderer v-if="file" :file="file" :path="path" :model-value="draft" :preview="true" class="h-full" @update:model-value="saveContent" />
        </main>
        <footer class="plugin-file-control flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 mobile:flex-wrap" @mousedown.stop @pointerdown.stop>
          <div class="flex min-w-0 items-center gap-1.5"><Button variant="outline" size="icon-sm" class="size-6 rounded-md bg-background" title="降低优先级" @click="adjustPriority(-1)"><Minus class="size-3" /></Button><span class="min-w-7 text-center text-xs tabular-nums">{{ priority }}</span><Button variant="outline" size="icon-sm" class="size-6 rounded-md bg-background" title="提高优先级" @click="adjustPriority(1)"><Plus class="size-3" /></Button></div>
          <Select :model-value="slot" @update:model-value="updateSlot"><SelectTrigger class="h-7 min-w-32 max-w-48 rounded-md border-border bg-background px-2.5 text-xs shadow-none" aria-label="插槽"><SelectValue>{{ selectedSlotTitle }}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">不属于插槽</SelectItem><SelectItem v-for="item in slotOptions" :key="item.path" :value="item.path">{{ item.sourceName }} · {{ item.name }}</SelectItem></SelectContent></Select>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.plugin-file-drag-handle { touch-action: none; user-select: none; }
@media (max-width: 767px) { .plugin-file-dialog { inset: .5rem; width: auto !important; height: auto !important; transform: none !important; } }
</style>
