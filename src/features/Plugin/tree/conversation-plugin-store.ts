import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { useMessageStore } from "@/features/Conversation/messages/message-store";
import type { ChatMessage, ChatMessageContainer, ConversationResourceOperation } from "@/features/Conversation/messages/conversation-types";
import { usePackageStore } from "@/features/Package/package-store";
import type { Plugin, PluginFile } from "./plugin-types";
import type { PluginBaseStore, PluginStoreApiOptions } from "./plugin-store";
import { builtinCorePluginId } from "./plugin-store";
import { ConversationResourceOverlay } from "./conversation-resource-overlay";
import type { PluginLogger } from "@/features/Plugin/runtime/logger";

type CachedTree = { revision: number; keys: string[]; plugins: Plugin[]; checkpoints: Map<string, Plugin[]> };
/** A conversation ID is only meaningful relative to one persistent Plugin owner. */
const treesByBase = new WeakMap<object, Map<string, CachedTree>>();
const containerPersistQueues = new Map<string, Promise<void>>();

function treesFor(base: PluginBaseStore) {
  let trees = treesByBase.get(base);
  if (!trees) {
    trees = new Map<string, CachedTree>();
    treesByBase.set(base, trees);
  }
  return trees;
}

function clonePlugins(plugins: Plugin[]) { return new ConversationResourceOverlay({ plugins }).plugins; }
function pathKey(keys: readonly string[]) { return keys.join("\u0001"); }
function sharedPrefix(left: readonly string[], right: readonly string[]) {
  let index = 0;
  while (index < left.length && left[index] === right[index]) index += 1;
  return index;
}

function selectedBasePlugins(base: PluginBaseStore, chatId: string) {
  const chat = useChatStore().chats.find((item) => item.id === chatId);
  if (!chat) throw new Error("会话不存在。");
  const packageItem = usePackageStore().packages.find((item) => item.id === chat.packageId);
  return base.enabledPluginsForPackage(chat.packageId, packageItem?.enabledGlobalPluginIds, packageItem?.mainPluginId || builtinCorePluginId);
}

function activeChanges(chatId: string) {
  const chat = useChatStore().chats.find((item) => item.id === chatId);
  if (!chat) throw new Error("会话不存在。");
  const changes: ConversationResourceOperation[] = [];
  const keys: string[] = [];
  for (const container of useMessageStore().pathFor(chat.lastContainerId)) {
    const message = container.activeMessage === null ? null : container.content[container.activeMessage];
    for (const [index, change] of (message?.meta.pluginChanges?.changes ?? []).entries()) {
      changes.push(change);
      keys.push(`${container.id}:${message!.id}:${index}:${JSON.stringify(change)}`);
    }
  }
  return { changes, keys };
}

/** Recomputes from cached structural changes, never from full Plugin snapshots. */
function materialize(base: PluginBaseStore, chatId: string) {
  const { changes, keys } = activeChanges(chatId);
  const trees = treesFor(base);
  let cache = trees.get(chatId);
  if (!cache || cache.revision !== base.treeRevision) {
    const plugins = clonePlugins(selectedBasePlugins(base, chatId));
    cache = { revision: base.treeRevision, keys: [], plugins, checkpoints: new Map([["", clonePlugins(plugins)]]) };
    trees.set(chatId, cache);
  }
  const shared = sharedPrefix(cache.keys, keys);
  if (shared === cache.keys.length) {
    if (shared < keys.length) {
      const view = new ConversationResourceOverlay({ plugins: cache.plugins, copy: false });
      for (const change of changes.slice(shared)) view.applyChange(change);
      cache.keys = [...keys];
    }
    return cache.plugins;
  }
  cache.checkpoints.set(pathKey(cache.keys), clonePlugins(cache.plugins));
  let checkpointKeys: string[] = [];
  let checkpoint = cache.checkpoints.get("")!;
  for (const [key, plugins] of cache.checkpoints) {
    const candidate = key ? key.split("\u0001") : [];
    if (candidate.length >= checkpointKeys.length && sharedPrefix(candidate, keys) === candidate.length) {
      checkpointKeys = candidate;
      checkpoint = plugins;
    }
  }
  const plugins = clonePlugins(checkpoint);
  const view = new ConversationResourceOverlay({ plugins, copy: false });
  for (const change of changes.slice(checkpointKeys.length)) view.applyChange(change);
  cache.plugins = plugins;
  cache.keys = [...keys];
  return plugins;
}

function persistContainer(container: ChatMessageContainer) {
  const previous = containerPersistQueues.get(container.id) ?? Promise.resolve();
  const next = previous.then(() => useMessageStore().persist(container));
  containerPersistQueues.set(container.id, next.catch(() => undefined));
  return next;
}

export function createConversationPluginStore(base: PluginBaseStore, conversationId: MaybeRefOrGetter<string | null | undefined>) {
  const chatId = computed(() => toValue(conversationId) ?? "");
  const changeRevision = ref(0);
  const finalPlugins = computed(() => {
    changeRevision.value;
    return chatId.value ? materialize(base, chatId.value) : [] as Plugin[];
  });

  function forVersion(container: ChatMessageContainer, message: ChatMessage, logger?: PluginLogger) {
    if (!chatId.value || container.conversationid !== chatId.value || !container.content.some((candidate) => candidate.id === message.id))
      throw new Error("Plugin 变更必须绑定到指定会话的具体消息版本。");
    const overlay = new ConversationResourceOverlay({
      plugins: finalPlugins.value,
      onChange: (change, stats) => {
        const state = message.meta.pluginChanges ??= { changes: [], stats };
        state.changes.push(change);
        state.stats = stats;
        changeRevision.value += 1;
        void persistContainer(container);
      },
    });
    if (logger) overlay.setLogger(logger);
    return {
      plugins: overlay.plugins,
      api: (pluginId: string, options: Omit<PluginStoreApiOptions, "plugins" | "mutation" | "conversationId"> = {}) =>
        base.api(pluginId, { ...options, plugins: overlay.plugins, mutation: overlay, conversationId: chatId.value }),
      updateFile: (pluginId: string, resourceId: string, patch: Partial<Pick<PluginFile, "content" | "order" | "insertion">>) => overlay.updateFile(pluginId, resourceId, patch),
      recordCodeAct: () => overlay.recordCodeAct(),
      async flush() {
        if (message.meta.pluginChanges && logger) {
          message.meta.pluginChanges.stats.logCount = logger.logs.length;
          await persistContainer(container);
        }
        await (containerPersistQueues.get(container.id) ?? Promise.resolve());
      },
    };
  }

  return {
    finalPlugins, plugins: finalPlugins, forVersion,
    async updateFile(pluginId: string, resourceId: string, patch: Partial<Pick<PluginFile, "content" | "order" | "insertion">>) {
      if (!chatId.value) throw new Error("会话不存在。");
      const chats = useChatStore();
      const messages = useMessageStore();
      const chat = chats.chats.find((item) => item.id === chatId.value);
      if (!chat) throw new Error("会话不存在。");
      const container = await messages.append({ conversationId: chat.id, role: "system", content: "", previousContainer: chat.lastContainerId, hidden: true });
      chat.lastContainerId = container.id;
      chat.updatedAt = new Date().toISOString();
      await chats.persist(chat);
      const message = messages.currentMessage(container);
      if (!message) throw new Error("新建的 Plugin 变更容器没有消息版本。");
      const attached = forVersion(container, message);
      const file = attached.updateFile(pluginId, resourceId, patch);
      await attached.flush();
      return file;
    },
  };
}
