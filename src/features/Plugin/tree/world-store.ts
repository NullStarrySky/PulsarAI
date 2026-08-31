import { computed, toRaw, toValue, type MaybeRefOrGetter } from "vue";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import type {
  ChatMessage,
  ChatMessageContainer,
} from "@/features/Conversation/messages/conversation-types";
import { usePackageStore } from "@/features/Package/package-store";
import type { WorldConfig } from "@/features/Package/package-types";
import type { PluginLogger } from "@/features/Plugin/runtime/logger";
import { builtinCorePluginId, usePluginStore } from "./plugin-store";
import { useSlotStore, type SlotQuery } from "./slot-store";
import type { PluginFile } from "./plugin-types";
import { ConversationResourceOverlay } from "./conversation-resource-overlay";
import {
  normalizeWorldPath,
  resolveWorldPath,
  worldReference,
} from "./world-path";
import {
  createWorldConfig,
  isWorldPathDisabled,
  parseWorldConfig,
  selectWorldSlotPaths,
} from "./world-config";

export type WorldScope =
  | string
  | null
  | undefined
  | { conversationId?: string | null; packageId?: string | null };

function normalizedScope(value: WorldScope) {
  return typeof value === "string" ? { conversationId: value } : value ?? {};
}

function metadata(id: string, name: string, path: string, kind: "file" | "folder") {
  return { id, name, path, kind };
}

function configWithSelection(
  current: WorldConfig,
  containers: { get: (id: string, scope?: "local" | "global") => SlotQuery | null; list: (scope?: "local" | "global") => SlotQuery[] },
  containerId: string,
  paths: string[],
) {
  const available = containers.get(containerId, "global")?.allResources.map((item) => worldReference(item.worldPath)) ?? [];
  const known = containers.list("global").flatMap((slot) =>
    slot.allResources.map((item) => worldReference(item.worldPath)));
  return selectWorldSlotPaths(current, containerId, available, known, paths);
}

/**
 * Complete package World: /config.json owns shared slot contracts and disabled paths,
 * package-local files live below /self, globals below /global/<pluginId>, and
 * conversation mutations replay as ordered operations on a concrete path.
 */
export function useWorld(scope: MaybeRefOrGetter<WorldScope> = undefined) {
  const base = usePluginStore();
  const chats = useChatStore();
  const packages = usePackageStore();
  const conversationId = computed(
    () => normalizedScope(toValue(scope)).conversationId ?? "",
  );
  const packageId = computed(() => {
    const value = normalizedScope(toValue(scope));
    return value.packageId
      ?? chats.chats.find((item) => item.id === value.conversationId)?.packageId
      ?? "";
  });
  const session = usePluginStore(conversationId);
  const packageItem = computed(
    () => packages.packages.find((item) => item.id === packageId.value) ?? null,
  );
  const plugins = computed(() => conversationId.value
    ? session.finalPlugins.value
    : base.sortedPlugins.filter(
        (plugin) => plugin.id === packageItem.value?.pluginId || plugin.packageId === null,
      ));
  const config = computed<WorldConfig>(() =>
    conversationId.value
      ? session.config.value ?? createWorldConfig()
      : packageItem.value?.worldConfig ?? createWorldConfig(),
  );
  const containers = computed(() => useSlotStore().api(plugins.value, {
    packageId: packageId.value,
    config: config.value,
  }));

  function localPluginId() {
    return packageItem.value?.pluginId || builtinCorePluginId;
  }

  function requireWorldPath(path: string) {
    if (!path.trim().startsWith("/"))
      throw new Error(`World 路径必须以 / 开头：${path}`);
    return path;
  }

  function isConfigPath(path: string) {
    return normalizeWorldPath(requireWorldPath(path)) === "config.json";
  }

  function api() {
    if (!packageId.value) throw new Error("World 文件 API 需要会话或角色包作用域。");
    return base.api(localPluginId(), {
      plugins: plugins.value,
      packageId: packageId.value,
      conversationId: conversationId.value || undefined,
    });
  }

  async function mutate(
    operation: (value: ReturnType<ReturnType<typeof session.forVersion>["api"]>) => unknown,
  ) {
    if (!conversationId.value) return operation(api());
    return session.mutateHidden((attached) => operation(attached.api(localPluginId())));
  }

  async function configure(value: WorldConfig) {
    const next = parseWorldConfig(value);
    if (conversationId.value) return session.configure(next);
    const item = packageItem.value;
    if (!item) throw new Error("World config 需要会话或角色包作用域。");
    await packages.update(item.id, { worldConfig: next });
  }

  async function select(containerId: string, paths: string[]) {
    const selected = paths.map((path) => worldReference(requireWorldPath(path)));
    await configure(configWithSelection(config.value, containers.value, containerId, selected));
  }

  async function move(from: string, to: string) {
    const sourcePath = requireWorldPath(from);
    const targetPath = requireWorldPath(to);
    if (isConfigPath(sourcePath) || isConfigPath(targetPath))
      throw new Error("World config 不能移动。");
    if (conversationId.value)
      return mutate((value) => value.move(sourcePath, targetPath));
    const source = resolveWorldPath(plugins.value, packageId.value, sourcePath, localPluginId());
    const target = resolveWorldPath(plugins.value, packageId.value, targetPath, localPluginId());
    if (source.plugin.id === target.plugin.id) return api().move(sourcePath, targetPath);
    const previousSource = structuredClone(toRaw(source.plugin));
    const previousTarget = structuredClone(toRaw(target.plugin));
    const overlay = new ConversationResourceOverlay({
      plugins: plugins.value,
      config: config.value,
      copy: false,
    });
    overlay.move(source.plugin.id, source.path, target.plugin.id, target.path);
    try {
      await Promise.all([
        base.persistPlugin(source.plugin),
        base.persistPlugin(target.plugin),
      ]);
    } catch (error) {
      Object.assign(source.plugin, previousSource);
      Object.assign(target.plugin, previousTarget);
      throw error;
    }
  }

  async function updateFile(
    path: string,
    patch: Partial<Pick<PluginFile, "content" | "order" | "insertion">>,
  ) {
    if (isConfigPath(path)) {
      if (!("content" in patch)) return;
      await configure(parseWorldConfig(patch.content));
      return;
    }
    const target = resolveWorldPath(
      plugins.value,
      packageId.value,
      requireWorldPath(path),
      localPluginId(),
    );
    const node = target.plugin.files.find((file) => file.path === target.path);
    if (!node) throw new Error(`文件不存在：${path}`);
    if (conversationId.value)
      return session.mutateHidden((attached) =>
        attached.updateFile(target.plugin.id, node.id, patch));
    return base.updateNode(target.plugin.id, node.id, patch);
  }

  function rootEntries() {
    return [
      metadata("world-config", "config.json", "/config.json", "file"),
      metadata("world-self", "self", "/self", "folder"),
      metadata("world-global", "global", "/global", "folder"),
    ];
  }

  function importResource(
    path: string | string[],
    environment?: Record<string, unknown>,
  ): unknown | Promise<unknown> {
    if (!Array.isArray(path))
      return isConfigPath(path)
        ? createWorldConfig(config.value)
        : api().import(requireWorldPath(path), environment);
    const values = path.map((item) => importResource(item, environment));
    return values.some((value) => value instanceof Promise)
      ? Promise.all(values).then((resolved) => resolved.flat())
      : values.flat();
  }

  function bind(
    container: ChatMessageContainer,
    message: ChatMessage,
    logger?: PluginLogger,
    sourcePluginId = localPluginId(),
  ) {
    if (!conversationId.value) throw new Error("消息版本绑定需要会话 World。");
    const attached = session.forVersion(container, message, logger);
    const boundApi = attached.api(sourcePluginId);
    const boundContainers = useSlotStore().api(attached.plugins, {
      packageId: packageId.value,
      config: attached.config,
      sourcePluginId,
    });
    return {
      plugins: attached.plugins,
      config: attached.config,
      ...boundApi,
      containers: boundContainers,
      configure: attached.configure,
      select: async (id: string, paths: string[]) => {
        attached.configure(configWithSelection(attached.config, boundContainers, id, paths));
      },
      flush: attached.flush,
      recordCodeAct: attached.recordCodeAct,
    };
  }

  return {
    conversationId,
    packageId,
    plugins,
    config,
    containers,
    bind,
    configure,
    select,
    isPathDisabled: (path: string) => isWorldPathDisabled(config.value, path),
    resolve: (path: string) => resolveWorldPath(
      plugins.value,
      packageId.value,
      requireWorldPath(path),
      localPluginId(),
    ),
    read: (path: string) => isConfigPath(path)
      ? JSON.stringify(config.value, null, 2)
      : api().read(requireWorldPath(path)),
    readMeta: (path: string) => isConfigPath(path)
      ? metadata("world-config", "config.json", "/config.json", "file")
      : api().readMeta(requireWorldPath(path)),
    ls: (path = "/") => {
      const normalized = normalizeWorldPath(requireWorldPath(path));
      if (!normalized) return rootEntries();
      if (normalized === "global") return plugins.value
        .filter((plugin) => plugin.packageId === null)
        .map((plugin) => metadata(plugin.id, plugin.name, `/global/${plugin.id}`, "folder"));
      return api().ls(requireWorldPath(path));
    },
    exists: (path: string) => {
      const normalized = normalizeWorldPath(requireWorldPath(path));
      if (!normalized || normalized === "config.json" || normalized === "self" || normalized === "global")
        return true;
      return api().exists(requireWorldPath(path));
    },
    import: importResource,
    parse: importResource,
    write: (path: string, content: unknown) => isConfigPath(path)
      ? configure(parseWorldConfig(content))
      : mutate((value) => value.write(requireWorldPath(path), content)),
    edit: (path: string, find: string, replace: string) => {
      if (isConfigPath(path)) {
        const source = JSON.stringify(config.value, null, 2);
        if (!source.includes(find)) throw new Error(`未找到待替换文本：${find}`);
        return configure(parseWorldConfig(source.replace(find, replace)));
      }
      return mutate((value) => value.edit(requireWorldPath(path), find, replace));
    },
    mkdir: (path: string) => mutate((value) => value.mkdir(requireWorldPath(path))),
    move,
    updateFile,
    remove: (path: string) => {
      if (isConfigPath(path)) throw new Error("World config 不能删除。");
      return mutate((value) => value.remove(requireWorldPath(path)));
    },
    open: (path: string) => api().open(requireWorldPath(path)),
    close: (path: string) => api().close(requireWorldPath(path)),
    toggle: (path: string) => api().toggle(requireWorldPath(path)),
  };
}

export function useWorldContainer(
  world: ReturnType<typeof useWorld>,
  id: MaybeRefOrGetter<string>,
) {
  const container = computed(() => world.containers.value.get(toValue(id)));
  return {
    container,
    resources: computed(() => container.value?.resources ?? []),
    paths: () => world.containers.value.paths(toValue(id)),
    import: () => world.containers.value.import(toValue(id)),
    select: (path: string | string[]) => world.select(
      toValue(id),
      Array.isArray(path) ? path : [path],
    ),
  };
}

export { worldReference };
