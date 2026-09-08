<script setup lang="ts">
import { FileText, MessageSquareText, X } from "lucide-vue-next";
import { push } from "notivue";
import { ref, watch } from "vue";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
	AttachmentTrigger,
} from "@/components/ui/attachment";
import type {
	FilePart,
	ReferencePart,
} from "@/features/Conversation/messages/message-types";
import {
	attachmentPreviewUrl,
	formatAttachmentSize,
	openMessageAttachment,
} from "@/features/Conversation/messages/message-attachment";

const props = withDefaults(
	defineProps<{
		attachments: (FilePart | ReferencePart)[];
		removable?: boolean;
	}>(),
	{ removable: true },
);
const emit = defineEmits<{ remove: [index: number] }>();
const previewUrls = ref<Record<string, string>>({});

watch(
	() => props.attachments,
	async (attachments) => {
		const entries = await Promise.all(
			attachments
				.filter(isFile)
				.map(async (attachment) => [
					attachment.url,
					await attachmentPreviewUrl(attachment),
				] as const),
		);
		previewUrls.value = Object.fromEntries(entries);
	},
	{ immediate: true, deep: false },
);

async function openAttachment(attachment: FilePart) {
	try {
		await openMessageAttachment(attachment);
	} catch (error) {
		push.error(error instanceof Error ? error.message : "无法打开附件");
	}
}

function isFile(attachment: FilePart | ReferencePart): attachment is FilePart {
	return attachment.type === "file";
}

function title(attachment: FilePart | ReferencePart) {
	return attachment.type === "file"
		? attachment.filename || "未命名附件"
		: attachment.label;
}

function description(attachment: FilePart | ReferencePart) {
	if (attachment.type === "reference")
		return attachment.referenceType === "file" ? "引用文件" : "引用消息";
	return formatAttachmentSize(attachment.size) || attachment.mediaType;
}

function previewUrl(attachment: FilePart | ReferencePart) {
	return isFile(attachment) ? previewUrls.value[attachment.url] ?? "" : "";
}
</script>

<template>
  <AttachmentGroup v-if="props.attachments.length" class="gap-2 py-0.5">
    <Attachment v-for="(attachment, index) in props.attachments" :key="`${attachment.type}:${attachment.type === 'file' ? attachment.filename : attachment.id}:${index}`" size="xs" class="min-w-0 max-w-64 flex-nowrap rounded-md">
      <AttachmentMedia :variant="isFile(attachment) && attachment.mediaType.startsWith('image/') ? 'image' : 'icon'">
        <img v-if="previewUrl(attachment)" :src="previewUrl(attachment)" alt="" />
        <MessageSquareText v-else-if="attachment.type === 'reference' && attachment.referenceType === 'message'" />
        <FileText v-else />
      </AttachmentMedia>
      <AttachmentContent><AttachmentTitle>{{ title(attachment) }}</AttachmentTitle><AttachmentDescription>{{ description(attachment) }}</AttachmentDescription></AttachmentContent>
      <AttachmentActions v-if="removable"><AttachmentAction title="移除附件" @click.stop="emit('remove', index)"><X /></AttachmentAction></AttachmentActions>
      <AttachmentTrigger v-if="isFile(attachment)" :aria-label="`打开 ${attachment.filename || '附件'}`" @click="openAttachment(attachment)" />
    </Attachment>
  </AttachmentGroup>
</template>
