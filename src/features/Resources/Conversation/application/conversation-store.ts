import { defineStore } from "pinia";
import type { ModelMessage } from "ai";
import { remove, selectAll, upsert } from "@/features/Database/application/database-service";
import {
  builtinCorePluginId,
  usePluginStore,
} from "@/features/Resources/Plugin/application/plugin-store";
import {
  findPluginNodeByPath,
  pluginConventions,
  pluginFileType,
} from "@/features/Resources/Plugin/domain/plugin-types";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { runConversationGeneration } from "./conversation-generation";
import { buildConversationResourceContext } from "./conversation-resource-context";
import { deleteConversationMemory } from "./conversation-memory";
import type {
  CharacterPackage,
  ActionPart,
  AdditionalParts,
  ChatMessage,
  ChatMessageContainer,
  ChatMessageType,
  ConversationKind,
  ConversationReasoningEffort,
  ConversationRendererId,
  ConversationResourceBinding,
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

interface MessageNavigationRequest {
  conversationId: string;
  containerId: string;
  requestId: number;
}

function now() {
  return new Date().toISOString();
}

function createMessage(content = "", type: ChatMessageType = "message"): ChatMessage {
  return {
    id: crypto.randomUUID(),
    type,
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
    type: message.type ?? "message",
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
  messageType?: ChatMessageType;
}): ChatMessageContainer {
  const message = createMessage(input.content ?? "", input.messageType);
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

function createDefaultPackage(): CharacterPackage {
  return {
    id: crypto.randomUUID(),
    name: "默认角色包",
    icon: "",
    description: "用于普通对话的默认会话容器。",
    categoryId: null,
    order: 0,
    conversations: [],
    pluginId: "",
    mainPluginId: builtinCorePluginId,
    enabledGlobalPluginIds: [],
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
    generatingConversationIds: [] as string[],
    lastMessageEditRequestId: 0,
    lastMessageNavigationRequestId: 0,
    messageNavigationRequest: null as MessageNavigationRequest | null,
  }),
  getters: {
    activePackage: (state) =>
      state.packages.find((item) => item.id === state.activePackageId) ?? state.packages[0],
    activeConversation: (state) =>
      state.conversations.find((item) => item.id === state.activeConversationId),
    activeContainer: (state) =>
      state.containers.find((item) => item.id === state.activeContainerId),
    generating: (state) => state.generatingConversationIds.length > 0,
    activeConversationGenerating: (state) =>
      state.generatingConversationIds.includes(state.activeConversationId),
    isConversationGenerating: (state) => (conversationId: string) =>
      state.generatingConversationIds.includes(conversationId),
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
        pluginId: item.pluginId ?? "",
        mainPluginId: item.mainPluginId || builtinCorePluginId,
        enabledGlobalPluginIds: item.enabledGlobalPluginIds ?? [],
        capabilities: item.capabilities
          ? structuredClone(item.capabilities)
          : undefined,
        syncEnabled: item.syncEnabled ?? true,
      }));
      this.conversations = conversations.map((item) => ({
        ...item.value,
        rendererId: item.value.rendererId ?? "chat",
        reasoningEffort: item.value.reasoningEffort ?? "none",
        featureApiEnabled: item.value.featureApiEnabled ?? true,
      }));
      this.containers = containers.map((item) => ({
        ...item.value,
        content: item.value.content.map((message) => ({
          ...message,
          type: message.type ?? "message",
        })),
      }));

      if (this.packages.length === 0) {
        const basePackage = createDefaultPackage();
        this.packages.push(basePackage);
        await this.persistPackage(basePackage);
      }
      const pluginStore = usePluginStore();
      await pluginStore.initialize();
      for (const item of this.packages) {
        const owned = pluginStore.plugins.filter(
          (plugin) => plugin.packageId === item.id,
        );
        if (owned.length > 1) {
          throw new Error(`角色包 ${item.name} 包含多个本地插件，请先整理数据。`);
        }
        const localPlugin = owned[0] ?? await pluginStore.createPlugin(item.id);
        const configuredMain = pluginStore.plugins.find(
          (plugin) => plugin.id === item.mainPluginId,
        );
        const nextMainPluginId = configuredMain
          && (configuredMain.packageId === null || configuredMain.id === localPlugin.id)
          ? configuredMain.id
          : builtinCorePluginId;
        const enabledGlobalPluginIds = [...new Set(item.enabledGlobalPluginIds)]
          .filter((pluginId) => pluginStore.plugins.some(
            (plugin) => plugin.id === pluginId && plugin.packageId === null,
          ));
        const nextMain = pluginStore.plugins.find(
          (plugin) => plugin.id === nextMainPluginId,
        );
        if (nextMain?.packageId === null) enabledGlobalPluginIds.push(nextMain.id);
        const normalizedGlobalPluginIds = [...new Set(enabledGlobalPluginIds)];
        if (
          item.pluginId !== localPlugin.id
          || item.mainPluginId !== nextMainPluginId
          || JSON.stringify(item.enabledGlobalPluginIds) !== JSON.stringify(normalizedGlobalPluginIds)
        ) {
          item.pluginId = localPlugin.id;
          item.mainPluginId = nextMainPluginId;
          item.enabledGlobalPluginIds = normalizedGlobalPluginIds;
          await this.persistPackage(item);
        }
      }
      this.packages.sort(comparePackages);

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
    async resetCharacterPackages() {
      await this.initialize();
      const pluginStore = usePluginStore();
      await pluginStore.initialize();
      for (const plugin of [...pluginStore.plugins]) {
        if (plugin.packageId !== null && !plugin.builtIn) {
          await pluginStore.deletePlugin(plugin.id);
        }
      }
      for (const item of [...this.conversations]) {
        await this.deleteConversation(item.id, { activateFallback: false });
      }
      for (const item of [...this.packages]) {
        await remove(packageTable, item.id);
      }
      for (const item of [...this.categories]) {
        await remove(categoryTable, item.id);
      }

      this.categories = [];
      this.packages = [];
      this.conversations = [];
      this.containers = [];
      this.activePackageId = "";
      this.activeConversationId = "";
      this.activeContainerId = "";
      const basePackage = createDefaultPackage();
      this.packages.push(basePackage);
      await this.persistPackage(basePackage);
      const localPlugin = await pluginStore.createPlugin(basePackage.id);
      basePackage.pluginId = localPlugin.id;
      await this.persistPackage(basePackage);
      await this.openPackage(basePackage.id);
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
    async createPackage(
      input?: Partial<
        Pick<CharacterPackage, "name" | "description" | "icon" | "categoryId">
      >,
      options: { activate?: boolean } = {},
    ) {
      const item: CharacterPackage = {
        id: crypto.randomUUID(),
        name: input?.name?.trim() || "新角色包",
        icon: input?.icon || "",
        description: input?.description?.trim(),
        categoryId: input?.categoryId ?? null,
        order: Math.max(-1, ...this.packages.map((packageItem) => packageItem.order ?? -1)) + 1,
        conversations: [],
        pluginId: "",
        mainPluginId: builtinCorePluginId,
        enabledGlobalPluginIds: [],
        syncEnabled: true,
      };
      this.packages.push(item);
      await this.persistPackage(item);
      const pluginStore = usePluginStore();
      await pluginStore.initialize();
      const localPlugin = await pluginStore.createPlugin(item.id);
      item.pluginId = localPlugin.id;
      await this.persistPackage(item);
      if (options.activate !== false) {
        await this.openPackage(item.id);
      }
      return item;
    },
    async updatePackage(packageId: string, patch: Partial<Pick<CharacterPackage, "name" | "description" | "icon" | "categoryId" | "syncEnabled" | "capabilities" | "mainPluginId" | "enabledGlobalPluginIds">>) {
      const item = this.packages.find((packageItem) => packageItem.id === packageId);
      if (!item) {
        return;
      }

      if (patch.mainPluginId || patch.enabledGlobalPluginIds) {
        const pluginStore = usePluginStore();
        await pluginStore.initialize();
        if (patch.mainPluginId) {
          const mainPlugin = pluginStore.plugins.find(
            (plugin) => plugin.id === patch.mainPluginId,
          );
          if (
            !mainPlugin
            || (mainPlugin.packageId !== null && mainPlugin.id !== item.pluginId)
          ) {
            throw new Error("主要插件必须是当前角色资源插件或全局插件。");
          }
          const context = findPluginNodeByPath(
            mainPlugin.root,
            pluginConventions.context,
          );
          const process = findPluginNodeByPath(mainPlugin.root, [
            pluginConventions.agentProcessFolder,
            pluginConventions.agentProcessEntry,
          ]);
          if (
            context?.kind !== "file"
            || pluginFileType(context.name) !== "markdown"
            || process?.kind !== "file"
            || pluginFileType(process.name) !== "javascript"
            || typeof process.content !== "string"
            || !process.content.trim()
          ) {
            throw new Error("主要插件必须包含有效的 context.md 和 agentprocess/index.js。");
          }
        }
        if (patch.enabledGlobalPluginIds) {
          patch.enabledGlobalPluginIds = [...new Set(patch.enabledGlobalPluginIds)]
            .filter((pluginId) => pluginStore.plugins.some(
              (plugin) => plugin.id === pluginId && plugin.packageId === null,
            ));
        }
        const nextMainPluginId = patch.mainPluginId ?? item.mainPluginId;
        const nextMain = pluginStore.plugins.find(
          (plugin) => plugin.id === nextMainPluginId,
        );
        if (nextMain?.packageId === null) {
          patch.enabledGlobalPluginIds = [...new Set([
            ...(patch.enabledGlobalPluginIds ?? item.enabledGlobalPluginIds),
            nextMain.id,
          ])];
        }
      }

      Object.assign(item, patch);
      await this.persistPackage(item);
    },
    async deletePackage(
      packageId: string,
      options: { activateFallback?: boolean } = {},
    ) {
      const relatedConversations = this.conversations.filter((item) => item.packageId === packageId);
      for (const conversation of relatedConversations) {
        await this.deleteConversation(conversation.id, {
          activateFallback: false,
        });
      }
      const relatedBindings = this.conversations.filter(
        (item) => item.packageId !== packageId && item.binding?.packageId === packageId,
      );
      for (const item of relatedBindings) {
        await this.deleteConversation(item.id, { activateFallback: false });
      }

      const pluginStore = usePluginStore();
      await pluginStore.initialize();
      const localPlugin = pluginStore.plugins.find(
        (plugin) => plugin.packageId === packageId,
      );
      if (localPlugin) await pluginStore.deletePlugin(localPlugin.id);

      this.packages = this.packages.filter((item) => item.id !== packageId);
      await remove(packageTable, packageId);
      if (options.activateFallback !== false && this.packages[0]) {
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
      const enabledGlobalPluginIds = [...new Set(item.enabledGlobalPluginIds)]
        .filter((pluginId) => pluginStore.plugins.some(
          (plugin) => plugin.id === pluginId && plugin.packageId === null,
        ));
      const mainPlugin = pluginStore.plugins.find(
        (plugin) => plugin.id === item.mainPluginId,
      );
      if (mainPlugin?.packageId === null) enabledGlobalPluginIds.push(mainPlugin.id);
      item.enabledGlobalPluginIds = [...new Set(enabledGlobalPluginIds)];
      await this.persistPackage(item);
      this.activePackageId = packageId;
      const newest = item.conversations
        .map((link) => this.conversations.find((conversation) => conversation.id === link.id))
        .filter((conversation): conversation is Conversation => Boolean(conversation))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (newest) {
        this.openConversation(newest.id);
      } else {
        this.activeConversationId = "";
        this.activeContainerId = "";
      }
    },
    async createConversation(
      packageId?: string,
      input: {
        activate?: boolean;
        binding?: ConversationResourceBinding;
        kind?: ConversationKind;
        reasoningEffort?: ConversationReasoningEffort;
        featureApiEnabled?: boolean;
        rendererId?: ConversationRendererId;
        title?: string;
      } = {},
    ) {
      packageId ??= this.activePackageId;
      const packageItem = this.packages.find((item) => item.id === packageId);
      if (!packageItem) {
        throw new Error("无法创建对话：请先选择角色包。");
      }
      const template = this.conversations.find((item) => item.packageId === packageId && item.isTemplate);
      const conversation: Conversation = {
        id: crypto.randomUUID(),
        packageId,
        kind: input.kind ?? "chat",
        binding: input.binding ? clonePlain(input.binding) : undefined,
        title: input.title?.trim() || template?.title || "新对话",
        isTemplate: false,
        rendererId: input.rendererId ?? template?.rendererId ?? "chat",
        reasoningEffort:
          input.reasoningEffort
          ?? template?.reasoningEffort
          ?? "none",
        featureApiEnabled:
          input.featureApiEnabled
          ?? template?.featureApiEnabled
          ?? true,
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
      packageItem.conversations.unshift({
        id: conversation.id,
        lastContainerid: conversation.lastContainerId ?? "",
        title: conversation.title,
      });
      await this.persistPackage(packageItem);

      await Promise.all([
        this.persistConversation(conversation),
        ...createdContainers.map((container) => this.persistContainer(container)),
      ]);
      if (input.activate !== false) {
        this.openConversation(conversation.id);
      }
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
        if (message?.type === "error") {
          continue;
        }
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
      patch: Partial<
        Pick<
          Conversation,
          | "title"
          | "isTemplate"
          | "kind"
          | "binding"
          | "rendererId"
          | "reasoningEffort"
          | "featureApiEnabled"
        >
      >,
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
    async setConversationReasoningEffort(
      conversationId: string,
      reasoningEffort: ConversationReasoningEffort,
    ) {
      await this.updateConversation(conversationId, { reasoningEffort });
    },
    async setConversationFeatureApiEnabled(
      conversationId: string,
      featureApiEnabled: boolean,
    ) {
      await this.updateConversation(conversationId, { featureApiEnabled });
    },
    async deleteConversation(
      conversationId: string,
      options: { activateFallback?: boolean } = {},
    ) {
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
      await deleteConversationMemory(conversationId);
      await remove(conversationTable, conversationId);

      const packageItem = this.packages.find((item) => item.id === conversation.packageId);
      if (packageItem) {
        packageItem.conversations = packageItem.conversations.filter((item) => item.id !== conversationId);
        await this.persistPackage(packageItem);
        const next = this.conversations.find((item) => item.packageId === packageItem.id);
        if (options.activateFallback === false) {
          return;
        }
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
    requestMessageNavigation(conversationId: string, containerId: string) {
      this.lastMessageNavigationRequestId += 1;
      this.messageNavigationRequest = {
        conversationId,
        containerId,
        requestId: this.lastMessageNavigationRequestId,
      };
    },
    completeMessageNavigation(requestId: number) {
      if (this.messageNavigationRequest?.requestId === requestId) {
        this.messageNavigationRequest = null;
      }
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
      message.meta.translation = undefined;
      await this.persistContainer(container);
    },
    async setMessageTranslation(
      containerId: string,
      messageId: string,
      translatedContent: string,
    ) {
      const container = this.containers.find((item) => item.id === containerId);
      const message = container?.content.find((item) => item.id === messageId);
      if (!container || !message) {
        return false;
      }

      message.meta.translation ??= {
        originalContent: message.content,
        translatedAt: now(),
      };
      message.content = translatedContent;
      await this.persistContainer(container);
      return true;
    },
    async restoreMessageOriginal(containerId: string, messageId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      const message = container?.content.find((item) => item.id === messageId);
      const translation = message?.meta.translation;
      if (!container || !message || !translation) {
        return false;
      }

      message.content = translation.originalContent;
      message.meta.translation = undefined;
      await this.persistContainer(container);
      return true;
    },
    async setMessageFavorite(
      containerId: string,
      messageId: string,
      favorite: boolean,
    ) {
      const container = this.containers.find((item) => item.id === containerId);
      const message = container?.content.find((item) => item.id === messageId);
      if (!container || !message) {
        return false;
      }

      message.favorite = favorite || undefined;
      await this.persistContainer(container);
      return true;
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
      return this.appendContainerToConversation(
        conversation.id,
        role,
        content,
        previousContainerId,
        parts,
        true,
      );
    },
    async appendContainerToConversation(
      conversationId: string,
      role: Role,
      content = "",
      previousContainerId?: string,
      parts?: AdditionalParts[],
      activate = false,
      messageType: ChatMessageType = "message",
    ) {
      const conversation = this.conversations.find(
        (item) => item.id === conversationId,
      );
      if (!conversation) {
        return null;
      }
      previousContainerId ??=
        conversation.lastContainerId ?? conversation.rootContainerId ?? undefined;

      const container = createContainer({
        role,
        conversationId: conversation.id,
        previousContainer: previousContainerId || null,
        content,
        parts,
        messageType,
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
      if (activate) {
        this.activeContainerId = container.id;
      }
      this.syncConversationLink(conversation);
      await Promise.all([this.persistContainer(container), this.persistConversation(conversation)]);
      return container;
    },
    async pushErrorMessage(
      content: string,
      conversationId?: string | null,
    ) {
      const message = content.trim();
      const targetConversationId = conversationId ?? this.activeConversationId;
      if (!message || !targetConversationId) {
        return null;
      }
      return this.appendContainerToConversation(
        targetConversationId,
        "assistant",
        message,
        undefined,
        undefined,
        targetConversationId === this.activeConversationId,
        "error",
      );
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
      if (
        (!trimmed && attachments.length === 0 && !action)
        || this.generatingConversationIds.includes(this.activeConversationId)
      ) {
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
    async sendToConversation(
      conversationId: string,
      content: string,
      mutate?: MessageDraftClosure,
      attachments: FilePart[] = [],
      action?: ActionPart | null,
    ) {
      const trimmed = content.trim();
      if (
        (!trimmed && attachments.length === 0 && !action)
        || this.generatingConversationIds.includes(conversationId)
      ) {
        return;
      }
      void import("@/features/Statistic/application/statistic-store").then(({ useStatisticStore }) =>
        useStatisticStore().recordEvent("message.user"),
      );

      const userContainer = await this.appendContainerToConversation(
        conversationId,
        "user",
        trimmed,
        undefined,
        action ? [clonePlain(action), ...attachments] : attachments,
      );
      if (!userContainer) {
        return;
      }
      const assistant = await this.appendContainerToConversation(
        conversationId,
        "assistant",
        "",
        userContainer.id,
      );
      if (assistant) {
        await this.fillAssistantContainer(assistant, mutate);
      }
    },
    async regenerate(containerId?: string, mutate?: MessageDraftClosure) {
      containerId ??= this.activeContainerId;
      const container = this.containers.find((item) => item.id === containerId);
      if (!container) {
        return;
      }
      if (this.generatingConversationIds.includes(container.conversationid)) {
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

      if (!this.generatingConversationIds.includes(container.conversationid)) {
        this.generatingConversationIds.push(container.conversationid);
      }
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
        const packageItem = this.packages.find(
          (item) => item.id === conversation.packageId,
        );
        let mainPluginId = packageItem?.mainPluginId ?? builtinCorePluginId;
        const enabledPlugins = pluginStore.enabledPluginsForPackage(
          conversation.packageId,
          packageItem?.enabledGlobalPluginIds,
          mainPluginId,
        );
        if (conversation.kind === "test" && conversation.binding?.pluginId) {
          const targetPlugin = pluginStore.plugins.find(
            (item) => item.id === conversation.binding?.pluginId,
          );
          if (
            targetPlugin
            && !enabledPlugins.some((item) => item.id === targetPlugin.id)
          ) {
            enabledPlugins.unshift(targetPlugin);
          }
          if (targetPlugin) mainPluginId = targetPlugin.id;
        }
        const previousPath = this.containerPathTo(container.previousContainer);
        const generationPath = previousPath.filter(
          (item) => this.currentMessage(item)?.type !== "error",
        );
        const promptContainer = [...generationPath].reverse().find(
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
          mainPluginId,
          conversationId: container.conversationid,
          conversation,
          reasoningEffort: conversation.reasoningEffort,
          activePath: generationPath,
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
          resourceContext: buildConversationResourceContext(
            conversation,
            pluginStore.plugins,
            this.packages,
            this.conversations,
            this.containers,
          ),
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
        message.type = "message";
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
        message.type = "error";
        message.content = error instanceof Error ? error.message : "生成失败";
      } finally {
        message.meta.generateInfo.timeUsed = Date.now() - start;
        await mutate?.(message, container);
        await this.persistContainer(container);
        this.generatingConversationIds = this.generatingConversationIds.filter(
          (id) => id !== container.conversationid,
        );
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
    async activateContainerBranch(containerId: string) {
      const target = this.containers.find((item) => item.id === containerId);
      const conversation = target
        ? this.conversations.find((item) => item.id === target.conversationid)
        : null;
      if (
        !target
        || !conversation
        || conversation.id !== this.activeConversationId
      ) {
        return null;
      }

      const path = this.containerPathTo(target.id);
      const changedParents: ChatMessageContainer[] = [];
      for (let index = 0; index < path.length - 1; index += 1) {
        const parent = path[index];
        const child = path[index + 1];
        if (!parent || !child || child.previousContainer !== parent.id) {
          continue;
        }
        if (parent.activeNextContainer !== child.id) {
          parent.activeNextContainer = child.id;
          changedParents.push(parent);
        }
      }

      const tailId = this.resolveActiveTailId(target.id);
      this.activeContainerId = tailId;
      conversation.lastContainerId = tailId;
      conversation.updatedAt = now();
      await Promise.all([
        ...changedParents.map((item) => this.persistContainer(item)),
        this.persistConversation(conversation),
      ]);
      this.syncConversationLink(conversation);
      return target.id;
    },
    async activateMessage(containerId: string, messageId: string) {
      const container = this.containers.find((item) => item.id === containerId);
      const messageIndex = container?.content.findIndex(
        (item) => item.id === messageId,
      ) ?? -1;
      if (!container || messageIndex < 0) {
        return null;
      }

      if (this.activeConversationId !== container.conversationid) {
        this.openConversation(container.conversationid);
      }
      if (container.activeMessage !== messageIndex) {
        container.activeMessage = messageIndex;
        await this.persistContainer(container);
      }

      return this.activateContainerBranch(containerId);
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
    uniqueConversationTitle(packageId: string, baseTitle: string) {
      const normalizedBase = baseTitle.trim() || "临时对话";
      const existing = new Set(
        this.conversations
          .filter((item) => item.packageId === packageId)
          .map((item) => item.title),
      );
      if (!existing.has(normalizedBase)) {
        return normalizedBase;
      }
      let suffix = 2;
      while (existing.has(`${normalizedBase} · ${suffix}`)) {
        suffix += 1;
      }
      return `${normalizedBase} · ${suffix}`;
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
      message?.type !== "error"
      && message?.content.trim()
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
