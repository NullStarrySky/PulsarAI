import { defineStore } from "pinia";
import { toRaw } from "vue";
import { remove, selectByField, upsert } from "@/features/Database/database-service";
import type { AdditionalParts, ChatMessage, ChatMessageContainer, ChatMessageType, FilePart, Role } from "./conversation-types";
import { formatChatMessageError } from "./conversation-types";
import { normalizeMarkdownLineBreaks } from "@/features/Misc/markdown";
import type { ModelMessage } from "ai";

export const messageContainerTable = "resource_message_containers";

function now() { return new Date().toISOString(); }

export function createMessage(content = "", type: ChatMessageType = "message"): ChatMessage {
  return {
    id: crypto.randomUUID(),
    type,
    content: type === "error" ? formatChatMessageError(content) : normalizeMarkdownLineBreaks(content),
    createdAt: now(),
    meta: { steps: [] },
  };
}

export function createContainer(input: {
  conversationId: string;
  role: Role;
  previousContainer?: string | null;
  content?: string;
  parts?: AdditionalParts[];
}): ChatMessageContainer {
  const message = createMessage(input.content);
  if (input.parts?.length) message.parts = structuredClone(toRaw(input.parts));
  return {
    id: crypto.randomUUID(),
    role: input.role,
    conversationid: input.conversationId,
    content: [message],
    activeMessage: 0,
    availableNextContainer: [],
    activeNextContainer: null,
    previousContainer: input.previousContainer ?? null,
  };
}

export function modelMessagesFromPath(path: ChatMessageContainer[]): ModelMessage[] {
  const output: ModelMessage[] = [];
  for (const container of path) {
    if (container.hidden || container.activeMessage === null) continue;
    const message = container.content[container.activeMessage];
    if (!message || message.type === "error") continue;
    const files = message.parts?.filter((part) => part.type === "file" || part.type === "image") ?? [];
    const content = message.content.trim();
    if (!content && files.length === 0) continue;
    if (container.role === "system" || container.role === "assistant") {
      if (content) output.push({ role: container.role, content });
      continue;
    }
    output.push(files.length
      ? { role: "user", content: [...(content ? [{ type: "text" as const, text: content }] : []), ...files.map((part) => part.type === "image" ? { type: "image" as const, image: part.image, mediaType: part.mediaType } : { type: "file" as const, data: part.data, filename: part.filename, mediaType: part.mediaType })] }
      : { role: "user", content });
  }
  return output;
}

export const useMessageStore = defineStore("conversation-messages", {
  state: () => ({
    containers: [] as ChatMessageContainer[], loadedChatIds: [] as string[],
  }),
  getters: {
    currentMessage: () => (container: ChatMessageContainer) =>
      container.activeMessage === null ? null : container.content[container.activeMessage] ?? null,
  },
  actions: {
    hydrate(containers: ChatMessageContainer[]) {
      this.containers = containers.map(normalizeContainer);
    },
    async loadForChat(chatId: string) {
      if (!chatId || this.loadedChatIds.includes(chatId)) return;
      const rows = await selectByField<ChatMessageContainer>(messageContainerTable, "conversationid", chatId);
      this.containers = [...this.containers.filter((item) => item.conversationid !== chatId), ...rows.map((row) => normalizeContainer(row.value))];
      this.loadedChatIds.push(chatId);
    },

    async persist(container: ChatMessageContainer) {
      await upsert(messageContainerTable, container.id, structuredClone(toRaw(container)));
    },
    pathFor(containerId: string | null): ChatMessageContainer[] {
      const path: ChatMessageContainer[] = [];
      const seen = new Set<string>();
      let current = containerId ? this.containers.find((item) => item.id === containerId) : undefined;
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift(current);
        current = current.previousContainer ? this.containers.find((item) => item.id === current?.previousContainer) : undefined;
      }
      return path;
    },
    async append(input: {
      conversationId: string;
      role: Role;
      content?: string;
      previousContainer?: string | null;
      parts?: AdditionalParts[];
    }) {
      const container = createContainer(input);
      const previous = input.previousContainer
        ? this.containers.find((item) => item.id === input.previousContainer)
        : null;
      if (previous) {
        previous.availableNextContainer.push(container.id);
        previous.activeNextContainer = container.id;
      }
      this.containers.push(container);
      await Promise.all([
        this.persist(container),
        ...(previous ? [this.persist(previous)] : []),
      ]);
      return container;
    },
    /** Create the persisted reply target before a generation plugin is allowed to write. */
    async requestAssistantContainer(input: {
      conversationId: string;
      previousContainer?: string | null;
    }) {
      return this.append({
        conversationId: input.conversationId,
        role: "assistant",
        content: "",
        previousContainer: input.previousContainer,
      });
    },
    async setMessageContent(containerId: string, content: string) {
      const container = this.containers.find((item) => item.id === containerId);
      const message = container ? this.currentMessage(container) : null;
      if (!container || !message) return;
      message.content = normalizeMarkdownLineBreaks(content);
      await this.persist(container);
    },
    async switchVersion(containerId: string, index: number) {
      const container = this.containers.find((item) => item.id === containerId);
      if (!container || index < 0 || index >= container.content.length) return;
      container.activeMessage = index;
      await this.persist(container);
    },
    async appendAssistantVersion(containerId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      if (!container || container.role !== "assistant") return null;
      container.content.push(createMessage());
      container.activeMessage = container.content.length - 1;
      await this.persist(container);
      return { container, message: container.content[container.activeMessage]! };
    },
    async addAttachments(containerId: string, files: FilePart[]) {
      const container = this.containers.find((item) => item.id === containerId);
      const message = container ? this.currentMessage(container) : null;
      if (!container || !message || files.length === 0) return;
      message.parts = [...(message.parts ?? []), ...structuredClone(toRaw(files))];
      await this.persist(container);
    },
    async deleteContainer(containerId: string) {
      const index = this.containers.findIndex((item) => item.id === containerId);
      if (index < 0) return;
      const [container] = this.containers.splice(index, 1);
      if (!container) return;
      const previous = container.previousContainer ? this.containers.find((item) => item.id === container.previousContainer) : null;
      const nextContainers = this.containers.filter((item) => item.previousContainer === containerId);
      for (const next of nextContainers) {
        next.previousContainer = container.previousContainer;
        await this.persist(next);
      }
      if (previous) {
        previous.availableNextContainer = previous.availableNextContainer
          .filter((id) => id !== containerId)
          .concat(nextContainers.map((item) => item.id));
        if (previous.activeNextContainer === containerId) previous.activeNextContainer = nextContainers[0]?.id ?? null;
        await this.persist(previous);
      }
      await remove(messageContainerTable, containerId);
    },
  },
});

function normalizeContainer(item: ChatMessageContainer): ChatMessageContainer {
  return {
    ...item,
    content: item.content.map((message) => ({
      ...message,
      type: message.type ?? "message",
      createdAt: message.createdAt ?? now(),
      meta: { ...message.meta, steps: message.meta?.steps ?? [] },
    })),
  };
}
