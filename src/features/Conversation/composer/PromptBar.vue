<script setup lang="ts">
import {
	ArrowUp,
	LoaderCircle,
	Paperclip,
	PenTool,
	Plus,
	X,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import type {
	ActionPart,
	FilePart,
} from "@/features/Conversation/messages/conversation-types";
import type { WorldResource } from "@/features/Plugin/tree/world-store";
import SttInputButton from "@/features/STT/SttInputButton.vue";
import ComposerAttachmentStrip from "./ComposerAttachmentStrip.vue";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";

const props = withDefaults(
	defineProps<{
		modelValue: string;
		attachments: FilePart[];
		actions?: WorldResource[];
		selectedAction?: ActionPart | null;
		generating?: boolean;
	}>(),
	{ actions: () => [], selectedAction: null, generating: false },
);

const emit = defineEmits<{
	"update:modelValue": [value: string];
	"update:selectedAction": [value: ActionPart | null];
	submit: [];
	attach: [];
	whiteboard: [];
	removeAttachment: [index: number];
	openView: [action: WorldResource];
}>();

const toolsOpen = ref(false);
const activeIndex = ref(0);
const liveInput = ref(props.modelValue);
const menuDismissed = ref(false);
const token = computed(() => {
	const input = liveInput.value.replace(/\u200B/g, "");
	const lineStart = input.lastIndexOf("\n") + 1;
	const lastLine = input.slice(lineStart);
	const match = /(^|\s)([@/])([\w-]*)$/u.exec(lastLine);
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
const atRows = [
	{
		key: "attach",
		title: "附加文件与照片",
		description: "从设备选择附件",
		icon: Paperclip,
	},
	{
		key: "whiteboard",
		title: "打开白板",
		description: "在画布中整理想法",
		icon: PenTool,
	},
] as const;
const actionRows = computed(() =>
	props.actions.filter((action) =>
		action.file.name.toLocaleLowerCase().includes(token.value?.query ?? ""),
	),
);
const menuRows = computed(() =>
	menuKind.value === "at"
		? atRows
		: menuKind.value === "slash"
			? actionRows.value
			: [],
);
const canSubmit = computed(
	() =>
		Boolean(
			props.modelValue.trim() ||
				props.selectedAction ||
				props.attachments.length,
		) && !props.generating,
);

watch([menuKind, () => token.value?.query], () => {
	activeIndex.value = 0;
});
watch(
	() => props.modelValue,
	(value) => {
		if (
			typeof document !== "undefined" &&
			document.activeElement?.closest(".conversation-composer-editor")
		)
			return;
		liveInput.value = value;
	},
);

function updateLiveInput(value: string) {
	liveInput.value = value;
	toolsOpen.value = false;
	menuDismissed.value = false;
}

function insertDictation(text: string) {
	emit(
		"update:modelValue",
		`${props.modelValue}${props.modelValue ? " " : ""}${text}`,
	);
}

function clearActiveToken() {
	const activeToken = token.value;
	if (!activeToken) return;
	const nextValue = liveInput.value.slice(0, activeToken.start);
	liveInput.value = nextValue;
	emit("update:modelValue", nextValue);
}

function runAtTool(key: (typeof atRows)[number]["key"]) {
	clearActiveToken();
	if (key === "attach") emit("attach");
	if (key === "whiteboard") emit("whiteboard");
	toolsOpen.value = false;
	menuDismissed.value = false;
}

function pickAction(action: WorldResource) {
	if (action.file.name.endsWith(".md")) {
		const nextValue =
			typeof action.file.content === "string"
				? action.file.content
				: JSON.stringify(action.file.content, null, 2);
		liveInput.value = nextValue;
		emit("update:modelValue", nextValue);
	} else if (action.file.name.endsWith(".vue")) {
		clearActiveToken();
		emit("openView", action);
	} else {
		emit("update:selectedAction", {
			type: "action",
			actionId: action.file.id,
			sourcePath: action.path,
			sourceName: action.scope === "global" ? "共享世界" : "角色世界",
			name: action.file.name.replace(/\.[^.]+$/, ""),
			description: "",
		});
		liveInput.value = "";
		emit("update:modelValue", "");
	}
	toolsOpen.value = false;
	menuDismissed.value = false;
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
			if (!item) return;
			if (menuKind.value === "at")
				runAtTool((item as (typeof atRows)[number]).key);
			else pickAction(item as WorldResource);
			return;
		}
	}
	if (event.key === "Escape") {
		toolsOpen.value = false;
		menuDismissed.value = true;
	}
}
</script>

<template>
  <div class="relative" @keydown.capture="handleKeydown">
    <Transition name="fade">
      <div
        v-if="menuKind"
        class="absolute inset-x-0 bottom-[calc(100%+0.625rem)] z-20 overflow-hidden rounded-2xl border bg-popover/98 p-1.5 shadow-xl backdrop-blur"
      >
        <p class="border-b px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">{{ menuKind === 'at' ? '快捷工具' : '选择插件动作' }}</p>
        <div class="max-h-60 overflow-y-auto py-1">
          <template v-if="menuKind === 'at'">
            <button
              v-for="item in atRows"
              :key="item.key"
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-xs transition-colors hover:bg-accent/60"
              @mousedown.prevent
              @click="runAtTool(item.key)"
            >
              <component :is="item.icon" class="size-4 text-muted-foreground" />
              <span class="min-w-0"><span class="block font-medium">{{ item.title }}</span><span class="mt-0.5 block text-[11px] opacity-70">{{ item.description }}</span></span>
            </button>
          </template>
          <template v-else>
            <button
              v-for="item in actionRows"
              :key="item.file.id"
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-xs transition-colors hover:bg-accent/60"
              @mousedown.prevent
              @click="pickAction(item)"
            >
              <span class="min-w-0"><span class="block font-mono font-medium text-primary">/{{ item.file.name.replace(/\.[^.]+$/, '') }}</span><span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{{ item.scope === 'global' ? '共享世界' : '角色世界' }}</span></span>
            </button>
            <p v-if="actionRows.length === 0" class="px-3 py-8 text-center text-xs text-muted-foreground">暂无匹配的插件动作</p>
          </template>
        </div>
      </div>
    </Transition>

    <div v-if="selectedAction" class="mb-1.5 flex items-center">
      <div class="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/50 py-1 pl-2.5 pr-1 text-xs">
        <span class="truncate font-mono font-medium text-primary">/{{ selectedAction.name }}</span>
        <Button size="icon-sm" variant="ghost" class="rounded-full" title="移除动作" @click="emit('update:selectedAction', null)"><X class="size-3" /></Button>
      </div>
    </div>

    <div
      class="rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-[0_8px_26px_-18px_hsl(var(--foreground)/0.55)] transition-[border-color,box-shadow] duration-150 focus-within:border-ring/55 focus-within:shadow-[0_10px_30px_-18px_hsl(var(--ring)/0.45)]"
    >
      <ComposerAttachmentStrip
        v-if="attachments.length"
        :attachments="attachments"
        @remove="emit('removeAttachment', $event)"
      />

      <div class="min-w-0">
        <ConversationComposerEditor
          :model-value="modelValue"
          placeholder="随心输入，输入 @ 或 / 打开工具…"
          class="min-w-0"
          @raw-input="updateLiveInput"
          @update:model-value="emit('update:modelValue', $event)"
          @submit="emit('submit')"
        />
        <div class="mt-1 flex min-w-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            class="size-8 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
            title="更多输入工具"
            @click="toolsOpen = !toolsOpen"
          >
            <Plus class="size-4" />
          </Button>
          <div class="min-w-0 flex-1" />
          <div class="min-w-0 shrink">
            <slot name="model" />
          </div>
          <SttInputButton
            class="size-8 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
            @result="insertDictation"
          />
          <Button
            size="icon"
            class="size-8 shrink-0 rounded-xl shadow-sm"
            :disabled="!canSubmit"
            title="发送"
            @click="emit('submit')"
          >
            <LoaderCircle v-if="generating" class="size-4 animate-spin" />
            <ArrowUp v-else class="size-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(0.25rem);
}
</style>
