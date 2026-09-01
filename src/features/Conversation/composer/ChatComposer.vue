<script setup lang="ts">
import { push } from "notivue";
import { type Component, computed, onMounted, ref, toRef } from "vue";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type {
	ActionPart,
	FilePart,
} from "@/features/Conversation/messages/conversation-types";
import { fileToMessagePart } from "@/features/Conversation/messages/message-attachment";
import { useConversation } from "@/features/Conversation/use-conversation";
import { useDefaultConfigStore } from "@/features/defaultConfigs/default-config-store";
import ModelSelect from "@/features/ModelConnection/components/ModelSelect.vue";
import { compilePluginVueFile } from "@/features/Plugin/editors/vue/plugin-vue-runtime";
import type { WorldResource } from "@/features/Plugin/tree/world-store";
import { useWorld } from "@/features/Plugin/tree/world-store";
import PromptBar from "./PromptBar.vue";

const props = defineProps<{ chatId: string }>();
const chat = useConversation(toRef(props, "chatId"));
const world = useWorld(toRef(props, "chatId"));
const defaults = useDefaultConfigStore();
const files = ref<FilePart[]>([]);
const selectedAction = ref<ActionPart | null>(null);
const input = ref<HTMLInputElement | null>(null);
const whiteboardOpen = ref(false);
const actionViewOpen = ref(false);
const actionView = ref<WorldResource | null>(null);
const actionViewComponent = ref<Component | null>(null);

const isEmpty = computed(() => chat.activePath.value.length === 0);
const suggestions = [
	"用一句话介绍你自己",
	"我们开始一段新的对话",
	"帮我梳理一个想法",
];
const actions = computed(
	() =>
		world.slots.value.find((slot) => slot.path === "/self/slot/COMMAND")
			?.resources ?? [],
);

onMounted(() => {
	if (!defaults.loaded) void defaults.load();
});

async function selectFiles(event: Event) {
	const target = event.target as HTMLInputElement;
	files.value.push(
		...(await Promise.all(
			Array.from(target.files ?? []).map(fileToMessagePart),
		)),
	);
	target.value = "";
}

async function send() {
	if (chat.generating.value) return;
	const parts = selectedAction.value
		? [...files.value, selectedAction.value]
		: files.value;
	if (await chat.send(parts)) {
		files.value = [];
		selectedAction.value = null;
	}
}

function useSuggestion(value: string) {
	chat.draft.value = value;
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
      <div v-if="isEmpty" class="mb-3 flex flex-wrap justify-center gap-2 px-2">
        <Button
          v-for="suggestion in suggestions"
          :key="suggestion"
          variant="secondary"
          class="h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
          @click="useSuggestion(suggestion)"
        >
          {{ suggestion }}
        </Button>
      </div>

      <PromptBar
        v-model="chat.draft.value"
        :attachments="files"
        :actions="actions"
        :selected-action="selectedAction"
        :generating="chat.generating.value"
        @submit="send"
        @attach="input?.click()"
        @whiteboard="whiteboardOpen = true"
        @remove-attachment="files.splice($event, 1)"
        @update:selected-action="selectedAction = $event"
        @open-view="openActionView"
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
    <DialogContent class="h-[min(820px,92vh)] w-[min(1200px,calc(100vw-32px))] max-w-none overflow-hidden p-0 sm:max-w-none mobile:h-[100dvh] mobile:w-screen mobile:rounded-none mobile:border-0">
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
