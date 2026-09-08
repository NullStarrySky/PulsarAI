<script setup lang="ts">
import { push } from "notivue";
import {
	type Component,
	computed,
	onBeforeUnmount,
	onMounted,
	ref,
	toRef,
} from "vue";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/fluid";
import type {
	ActionPart,
	FilePart,
	ReferencePart,
} from "@/features/Conversation/messages/message-types";
import { fileToMessagePart } from "@/features/Conversation/messages/message-attachment";
import { removeMediaLink } from "@/features/Media/media-link";
import { toggleEditModeEvent } from "@/features/Conversation/actions";
import { useConversation } from "@/features/Conversation/use-conversation";
import { useDefaultConfigStore } from "@/features/defaultConfigs/default-config-store";
import ModelSelect from "@/features/ModelConnection/components/ModelSelect.vue";
import { compilePluginVueFile } from "@/features/Plugin/editors/vue/plugin-vue-runtime";
import {
	parsePluginModes,
	type PluginMode,
} from "@/features/Plugin/runtime/mode-slot";
import type { WorldResource } from "@/features/Plugin/tree/world-store";
import { useWorld } from "@/features/Plugin/tree/world-store";
import PromptBar from "./PromptBar.vue";

const props = defineProps<{ chatId: string }>();
const chat = useConversation(toRef(props, "chatId"));
const world = useWorld(toRef(props, "chatId"));
const defaults = useDefaultConfigStore();
const attachments = ref<(FilePart | ReferencePart)[]>([]);
const selectedAction = ref<ActionPart | null>(null);
const input = ref<HTMLInputElement | null>(null);
const whiteboardOpen = ref(false);
const actionViewOpen = ref(false);
const actionView = ref<WorldResource | null>(null);
const actionViewComponent = ref<Component | null>(null);

const draftContent = computed({
	get: () => chat.composerDraftContent.value,
	set: (val: string) => {
		chat.composerDraftContent.value = val;
	},
});

const actions = computed(
	() =>
		world.slots.value.find((slot) => slot.path === "/self/slot/COMMAND")
			?.resources ?? [],
);
const modes = computed(() =>
	parsePluginModes(
		world.slots.value.find((slot) => slot.path === "/self/slot/MODE")
			?.resources ?? [],
	),
);
const activeModeId = computed(
	() => chat.editModeInterval.value?.interval.id ?? "",
);
const referenceOptions = computed(() => [
	...world.resources.value.map((resource) => ({
		key: `file:${resource.file.id}`,
		label: resource.file.name,
		description: resource.displayPath,
		reference: {
			type: "reference" as const,
			referenceType: "file" as const,
			id: resource.file.id,
			label: resource.file.name,
			path: resource.path,
			content:
				typeof resource.file.content === "string"
					? resource.file.content
					: JSON.stringify(resource.file.content, null, 2),
		},
	})),
	...chat.activePathView.value
		.filter((item) => item.message?.content && item.role !== "system")
		.map((item) => ({
			key: `message:${item.message!.id}`,
			label: item.message!.content.slice(0, 48),
			description: item.role === "user" ? "用户消息" : "助手消息",
			reference: {
				type: "reference" as const,
				referenceType: "message" as const,
				id: item.message!.id,
				label: item.message!.content.slice(0, 48),
				content: item.message!.content,
			},
		})),
]);
const lastTokenUsage = computed(() => {
	const usage = [...chat.activePathView.value]
		.reverse()
		.find((item) => item.message?.meta.generateInfo?.usage)?.message?.meta
		.generateInfo?.usage;
	if (!usage) return "";
	return `${usage.inputTokens ?? 0} in · ${usage.outputTokens ?? 0} out · ${usage.totalTokens ?? 0} tokens`;
});

onMounted(() => {
	if (!defaults.loaded) void defaults.load();
	window.addEventListener(toggleEditModeEvent, toggleEditMode);
});
onBeforeUnmount(() =>
	window.removeEventListener(toggleEditModeEvent, toggleEditMode),
);

function toggleEditMode() {
	void chat.toggleEditMode();
}

async function selectMode(mode: PluginMode | null) {
	const active = chat.editModeInterval.value?.interval.content as
		| Record<string, unknown>
		| undefined;
	if (active?.exit && typeof active.exit === "string")
		await world.import(active.exit, { conversationId: props.chatId });
	if (mode?.enter)
		await world.import(mode.enter, { conversationId: props.chatId, mode });
	await chat.setMode(
		mode
			? {
					id: mode.id,
					name: mode.name,
					content: {
						mode: mode.id,
						definitionPath: mode.resourcePath,
						...(mode.exit ? { exit: mode.exit } : {}),
					},
				}
			: undefined,
	);
}

async function selectFiles(event: Event) {
	const target = event.target as HTMLInputElement;
	attachments.value.push(
		...(await Promise.all(
			Array.from(target.files ?? []).map(fileToMessagePart),
		)),
	);
	target.value = "";
}

async function send() {
	if (chat.generating.value) return;
	const parts = selectedAction.value
		? [...attachments.value, selectedAction.value]
		: attachments.value;
	if (await chat.send(parts)) {
		attachments.value = [];
		selectedAction.value = null;
	}
}

function addReference(reference: ReferencePart) {
	if (
		attachments.value.some(
			(part) => part.type === "reference" && part.id === reference.id,
		)
	)
		return;
	attachments.value.push(reference);
}

async function removeAttachment(index: number) {
	const [removed] = attachments.value.splice(index, 1);
	if (removed?.type === "file") await removeMediaLink(removed.url);
}

function openActionView(action: WorldResource) {
	const result = compilePluginVueFile(action.file);
	if (!result.component) {
		push.error(result.diagnostics[0] || "无法打开动作视图。");
		return;
	}
	if (result.diagnostics.length) push.warning(result.diagnostics.join("\n"));
	actionView.value = action;
	actionViewComponent.value = result.component;
	actionViewOpen.value = true;
}
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 grid grid-cols-[minmax(1rem,1fr)_minmax(0,724px)_minmax(1rem,1fr)] mobile:block">
    <div aria-hidden="true" class="mobile:hidden" />
    <div class="pointer-events-auto w-full pb-4 pt-2 mobile:px-2 mobile:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <PromptBar
        v-model="draftContent"
        :attachments="attachments"
        :actions="actions"
        :references="referenceOptions"
        :token-usage="lastTokenUsage"
		:edit-mode="chat.isEditMode.value"
		:modes="modes"
		:active-mode-id="activeModeId"
        :selected-action="selectedAction"
        :generating="chat.generating.value"
        @submit="send"
        @attach="input?.click()"
        @whiteboard="whiteboardOpen = true"
        @remove-attachment="removeAttachment"
        @add-reference="addReference"
        @update:selected-action="selectedAction = $event"
        @open-view="openActionView"
		@toggle-edit-mode="toggleEditMode"
		@select-mode="selectMode"
      >
        <template #model>
          <ModelSelect
            :model-value="defaults.defaultChatModel"
            button-class="h-8 max-w-[min(18rem,42vw)] justify-between rounded-lg border-0 bg-muted/65 px-2.5 text-xs shadow-none mobile:h-10"
            @update:model-value="defaults.setDefaultChatModel"
          />
        </template>
      </PromptBar>
      <input ref="input" class="hidden" type="file" multiple @change="selectFiles" />
    </div>
    <div aria-hidden="true" class="mobile:hidden" />
  </div>

  <Dialog v-model:open="whiteboardOpen">
    <DialogContent class="h-[min(820px,92vh)] w-[min(1200px,calc(100vw-32px))] max-w-none overflow-hidden p-0 sm:max-w-none mobile:h-dvh mobile:w-screen mobile:rounded-none mobile:border-0">
      <DialogHeader class="sr-only"><DialogTitle>白板</DialogTitle></DialogHeader>
      <iframe class="h-full w-full border-0 bg-background" src="https://excalidraw.com/" title="Excalidraw 白板" allow="clipboard-read; clipboard-write" />
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="actionViewOpen">
    <DialogContent class="max-h-[min(760px,90vh)] w-[min(760px,calc(100vw-32px))] max-w-none overflow-y-auto sm:max-w-none">
      <DialogHeader><DialogTitle>/{{ actionView ? actionView.file.name.replace(/\.[^.]+$/, '') : '' }}</DialogTitle></DialogHeader>
      <component :is="actionViewComponent" v-if="actionViewComponent" />
    </DialogContent>
  </Dialog>
</template>
