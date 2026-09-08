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
const inputSuggestions = computed(() => {
	if (!menuKind.value) return [];
	if (menuKind.value === "at") {
		return atRows.value.map((item) => ({
			id: (item as any).key ?? (item as any).label,
			label: (item as any).label,
			description: (item as any).description,
			icon: atIcon(item),
			value: props.modelValue,
			raw: item,
		}));
	}
	return actionRows.value.map((action) => ({
		id: action.file.id,
		label: `/${action.file.name.replace(/\.[^.]+$/, "")}`,
		description: action.scope === "global" ? "共享世界" : "角色世界",
		value: props.modelValue,
		raw: action,
	}));
});

function onSelectSuggestion(item: any) {
	if (!item) return;
	const raw = typeof item === "object" && "raw" in item ? item.raw : item;
	if (menuKind.value === "at") {
		pickAt(raw);
	} else if (menuKind.value === "slash") {
		pickAction(raw);
	}
}

function insertDictation(text: string) {
	emit(
		"update:modelValue",
		`${props.modelValue}${props.modelValue ? " " : ""}${text}`,
	);
}

function atIcon(item: unknown) {
	const row = item as ComposerReferenceOption & { icon?: unknown };
	return (
		row.icon ??
		(row.reference?.referenceType === "file" ? FileText : MessageSquareText)
	);
}
</script>

<template>
  <div class="relative">
    <InputMessage
      :model-value="modelValue"
      :disabled="generating"
      :suggestions="inputSuggestions"
      placeholder="随心输入，输入 @ 引用，输入 / 执行命令…"
      :min-rows="2"
      :max-rows="8"
      :class="[
        'rounded-2xl border border-border/80 bg-background/95 shadow-[0_8px_26px_-18px_hsl(var(--foreground)/0.55)] transition-[border-color,box-shadow]',
        editMode && 'border-primary/60 ring-2 ring-primary/20 shadow-[0_8px_26px_-18px_hsl(var(--primary)/0.45)]',
      ]"
      @update:model-value="emit('update:modelValue', $event)"
      @send="emit('submit')"
      @select-suggestion="onSelectSuggestion"
    >
      <template #attachments>
        <div v-if="editMode" class="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">
          <PencilLine class="size-3" />
          <span>{{ activeModeId === 'builtin-edit' ? '编辑模式' : '子模式中' }}</span>
          <button type="button" class="ml-1 text-primary/70 hover:text-primary" title="退出编辑模式" @click="emit('toggleEditMode')">×</button>
        </div>
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
