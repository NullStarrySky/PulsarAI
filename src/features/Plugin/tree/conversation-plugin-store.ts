import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { useMessageStore } from "@/features/Conversation/messages/message-store";
import type {
  ChatMessage,
  ChatMessageContainer,
  ConversationResourceOperation,
} from "@/features/Conversation/messages/conversation-types";
import { usePackageStore } from "@/features/Package/package-store";
import type { WorldConfig } from "@/features/Package/package-types";
import type { Plugin, PluginFile } from "./plugin-types";
import type { PluginBaseStore, PluginStoreApiOptions } from "./plugin-store";
import { ConversationResourceOverlay } from "./conversation-resource-overlay";
import type { PluginLogger } from "@/features/Plugin/runtime/logger";

type CachedWorld = { plugins: Plugin[]; config: WorldConfig };
type CachedTree = CachedWorld & {
  revision: number;
  keys: string[];
  checkpoints: Map<string, CachedWorld>;
};
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

function cloneWorld(plugins: Plugin[], config: WorldConfig): CachedWorld {
  const overlay = new ConversationResourceOverlay({ plugins, config });
  return { plugins: overlay.plugins, config: overlay.config };
}
function pathKey(keys: readonly string[]) { return keys.join("\u0001"); }
function sharedPrefix(left: readonly string[], right: readonly string[]) {
  let index = 0;
  while (index < left.length && left[index] === right[index]) index += 1;
  return index;
}

function selectedBaseWorld(base: PluginBaseStore, chatId: string) {
  const chat = useChatStore().chats.find((item) => item.id === chatId);
  if (!chat) throw new Error("会话不存在。");
  const packageItem = usePackageStore().packages.find((item) => item.id === chat.packageId);
  if (!packageItem) throw new Error("会话角色包不存在。");
  return {
    plugins: base.sortedPlugins.filter(
      (plugin) => plugin.id === packageItem.pluginId || plugin.packageId === null,
    ),
    config: packageItem.worldConfig,
  };
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
function materialize(base: PluginBaseStore, chatId: string): CachedWorld {
  const { changes, keys } = activeChanges(chatId);
  const trees = treesFor(base);
  let cache = trees.get(chatId);
  if (!cache || cache.revision !== base.treeRevision) {
    const selected = selectedBaseWorld(base, chatId);
    const world = cloneWorld(selected.plugins, selected.config);
    cache = {
      revision: base.treeRevision,
      keys: [],
      ...world,
      checkpoints: new Map([["", cloneWorld(world.plugins, world.config)]]),
    };
    trees.set(chatId, cache);
  }
  const shared = sharedPrefix(cache.keys, keys);
  if (shared === cache.keys.length) {
    if (shared < keys.length) {
      const view = new ConversationResourceOverlay({
        plugins: cache.plugins,
        config: cache.config,
        copy: false,
      });
      for (const change of changes.slice(shared)) view.applyChange(change);
      cache.config = view.config;
      cache.keys = [...keys];
    }
    return { plugins: cache.plugins, config: cache.config };
  }
  cache.checkpoints.set(pathKey(cache.keys), cloneWorld(cache.plugins, cache.config));
  let checkpointKeys: string[] = [];
  let checkpoint = cache.checkpoints.get("")!;
  for (const [key, world] of cache.checkpoints) {
    const candidate = key ? key.split("\u0001") : [];
    if (candidate.length >= checkpointKeys.length && sharedPrefix(candidate, keys) === candidate.length) {
      checkpointKeys = candidate;
      checkpoint = world;
    }
  }
  const world = cloneWorld(checkpoint.plugins, checkpoint.config);
  const view = new ConversationResourceOverlay({
    plugins: world.plugins,
    config: world.config,
    copy: false,
  });
  for (const change of changes.slice(checkpointKeys.length)) view.applyChange(change);
  cache.plugins = world.plugins;
  cache.config = view.config;
  cache.keys = [...keys];
  return { plugins: cache.plugins, config: cache.config };
}

function persistContainer(container: ChatMessageContainer) {
  const previous = containerPersistQueues.get(container.id) ?? Promise.resolve();
  const next = previous.then(() => useMessageStore().persist(container));
  containerPersistQueues.set(container.id, next.catch(() => undefined));
  return next;
}

export function createConversationPluginStore(
  base: PluginBaseStore,
  conversationId: MaybeRefOrGetter<string | null | undefined>,
) {
  const chatId = computed(() => toValue(conversationId) ?? "");
  const changeRevision = ref(0);
  const finalPlugins = computed(() => {
    changeRevision.value;
    return chatId.value ? materialize(base, chatId.value).plugins : [] as Plugin[];
  });
  const config = computed(() => {
    changeRevision.value;
    return chatId.value ? materialize(base, chatId.value).config : null;
  });

  function forVersion(
    container: ChatMessageContainer,
    message: ChatMessage,
    logger?: PluginLogger,
  ) {
    if (!chatId.value || container.conversationid !== chatId.value ||
      !container.content.some((candidate) => candidate.id === message.id))
      throw new Error("Plugin 变更必须绑定到指定会话的具体消息版本。");
    const currentConfig = config.value;
    if (!currentConfig) throw new Error("会话 World config 不存在。");
    const overlay = new ConversationResourceOverlay({
      plugins: finalPlugins.value,
      config: currentConfig,
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
      config: overlay.config,
      api: (
        pluginId: string,
        options: Omit<PluginStoreApiOptions, "plugins" | "mutation" | "conversationId"> = {},
      ) => base.api(pluginId, {
        ...options,
        plugins: overlay.plugins,
        mutation: overlay,
        conversationId: chatId.value,
        packageId: useChatStore().chats.find((item) => item.id === chatId.value)?.packageId,
      }),
      updateFile: (
        pluginId: string,
        resourceId: string,
        patch: Partial<Pick<PluginFile, "content" | "order" | "insertion">>,
      ) => overlay.updateFile(pluginId, resourceId, patch),
      configure: (value: WorldConfig) => overlay.configure(value),
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

  async function mutateHidden<T>(
    mutate: (attached: ReturnType<typeof forVersion>) => T | Promise<T>,
  ) {
    if (!chatId.value) throw new Error("会话不存在。");
    const chats = useChatStore();
    const messages = useMessageStore();
    const chat = chats.chats.find((item) => item.id === chatId.value);
    if (!chat) throw new Error("会话不存在。");
    const container = await messages.append({
      conversationId: chat.id,
      role: "system",
      content: "",
      previousContainer: chat.lastContainerId,
      hidden: true,
    });
    chat.lastContainerId = container.id;
    chat.updatedAt = new Date().toISOString();
    await chats.persist(chat);
    const message = messages.currentMessage(container);
    if (!message) throw new Error("新建的 World 变更容器没有消息版本。");
    const attached = forVersion(container, message);
    const result = await mutate(attached);
    await attached.flush();
    return result;
  }

  return {
    finalPlugins,
    plugins: finalPlugins,
    config,
    forVersion,
    mutateHidden,
    async updateFile(
      pluginId: string,
      resourceId: string,
      patch: Partial<Pick<PluginFile, "content" | "order" | "insertion">>,
    ) {
      return mutateHidden((attached) => attached.updateFile(pluginId, resourceId, patch));
    },
    configure: (value: WorldConfig) =>
      mutateHidden((attached) => attached.configure(value)),
  };
}
