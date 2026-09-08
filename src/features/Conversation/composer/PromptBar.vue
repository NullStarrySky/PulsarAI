<script setup lang="ts">
import {
	FileText,
	MessageSquareText,
	Paperclip,
	PencilLine,
	PenTool,
	Plus,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	InputMessage,
} from "@/components/fluid";
import type {
	ActionPart,
	FilePart,
	ReferencePart,
} from "@/features/Conversation/messages/message-types";
import type { WorldResource } from "@/features/Plugin/tree/world-store";
import type { PluginMode } from "@/features/Plugin/runtime/mode-slot";
import SttInputButton from "@/features/STT/SttInputButton.vue";
import ComposerAttachmentStrip from "./ComposerAttachmentStrip.vue";

export interface ComposerReferenceOption {
	key: string;
	label: string;
	description: string;
	reference: ReferencePart;
}

const props = withDefaults(
	defineProps<{
		modelValue: string;
		attachments: (FilePart | ReferencePart)[];
		actions?: WorldResource[];
		references?: ComposerReferenceOption[];
		selectedAction?: ActionPart | null;
		generating?: boolean;
		suggestions?: Array<{ label?: string; suggestions: string[] }>;
		tokenUsage?: string;
		editMode?: boolean;
		modes?: PluginMode[];
		activeModeId?: string;
	}>(),
	{
		actions: () => [],
		references: () => [],
		selectedAction: null,
		generating: false,
		suggestions: () => [],
		tokenUsage: "",
		editMode: false,
		modes: () => [],
		activeModeId: "",
	},
);

const emit = defineEmits<{
	"update:modelValue": [value: string];
	"update:selectedAction": [value: ActionPart | null];
	submit: [];
	attach: [];
	whiteboard: [];
	removeAttachment: [index: number];
	addReference: [reference: ReferencePart];
	openView: [action: WorldResource];
	toggleEditMode: [];
	selectMode: [mode: PluginMode | null];
}>();

const toolsOpen = ref(false);
const activeIndex = ref(0);
const menuDismissed = ref(false);
const token = computed(() => {
	const input = props.modelValue.replace(/\u200B/g, "");
	const lineStart = input.lastIndexOf("\n") + 1;
	const match = /(^|\s)([@/])([\w-]*)$/u.exec(input.slice(lineStart));
	if (!match) return null;
	return {
		kind: match[2] === "@" ? ("at" as const) : ("slash" as const),
		query: match[3].toLocaleLowerCase(),
		start: lineStart + match.index + match[1].length,
	};
});
const menuKind = computed(() =>
	toolsOpen.value
		? ("at" as const)
		: menuDismissed.value
			? null
			: (token.value?.kind ?? null),
);
const utilityRows = [
	{
		key: "attach",
		label: "附加文件与照片",
		description: "从设备选择附件",
		icon: Paperclip,
	},
	{
		key: "whiteboard",
		label: "打开白板",
		description: "在画布中整理想法",
		icon: PenTool,
	},
] as const;
const atRows = computed(() => {
	const query = token.value?.query ?? "";
	return [
		...utilityRows,
		...props.references.filter((item) =>
			`${item.label} ${item.description}`.toLocaleLowerCase().includes(query),
		),
	];
});
const actionRows = computed(() =>
	props.actions.filter((action) =>
		action.file.name.toLocaleLowerCase().includes(token.value?.query ?? ""),
	),
);
const menuRows = computed(() =>
	menuKind.value === "at"
		? atRows.value
		: menuKind.value === "slash"
			? actionRows.value
			: [],
);

watch([menuKind, () => token.value?.query], () => (activeIndex.value = 0));

function clearActiveToken() {
	if (token.value)
		emit("update:modelValue", props.modelValue.slice(0, token.value.start));
}
function closeMenu() {
	toolsOpen.value = false;
	menuDismissed.value = false;
}
function pickAt(item: (typeof utilityRows)[number] | ComposerReferenceOption) {
	clearActiveToken();
	if (item.key === "attach") emit("attach");
	else if (item.key === "whiteboard") emit("whiteboard");
	else emit("addReference", (item as ComposerReferenceOption).reference);
	closeMenu();
}
function pickAction(action: WorldResource) {
	if (action.file.name.endsWith(".md"))
		emit(
			"update:modelValue",
			typeof action.file.content === "string"
				? action.file.content
				: JSON.stringify(action.file.content, null, 2),
		);
	else if (action.file.name.endsWith(".vue")) {
		clearActiveToken();
		emit("openView", action);
	} else {
		emit("update:selectedAction", {
			type: "action",
			id: action.file.id,
			label: action.file.name.replace(/\.[^.]+$/, ""),
			action: action.path,
		});
		emit("update:modelValue", "");
	}
	closeMenu();
}
function handleKeydown(event: KeyboardEvent) {
	const count = menuRows.value.length;
	if (menuKind.value && count) {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			activeIndex.value =
				(activeIndex.value + (event.key === "ArrowDown" ? 1 : -1) + count) %
				count;
			return;
		}
		if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
			event.preventDefault();
			event.stopPropagation();
			const item = menuRows.value[activeIndex.value];
			if (menuKind.value === "at")
				pickAt(item as (typeof atRows.value)[number]);
			else pickAction(item as WorldResource);
			return;
		}
	}
	if (event.key === "Escape") {
		toolsOpen.value = false;
		menuDismissed.value = true;
	}
}
function insertDictation(text: string) {
	emit(
		"update:modelValue",
		`${props.modelValue}${props.modelValue ? " " : ""}${text}`,
	);
}
function menuKey(item: unknown) {
	return menuKind.value === "slash"
		? (item as WorldResource).file.id
		: (item as { key: string }).key;
}
function atIcon(item: unknown) {
	const row = item as ComposerReferenceOption & { icon?: unknown };
	return (
		row.icon ??
		(row.reference?.referenceType === "file" ? FileText : MessageSquareText)
	);
}
function selectMenuItem(item: unknown) {
	if (menuKind.value === "at") pickAt(item as (typeof atRows.value)[number]);
	else pickAction(item as WorldResource);
}
</script>

<template>
  <div class="relative" @keydown.capture="handleKeydown">
    <Transition name="fade">
      <div v-if="menuKind" class="absolute inset-x-0 bottom-[calc(100%+0.625rem)] z-20 overflow-hidden rounded-2xl border bg-popover/98 p-1.5 shadow-xl backdrop-blur">
        <p class="border-b px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">{{ menuKind === 'at' ? '引用文件或消息' : '执行命令' }}</p>
        <div class="max-h-72 overflow-y-auto py-1">
          <button v-for="(item, index) in menuRows" :key="menuKey(item)" type="button" class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-xs transition-colors" :class="index === activeIndex ? 'bg-accent/60' : 'hover:bg-accent/60'" @mousedown.prevent @mouseenter="activeIndex = index" @click="selectMenuItem(item)">
            <template v-if="menuKind === 'at'">
              <component :is="atIcon(item)" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0"><span class="block truncate font-medium">{{ (item as any).label }}</span><span class="mt-0.5 block truncate text-[11px] opacity-70">{{ (item as any).description }}</span></span>
            </template>
            <template v-else>
              <span class="min-w-0"><span class="block font-mono font-medium text-primary">/{{ (item as WorldResource).file.name.replace(/\.[^.]+$/, '') }}</span><span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{{ (item as WorldResource).scope === 'global' ? '共享世界' : '角色世界' }}</span></span>
            </template>
          </button>
          <p v-if="menuRows.length === 0" class="px-3 py-8 text-center text-xs text-muted-foreground">暂无匹配项</p>
        </div>
      </div>
    </Transition>

    <InputMessage :model-value="modelValue" :disabled="generating" :suggestions="suggestions" placeholder="随心输入，输入 @ 引用，输入 / 执行命令…" :min-rows="2" :max-rows="8" class="rounded-2xl border border-border/80 bg-background/95 shadow-[0_8px_26px_-18px_hsl(var(--foreground)/0.55)]" @update:model-value="emit('update:modelValue', $event)" @send="emit('submit')">
      <template #attachments>
        <ComposerAttachmentStrip v-if="attachments.length" :attachments="attachments" @remove="emit('removeAttachment', $event)" />
        <div v-if="selectedAction" class="flex items-center">
          <span class="rounded-md border bg-muted/50 px-2 py-1 text-xs font-mono text-primary">/{{ selectedAction.label }}</span>
          <Button size="icon-sm" variant="ghost" title="移除动作" @click="emit('update:selectedAction', null)">×</Button>
        </div>
      </template>
      <template #left><Button size="icon-sm" variant="ghost" title="引用或添加附件" @click="toolsOpen = !toolsOpen"><Plus class="size-4" /></Button></template>
      <template #right>
        <DropdownMenu>
          <DropdownMenuTrigger as-child><Button size="icon-sm" :variant="editMode ? 'secondary' : 'ghost'" title="切换输入模式"><PencilLine class="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="emit('toggleEditMode')">{{ activeModeId === 'builtin-edit' ? '退出编辑模式' : '编辑模式' }}</DropdownMenuItem>
            <DropdownMenuItem v-for="mode in modes" :key="mode.id" @click="emit('selectMode', activeModeId === mode.id ? null : mode)">{{ activeModeId === mode.id ? `退出 ${mode.name}` : mode.name }}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span v-if="tokenUsage" class="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground" :title="`上一次发送：${tokenUsage}`">{{ tokenUsage }}</span>
        <slot name="model" />
        <SttInputButton class="size-7 shrink-0 rounded-lg text-muted-foreground" @result="insertDictation" />
      </template>
    </InputMessage>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(0.25rem); }
</style>
