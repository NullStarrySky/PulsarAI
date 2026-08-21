<script setup lang="ts">
import { computed, ref } from "vue";
import { Paperclip, Send } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { fileToMessagePart } from "@/features/Conversation/messages/message-attachment";
import type { FilePart } from "@/features/Conversation/messages/conversation-types";
import { toRef } from "vue";
import { useConversation } from "@/features/Conversation/use-conversation";
import ComposerAttachmentStrip from "./ComposerAttachmentStrip.vue";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";

const props = defineProps<{ chatId: string }>();
const chat = useConversation(toRef(props, "chatId"));
const files = ref<FilePart[]>([]);
const input = ref<HTMLInputElement | null>(null);
const canSend = computed(() => Boolean(chat.draft.value.trim() || files.value.length) && !chat.generating.value);

async function selectFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  files.value.push(...await Promise.all(Array.from(target.files ?? []).map(fileToMessagePart)));
  target.value = "";
}

async function send() {
  if (!canSend.value) return;
  if (await chat.send(files.value)) files.value = [];
}
</script>

<template>
  <div class="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[760px] px-4 pb-5 mobile:px-3">
    <div class="rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
      <ComposerAttachmentStrip v-if="files.length" :attachments="files" class="mb-2" @remove="files.splice($event, 1)" />
      <ConversationComposerEditor v-model="chat.draft.value" @submit="send" />
      <div class="mt-2 flex justify-between gap-2">
        <Button variant="ghost" size="icon" title="添加附件" @click="input?.click()"><Paperclip /></Button>
        <input ref="input" class="hidden" type="file" multiple @change="selectFiles" />
        <Button size="icon" :disabled="!canSend" title="发送" @click="send"><Send /></Button>
      </div>
    </div>
  </div>
</template>
