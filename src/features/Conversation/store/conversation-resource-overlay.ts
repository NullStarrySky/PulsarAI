import { toRaw } from "vue";
import type {
  ChatMessageContainer,
  ConversationResourceNodeSnapshot,
  ConversationResourceOperation,
  ConversationResourceUpdate,
} from "@/features/Conversation/messages/conversation-types";
import type { ContextDataValue } from "@/features/Plugin/editors/chat/plugin-chat";
import {
  findPluginTreeNode,
  type Plugin,
  type PluginTreeNode,
} from "@/features/Plugin/tree/plugin-types";

export function safeClone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  const raw = toRaw(value);
  try {
    return structuredClone(raw);
  } catch {
    return JSON.parse(JSON.stringify(raw));
  }
}

export interface ConversationResourceOverlay {
  plugins: Plugin[];
  dataValues: Record<string, ContextDataValue>;
}

export function createConversationResourceOverlay(
  plugins: Plugin[],
  activePath: ChatMessageContainer[],
): ConversationResourceOverlay {
  const overlay: ConversationResourceOverlay = {
    plugins: safeClone(plugins),
    dataValues: {},
  };
  for (const container of activePath) {
    const index = container.activeMessage;
    const message = index === null ? null : container.content[index] ?? null;
    for (const operation of message?.meta.resourceUpdate?.operations ?? []) {
      applyConversationResourceOperation(overlay, operation);
    }
  }
  return overlay;
}

export function appendConversationResourceOperations(
  previous: ConversationResourceUpdate | undefined,
  operations: ConversationResourceOperation[],
): ConversationResourceUpdate | undefined {
  if (!operations.length) return previous;
  return {
    operations: [...(previous?.operations ?? []), ...safeClone(operations)],
    createdAt: previous?.createdAt ?? new Date().toISOString(),
  };
}

function joinPath(parentPath: string, name: string) {
  return parentPath ? `${parentPath}/${name}` : name;
}

function renumberDescendantPaths(
  plugin: Plugin,
  oldPrefix: string,
  nextPath: string,
) {
  for (const other of plugin.nodes) {
    if (other.path.startsWith(oldPrefix)) {
      other.path = `${nextPath}${other.path.slice(oldPrefix.length - 1)}`;
    }
  }
}

export function applyConversationResourceOperation(
  overlay: ConversationResourceOverlay,
  operation: ConversationResourceOperation,
) {
  if (operation.type === "edit" && operation.target.kind === "data") {
    overlay.dataValues[operation.target.resourceId] = cloneJsonValue(operation.value);
    return;
  }
  if (operation.type === "create") {
    const plugin = requirePlugin(overlay.plugins, operation.pluginId);
    if (findPluginTreeNode(plugin, operation.node.id)) {
      throw new Error(`资源覆盖创建冲突：${operation.pluginId}/${operation.node.id}`);
    }
    const node = snapshotToNode(operation.node);
    if (plugin.nodes.some((candidate) => candidate.path === node.path)) {
      throw new Error(`资源覆盖路径冲突：${operation.pluginId}/${node.path}`);
    }
    plugin.nodes.push(node);
    return;
  }
  if (operation.type === "move") {
    const sourcePlugin = requirePlugin(overlay.plugins, operation.pluginId);
    const node = findPluginTreeNode(sourcePlugin, operation.resourceId);
    if (!node) {
      throw new Error(`资源覆盖移动源不存在：${operation.pluginId}/${operation.resourceId}`);
    }
    const targetPlugin = requirePlugin(overlay.plugins, operation.targetPluginId);
    const nextPath = joinPath(operation.targetParentPath, operation.name);
    if (
      node.kind === "folder"
      && (operation.targetParentPath === node.path
        || operation.targetParentPath.startsWith(`${node.path}/`))
    ) {
      throw new Error("资源覆盖不能把文件夹移动到自身或其后代中。");
    }
    if (
      targetPlugin.nodes.some(
        (candidate) => candidate.path === nextPath && candidate.id !== node.id,
      )
    ) {
      throw new Error(`资源覆盖路径冲突：${operation.targetPluginId}/${nextPath}`);
    }
    const oldPrefix = `${node.path}/`;
    node.name = operation.name;
    if (sourcePlugin === targetPlugin) {
      node.path = nextPath;
      if (node.kind === "folder") {
        renumberDescendantPaths(targetPlugin, oldPrefix, nextPath);
      }
      return;
    }
    const descendants = sourcePlugin.nodes.filter(
      (candidate) => candidate.path.startsWith(oldPrefix),
    );
    sourcePlugin.nodes = sourcePlugin.nodes.filter(
      (candidate) => candidate.id !== node.id && !candidate.path.startsWith(oldPrefix),
    );
    node.path = nextPath;
    for (const descendant of descendants) {
      descendant.path = `${nextPath}${descendant.path.slice(oldPrefix.length - 1)}`;
    }
    targetPlugin.nodes.push(node, ...descendants);
    return;
  }
  if (operation.type === "remove") {
    const plugin = requirePlugin(overlay.plugins, operation.target.pluginId);
    const node = findPluginTreeNode(plugin, operation.target.resourceId);
    if (!node) throw new Error(`资源覆盖删除目标不存在：${operation.target.resourceId}`);
    const prefix = `${node.path}/`;
    plugin.nodes = plugin.nodes.filter(
      (candidate) => candidate.id !== node.id && !candidate.path.startsWith(prefix),
    );
    return;
  }
  if (operation.type === "edit" && operation.target.kind === "plugin-node") {
    const plugin = requirePlugin(overlay.plugins, operation.target.pluginId);
    const node = findPluginTreeNode(plugin, operation.target.resourceId);
    if (!node) throw new Error(`资源覆盖替换目标不存在：${operation.target.resourceId}`);
    const next = snapshotToNode(operation.value as ConversationResourceNodeSnapshot);
    if (node.kind !== next.kind) throw new Error("资源覆盖不能改变节点类型。");
    const previousPath = node.path;
    Object.assign(node, next);
    if (node.kind === "folder" && previousPath !== node.path) {
      renumberDescendantPaths(plugin, `${previousPath}/`, node.path);
    }
  }
}



function requirePlugin(plugins: Plugin[], pluginId: string) {
  const plugin = plugins.find((item) => item.id === pluginId);
  if (!plugin) throw new Error(`资源覆盖插件不存在：${pluginId}`);
  return plugin;
}

function snapshotToNode(snapshot: ConversationResourceNodeSnapshot): PluginTreeNode {
  if (snapshot.kind === "folder") {
    return {
      id: snapshot.id,
      path: snapshot.path,
      name: snapshot.name,
      icon: snapshot.icon,
      treeOrder: snapshot.treeOrder,
      kind: "folder",
    };
  }
  return {
    id: snapshot.id,
    path: snapshot.path,
    name: snapshot.name,
    icon: snapshot.icon,
    treeOrder: snapshot.treeOrder,
    kind: "file",
    content: safeClone(snapshot.content),
    order: snapshot.order ?? 100,
    ...(snapshot.insertion ? { insertion: safeClone(snapshot.insertion) } : {}),
  };
}

function cloneJsonValue(value: unknown): ContextDataValue {
  const cloned = safeClone(value);
  assertJsonValue(cloned, "data");
  return cloned as ContextDataValue;
}

function assertJsonValue(value: unknown, path = "value"): void {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
  ) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${path} 必须是可持久化的纯 JSON 值。`);
  }
  for (const [key, item] of Object.entries(value)) {
    assertJsonValue(item, `${path}.${key}`);
  }
}
