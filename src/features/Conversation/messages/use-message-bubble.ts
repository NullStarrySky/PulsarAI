import { computed, reactive, unref, type MaybeRef } from "vue";
import { useConversation } from "@/features/Conversation/use-conversation";
import type { ChatMessage, ChatMessageContainer, FilePart } from "./conversation-types";
import {
  attachmentPreviewUrl,
  formatAttachmentSize,
  openMessageAttachment,
} from "./message-attachment";

/** View state for the default bubble; message mutations stay in useConversation. */
export function useMessageBubble(
  container: MaybeRef<ChatMessageContainer>,
  message: MaybeRef<ChatMessage | null>,
) {
  const conversation = useConversation(computed(() => unref(container).conversationid));
  const editing = reactive({ active: false, content: "" });
  const thinking = computed(() => unref(message)?.meta.steps.filter(
    (step) => step.type === "thinking" || step.type === "tool-call" || step.type === "tool-result",
  ) ?? []);
  const attachments = computed(() => unref(message)?.parts?.filter(
    (part): part is FilePart => part.type === "file",
  ) ?? []);
  const pluginChanges = computed(() => unref(message)?.meta.pluginChanges);
  const hasPluginChanges = computed(() => Boolean(pluginChanges.value?.changes.length));
  const agentWorking = computed(() =>
    conversation.generating.value &&
    conversation.activePath.value[conversation.activePath.value.length - 1]?.id === unref(container).id &&
    unref(message)?.meta.generateInfo?.timeUsed === undefined,
  );
  const hasVisibleMessage = computed(() => Boolean(
    thinking.value.length || attachments.value.length || unref(message)?.content.trim() || unref(message)?.type === "error",
  ));
  const canNavigateNext = computed(() =>
    (unref(container).activeMessage ?? 0) < unref(container).content.length - 1 || !conversation.generating.value,
  );
  const resourceSummary = computed(() => `${pluginChanges.value?.changes.length ?? 0} 项资源变更`);

  function startEdit() {
    const current = unref(message);
    if (!current) return;
    editing.active = true;
    editing.content = current.content;
  }

  async function saveEdit() {
    if (!unref(message)) return;
    await conversation.updateMessage(unref(container).id, editing.content);
    editing.active = false;
  }

  function exportScreenshot() {
    const current = unref(container);
    return conversation.exportMessageScreenshot(
      current.id,
      document.getElementById(`message-bubble-${current.id}`),
    );
  }

  function messageTime() {
    const current = unref(message);
    const value = current?.createdAt ?? current?.meta.generateInfo?.startTime;
    return value
      ? new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "";
  }

  function formatValue(value: unknown) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return {
    conversation,
    editing,
    thinking,
    attachments,
    pluginChanges,
    hasPluginChanges,
    agentWorking,
    hasVisibleMessage,
    canNavigateNext,
    resourceSummary,
    startEdit,
    saveEdit,
    exportScreenshot,
    messageTime,
    formatValue,
    attachmentPreviewUrl,
    formatAttachmentSize,
    openMessageAttachment,
  };
}
