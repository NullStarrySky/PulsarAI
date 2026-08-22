import { defineStore } from "pinia";
import { toRaw } from "vue";
import { remove, selectByField, selectOne, upsert } from "@/features/Database/database-service";
import type { Conversation, ConversationKind, ConversationResourceBinding } from "../messages/conversation-types";
import { createContainer, useMessageStore } from "../messages/message-store";
import { usePackageStore } from "@/features/Package/package-store";

export const chatTable = "resource_conversations";
const now = () => new Date().toISOString();

export const useChatStore = defineStore("conversation-chats", {
  state: () => ({ chats: [] as Conversation[], loadedPackageIds: [] as string[], generatingChatIds: [] as string[] }),
  getters: {
    isGenerating: (state) => (chatId: string) => state.generatingChatIds.includes(chatId),
    chatsForPackage: (state) => (packageId: string) => state.chats
      .filter((item) => item.packageId === packageId)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt)),
  },
  actions: {
    hydrate(chats: Conversation[]) {
      this.chats = chats.map(normalizeChat);
    },
    async loadForPackage(packageId: string) {
      if (!packageId || this.loadedPackageIds.includes(packageId)) return;
      const rows = await selectByField<Conversation>(chatTable, "packageId", packageId);
      this.chats = [...this.chats.filter((item) => item.packageId !== packageId), ...rows.map((row) => normalizeChat(row.value))];
      this.loadedPackageIds.push(packageId);
    },
    async load(chatId: string) {
      const existing = this.chats.find((item) => item.id === chatId);
      if (existing) return existing;
      const chat = await selectOne<Conversation>(chatTable, chatId);
      if (!chat) return null;
      const normalized = normalizeChat(chat);
      this.chats.push(normalized);
      if (!this.loadedPackageIds.includes(normalized.packageId)) this.loadedPackageIds.push(normalized.packageId);
      return normalized;
    },
    async persist(chat: Conversation) { await upsert(chatTable, chat.id, structuredClone(toRaw(chat))); },
    async create(input: { packageId: string; title?: string; kind?: ConversationKind; binding?: ConversationResourceBinding; activate?: boolean }) {
      const packages = usePackageStore();
      const packageId = input.packageId;
      if (!packageId) throw new Error("请先选择角色包。");
      const chat: Conversation = { id: crypto.randomUUID(), packageId, kind: input.kind ?? "chat", binding: input.binding ? structuredClone(toRaw(input.binding)) : undefined, title: input.title?.trim() || "新对话", rendererId: "chat", rootContainerId: null, lastContainerId: null, composerDraft: "", createdAt: now(), updatedAt: now() };
      const root = createContainer({ conversationId: chat.id, role: "system", content: "" });
      chat.rootContainerId = root.id;
      chat.lastContainerId = root.id;
      this.chats.push(chat);
      const packageItem = packages.packages.find((item) => item.id === packageId);
      packageItem?.conversations.unshift({ id: chat.id, lastContainerid: root.id, title: chat.title });
      useMessageStore().containers.push(root);
      await Promise.all([this.persist(chat), useMessageStore().persist(root), ...(packageItem ? [packages.persist(packageItem)] : [])]);
      return chat;
    },
    async update(chatId: string, patch: Partial<Pick<Conversation, "title" | "pinned" | "isTemplate" | "isEphemeral" | "rendererId" | "composerDraft">>) {
      const chat = this.chats.find((item) => item.id === chatId);
      if (!chat) return;
      Object.assign(chat, patch, { updatedAt: now() });
      await this.persist(chat);
    },
    async setComposerDraft(content: string, chatId?: string) {
      if (!chatId) return;
      const chat = this.chats.find((item) => item.id === chatId);
      if (!chat || chat.composerDraft === content) return;
      chat.composerDraft = content;
      await this.persist(chat);
    },
    async remove(chatId: string) {
      const messages = useMessageStore();
      const chat = this.chats.find((item) => item.id === chatId);
      if (!chat) return;
      const ids = messages.containers.filter((item) => item.conversationid === chatId).map((item) => item.id);
      for (const id of ids) await messages.deleteContainer(id);
      this.chats = this.chats.filter((item) => item.id !== chatId);
      await remove(chatTable, chatId);
    },
    startGeneration(chatId: string) { if (chatId && !this.generatingChatIds.includes(chatId)) this.generatingChatIds.push(chatId); },
    finishGeneration(chatId: string) { this.generatingChatIds = this.generatingChatIds.filter((id) => id !== chatId); },
  },
});

function normalizeChat(item: Conversation): Conversation {
  return { ...item, rendererId: item.rendererId ?? "chat", composerDraft: item.composerDraft ?? "" };
}
