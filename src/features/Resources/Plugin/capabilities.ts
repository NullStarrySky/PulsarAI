import {
  createCapabilityBuilder,
} from "@/features/Capabilities/domain/capability";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import {
  pluginConventions,
  findPluginNodeByPath,
  findPluginTreeParent,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  pluginFileType,
  type PluginTreeNode,
} from "./domain/plugin-types";
import {
  findPluginReferenceTokens,
  parsePluginContainerDefinitions,
} from "./domain/plugin-reference";
import { usePluginStore } from "./application/plugin-store";
import {
  pluginCapabilitiesDefinition,
} from "./domain/plugin-capability";

export const capabilities = pluginCapabilitiesDefinition;

function nodeSummary(
  node: PluginTreeNode,
  path: string[] = [],
): Record<string, unknown> {
  const nodePath = node.kind === "folder" && path.length === 0
    ? path
    : [...path, node.name];
  const source =
    node.kind === "file" && typeof node.content === "string"
      ? node.content
      : "";
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    icon: node.icon,
    ...(node.kind === "file"
      ? {
          type: pluginFileType(node.name),
          priority: node.priority,
          references: findPluginReferenceTokens(source).map(
            ({ target }) => target,
          ),
          containers:
            nodePath.join("/").toLocaleLowerCase()
              === pluginConventions.containers.toLocaleLowerCase()
              ? parsePluginContainerDefinitions(source).containers
              : [],
          memberships: node.memberships,
        }
      : { children: node.children.map((child) => nodeSummary(child, nodePath)) }),
  };
}

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    list: () => {
      const conversation = useConversationStore();
      return usePluginStore().visiblePluginsForPackage(
        conversation.activePackageId,
        conversation.activePackage?.globalPluginOrder,
      ).map(({ id, name, shortDescription, enabled, builtIn, packageId }) => ({
        id,
        name,
        shortDescription,
        enabled,
        builtIn,
        packageId,
      }));
    },
    getTree: (pluginId: string) => {
      const plugin = usePluginStore().plugins.find((item) => item.id === pluginId);
      return plugin ? nodeSummary(plugin.root) : null;
    },
  } : {}),
}));

function normalizePath(path: string) {
  return path.trim().replace(/\\/g, "/").split("/").filter(Boolean);
}

function scopedNodeSummary(plugin: Plugin, node: PluginTreeNode) {
  return {
    ...nodeSummary(node, pluginNodePath(plugin.root, node.id).slice(0, -1)),
    path: `/${pluginNodePath(plugin.root, node.id).join("/")}`,
    ...(node.kind === "file" ? { content: structuredClone(node.content) } : {}),
  };
}

export function createPluginSelfApi(
  pluginId: string,
  grantedSubCaps: string[] = [],
) {
  const store = usePluginStore();
  const requirePlugin = () => {
    const plugin = store.plugins.find((item) => item.id === pluginId);
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
    if (!grantedSubCaps.includes("read") && !grantedSubCaps.includes("all")) {
      throw new Error("当前角色包没有授权 Plugin Feature。");
    }
  };
  const requireRead = () => {
    if (
      !grantedSubCaps.includes("read")
      && !grantedSubCaps.includes("all")
    ) {
      throw new Error("当前角色包没有授权插件读取权限。");
    }
  };

  return {
    getSelf() {
      requireRead();
      const plugin = requirePlugin();
      return {
        id: plugin.id,
        name: plugin.name,
        shortDescription: plugin.shortDescription,
        packageId: plugin.packageId,
        enabled: plugin.enabled,
        main: plugin.main,
      };
    },
    read(path: string) {
      requireRead();
      const { plugin, node } = requireNode(path);
      return scopedNodeSummary(plugin, node);
    },
    async write(path: string, content: unknown) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只能写入文件。");
      await store.updateNode(plugin.id, node.id, { content });
      return scopedNodeSummary(plugin, node);
    },
    async create(
      path: string,
      input: {
        kind?: "file" | "folder";
        content?: unknown;
        priority?: number;
      } = {},
    ) {
      requireWrite();
      const plugin = requirePlugin();
      const parts = normalizePath(path);
      const name = parts.pop();
      if (!name) throw new Error("创建路径不能为空。");
      const parent = findPluginNodeByPath(plugin.root, parts);
      if (parent?.kind !== "folder") throw new Error("目标父路径不是文件夹。");
      const created = input.kind === "folder"
        ? await store.createFolder(plugin.id, parent.id, name)
        : await store.createFile(plugin.id, parent.id, {
            name,
            content: input.content ?? "",
            priority: input.priority,
          });
      if (!created) throw new Error(`无法创建插件路径：${path}`);
      return scopedNodeSummary(plugin, created);
    },
    async move(from: string, toFolder: string, beforeName?: string) {
      requireWrite();
      const plugin = requirePlugin();
      const source = findPluginNodeByPath(plugin.root, normalizePath(from));
      const target = findPluginNodeByPath(plugin.root, normalizePath(toFolder));
      if (!source || target?.kind !== "folder") throw new Error("移动路径不存在。");
      const before = beforeName
        ? sortPluginTreeNodes(target.children).find((item) => item.name === beforeName)
        : undefined;
      await store.moveNode(plugin.id, source.id, target.id, before?.id);
      return scopedNodeSummary(plugin, source);
    },
    async remove(path: string) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      if (node.id === plugin.root.id) throw new Error("不能删除插件根目录。");
      const parent = findPluginTreeParent(plugin.root, node.id);
      await store.deleteNode(plugin.id, node.id);
      if (parent?.children.some((item) => item.id === node.id)) {
        throw new Error("该节点是固定插件约定，不能删除。");
      }
    },
  };
}
