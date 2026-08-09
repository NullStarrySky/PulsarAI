<script setup lang="ts">
import { Paperclip, Send, Square } from "lucide-vue-next";
import { push } from "notivue";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import { useConversationStore } from "../application/conversation-store";
import { fileToMessagePart } from "../application/message-attachment";
import type { ActionPart, FilePart } from "../domain/conversation-types";
import ConversationActionPicker from "./ConversationActionPicker.vue";
import ConversationBranchMapDialog from "./ConversationBranchMapDialog.vue";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";
import ConversationComposerToolbarTools from "./ConversationComposerToolbarTools.vue";
import GenerationComponentDialog from "./GenerationComponentDialog.vue";
import MessageAttachmentStrip from "./MessageAttachmentStrip.vue";

const conversation = useConversationStore();
const plugin = usePluginStore();
const appearance = useAppearanceStore();
const input = ref("");
const selectedAction = ref<ActionPart | null>(null);
const pendingAttachments = ref<FilePart[]>([]);
const attachmentInput = ref<HTMLInputElement | null>(null);
const fullscreenOpen = ref(false);
const whiteboardOpen = ref(false);
const mapOpen = ref(false);

const actions = computed(() =>
	plugin.actionResourcesForPackage(
		conversation.activePackageId,
		conversation.activePackage?.enabledGlobalPluginIds,
		conversation.activePackage?.mainPluginId,
	),
);
const canSend = computed(
	() =>
		Boolean(input.value.trim()) && !conversation.activeConversationGenerating,
);
const isBlankConversation = computed(() =>
	conversation.activePath.every((container) =>
		container.role === "system"
		|| !conversation.currentMessage(container)?.content.trim(),
	),
);
const suggestedTopics = computed(() => {
	const name = conversation.activePackage?.name ?? "你";
	return [
		`先简单介绍一下${name}吧`,
		"聊聊今天最值得记录的一件事",
		"一起构思一个短故事",
		"给我一个意想不到的话题",
	];
});

function resolveAction(content: string) {
	if (selectedAction.value)
		return {
			content,
			action: selectedAction.value,
			prompt: undefined as string | undefined,
		};
	const match = content.match(/^\s*\/([^\s]+)(?:\s+([\s\S]*))?$/);
	const candidate = match?.[1]
		? actions.value.find(
				({ resource }) =>
					resource.name.trim().toLocaleLowerCase() ===
					match[1]!.toLocaleLowerCase(),
			)
		: null;
	if (!candidate)
		return { content, action: null, prompt: undefined as string | undefined };
	if (candidate.kind === "prompt") {
		return {
			content,
			action: null,
			prompt:
				typeof candidate.resource.content === "string"
					? candidate.resource.content
					: JSON.stringify(candidate.resource.content, null, 2),
		};
	}
	return {
		content: match?.[2] ?? "",
		prompt: undefined,
		action: {
			type: "action" as const,
			actionId: candidate.resource.id,
			pluginId: candidate.pluginId,
			pluginName: candidate.pluginName,
			name: candidate.resource.name,
			description: "",
		},
	};
}

async function send() {
	if (!canSend.value) return;
	const resolved = resolveAction(input.value);
	if (resolved.prompt !== undefined) {
		input.value = resolved.prompt;
		selectedAction.value = null;
		return;
	}
	const content = resolved.content;
	const attachments = [...pendingAttachments.value];
	input.value = "";
	pendingAttachments.value = [];
	selectedAction.value = null;
	await conversation.send(content, undefined, attachments, resolved.action);
}

function requestAttachments() {
	attachmentInput.value?.click();
}

async function onAttachmentsSelected(event: Event) {
	const element = event.target as HTMLInputElement;
	const files = Array.from(element.files ?? []);
	element.value = "";
	try {
		pendingAttachments.value.push(
			...(await Promise.all(files.map(fileToMessagePart))),
		);
	} catch (error) {
		push.error(error instanceof Error ? error.message : "读取附件失败");
	}
}
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 grid grid-cols-[minmax(1rem,1fr)_minmax(0,724px)_minmax(1rem,1fr)] mobile:block">
    <div aria-hidden="true" class="mobile:hidden" />
    <div class="pointer-events-auto w-full pb-4 pt-2 mobile:px-2 mobile:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div v-if="isBlankConversation" class="mb-2 flex flex-wrap justify-center gap-1.5 px-2">
        <Button
          v-for="topic in suggestedTopics"
          :key="topic"
          variant="secondary"
          size="sm"
          class="h-7 rounded-full px-3 text-xs font-normal shadow-sm"
          @click="input = topic"
        >
          {{ topic }}
        </Button>
      </div>
      <div class="min-h-[96px] w-full rounded-3xl border border-border bg-popover shadow-sm">
        <div class="flex min-h-[94px] flex-col justify-between gap-1 p-2 pt-0">
          <ConversationActionPicker v-model="input" v-model:selected-action="selectedAction" :actions="actions" />
          <MessageAttachmentStrip v-if="pendingAttachments.length" :attachments="pendingAttachments" removable @remove="pendingAttachments.splice($event, 1)" />
          <ConversationComposerEditor v-model="input" compact placeholder="随心输入" :enable-ai="false" @submit="send" />
          <div class="flex min-w-0 items-center justify-between gap-2">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <ConversationComposerToolbarTools
                v-model:prompt="input"
                :tool-ids="appearance.composerToolbar.left"
                @attach="requestAttachments"
                @whiteboard="whiteboardOpen = true"
                @map="mapOpen = true"
                @fullscreen="fullscreenOpen = true"
              />
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <ConversationComposerToolbarTools
                v-model:prompt="input"
                :tool-ids="appearance.composerToolbar.right"
                @attach="requestAttachments"
                @whiteboard="whiteboardOpen = true"
                @map="mapOpen = true"
                @fullscreen="fullscreenOpen = true"
              />
              <Button v-if="conversation.activeConversationGenerating" size="icon-sm" class="rounded-full" title="生成中"><Square class="size-3.5 fill-current" /></Button>
              <Button v-else size="icon-sm" class="rounded-full" title="发送" :disabled="!canSend" @click="send"><Send class="size-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div aria-hidden="true" class="mobile:hidden" />
  </div>

  <input ref="attachmentInput" type="file" multiple class="hidden" @change="onAttachmentsSelected" />

  <Dialog v-model:open="fullscreenOpen">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader><DialogTitle>输入消息</DialogTitle></DialogHeader>
      <MessageAttachmentStrip v-if="pendingAttachments.length" :attachments="pendingAttachments" removable @remove="pendingAttachments.splice($event, 1)" />
      <Textarea v-model="input" class="min-h-[46vh] resize-none" placeholder="输入消息…" />
      <DialogFooter>
        <Button variant="ghost" size="icon" class="mr-auto" @click="requestAttachments"><Paperclip class="size-4" /></Button>
        <Button variant="outline" @click="fullscreenOpen = false">取消</Button>
        <Button :disabled="!canSend" @click="fullscreenOpen = false; send()"><Send class="size-4" />发送</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="whiteboardOpen">
    <DialogContent class="h-[min(820px,92vh)] w-[min(1200px,calc(100vw-32px))] max-w-none overflow-hidden p-0 sm:max-w-none mobile:h-[100dvh] mobile:w-screen mobile:rounded-none mobile:border-0">
      <iframe class="h-full w-full border-0 bg-background" src="https://excalidraw.com/" title="Excalidraw 白板" allow="clipboard-read; clipboard-write" />
    </DialogContent>
  </Dialog>

  <ConversationBranchMapDialog v-model:open="mapOpen" />
  <GenerationComponentDialog />
</template>
