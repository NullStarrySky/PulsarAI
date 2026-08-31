import type { ModelMessage } from "ai";
import { PluginLogger } from "@/features/Plugin/runtime";
import type { ResourceImportEnvironment } from "@/features/Plugin/resources/resource-wrapper";
import {
  type PluginStoreApiMutation,
  usePluginStore,
} from "@/features/Plugin/tree/plugin-store";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";
import type { ChatMessage, ChatMessageContainer } from "@/features/Conversation/messages/conversation-types";
import { useSlotStore } from "@/features/Plugin/tree/slot-store";
import {
  resolveSandboxMessagesAsync,
  resolveSandboxTextAsync,
} from "@/features/Sandbox/sandbox";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { usePackageStore } from "@/features/Package/package-store";
import type { WorldConfig } from "@/features/Package/package-types";
import { createWorldConfig, parseWorldConfig, selectWorldSlotPaths } from "@/features/Plugin/tree/world-config";
import { normalizeWorldPath } from "@/features/Plugin/tree/world-path";

export type PluginSelfApiMutation = PluginStoreApiMutation;

export interface PluginSelfApiOptions {
  plugins?: Plugin[];
  logger?: PluginLogger;
  mutation?: PluginSelfApiMutation;
  conversationId?: string;
  /** The exact message-version container that owns Plugin persistence. */
  container?: ChatMessageContainer;
  /** Required with container: the concrete version that owns Plugin changes. */
  messageVersion?: ChatMessage;
  packageId?: string;
  worldConfig?: WorldConfig;
}

function isModelMessage(value: unknown): value is ModelMessage {
  return Boolean(value && typeof value === "object" && "role" in value && "content" in value);
}

/** Compose the Store-owned Plugin and Slot APIs with recursive Sandbox parsing. */
export function createPluginSelfApi(
  pluginId: string,
  options: PluginSelfApiOptions = {},
) {
  const logger = options.logger ?? new PluginLogger();
  if (options.container && !options.messageVersion)
    throw new Error("会话 Plugin selfApi 必须绑定具体消息版本。");
  const attached = options.container && options.conversationId && options.messageVersion
    ? usePluginStore(options.conversationId).forVersion(options.container, options.messageVersion, logger)
    : null;
  const plugins = attached?.plugins ?? options.plugins ?? usePluginStore().plugins;
  const packageId = options.packageId
    ?? useChatStore().chats.find((item) => item.id === options.conversationId)?.packageId
    ?? undefined;
  const packageItem = usePackageStore().packages.find((item) => item.id === packageId);
  const config = attached?.config ?? options.worldConfig ?? packageItem?.worldConfig ?? createWorldConfig();
  const plugin = attached
    ? attached.api(pluginId, { logger })
    : usePluginStore().api(pluginId, { ...options, plugins, logger, packageId });
  const slot = useSlotStore().api(plugins, {
    packageId,
    config,
    sourcePluginId: pluginId,
  });
  const isConfigPath = (path: string) => path.trim() === "/config.json";
  const importResource = (
    path: string | string[],
    environment: ResourceImportEnvironment = {},
  ): unknown | Promise<unknown> => {
    if (!Array.isArray(path))
      return isConfigPath(path) ? createWorldConfig(config) : plugin.import(path, environment);
    const values = path.map((item) => importResource(item, environment));
    return values.some((value) => value instanceof Promise)
      ? Promise.all(values).then((resolved) => resolved.flat())
      : values.flat();
  };
  const parse = async (
    path: string | string[],
    input: ResourceImportEnvironment = {},
  ) => {
    const environment: ResourceImportEnvironment = {
      ...input,
      imports: input.imports ?? importResource,
      logger,
    };
    const imported = await importResource(path, environment);
    if (typeof imported === "string") {
      return resolveSandboxTextAsync(imported, [environment], { logger });
    }
    if (Array.isArray(imported) && imported.every(isModelMessage)) {
      return resolveSandboxMessagesAsync(imported, [environment], { logger });
    }
    return imported;
  };
  const configure = async (value: WorldConfig) => {
    const next = parseWorldConfig(value);
    if (attached) {
      attached.configure(next);
      return;
    }
    if (options.mutation) throw new Error("当前资源环境不允许修改 World config。");
    if (!packageItem) throw new Error("World config 需要会话或角色包作用域。");
    await usePackageStore().update(packageItem.id, { worldConfig: next });
  };
  const read = (path: string) => isConfigPath(path)
    ? JSON.stringify(config, null, 2)
    : plugin.read(path);
  const write = (path: string, content: unknown) => isConfigPath(path)
    ? configure(parseWorldConfig(content))
    : plugin.write(path, content);
  const edit = (path: string, find: string, replace: string) => {
    if (!isConfigPath(path)) return plugin.edit(path, find, replace);
    const source = JSON.stringify(config, null, 2);
    if (!source.includes(find)) throw new Error(`未找到待替换文本：${find}`);
    return configure(parseWorldConfig(source.replace(find, replace)));
  };
  const select = async (slotId: string, paths: string[]) => {
    const available = slot.get(slotId, "global")?.allResources.map((item) => item.worldPath) ?? [];
    const known = slot.list("global").flatMap((item) =>
      item.allResources.map((resource) => resource.worldPath));
    await configure(selectWorldSlotPaths(config, slotId, available, known, paths));
  };
  return {
    ...plugin,
    import: importResource,
    run: importResource,
    read,
    write,
    edit,
    exists: (path: string) => isConfigPath(path) || plugin.exists(path),
    readMeta: (path: string) => isConfigPath(path)
      ? { id: "world-config", name: "config.json", path: "/config.json", kind: "file" as const }
      : plugin.readMeta(path),
    ls: (path = "/") => normalizeWorldPath(path)
      ? plugin.ls(path)
      : [
          { id: "world-config", name: "config.json", path: "/config.json", kind: "file" as const },
          { id: "world-self", name: "self", path: "/self", kind: "folder" as const },
          { id: "world-global", name: "global", path: "/global", kind: "folder" as const },
        ],
    parse,
    slot,
    logger,
    plugins,
    config,
    configure,
    select,
    flush: attached?.flush,
    recordCodeAct: attached?.recordCodeAct,
  };
}
