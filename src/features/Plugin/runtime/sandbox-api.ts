import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import { createPluginReferenceResolver } from "./plugin-reference-resolver";
import { pluginGenerateFile } from "./plugin-generate-path";
import { globMatcher } from "./plugin-uri";
import { usePluginStore } from "../tree/plugin-store";
import type { Plugin } from "../tree/plugin-types";

function plugins() {
  return (usePluginStore() as unknown as { plugins: Plugin[] }).plugins;
}

function visiblePlugins() {
  const conversation = useConversationStore();
  return usePluginStore().enabledPluginsForPackage(
    conversation.activePackageId,
    conversation.activePackage?.enabledGlobalPluginIds,
    conversation.activePackage?.mainPluginId,
  );
}

function summary(plugin: Plugin) {
  const active = useConversationStore().activePackage;
  return {
    id: plugin.id,
    name: plugin.name,
    icon: plugin.icon,
    description: plugin.shortDescription,
    packageId: plugin.packageId,
    enabled: plugin.enabled,
    builtIn: plugin.builtIn,
    active:
      plugin.id === active?.pluginId
      || plugin.id === active?.mainPluginId
      || active?.enabledGlobalPluginIds.includes(plugin.id) === true,
  };
}

function visibleResolver() {
  return createPluginReferenceResolver(visiblePlugins());
}

function findContainer(scope: "local" | "global", id: string) {
  const resolver = visibleResolver();
  const container = resolver.listContainers().find(
    (item) => item.scope === scope && (item.name === id || item.id === id),
  );
  return { resolver, container };
}

/**
 * `environment.plugin` 的完整实现。注册表按需屏蔽其中的危险方法。
 */
export function createPluginSandboxApi() {
  return {
    self: () => null,
    list: (input: { packageId?: string; activeOnly?: boolean } = {}) =>
      plugins().filter((plugin) =>
        (input.packageId === undefined || plugin.packageId === input.packageId)
        && (!input.activeOnly || summary(plugin).active)
      ).map(summary),
    get: (pluginId: string) => {
      const plugin = plugins().find((item) => item.id === pluginId);
      return plugin ? summary(plugin) : null;
    },
    getMainPlugin: (packageId?: string) => {
      const conversation = useConversationStore();
      const targetPackage = packageId
        ? conversation.packages.find((item) => item.id === packageId)
        : conversation.activePackage;
      const plugin = plugins().find((item) => item.id === targetPackage?.mainPluginId);
      if (!plugin || !pluginGenerateFile(plugin)) {
        throw new Error("主要插件不存在或 generatePath 无效。");
      }
      return summary(plugin);
    },
    createGlobal: async (input: { name: string; icon?: string; description?: string }) => {
      const store = usePluginStore();
      const plugin = await store.createGlobalPlugin();
      await store.updatePlugin(plugin.id, {
        name: input.name.trim() || plugin.name,
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.description !== undefined ? { shortDescription: input.description } : {}),
      });
      return summary(plugin);
    },
    update: async (
      pluginId: string,
      patch: { id?: string; name?: string; icon?: string; description?: string; enabled?: boolean },
    ) => {
      const plugin = plugins().find((item) => item.id === pluginId);
      if (!plugin) throw new Error("插件不存在。");
      const updated = patch.id === undefined
        ? plugin
        : await usePluginStore().renamePluginId(pluginId, patch.id);
      if (!updated) throw new Error("插件不存在。");
      await usePluginStore().updatePlugin(updated.id, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.description !== undefined ? { shortDescription: patch.description } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      });
      return summary(updated);
    },
    remove: async (pluginId: string) => {
      await usePluginStore().deletePlugin(pluginId);
    },
    restore: async (pluginId: string) => {
      await usePluginStore().restoreBuiltInPlugin(pluginId);
      const plugin = plugins().find((item) => item.id === pluginId);
      if (!plugin) throw new Error("内置插件不存在。");
      return summary(plugin);
    },
    listContainers: (input: { scope?: "local" | "global" } = {}) =>
      visibleResolver().listContainers().filter(
        (item) => !input.scope || item.scope === input.scope,
      ),
    getContainer: (scope: "local" | "global", id: string) => {
      const { resolver, container } = findContainer(scope, id);
      return container ? resolver.getContainer(container.id) : null;
    },
    readContainer: (scope: "local" | "global", id: string) => {
      const { resolver, container } = findContainer(scope, id);
      if (!container) throw new Error(`容器不存在：${scope}/${id}`);
      return resolver.readContainer(container.id);
    },
    readContainerPaths: (scope: "local" | "global", id: string) => {
      const { resolver, container } = findContainer(scope, id);
      if (!container) throw new Error(`容器不存在：${scope}/${id}`);
      return resolver.readContainerPaths(container.id);
    },
    readContainers: (scope: "local" | "global", pattern: string) => {
      const matcher = globMatcher(pattern);
      return visibleResolver().listContainers().filter(
        (item) => item.scope === scope && matcher.test(item.name),
      );
    },
  };
}
