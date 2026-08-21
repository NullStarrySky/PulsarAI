<script setup lang="ts">
import { computed } from "vue";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import ConversationMarkdown from "@/features/Conversation/stage/markstream/ConversationMarkdown.vue";
import ChatSteps from "./ChatSteps.vue";
import { attachmentPreviewUrl, formatAttachmentSize, openMessageAttachment } from "./message-attachment";
import type { ChatMessage, ChatMessageContainer, FilePart } from "./conversation-types";

const props = defineProps<{ container: ChatMessageContainer; message: ChatMessage | null }>();
const thinking = computed(() => props.message?.meta.steps.filter((step) => step.type === "thinking" || step.type === "tool-call" || step.type === "tool-result") ?? []);
const attachments = computed(() => props.message?.parts?.filter((part): part is FilePart => part.type === "file") ?? []);
</script>

<template>
  <Message :align="container.role === 'user' ? 'end' : 'start'" class="group/message flex-col gap-1">
    <MessageContent :class="container.role === 'user' ? 'max-w-[77%] self-end mobile:max-w-[88%]' : 'w-full'">
      <Bubble :align="container.role === 'user' ? 'end' : 'start'" :variant="container.role === 'user' ? 'tinted' : 'ghost'" :class="[container.role === 'user' ? 'max-w-full' : 'w-full p-0', message?.type === 'error' ? 'border border-destructive/30 bg-destructive/10 text-destructive' : '']">
        <BubbleContent :class="container.role === 'user' ? 'rounded-2xl' : 'w-full bg-transparent p-0'">
          <ChatSteps :steps="thinking" />
          <div v-if="attachments.length" class="mb-2 flex flex-wrap gap-2">
            <button v-for="attachment in attachments" :key="attachment.filename" type="button" class="rounded-md border px-2 py-1 text-left text-xs" @click="openMessageAttachment(attachment)">
              <img v-if="attachmentPreviewUrl(attachment)" :src="attachmentPreviewUrl(attachment)" class="mr-1 inline size-5 rounded object-cover" alt="" />{{ attachment.filename }} · {{ formatAttachmentSize(attachment.size) }}
            </button>
          </div>
          <ConversationMarkdown v-if="message?.type === 'error'" :model-value="message.content" :plugin-id="message.meta.environmentInfo?.pluginId" />
          <ConversationMarkdown v-else :model-value="message?.content ?? ''" :plugin-id="message?.meta.environmentInfo?.pluginId" />
        </BubbleContent>
      </Bubble>
    </MessageContent>
  </Message>
</template>
