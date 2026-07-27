import { defineStore } from "pinia";
import type { ModelMessage } from "ai";
import { remove, selectAll, upsert } from "@/features/Database/application/database-service";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { runConversationGeneration } from "./conversation-generation";
import type {
  CharacterPackage,
  ActionPart,
  AdditionalParts,
  ChatMessage,
  ChatMessageContainer,
  ConversationRendererId,
  FilePart,
  Conversation,
  MessageDraftClosure,
  PackageCategory,
  Role,
} from "../domain/conversation-types";

const categoryTable = "resource_package_categories";
const packageTable = "resource_packages";
const conversationTable = "resource_conversations";
const containerTable = "resource_message_containers";
let initializePromise: Promise<void> | null = null;

function now() {
  return new Date().toISOString();
}

function createMessage(content = ""): ChatMessage {
  return {
    id: crypto.randomUUID(),
    content,
    meta: {
      steps: [],
    },
  };
}

function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    id: crypto.randomUUID(),
    content: message.content,
    meta: clonePlain(message.meta),
    parts: message.parts ? clonePlain(message.parts) : undefined,
  };
}

function createContainer(input: {
  role: Role;
  conversationId: string;
  previousContainer: string | null;
  content?: string;
  parts?: AdditionalParts[];
}): ChatMessageContainer {
  const message = createMessage(input.content ?? "");
  if (input.parts?.length) {
    message.parts = clonePlain(input.parts);
  }
  return {
    id: crypto.randomUUID(),
    role: input.role,
    conversationid: input.conversationId,
    content: [message],
    activeMessage: 0,
    availableNextContainer: [],
    activeNextContainer: null,
    previousContainer: input.previousContainer,
  };
}

function createPackage(): CharacterPackage {
  return {
    id: crypto.randomUUID(),
    name: "默认角色包",
    icon: "",
    description: "用于普通对话的默认会话容器。",
    categoryId: null,
    order: 0,
    conversations: [],
    plugins: [],
    globalPluginOrder: [],
    syncEnabled: true,
  };
}

function comparePackages(a: CharacterPackage, b: CharacterPackage) {
  return (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY)
    || a.name.localeCompare(b.name, "zh-Hans")
    || a.id.localeCompare(b.id);
}

export const useConversationStore = defineStore("conversation", {
  state: () => ({
    loaded: false,
    conversationSearch: "",
    activePackageId: "",
    activeConversationId: "",
    activeContainerId: "",
    packages: [] as CharacterPackage[],
    categories: [] as PackageCategory[],
    conversations: [] as Conversation[],
    containers: [] as ChatMessageContainer[],
    generating: false,
    lastMessageEditRequestId: 0,
  }),
  getters: {
    activePackage: (state) =>
      state.packages.find((item) => item.id === state.activePackageId) ?? state.packages[0],
    activeConversation: (state) =>
      state.conversations.find((item) => item.id === state.activeConversationId),
    activeContainer: (state) =>
      state.containers.find((item) => item.id === state.activeContainerId),
    sortedCategories(state): PackageCategory[] {
      return [...state.categories].sort((a, b) => a.order - b.order);
    },
    packagesByCategory: (state) => (categoryId: string | null) =>
      state.packages.filter((item) => (item.categoryId ?? null) === categoryId).sort(comparePackages),
    activePackageConversations(state): Conversation[] {
      return state.conversations
        .filter((item) => item.packageId === state.activePackageId)
        .filter((item) => {
          const keyword = state.conversationSearch.trim().toLowerCase();
          return !keyword || item.title.toLowerCase().includes(keyword);
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    activePath(state): ChatMessageContainer[] {
      const active = state.containers.find((item) => item.id === state.activeContainerId);
      if (!active) {
        return [];
      }

      const path: ChatMessageContainer[] = [];
      const seen = new Set<string>();
      let current: ChatMessageContainer | undefined = active;

      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift(current);
        current = current.previousContainer
          ? state.containers.find((item) => item.id === current?.previousContainer)
          : undefined;
      }

      return path;
    },
  },
  actions: {
    async initialize() {
      if (this.loaded) {
        return;
      }

      if (initializePromise) {
        await initializePromise;
        return;
      }

      initializePromise = this.loadInitialData();
      try {
        await initializePromise;
      } finally {
        initializePromise = null;
      }
    },
    async loadInitialData() {
      const [categories, packages, conversations, containers] = await Promise.all([
        selectAll<PackageCategory>(categoryTable),
        selectAll<CharacterPackage>(packageTable),
        selectAll<Conversation>(conversationTable),
        selectAll<ChatMessageContainer>(containerTable),
      ]);

      this.categories = categories.map((item) => item.value);
      this.packages = packages.map((item) => item.value).sort(comparePackages);
      this.packages = this.packages.map((item) => ({
        ...item,
        globalPluginOrder: item.globalPluginOrder ?? [],
        capabilities: item.capabilities
          ? structuredClone(item.capabilities)
          : undefined,
        syncEnabled: item.syncEnabled ?? true,
      }));
      this.conversations = conversations.map((item) => ({
        ...item.value,
        rendererId: item.value.rendererId ?? "chat",
      }));
      this.containers = containers.map((item) => item.value);

      if (this.packages.length === 0) {
        const basePackage = createPackage();
        this.packages.push(basePackage);
        await this.persistPackage(basePackage);
      }

      this.loaded = true;
      await this.openPackage(this.packages[0].id);
    },
    async persistPackage(item: CharacterPackage) {
      await upsert(packageTable, item.id, item);
    },
    async persistCategory(item: PackageCategory) {
      await upsert(categoryTable, item.id, item);
    },
    async persistConversation(item: Conversation) {
      await upsert(conversationTable, item.id, item);
    },
    async persistContainer(item: ChatMessageContainer) {
      await upsert(containerTable, item.id, item);
    },
    async createCategory(name = "新分类") {
      const item: PackageCategory = {
        id: crypto.randomUUID(),
        name,
        order: this.categories.length,
      };
      this.categories.push(item);
      await this.persistCategory(item);
    },
    async updateCategory(categoryId: string, patch: Partial<Pick<PackageCategory, "name">>) {
      const item = this.categories.find((category) => category.id === categoryId);
      if (!item) {
        return;
      }

      Object.assign(item, patch);
      await this.persistCategory(item);
    },
    async moveCategory(categoryId: string, direction: -1 | 1) {
      const sorted = this.sortedCategories;
      const index = sorted.findIndex((item) => item.id === categoryId);
      const target = sorted[index + direction];
      const current = sorted[index];
      if (!current || !target) {
        return;
      }

      [current.order, target.order] = [target.order, current.order];
      await Promise.all([this.persistCategory(current), this.persistCategory(target)]);
    },
    async deleteCategory(categoryId: string) {
      this.categories = this.categories.filter((item) => item.id !== categoryId);
      for (const item of this.packages.filter((packageItem) => packageItem.categoryId === categoryId)) {
        item.categoryId = null;
        await this.persistPackage(item);
      }
      await remove(categoryTable, categoryId);
    },
    async deleteCategoryWithPackages(categoryId: string) {
      const packages = this.packages.filter((item) => item.categoryId === categoryId);
      for (const item of packages) {
        await this.deletePackage(item.id);
      }
      this.categories = this.categories.filter((item) => item.id !== categoryId);
      await remove(categoryTable, categoryId);
    },
    async createPackage(input?: Partial<Pick<CharacterPackage, "name" | "description" | "icon" | "categoryId">>) {
      const item: CharacterPackage = {
        id: crypto.randomUUID(),
        name: input?.name?.trim() || "新角色包",
        icon: input?.icon || "",
        description: input?.description?.trim(),
        categoryId: input?.categoryId ?? null,
        order: Math.max(-1, ...this.packages.map((packageItem) => packageItem.order ?? -1)) + 1,
        conversations: [],
        plugins: [],
        globalPluginOrder: [],
        syncEnabled: true,
      };
      this.packages.push(item);
      await this.persistPackage(item);
      await this.openPackage(item.id);
    },
    async updatePackage(packageId: string, patch: Partial<Pick<CharacterPackage, "name" | "description" | "icon" | "categoryId" | "syncEnabled" | "capabilities">>) {
      const item = this.packages.find((packageItem) => packageItem.id === packageId);
      if (!item) {
        return;
      }

      Object.assign(item, patch);
      await this.persistPackage(item);
    },
    async deletePackage(packageId: string) {
      const relatedConversations = this.conversations.filter((item) => item.packageId === packageId);
      for (const conversation of relatedConversations) {
        await this.deleteConversation(conversation.id);
      }

      this.packages = this.packages.filter((item) => item.id !== packageId);
      await remove(packageTable, packageId);
      if (this.packages[0]) {
        await this.openPackage(this.packages[0].id);
      }
    },
    async openPackage(packageId: string) {
      const item = this.packages.find((packageItem) => packageItem.id === packageId);
      if (!item) {
        return;
      }

      const pluginStore = usePluginStore();
      await pluginStore.initialize();
      await this.normalizePackageGlobalPluginOrder(
        item.id,
        pluginStore.externalGlobalPlugins.map((plugin) => plugin.id),
      );
      this.activePackageId = packageId;
      const newest = item.conversations
        .map((link) => this.conversations.find((conversation) => conversation.id === link.id))
        .filter((conversation): conversation is Conversation => Boolean(conversation))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (newest) {
        this.openConversation(newest.id);
      } else {
        await this.createConversation(packageId);
      }
    },
    async normalizePackageGlobalPluginOrder(
      packageId: string,
      availablePluginIds: string[],
    ) {
      const item = this.packages.find((packageItem) => packageItem.id === packageId);
      if (!item) {
        return;
      }

      const available = new Set(availablePluginIds);
      const seen = new Set<string>();
      const normalized = [
        ...(item.globalPluginOrder ?? []).filter((pluginId) => {
          if (!available.has(pluginId) || seen.has(pluginId)) {
            return false;
          }
          seen.add(pluginId);
          return true;
        }),
        ...availablePluginIds.filter((pluginId) => {
          if (seen.has(pluginId)) {
            return false;
          }
          seen.add(pluginId);
          return true;
        }),
      ];

      if (JSON.stringify(normalized) === JSON.stringify(item.globalPluginOrder ?? [])) {
        return;
      }
      item.globalPluginOrder = normalized;
      await this.persistPackage(item);
    },
    async movePackageGlobalPluginBefore(
      packageId: string,
      pluginId: string,
      beforePluginId?: string,
    ) {
      const item = this.packages.find((packageItem) => packageItem.id === packageId);
      if (!item) {
        return;
      }

      const pluginStore = usePluginStore();
      const availableIds = pluginStore.externalGlobalPlugins.map((plugin) => plugin.id);
      await this.normalizePackageGlobalPluginOrder(packageId, availableIds);
      const ordered = (item.globalPluginOrder ?? []).filter((id) => id !== pluginId);
      if (!availableIds.includes(pluginId)) {
        return;
      }

      const targetIndex = beforePluginId ? ordered.indexOf(beforePluginId) : -1;
      ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, pluginId);
      item.globalPluginOrder = ordered;
      await this.persistPackage(item);
    },
    async createConversation(packageId?: string) {
      packageId ??= this.activePackageId;
      const template = this.conversations.find((item) => item.packageId === packageId && item.isTemplate);
      const conversation: Conversation = {
        id: crypto.randomUUID(),
        packageId,
        title: template?.title ?? "新对话",
        isTemplate: false,
        rendererId: template?.rendererId ?? "chat",
        rootContainerId: null,
        lastContainerId: null,
        createdAt: now(),
        updatedAt: now(),
      };

      this.conversations.push(conversation);

      let createdContainers: ChatMessageContainer[] = [];
      if (template) {
        const clone = this.cloneConversationContainers(template.id, conversation.id);
        createdContainers = clone.containers;
        conversation.rootContainerId = template.rootContainerId
          ? clone.idMap.get(template.rootContainerId) ?? createdContainers[0]?.id ?? null
          : createdContainers[0]?.id ?? null;
        conversation.lastContainerId = template.lastContainerId
          ? clone.idMap.get(template.lastContainerId) ?? conversation.rootContainerId
          : conversation.rootContainerId;
      }

      if (createdContainers.length === 0) {
        const container = createContainer({
          role: "system",
          conversationId: conversation.id,
          previousContainer: null,
          content: "",
        });
        createdContainers = [container];
        conversation.rootContainerId = container.id;
        conversation.lastContainerId = container.id;
      }

      this.containers.push(...createdContainers);
      const packageItem = this.packages.find((item) => item.id === packageId);
      if (packageItem) {
        packageItem.conversations.unshift({
          id: conversation.id,
          lastContainerid: conversation.lastContainerId ?? "",
          title: conversation.title,
        });
        await this.persistPackage(packageItem);
      }

      await Promise.all([
        this.persistConversation(conversation),
        ...createdContainers.map((container) => this.persistContainer(container)),
      ]);
      this.openConversation(conversation.id);
      return conversation;
    },
    cloneConversationContainers(templateConversationId: string, conversationId: string) {
      const template = this.conversations.find((item) => item.id === templateConversationId);
      const sourceContainers = this.containerPathForConversation(template).filter((item) => item.conversationid === templateConversationId);
      const idMap = new Map(sourceContainers.map((item) => [item.id, crypto.randomUUID()]));
      const containers = sourceContainers.map((source, index): ChatMessageContainer => {
        const next = sourceContainers[index + 1];
        const activeMessage =
          source.activeMessage === null || source.activeMessage >= source.content.length ? null : source.activeMessage;
        return {
          id: idMap.get(source.id) ?? crypto.randomUUID(),
          role: source.role,
          conversationid: conversationId,
          content: source.content.map(cloneMessage),
          activeMessage,
          availableNextContainer: next ? [idMap.get(next.id) ?? crypto.randomUUID()] : [],
          activeNextContainer: next ? idMap.get(next.id) ?? null : null,
          previousContainer: source.previousContainer ? idMap.get(source.previousContainer) ?? null : null,
        };
      });
      return { containers, idMap };
    },
    containerPathForConversation(conversation?: Conversation) {
      if (!conversation) {
        return [] as ChatMessageContainer[];
      }

      const path: ChatMessageContainer[] = [];
      const seen = new Set<string>();
      let current = this.containers.find(
        (item) => item.id === (conversation.lastContainerId ?? conversation.rootContainerId),
      );
      if (!current && conversation.rootContainerId) {
        current = this.containers.find((item) => item.id === conversation.rootContainerId);
      }

      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift(current);
        current = current.previousContainer
          ? this.containers.find((item) => item.id === current?.previousContainer)
          : undefined;
      }

      return path;
    },
    containerPathTo(containerId: string | null) {
      if (!containerId) {
        return [] as ChatMessageContainer[];
      }

      const path: ChatMessageContainer[] = [];
      const seen = new Set<string>();
      let current = this.containers.find((item) => item.id === containerId);

      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift(current);
        current = current.previousContainer
          ? this.containers.find((item) => item.id === current?.previousContainer)
          : undefined;
      }

      return path;
    },
    modelMessagesBefore(container: ChatMessageContainer): ModelMessage[] {
      const messages: ModelMessage[] = [];
      for (const item of this.containerPathTo(container.previousContainer)) {
        const message = this.currentMessage(item);
        const content = message?.content.trim();
        const fileParts = message?.parts?.filter(
          (part) => part.type === "file" || part.type === "image",
        ) ?? [];
        if (!content && fileParts.length === 0) {
          continue;
        }

        if (item.role === "system") {
          if (content) {
            messages.push({ role: "system", content });
          }
        } else if (item.role === "user") {
          if (fileParts.length === 0) {
            messages.push({ role: "user", content: content ?? "" });
            continue;
          }
          messages.push({
            role: "user",
            content: [
              ...(content ? [{ type: "text" as const, text: content }] : []),
              ...fileParts.map((part) => {
                if (part.type === "image") {
                  return {
                    type: "image" as const,
                    image: part.image,
                    mediaType: part.mediaType,
                  };
                }
                return {
                  type: "file" as const,
                  data: part.data,
                  filename: part.filename,
                  mediaType: part.mediaType,
                };
              }),
            ],
          });
        } else {
          if (content) {
            messages.push({ role: "assistant", content });
          }
        }
      }
      return messages;
    },
    openConversation(conversationId: string) {
      const conversation = this.conversations.find((item) => item.id === conversationId);
      if (!conversation) {
        return;
      }

      this.activeConversationId = conversationId;
      this.activePackageId = conversation.packageId;
      this.activeContainerId = conversation.lastContainerId ?? conversation.rootContainerId ?? "";
      this.syncConversationLink(conversation);
    },
    async updateConversation(
      conversationId: string,
      patch: Partial<Pick<Conversation, "title" | "isTemplate" | "rendererId">>,
    ) {
      const conversation = this.conversations.find((item) => item.id === conversationId);
      if (!conversation) {
        return;
      }

      const promises: Promise<void>[] = [];
      if (patch.isTemplate) {
        for (const item of this.conversations.filter((item) => item.packageId === conversation.packageId && item.id !== conversationId && item.isTemplate)) {
          item.isTemplate = false;
          promises.push(this.persistConversation(item));
        }
      }

      Object.assign(conversation, patch, { updatedAt: now() });
      const packageItem = this.packages.find((item) => item.id === conversation.packageId);
      const link = packageItem?.conversations.find((item) => item.id === conversation.id);
      if (link) {
        link.title = conversation.title;
      }
      await Promise.all([
        ...promises,
        this.persistConversation(conversation),
        packageItem ? this.persistPackage(packageItem) : Promise.resolve(),
      ]);
    },
    async setConversationRenderer(
      conversationId: string,
      rendererId: ConversationRendererId,
    ) {
      await this.updateConversation(conversationId, { rendererId });
    },
    async deleteConversation(conversationId: string) {
      const conversation = this.conversations.find((item) => item.id === conversationId);
      if (!conversation) {
        return;
      }

      const containers = this.containers.filter((item) => item.conversationid === conversationId);
      for (const container of containers) {
        await remove(containerTable, container.id);
      }

      this.containers = this.containers.filter((item) => item.conversationid !== conversationId);
      this.conversations = this.conversations.filter((item) => item.id !== conversationId);
      await remove(conversationTable, conversationId);

      const packageItem = this.packages.find((item) => item.id === conversation.packageId);
      if (packageItem) {
        packageItem.conversations = packageItem.conversations.filter((item) => item.id !== conversationId);
        await this.persistPackage(packageItem);
        const next = this.conversations.find((item) => item.packageId === packageItem.id);
        if (next) {
          this.openConversation(next.id);
        } else {
          await this.createConversation(packageItem.id);
        }
      }
    },
    currentMessage(container: ChatMessageContainer) {
      return container.activeMessage === null ? null : container.content[container.activeMessage] ?? null;
    },
    requestLastMessageEdit() {
      this.lastMessageEditRequestId += 1;
    },
    branchIdsFor(containerId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      const previous = container?.previousContainer
        ? this.containers.find((item) => item.id === container.previousContainer)
        : null;
      return previous?.availableNextContainer ?? [];
    },
    activeBranchIdFor(containerId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      const previous = container?.previousContainer
        ? this.containers.find((item) => item.id === container.previousContainer)
        : null;
      return previous?.activeNextContainer ?? null;
    },
    async addMessage(containerId: string, content = "") {
      const container = this.containers.find((item) => item.id === containerId);
      if (!container) {
        return;
      }

      container.content.push(createMessage(content));
      container.activeMessage = container.content.length - 1;
      await this.persistContainer(container);
    },
    async switchMessage(containerId: string, index: number) {
      const container = this.containers.find((item) => item.id === containerId);
      if (!container || index < 0 || index >= container.content.length) {
        return;
      }

      container.activeMessage = index;
      await this.persistContainer(container);
    },
    async editMessage(containerId: string, messageId: string, content: string) {
      const container = this.containers.find((item) => item.id === containerId);
      const message = container?.content.find((item) => item.id === messageId);
      if (!container || !message) {
        return;
      }

      message.content = content;
      await this.persistContainer(container);
    },
    async addMessageAttachments(
      containerId: string,
      messageId: string,
      attachments: FilePart[],
    ) {
      const container = this.containers.find((item) => item.id === containerId);
      const message = container?.content.find((item) => item.id === messageId);
      if (!container || !message || attachments.length === 0) {
        return;
      }

      message.parts ??= [];
      message.parts.push(...clonePlain(attachments));
      await this.persistContainer(container);
    },
    async removeMessageAttachment(
      containerId: string,
      messageId: string,
      attachmentIndex: number,
    ) {
      const container = this.containers.find((item) => item.id === containerId);
      const message = container?.content.find((item) => item.id === messageId);
      if (!container || !message?.parts) {
        return;
      }

      let currentAttachmentIndex = -1;
      const partIndex = message.parts.findIndex((part) => {
        if (part.type !== "file" && part.type !== "image") {
          return false;
        }
        currentAttachmentIndex += 1;
        return currentAttachmentIndex === attachmentIndex;
      });
      if (partIndex < 0) {
        return;
      }
      message.parts.splice(partIndex, 1);
      await this.persistContainer(container);
    },
    async deleteActiveMessage(containerId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      if (!container || container.activeMessage === null) {
        return;
      }

      container.content.splice(container.activeMessage, 1);
      container.activeMessage = container.content.length === 0 ? null : Math.min(container.activeMessage, container.content.length - 1);
      await this.persistContainer(container);
    },
    async appendContainer(
      role: Role,
      content = "",
      previousContainerId?: string,
      parts?: AdditionalParts[],
    ) {
      previousContainerId ??= this.activeContainerId;
      const conversation = this.activeConversation;
      if (!conversation) {
        return null;
      }

      const container = createContainer({
        role,
        conversationId: conversation.id,
        previousContainer: previousContainerId || null,
        content,
        parts,
      });

      const previous = previousContainerId ? this.containers.find((item) => item.id === previousContainerId) : null;
      if (previous) {
        previous.availableNextContainer.push(container.id);
        previous.activeNextContainer = container.id;
        await this.persistContainer(previous);
      }

      this.containers.push(container);
      conversation.lastContainerId = container.id;
      conversation.updatedAt = now();
      this.activeContainerId = container.id;
      this.syncConversationLink(conversation);
      await Promise.all([this.persistContainer(container), this.persistConversation(conversation)]);
      return container;
    },
    async createBranch(containerId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      if (!container) {
        return;
      }

      const branch = await this.appendContainer(container.role, "", container.previousContainer ?? undefined);
      if (branch && branch.role === "assistant") {
        this.activeContainerId = branch.id;
        await this.fillAssistantContainer(branch);
      } else if (branch) {
        this.activeContainerId = branch.id;
        const conversation = this.conversations.find((item) => item.id === branch.conversationid);
        if (conversation) {
          conversation.lastContainerId = branch.id;
          await this.persistConversation(conversation);
          this.syncConversationLink(conversation);
        }
      }
    },
    async deleteContainer(containerId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      if (!container) {
        return;
      }

      const previous = container.previousContainer
        ? this.containers.find((item) => item.id === container.previousContainer)
        : null;
      const nextContainers = this.containers.filter((item) => item.previousContainer === containerId);

      for (const next of nextContainers) {
        next.previousContainer = container.previousContainer;
        await this.persistContainer(next);
      }

      if (previous) {
        previous.availableNextContainer = previous.availableNextContainer
          .filter((id) => id !== containerId)
          .concat(nextContainers.map((item) => item.id));
        previous.activeNextContainer =
          previous.activeNextContainer === containerId ? nextContainers[0]?.id ?? null : previous.activeNextContainer;
        await this.persistContainer(previous);
      }

      this.containers = this.containers.filter((item) => item.id !== containerId);
      await remove(containerTable, containerId);
      this.activeContainerId = previous?.id ?? nextContainers[0]?.id ?? "";
      const conversation = this.conversations.find((item) => item.id === container.conversationid);
      if (conversation) {
        conversation.lastContainerId = this.activeContainerId;
        await this.persistConversation(conversation);
        this.syncConversationLink(conversation);
      }
    },
    async send(
      content: string,
      mutate?: MessageDraftClosure,
      attachments: FilePart[] = [],
      action?: ActionPart | null,
    ) {
      const trimmed = content.trim();
      if ((!trimmed && attachments.length === 0 && !action) || this.generating) {
        return;
      }
      void import("@/features/Statistic/application/statistic-store").then(({ useStatisticStore }) =>
        useStatisticStore().recordEvent("message.user"),
      );

      const userContainer = await this.appendContainer(
        "user",
        trimmed,
        undefined,
        action ? [clonePlain(action), ...attachments] : attachments,
      );
      if (!userContainer) {
        return;
      }

      await this.generateFromPath(mutate);
    },
    async regenerate(containerId?: string, mutate?: MessageDraftClosure) {
      containerId ??= this.activeContainerId;
      if (this.generating) {
        return;
      }

      const container = this.containers.find((item) => item.id === containerId);
      if (!container) {
        return;
      }

      if (container.role !== "assistant") {
        await this.addMessage(container.id);
        return;
      }

      const beforeGenerationMessage = findLastCompleteMessage(
        container,
        container.activeMessage ?? container.content.length - 1,
      );
      const message = createMessage("");
      container.content.push(message);
      container.activeMessage = container.content.length - 1;
      this.activeContainerId = container.id;
      await this.fillAssistantContainer(container, mutate, beforeGenerationMessage ?? undefined);
    },
    async fillAssistantContainer(
      container: ChatMessageContainer,
      mutate?: MessageDraftClosure,
      beforeGenerationMessage?: ChatMessage,
    ) {
      const message = this.currentMessage(container);
      if (!message) {
        return;
      }

      this.generating = true;
      const layout = useLayoutStore();
      layout.setResourceTabStatus("conversation", container.conversationid, {
        kind: "loading",
        label: "生成中",
      });
      const start = Date.now();
      message.meta.generateInfo = {
        modelName: "default-agent",
        startTime: new Date(start).toISOString(),
      };
      await mutate?.(message, container);
      await this.persistContainer(container);

      try {
        const pluginStore = usePluginStore();
        await pluginStore.initialize();
        const conversation = this.conversations.find(
          (item) => item.id === container.conversationid,
        );
        if (!conversation) {
          throw new Error("当前消息没有所属对话。");
        }
        const enabledPlugins = pluginStore.enabledPluginsForPackage(
          conversation.packageId,
          this.packages.find((item) => item.id === conversation.packageId)
            ?.globalPluginOrder,
        );
        const previousPath = this.containerPathTo(container.previousContainer);
        const promptContainer = [...previousPath].reverse().find(
          (item) => item.role === "user",
        );
        const promptMessage = promptContainer
          ? this.currentMessage(promptContainer)
          : null;
        const actionPart = promptMessage?.parts?.find(
          (part): part is ActionPart => part.type === "action",
        );
        const result = await runConversationGeneration({
          plugins: enabledPlugins,
          packageId: conversation.packageId,
          conversationId: container.conversationid,
          conversation,
          activePath: this.containerPathTo(container.previousContainer),
          chat: this.modelMessagesBefore(container),
          emptyContainer: container,
          emptyMessage: message,
          action: actionPart
            ? {
                pluginId: actionPart.pluginId,
                resourceId: actionPart.actionId,
                name: actionPart.name,
              }
            : undefined,
          prompt: promptMessage?.content ?? "",
          beforeGenerationMessage,
          capabilityGrants: this.packages.find(
            (item) => item.id === conversation.packageId,
          )?.capabilities,
          onStep: async (step) => {
            message.meta.steps.push(step);
            await mutate?.(message, container);
            await this.persistContainer(container);
          },
        });
        message.meta.generateInfo.modelName = result.modelName;
          message.content = result.text;
          void import("@/features/Statistic/application/statistic-store").then(({ useStatisticStore }) =>
            useStatisticStore().recordEvent("message.assistant"),
          );
          void import("@/features/Misc/application/reply-completion-notifier").then(({ notifyReplyCompleted }) =>
            notifyReplyCompleted({
              title: "Pulsar",
              body: result.text.slice(0, 120) || "回复已完成。",
            }),
          );
      } catch (error) {
        message.content = error instanceof Error ? error.message : "生成失败";
      } finally {
        message.meta.generateInfo.timeUsed = Date.now() - start;
        await mutate?.(message, container);
        await this.persistContainer(container);
        this.generating = false;
        layout.setResourceTabStatus("conversation", container.conversationid);
      }
    },
    async generateFromPath(mutate?: MessageDraftClosure, usePreviousPath = false) {
      const previousContainerId = usePreviousPath
        ? this.activeContainer?.previousContainer ?? this.activeContainerId
        : this.activeContainerId;
      const assistant = await this.appendContainer("assistant", "", previousContainerId);
      if (!assistant) {
        return;
      }

      await this.fillAssistantContainer(assistant, mutate);
    },
    async switchNext(containerId: string, nextId: string | null) {
      const container = this.containers.find((item) => item.id === containerId);
      if (!container || (nextId && !container.availableNextContainer.includes(nextId))) {
        return;
      }

      container.activeNextContainer = nextId;
      const conversation = this.conversations.find((item) => item.id === container.conversationid);
      if (nextId && conversation) {
        const tailId = this.resolveActiveTailId(nextId);
        conversation.lastContainerId = tailId;
        this.activeContainerId = tailId;
        await Promise.all([this.persistContainer(container), this.persistConversation(conversation)]);
        this.syncConversationLink(conversation);
        return;
      }

      await this.persistContainer(container);
      if (!nextId && conversation) {
        conversation.lastContainerId = container.id;
        this.activeContainerId = container.id;
        await this.persistConversation(conversation);
        this.syncConversationLink(conversation);
      }
    },
    async switchBranch(containerId: string, branchId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      const previous = container?.previousContainer
        ? this.containers.find((item) => item.id === container.previousContainer)
        : null;
      if (!previous || !previous.availableNextContainer.includes(branchId)) {
        return;
      }

      previous.activeNextContainer = branchId;
      const conversation = this.conversations.find((item) => item.id === previous.conversationid);
      const tailId = this.resolveActiveTailId(branchId);
      this.activeContainerId = tailId;
      if (conversation) {
        conversation.lastContainerId = tailId;
        await Promise.all([this.persistContainer(previous), this.persistConversation(conversation)]);
        this.syncConversationLink(conversation);
      } else {
        await this.persistContainer(previous);
      }
    },
    resolveActiveTailId(containerId: string) {
      const seen = new Set<string>();
      let current = this.containers.find((item) => item.id === containerId);

      while (current?.activeNextContainer && !seen.has(current.id)) {
        seen.add(current.id);
        const next = this.containers.find((item) => item.id === current?.activeNextContainer);
        if (!next) {
          break;
        }
        current = next;
      }

      return current?.id ?? containerId;
    },
    syncConversationLink(conversation: Conversation) {
      const packageItem = this.packages.find((item) => item.id === conversation.packageId);
      const link = packageItem?.conversations.find((item) => item.id === conversation.id);
      if (packageItem && link) {
        link.title = conversation.title;
        link.lastContainerid = conversation.lastContainerId ?? "";
        void this.persistPackage(packageItem);
      }
    },
  },
});

function findLastCompleteMessage(
  container: ChatMessageContainer,
  startIndex: number,
) {
  for (let index = startIndex; index >= 0; index -= 1) {
    const message = container.content[index];
    if (
      message?.content.trim()
      && (
        !message.meta.generateInfo
        || typeof message.meta.generateInfo.timeUsed === "number"
      )
    ) {
      return clonePlain(message);
    }
  }
  return null;
}
