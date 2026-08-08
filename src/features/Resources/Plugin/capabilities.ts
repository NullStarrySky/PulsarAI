import { createCapabilityBuilder } from "@/features/Capabilities/domain/capability";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { executeSandboxCodeAsync } from "@/features/Sandbox/domain/sandbox";
import { createPluginReferenceResolver } from "./application/plugin-reference-resolver";
import { usePluginStore } from "./application/plugin-store";
import { pluginCapabilitiesDefinition } from "./domain/plugin-capability";
import { pluginGenerateFile } from "./domain/plugin-runtime";
import {
  findPluginNodeByPath,
  pluginFileType,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFile,
  type PluginTreeNode,
} from "./domain/plugin-types";

export const capabilities = pluginCapabilitiesDefinition;

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
    active: plugin.id === active?.pluginId
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

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
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
    main: (packageId?: string) => {
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
    async createGlobal(input: { name: string; icon?: string; description?: string }) {
      const store = usePluginStore();
      const plugin = await store.createGlobalPlugin();
      await store.updatePlugin(plugin.id, {
        name: input.name.trim() || plugin.name,
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.description !== undefined
          ? { shortDescription: input.description }
          : {}),
      });
      return summary(plugin);
    },
    async update(
      pluginId: string,
      patch: { id?: string; name?: string; icon?: string; description?: string; enabled?: boolean },
    ) {
      const plugin = plugins().find((item) => item.id === pluginId);
      if (!plugin) throw new Error("插件不存在。");
      const updated = patch.id === undefined
        ? plugin
        : await usePluginStore().renamePluginId(pluginId, patch.id);
      if (!updated) throw new Error("插件不存在。");
      await usePluginStore().updatePlugin(updated.id, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.description !== undefined
          ? { shortDescription: patch.description }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      });
      return summary(updated);
    },
    async remove(pluginId: string) {
      await usePluginStore().deletePlugin(pluginId);
    },
    async restore(pluginId: string) {
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
    readContainers: (scope: "local" | "global", pattern: string) => {
      const matcher = globMatcher(pattern);
      return visibleResolver().listContainers().filter(
        (item) => item.scope === scope && matcher.test(item.name),
      );
    },
  } : {}),
}));

export function createPluginSelfApi(pluginId: string, grantedSubCaps: string[] = []) {
  const store = usePluginStore();
  const writable = grantedSubCaps.includes("read") || grantedSubCaps.includes("all");
  const requirePlugin = () => {
    const plugin = plugins().find((item) => item.id === pluginId);
    if (!plugin) throw new Error("当前插件不存在。");
    return plugin;
  };
  const requireNode = (path: string) => {
    const plugin = requirePlugin();
    const node = findPluginNodeByPath(plugin.root, normalizePath(path));
    if (!node) throw new Error(`插件路径不存在：${path}`);
    return { plugin, node };
  };
  const requireWrite = () => {
    if (!writable) throw new Error("当前插件没有文件写入权限。");
  };

  const files = {
    read(path: string) {
      const { node } = requireNode(path);
      return node.kind === "file" ? structuredClone(node.content) : nodeMeta(requirePlugin(), node);
    },
    readMeta(path: string) {
      const { plugin, node } = requireNode(path);
      return nodeMeta(plugin, node);
    },
    exists(path: string) {
      return Boolean(findPluginNodeByPath(requirePlugin().root, normalizePath(path)));
    },
    list(path = "") {
      const { plugin, node } = requireNode(path);
      if (node.kind !== "folder") throw new Error("目标路径不是文件夹。");
      return sortPluginTreeNodes(node.children).map((child) => nodeMeta(plugin, child));
    },
    async write(
      path: string,
      content: unknown,
      meta: Partial<Pick<PluginFile, "icon" | "treeOrder" | "order">> & {
        insertion?: PluginFile["insertion"] | null;
      } = {},
    ) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只能写入文件。");
      const { insertion, ...restMeta } = meta;
      await store.updateNode(plugin.id, node.id, {
        content,
        ...restMeta,
        ...(insertion !== undefined ? { insertion: insertion ?? undefined } : {}),
      });
      return nodeMeta(plugin, node);
    },
    async edit(path: string, find: string, replace: string) {
      const { node } = requireNode(path);
      if (node.kind !== "file" || typeof node.content !== "string") {
        throw new Error("精准编辑只支持文本文件。");
      }
      const first = node.content.indexOf(find);
      if (first < 0 || node.content.indexOf(find, first + find.length) >= 0) {
        throw new Error("find 必须在文件中唯一匹配一次。");
      }
      return files.write(path, node.content.slice(0, first) + replace + node.content.slice(first + find.length));
    },
    async mkdir(path: string) {
      requireWrite();
      const parts = normalizePath(path);
      const name = parts.pop();
      if (!name) throw new Error("文件夹路径不能为空。");
      const parent = requireNode(parts.join("/"));
      if (parent.node.kind !== "folder") throw new Error("父路径不是文件夹。");
      const node = await store.createFolder(parent.plugin.id, parent.node.id, name);
      if (!node) throw new Error("创建文件夹失败。");
      return nodeMeta(parent.plugin, node);
    },
    async move(from: string, to: string) {
      requireWrite();
      const source = requireNode(from);
      const targetParts = normalizePath(to);
      const newName = targetParts.pop();
      const target = requireNode(targetParts.join("/"));
      if (target.node.kind !== "folder") throw new Error("目标父路径不是文件夹。");
      await store.moveNode(source.plugin.id, source.node.id, target.node.id);
      if (newName && newName !== source.node.name) {
        await store.updateNode(source.plugin.id, source.node.id, { name: newName });
      }
      return nodeMeta(source.plugin, source.node);
    },
    async remove(path: string) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      await store.deleteNode(plugin.id, node.id);
    },
    async run(path: string, environment: Record<string, unknown> = {}) {
      const { node } = requireNode(path);
      if (node.kind !== "file" || pluginFileType(node.name) !== "javascript") {
        throw new Error("run 只接受 JavaScript 文件。");
      }
      const resolver = createPluginReferenceResolver(visiblePlugins());
      const prepared = resolver.prepareJavaScript(node.id);
      return executeSandboxCodeAsync(prepared.source, [environment, prepared.environment]);
    },
  };

  return {
    self: () => summary(requirePlugin()),
    list: () => plugins().map(summary),
    get: (id: string) => {
      const plugin = plugins().find((item) => item.id === id);
      return plugin ? summary(plugin) : null;
    },
    files,
    read: files.read,
    write: files.write,
  };
}

function nodeMeta(plugin: Plugin, node: PluginTreeNode) {
  return {
    id: node.id,
    name: node.name,
    path: `/${pluginNodePath(plugin.root, node.id).join("/")}`,
    kind: node.kind,
    icon: node.icon,
    treeOrder: node.treeOrder,
    ...(node.kind === "file"
      ? {
          type: pluginFileType(node.name),
          order: node.order,
          insertion: node.insertion ? structuredClone(node.insertion) : undefined,
        }
      : {}),
  };
}

function normalizePath(path: string) {
  const parts = path.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) throw new Error("路径不能跨出插件根目录。");
  return parts;
}

function globMatcher(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
