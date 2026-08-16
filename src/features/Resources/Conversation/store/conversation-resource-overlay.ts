import { toRaw } from "vue";
import type {
  ChatMessageContainer,
  ConversationResourceNodeSnapshot,
  ConversationResourceOperation,
  ConversationResourceUpdate,
} from "@/features/Resources/Conversation/messages/conversation-types";
import type { ContextDataValue } from "@/features/Resources/Plugin/editors/chat/plugin-chat";
import {
  findPluginTreeNode,
  findPluginTreeParent,
  type Plugin,
  type PluginFolder,
  type PluginTreeNode,
} from "@/features/Resources/Plugin/tree/plugin-types";

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
    const parent = requireFolder(plugin, operation.parentId);
    if (findPluginTreeNode(plugin.root, operation.node.id)) {
      throw new Error(`资源覆盖创建冲突：${operation.pluginId}/${operation.node.id}`);
    }
    parent.children.push(snapshotToNode(operation.node));
    return;
  }
  if (operation.type === "move") {
    const sourcePlugin = requirePlugin(overlay.plugins, operation.pluginId);
    const sourceParent = findPluginTreeParent(sourcePlugin.root, operation.resourceId);
    const node = findPluginTreeNode(sourcePlugin.root, operation.resourceId);
    if (!sourceParent || !node || node.id === sourcePlugin.root.id) {
      throw new Error(`资源覆盖移动源不存在：${operation.pluginId}/${operation.resourceId}`);
    }
    const targetPlugin = requirePlugin(overlay.plugins, operation.targetPluginId);
    const targetParent = requireFolder(targetPlugin, operation.parentId);
    if (
      node.kind === "folder"
      && findPluginTreeNode(node, targetParent.id)
    ) {
      throw new Error("资源覆盖不能把文件夹移动到自身或其后代中。");
    }
    sourceParent.children.splice(sourceParent.children.findIndex((item) => item.id === node.id), 1);
    node.name = operation.name;
    targetParent.children.push(node);
    return;
  }
  if (operation.type === "remove") {
    const plugin = requirePlugin(overlay.plugins, operation.target.pluginId);
    const parent = findPluginTreeParent(plugin.root, operation.target.resourceId);
    if (!parent) throw new Error(`资源覆盖删除目标不存在：${operation.target.resourceId}`);
    parent.children.splice(parent.children.findIndex((item) => item.id === operation.target.resourceId), 1);
    return;
  }
  if (operation.type === "edit" && operation.target.kind === "plugin-node") {
    const plugin = requirePlugin(overlay.plugins, operation.target.pluginId);
    const node = findPluginTreeNode(plugin.root, operation.target.resourceId);
    if (!node) throw new Error(`资源覆盖替换目标不存在：${operation.target.resourceId}`);
    const next = snapshotToNode(operation.value as ConversationResourceNodeSnapshot);
    if (node.kind !== next.kind) throw new Error("资源覆盖不能改变节点类型。");
    Object.assign(node, next);
  }
}

export function pluginNodeSnapshot(node: PluginTreeNode): ConversationResourceNodeSnapshot {
  return safeClone(node) as ConversationResourceNodeSnapshot;
}

function requirePlugin(plugins: Plugin[], pluginId: string) {
  const plugin = plugins.find((item) => item.id === pluginId);
  if (!plugin) throw new Error(`资源覆盖插件不存在：${pluginId}`);
  return plugin;
}

function requireFolder(plugin: Plugin, resourceId: string): PluginFolder {
  const node = findPluginTreeNode(plugin.root, resourceId);
  if (!node || node.kind !== "folder") {
    throw new Error(`资源覆盖父文件夹不存在：${plugin.id}/${resourceId}`);
  }
  return node;
}

function snapshotToNode(snapshot: ConversationResourceNodeSnapshot): PluginTreeNode {
  if (snapshot.kind === "folder") {
    return {
      id: snapshot.id,
      name: snapshot.name,
      icon: snapshot.icon,
      treeOrder: snapshot.treeOrder,
      kind: "folder",
      children: (snapshot.children ?? []).map(snapshotToNode),
    };
  }
  return {
    id: snapshot.id,
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

export function assertJsonValue(value: unknown, path = "value"): void {
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
