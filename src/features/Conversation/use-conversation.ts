import { computed, unref, type MaybeRef } from "vue";
import type { AdditionalParts, ChatMessageContainer } from "./messages/conversation-types";
import { useChatStore } from "./chats/chat-store";
import { useMessageStore } from "./messages/message-store";

/**
 * A chat-bound UI/runtime contract.  There is intentionally no global
 * "active conversation": each mounted tab supplies its own chat id.
 */
export function useConversation(chatId: MaybeRef<string | null | undefined>) {
  const chats = useChatStore();
  const messages = useMessageStore();
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
    current.lastContainerId = container.id;
    current.composerDraft = "";
    current.updatedAt = new Date().toISOString();
    await chats.persist(current);
    return container;
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
    switchVersion: messages.switchVersion,
    updateMessage: messages.setMessageContent,
    clearDraft: () => chats.setComposerDraft("", id.value),
  };
}
