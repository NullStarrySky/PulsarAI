<script setup lang="ts">
import {
	Code,
	Crosshair,
	Bug,
	Eye,
	FileText,
	GripVertical,
	Minus,
	Plus,
	SlidersHorizontal,
	X,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
	MenuItem,
	Switch,
	Tabs,
	TabsList,
	TabItem,
	Tooltip,
} from "@/components/fluid";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useFloatingSurface } from "@/features/UI/FloatingSurface";
import PluginResourceConditionEditor from "@/features/Plugin/resources/PluginResourceConditionEditor.vue";
import PluginResourceRenderer from "@/features/Plugin/resources/PluginResourceRenderer.vue";
import PluginContextDebugger from "@/features/Plugin/runtime/PluginContextDebugger.vue";
import { estimateReferenceTokens } from "@/features/Plugin/resources/token-estimate";
import { requestLocate } from "./file-editor-manager";
import SlotSubMenu from "./SlotSubMenu.vue";
import type { SlotMenuNode } from "./slot-menu-types";
import { providePluginWorldScope } from "@/features/Plugin/runtime/file-composables";
import { useWorld } from "./world-store";
import type { WorldFileNode } from "./world-types";

const props = withDefaults(
	defineProps<{
		open: boolean;
		file: WorldFileNode | null;
		path: string;
		localPluginId: string;
		conversationId?: string;
		zIndex?: number;
		bounceKey?: number;
		initialOffset?: { x: number; y: number };
	}>(),
	{
		zIndex: 100,
		bounceKey: 0,
		initialOffset: () => ({ x: 0, y: 0 }),
	},
);

const emit = defineEmits<{
	"update:open": [value: boolean];
	focus: [];
}>();

const worldScope = computed(() => ({
	localPluginId: props.localPluginId,
	conversationId: props.conversationId,
	applyReplay: true,
}));
const world = useWorld(worldScope);
providePluginWorldScope(worldScope);

const draft = ref("");
const viewMode = ref<"preview" | "source">("preview");
const slot = ref("none");
const priority = ref(100);
const condition = ref("");
const conditionEnabled = ref(true);
const resourceSelected = ref(true);
const isBouncing = ref(false);
const debuggerOpen = ref(false);
const referenceTokenCount = ref<number | null>(null);
let tokenEstimateRevision = 0;

const dialog = ref<HTMLElement | null>(null);
const floating = useFloatingSurface({
	surfaceId: computed(() => `plugin-file:${props.path}`).value,
	open: computed(() => props.open),
	element: dialog,
	initialSize: { width: 760, height: 720 },
	minSize: { width: 420, height: 420 },
	zIndex: props.zIndex,
	initialPosition:
		props.initialOffset.x || props.initialOffset.y
			? {
					x: Math.max(
						8,
						Math.round(window.innerWidth / 2 - 380 + props.initialOffset.x),
					),
					y: Math.max(
						8,
						Math.round(window.innerHeight / 2 - 360 + props.initialOffset.y),
					),
				}
			: undefined,
});
const floatingStyle = computed(() => floating.style.value);

const currentFile = computed(() => {
	if (!props.file) return null;
	const res = world.resources.value.find((item) => item.path === props.path);
	return res?.file ?? props.file;
});

const fileType = computed(() =>
	currentFile.value ? world.worldFileType(currentFile.value.name) : "text",
);

const hasRenderSurface = computed(() => {
	if (fileType.value === "media") return false;
	if (["markdown", "chat", "data", "component"].includes(fileType.value))
		return true;
	if (
		props.path.endsWith("/config.json") ||
		props.path.endsWith("/regex.json") ||
		props.path.endsWith(".regex.json")
	)
		return true;
	if (currentFile.value?.name.endsWith(".json")) {
		try {
			const c = currentFile.value.content;
			const obj = typeof c === "string" ? JSON.parse(c) : c;
			if (
				obj &&
				typeof obj === "object" &&
				("entries" in obj || "prompts" in obj || "prompt_order" in obj)
			) {
				return true;
			}
		} catch {}
	}
	return false;
});

function globalSlotFor(fileSlot?: string) {
	if (!fileSlot) return undefined;
	const local = world.localSlots.value.find((item) => item.path === fileSlot);
	return world.slots.value.find(
		(item) => item.path === (local?.parent ?? fileSlot),
	);
}

const slotOptions = computed(() => {
	if (!currentFile.value) return [];
	const type = world.worldFileType(currentFile.value.name);
	return world.slots.value.filter(
		(item) =>
			!item.hasChildren &&
			(item.allowedResourceTypes.includes(type) ||
				world.customTypes.value.includes(type)),
	);
});

const selectedSlot = computed(() => globalSlotFor(slot.value));

function slotLabel(target: (typeof world.slots.value)[number]) {
	const names = [target.name];
	let parent = target.parent;
	while (parent) {
		const parentSlot = world.slots.value.find((item) => item.path === parent);
		if (!parentSlot) break;
		names.unshift(parentSlot.name);
		parent = parentSlot.parent;
	}
	return names.join(" · ");
}

const selectedSlotTitle = computed(() =>
	selectedSlot.value ? slotLabel(selectedSlot.value) : "不属于插槽",
);

const slotMenu = computed(() => {
	const eligible = new Set(slotOptions.value.map((item) => item.path));
	function build(parent?: string): SlotMenuNode[] {
		return world.slots.value
			.filter((item) => item.parent === parent)
			.map((item) => ({ slot: item, children: build(item.path) }))
			.filter(
				(item) => eligible.has(item.slot.path) || item.children.length > 0,
			);
	}
	return build();
});

const conditionLabel = computed(() =>
	condition.value.trim() ? "已配置条件" : "配置条件",
);

function restoreDraft() {
	if (!currentFile.value) return;
	draft.value =
		typeof currentFile.value.content === "string"
			? currentFile.value.content
			: JSON.stringify(currentFile.value.content ?? null, null, 2);
	slot.value = globalSlotFor(currentFile.value.slot)?.path ?? "none";
	priority.value = currentFile.value.priority ?? 100;
	condition.value = currentFile.value.condition ?? "";
	conditionEnabled.value = currentFile.value.conditionEnabled !== false;
	resourceSelected.value = currentFile.value.resourceSelected !== false;
	viewMode.value = "preview";
}

async function saveContent(value: string) {
	if (!currentFile.value) return;
	draft.value = value;
	const type = world.worldFileType(currentFile.value.name);
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

async function updateSlot(value: string) {
	slot.value = value;
	await world.assignSlot(props.path, value === "none" ? undefined : value);
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

async function setResourceSelected(next: boolean) {
	resourceSelected.value = next;
	await world.setSelected(props.path, next);
}

function handleLocate() {
	if (currentFile.value) {
		requestLocate(props.path, currentFile.value);
	}
}

// Watch bounceKey to trigger bounce animation
watch(
	() => props.bounceKey,
	(key) => {
		if (key && key > 0) {
			isBouncing.value = true;
			setTimeout(() => {
				isBouncing.value = false;
			}, 350);
		}
	},
);

watch(
	() => [props.file?.id, props.open] as const,
	() => {
		if (!props.open) return;
		restoreDraft();
	},
	{ immediate: true },
);

watch(
	[() => props.path, draft],
	async ([path, content]) => {
		const revision = ++tokenEstimateRevision;
		const count = await estimateReferenceTokens(path, content);
		if (revision === tokenEstimateRevision) referenceTokenCount.value = count;
	},
	{ immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && currentFile"
      class="pointer-events-none fixed inset-0 z-50 [webkit-app-region:no-drag]"
    >
      <section
        ref="dialog"
        :style="floatingStyle"
        class="plugin-file-dialog pointer-events-auto absolute flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl transition-[box-shadow]"
        :class="{ 'dialog-bouncing ring-2 ring-primary/40': isBouncing }"
        @mousedown="emit('focus')"
      >
        <!-- Header -->
        <header
          data-floating-drag-handle
          class="relative z-10 flex min-h-14 shrink-0 cursor-move items-center gap-2.5 border-b bg-muted/30 px-3 mobile:cursor-default"
          @auxclick.prevent="e => { if (e.button === 1) emit('update:open', false) }"
        >
          <GripVertical class="size-4 shrink-0 text-muted-foreground/50" />
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText class="size-4" />
          </span>

          <div class="min-w-0 flex-1">
            <h2 class="truncate text-xs font-semibold tracking-tight text-foreground">
              {{ currentFile.name }}
            </h2>
          </div>

          <div
            class="plugin-file-control flex shrink-0 items-center gap-1.5"
            @mousedown.stop
            @pointerdown.stop
          >
            <!-- Source / Preview View Mode Tabs -->
            <Tabs
              v-if="hasRenderSurface"
              :model-value="viewMode"
              size="compact"
              @update:model-value="viewMode = ($event as 'preview' | 'source')"
            >
              <TabsList>
                <TabItem value="preview" class="h-6 px-2 text-[11px]">
                  <Eye class="mr-1 size-3" />渲染
                </TabItem>
                <TabItem value="source" class="h-6 px-2 text-[11px]">
                  <Code class="mr-1 size-3" />源码
                </TabItem>
              </TabsList>
            </Tabs>

            <!-- File Enabled Toggle Switch -->
            <Switch
              size="sm"
              :model-value="resourceSelected"
              :title="resourceSelected ? '文件已启用' : '文件已禁用'"
              @update:model-value="setResourceSelected"
            />

            <!-- Locate in Asset Tree Button -->
            <Button
              variant="ghost"
              size="icon-sm"
              class="size-7 rounded-lg text-muted-foreground hover:text-foreground"
              title="在资源树中定位"
              aria-label="在资源树中定位"
              @click="handleLocate"
            >
              <Crosshair class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="size-7 rounded-lg text-muted-foreground hover:text-foreground" title="上下文调试器" @click="debuggerOpen = !debuggerOpen">
              <Bug class="size-3.5" />
            </Button>

            <!-- Condition Editor Popover -->
            <Popover>
              <PopoverTrigger as-child>
                <Button
                  :variant="condition ? 'secondary' : 'ghost'"
                  size="sm"
                  class="h-7 gap-1.5 px-2.5 text-xs"
                  title="插入条件"
                >
                  <SlidersHorizontal class="size-3.5" />
                  {{ conditionLabel }}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                :side-offset="8"
                class="w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-border/80 p-0 shadow-xl"
              >
                <PluginResourceConditionEditor
                  :model-value="condition"
                  :enabled="conditionEnabled"
                  @update:enabled="updateConditionEnabled"
                  @update:model-value="updateCondition"
                />
              </PopoverContent>
            </Popover>

            <!-- Close Dialog Button -->
            <Button
              variant="ghost"
              size="icon-sm"
              class="size-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="关闭文件编辑器"
              @click="emit('update:open', false)"
            >
              <X class="size-4" />
            </Button>
          </div>
        </header>

        <!-- Main Content Area -->
        <main class="relative z-0 flex min-h-0 flex-1 overflow-hidden bg-background">
          <PluginResourceRenderer
            v-if="currentFile"
            :file="currentFile"
            :path="path"
            :model-value="draft"
            :preview="viewMode === 'preview'"
            class="h-full min-w-0 flex-1"
            @update:model-value="saveContent"
          />
          <PluginContextDebugger :open="debuggerOpen" :path="path" :local-plugin-id="localPluginId" :conversation-id="conversationId" />
        </main>

        <!-- Footer -->
        <footer
          class="plugin-file-control flex shrink-0 items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 mobile:flex-wrap"
          @mousedown.stop
          @pointerdown.stop
        >
          <!-- Left: Truncated Path and File ID with Chinese Tooltips -->
          <div class="flex items-center gap-2 text-[11px] font-mono text-muted-foreground shrink-0 min-w-0 max-w-[55%] select-none">
            <Tooltip :content="`文件路径：${path}`">
              <span class="max-w-[9rem] truncate cursor-default font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                {{ path }}
              </span>
            </Tooltip>
            <span class="text-muted-foreground/30 shrink-0">·</span>
            <Tooltip :content="`节点标识：${currentFile.id}`">
              <span class="max-w-[9rem] truncate cursor-default font-mono text-[11px] text-muted-foreground/80 hover:text-foreground transition-colors">
                ID: {{ currentFile.id }}
              </span>
            </Tooltip>
          </div>

          <!-- Right: Priority and Slot Selector -->
          <div class="flex items-center gap-3">
            <Tooltip v-if="referenceTokenCount !== null" content="本地参考值；递归展开、条件和插槽会改变实际 token 用量">
              <span class="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">≈ {{ referenceTokenCount.toLocaleString() }} tokens</span>
            </Tooltip>
            <div class="flex min-w-0 items-center gap-1.5">
              <span class="text-[11px] text-muted-foreground">优先级</span>
              <Button
                variant="outline"
                size="icon-sm"
                class="size-6 rounded-md bg-background"
                title="降低优先级"
                @click="adjustPriority(-1)"
              >
                <Minus class="size-3" />
              </Button>
              <span class="min-w-6 text-center text-xs tabular-nums font-mono">{{ priority }}</span>
              <Button
                variant="outline"
                size="icon-sm"
                class="size-6 rounded-md bg-background"
                title="提高优先级"
                @click="adjustPriority(1)"
              >
                <Plus class="size-3" />
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 min-w-32 max-w-56 justify-between rounded-md border-border bg-background px-2.5 text-xs shadow-none"
                  aria-label="插槽"
                >
                  <span class="truncate">{{ selectedSlotTitle }}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-56">
                <MenuItem
                  label="不属于插槽"
                  :checked="slot === 'none'"
                  @select="updateSlot('none')"
                />
                <SlotSubMenu
                  :nodes="slotMenu"
                  :selected-slot="slot"
                  @select="updateSlot"
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
[data-floating-drag-handle] {
	touch-action: none;
	user-select: none;
}

@keyframes file-dialog-bounce {
	0% {
		transform: scale(1);
	}
	35% {
		transform: scale(1.025);
	}
	70% {
		transform: scale(0.985);
	}
	100% {
		transform: scale(1);
	}
}

.dialog-bouncing {
	transform-origin: center center;
	animation: file-dialog-bounce 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@media (max-width: 767px) {
	.plugin-file-dialog {
		inset: 0.5rem;
		width: auto !important;
		height: auto !important;
		left: 0.5rem !important;
		top: 0.5rem !important;
		transform: none !important;
	}
}
</style>
