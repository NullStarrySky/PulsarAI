<script setup lang="ts">
import { FileText, X } from "lucide-vue-next";
import { push } from "notivue";
import {
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
	AttachmentTrigger,
} from "@/components/ui/attachment";
import type { FilePart } from "@/features/Conversation/messages/conversation-types";
import {
	attachmentPreviewUrl,
	formatAttachmentSize,
	openMessageAttachment,
} from "@/features/Conversation/messages/message-attachment";

const props = defineProps<{ attachments: FilePart[] }>();
const emit = defineEmits<{ remove: [index: number] }>();

async function openAttachment(attachment: FilePart) {
	try {
		await openMessageAttachment(attachment);
	} catch (error) {
		push.error(error instanceof Error ? error.message : "无法打开附件");
	}
}
</script>

<template>
  <AttachmentGroup v-if="props.attachments.length" class="gap-2 py-0.5">
    <Attachment v-for="(attachment, index) in props.attachments" :key="`${attachment.filename}:${index}`" size="xs" class="min-w-0 max-w-64 flex-nowrap rounded-md">
      <AttachmentMedia :variant="attachment.mediaType.startsWith('image/') ? 'image' : 'icon'">
        <img v-if="attachmentPreviewUrl(attachment)" :src="attachmentPreviewUrl(attachment)" alt="" />
        <FileText v-else />
      </AttachmentMedia>
      <AttachmentContent><AttachmentTitle>{{ attachment.filename || "未命名附件" }}</AttachmentTitle><AttachmentDescription>{{ formatAttachmentSize(attachment.size) || attachment.mediaType }}</AttachmentDescription></AttachmentContent>
      <AttachmentActions><AttachmentAction title="移除附件" @click.stop="emit('remove', index)"><X /></AttachmentAction></AttachmentActions>
      <AttachmentTrigger :aria-label="`打开 ${attachment.filename || '附件'}`" @click="openAttachment(attachment)" />
    </Attachment>
  </AttachmentGroup>
</template>
