import { computed, unref, type MaybeRef } from "vue";
import { toBlob } from "html-to-image";
import { push } from "notivue";
import type { AdditionalParts, ChatMessageContainer } from "./messages/conversation-types";
import { useChatStore } from "./chats/chat-store";
import { useMessageStore } from "./messages/message-store";
import { generateRequestedAssistantReply } from "./messages/conversation-generation";
import { useTranslateStore } from "@/features/Translate/translate-store";
import { playMessageSpeech } from "@/features/TTS/message-speech-cache";

/**
 * A chat-bound UI/runtime contract.  There is intentionally no global
 * "active conversation": each mounted tab supplies its own chat id.
 */
export function useConversation(chatId: MaybeRef<string | null | undefined>) {
  const chats = useChatStore();
  const messages = useMessageStore();
  const translate = useTranslateStore();
  const id = computed(() => unref(chatId) ?? "");
  const chat = computed(() => chats.chats.find((item) => item.id === id.value) ?? null);
  const activePath = computed<ChatMessageContainer[]>(() => {
    const current = chat.value;
    return current
      ? messages.pathFor(current.lastContainerId ?? current.rootContainerId).filter((item) => !item.hidden)
      : [];
  });
  const draft = computed({
    get: () => chat.value?.composerDraft ?? "",
    set: (content: string) => { void chats.setComposerDraft(content, id.value); },
  });

  async function ensureLoaded() {
    const currentId = id.value;
    if (!currentId) return null;
    const current = await chats.load(currentId);
    if (!current) return null;
    await messages.loadForChat(current.id);
    return current;
  }

  async function send(parts: AdditionalParts[] = []) {
    const current = chat.value;
    const content = draft.value.trim();
    if (!current || (!content && parts.length === 0)) return null;
    const container = await messages.append({
      conversationId: current.id,
      role: "user",
      content,
      parts,
      previousContainer: current.lastContainerId,
    });
    const requestedReply = await messages.requestAssistantContainer({
      conversationId: current.id,
      previousContainer: container.id,
    });
    current.lastContainerId = requestedReply.id;
    current.composerDraft = "";
    current.updatedAt = new Date().toISOString();
    await chats.persist(current);
    await generateRequestedAssistantReply({
      chatId: current.id,
      containerId: requestedReply.id,
      activePath: messages.pathFor(container.id),
      prompt: content,
    });
    return container;
  }

  async function regenerate(containerId: string) {
    const current = chat.value;
    const target = messages.containers.find((item) => item.id === containerId);
    if (!current || chats.isGenerating(current.id) || !target || target.conversationid !== current.id || target.role !== "assistant") return null;
    const version = await messages.appendAssistantVersion(containerId);
    if (!version) return null;
    const path = messages.pathFor(target.previousContainer);
    const prompt = path[path.length - 1];
    await generateRequestedAssistantReply({
      chatId: current.id,
      containerId: target.id,
      activePath: messages.pathFor(target.previousContainer),
      prompt: messages.currentMessage(prompt ?? target)?.content ?? "",
    });
    return version;
  }

  async function navigateAssistantVersion(containerId: string, direction: -1 | 1) {
    const target = messages.containers.find((item) => item.id === containerId);
    if (!target || target.role !== "assistant") return null;
    const currentVersion = target.activeMessage ?? 0;
    const nextVersion = currentVersion + direction;
    if (nextVersion < 0) return null;
    if (nextVersion >= target.content.length) return regenerate(containerId);
    await messages.switchVersion(containerId, nextVersion);
    return messages.currentMessage(target);
  }

  async function deleteMessage(containerId: string) {
    const current = chat.value;
    const target = messages.containers.find((item) => item.id === containerId);
    if (!current || !target || target.conversationid !== current.id) return;
    const successor = messages.containers.find((item) => item.previousContainer === containerId);
    await messages.deleteContainer(containerId);
    if (current.lastContainerId === containerId) {
      current.lastContainerId = successor?.id ?? target.previousContainer ?? current.rootContainerId;
      current.updatedAt = new Date().toISOString();
      await chats.persist(current);
    }
  }

  async function confirmDeleteMessage(containerId: string) {
    if (!window.confirm("删除这条消息？")) return;
    await deleteMessage(containerId);
  }

  function branchIdsFor(containerId: string) {
    const container = messages.containers.find((item) => item.id === containerId);
    const previous = container?.previousContainer ? messages.containers.find((item) => item.id === container.previousContainer) : null;
    return previous?.availableNextContainer ?? [];
  }

  function activeBranchIdFor(containerId: string) {
    const container = messages.containers.find((item) => item.id === containerId);
    return container?.previousContainer ? messages.containers.find((item) => item.id === container.previousContainer)?.activeNextContainer ?? null : null;
  }

  function activeTail(containerId: string) {
    const seen = new Set<string>();
    let current = messages.containers.find((item) => item.id === containerId) ?? null;
    while (current?.activeNextContainer && !seen.has(current.id)) {
      seen.add(current.id);
      current = messages.containers.find((item) => item.id === current?.activeNextContainer) ?? null;
    }
    return current?.id ?? containerId;
  }

  async function createBranch(containerId: string) {
    const current = chat.value;
    const target = messages.containers.find((item) => item.id === containerId);
    if (!current || chats.isGenerating(current.id) || !target || target.conversationid !== current.id) return null;
    const branch = await messages.append({ conversationId: current.id, role: target.role, content: "", previousContainer: target.previousContainer });
    current.lastContainerId = branch.id;
    current.updatedAt = new Date().toISOString();
    await chats.persist(current);
    if (branch.role === "assistant") {
      const path = messages.pathFor(branch.previousContainer);
      const prompt = path[path.length - 1] ?? branch;
      await generateRequestedAssistantReply({ chatId: current.id, containerId: branch.id, activePath: path, prompt: messages.currentMessage(prompt)?.content ?? "" });
    }
    return branch;
  }

  function messageFor(containerId: string) {
    const container = messages.containers.find((item) => item.id === containerId);
    return container?.conversationid === id.value ? messages.currentMessage(container) : null;
  }

  async function copyMessage(containerId: string) {
    const message = messageFor(containerId);
    if (!message?.content) return;
    await navigator.clipboard.writeText(message.content);
    push.success("已复制");
  }

  async function speakMessage(containerId: string) {
    const message = messageFor(containerId);
    if (!message?.content.trim()) return;
    try {
      await playMessageSpeech(message.id, message.content);
    } catch (error) {
      push.error(error instanceof Error ? error.message : "朗读失败");
    }
  }

  async function toggleMessageFavorite(containerId: string) {
    const message = messageFor(containerId);
    if (!message) return;
    await messages.setMessageFavorite(containerId, !message.favorite);
  }

  async function translateMessage(containerId: string) {
    const message = messageFor(containerId);
    if (!message?.content.trim() || translate.translating) return;
    if (message.meta.translation) {
      await messages.setMessageContent(containerId, message.meta.translation.originalContent);
      return;
    }
    const originalContent = message.content;
    try {
      const content = await translate.translateText(originalContent, true);
      await messages.setMessageTranslation(containerId, content, {
        originalContent,
        translatedAt: new Date().toISOString(),
      });
    } catch {
      push.error(translate.errorText || "翻译失败");
    }
  }

  async function exportMessageScreenshot(containerId: string, element: HTMLElement | null) {
    if (!messageFor(containerId) || !element) return;
    try {
      const blob = await toBlob(element, {
        cacheBust: true,
        pixelRatio: 2,
        style: { borderRadius: "16px" },
      });
      if (!blob) throw new Error("生成截图失败");
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || "image/png"]: blob }),
      ]);
      push.success("截图已复制到剪切板");
    } catch (error) {
      push.error(error instanceof Error ? error.message : "截图导出失败");
    }
  }

  async function switchBranch(containerId: string, branchId: string) {
    const current = chat.value;
    const target = messages.containers.find((item) => item.id === containerId);
    const previous = target?.previousContainer ? messages.containers.find((item) => item.id === target.previousContainer) : null;
    if (!current || !previous || !previous.availableNextContainer.includes(branchId)) return;
    previous.activeNextContainer = branchId;
    current.lastContainerId = activeTail(branchId);
    current.updatedAt = new Date().toISOString();
    await Promise.all([messages.persist(previous), chats.persist(current)]);
  }

  return {
    chat,
    chatId: id,
    activePath,
    draft,
    generating: computed(() => chats.isGenerating(id.value)),
    messageOf: messages.currentMessage,
    ensureLoaded,
    send,
    regenerate,
    navigateAssistantVersion,
    deleteMessage,
    confirmDeleteMessage,
    branchIdsFor,
    activeBranchIdFor,
    createBranch,
    switchBranch,
    switchVersion: messages.switchVersion,
    updateMessage: messages.setMessageContent,
    copyMessage,
    speakMessage,
    toggleMessageFavorite,
    translateMessage,
    exportMessageScreenshot,
    clearDraft: () => chats.setComposerDraft("", id.value),
  };
}
