<script setup lang="ts">
import { FileText, X } from "lucide-vue-next";
import { push } from "notivue";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import {
  attachmentPreviewUrl,
  formatAttachmentSize,
  openMessageAttachment,
} from "@/features/Resources/Conversation/application/message-attachment";
import type { FilePart } from "@/features/Resources/Conversation/domain/conversation-types";

const props = withDefaults(
  defineProps<{
    attachments: FilePart[];
    removable?: boolean;
  }>(),
  {
    removable: false,
  },
);

const emit = defineEmits<{
  remove: [index: number];
}>();

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
    <Attachment
      v-for="(attachment, index) in props.attachments"
      :key="`${attachment.filename}:${attachment.mediaType}:${index}`"
      size="xs"
      class="min-w-0 max-w-64 cursor-pointer flex-nowrap rounded-md"
      role="button"
      tabindex="0"
      :title="attachment.filename || '打开附件'"
      @click="openAttachment(attachment)"
      @keydown.enter.prevent="openAttachment(attachment)"
      @keydown.space.prevent="openAttachment(attachment)"
    >
      <AttachmentMedia
        :variant="attachment.mediaType.startsWith('image/') ? 'image' : 'icon'"
      >
        <img
          v-if="attachmentPreviewUrl(attachment)"
          :src="attachmentPreviewUrl(attachment)"
          alt=""
        />
        <FileText v-else />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{{ attachment.filename || "未命名附件" }}</AttachmentTitle>
        <AttachmentDescription>
          {{ formatAttachmentSize(attachment.size) || attachment.mediaType }}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions v-if="props.removable">
        <AttachmentAction
          title="移除附件"
          @click.stop="emit('remove', index)"
        >
          <X />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  </AttachmentGroup>
</template>
