import type { PluginLogger } from "@/features/Plugin/runtime";
import { toRaw } from "vue";
import {
  findPluginNodeByPath,
  findPluginTreeNode,
  pluginChildNodes,
  pluginDirectoryExists,
  pluginFolder,
  pluginParentPath,
  type Plugin,
  type PluginFile,
  type PluginTreeNode,
} from "@/features/Plugin/tree/plugin-types";
import type {
  ChatMessageContainer,
  ConversationResourceNodeSnapshot,
  ConversationResourceOperation,
  ConversationResourceOperationStats,
  ConversationResourceUpdate,
} from "./conversation-types";

type OverlaySnapshot = {
  plugins: Plugin[];
  operations: ConversationResourceOperation[];
  stats: ConversationResourceOperationStats;
};

export interface ConversationResourceOverlayOptions {
  plugins: Plugin[];
  activePath: ChatMessageContainer[];
  onUpdate?: (update: ConversationResourceUpdate) => void | Promise<void>;
}

function clone<T>(value: T): T {
  return cloneValue(value, new WeakMap()) as T;
}

function cloneValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== "object") return value;
  const raw = toRaw(value as object);
  const existing = seen.get(raw);
  if (existing !== undefined) return existing;
  if (raw instanceof ArrayBuffer) return raw.slice(0);
  if (ArrayBuffer.isView(raw)) return structuredClone(raw);
  if (raw instanceof Date) return new Date(raw);
  if (raw instanceof RegExp) return new RegExp(raw.source, raw.flags);
  if (raw instanceof Blob) return raw.slice(0, raw.size, raw.type);
  if (Array.isArray(raw)) {
    const result: unknown[] = [];
    seen.set(raw, result);
    for (const item of raw) result.push(cloneValue(item, seen));
    return result;
  }
  if (raw instanceof Map) {
    const result = new Map<unknown, unknown>();
    seen.set(raw, result);
    for (const [key, item] of raw)
      result.set(cloneValue(key, seen), cloneValue(item, seen));
    return result;
  }
  if (raw instanceof Set) {
    const result = new Set<unknown>();
    seen.set(raw, result);
    for (const item of raw) result.add(cloneValue(item, seen));
    return result;
  }
  const result: Record<string, unknown> = {};
  seen.set(raw, result);
  for (const [key, item] of Object.entries(raw))
    result[key] = cloneValue(item, seen);
  return result;
}

function emptyStats(): ConversationResourceOperationStats {
  return {
    total: 0,
    edit: 0,
    create: 0,
    move: 0,
    remove: 0,
    codeAct: { attempted: 0, committed: 0, rolledBack: 0 },
    logCount: 0,
  };
}

function statsFor(
  operations: ConversationResourceOperation[],
  codeAct: ConversationResourceOperationStats["codeAct"],
  logCount: number,
): ConversationResourceOperationStats {
  const stats = emptyStats();
  stats.total = operations.length;
  stats.codeAct = clone(codeAct);
  stats.logCount = logCount;
  for (const operation of operations) stats[operation.type] += 1;
  return stats;
}

function snapshotNode(node: PluginTreeNode): ConversationResourceNodeSnapshot {
  return {
    id: node.id,
    path: node.path,
    name: node.name,
    icon: node.icon,
    treeOrder: node.treeOrder,
    kind: node.kind,
    ...(node.kind === "file"
      ? {
          content: clone(node.content),
          order: node.order,
          ...(node.insertion ? { insertion: clone(node.insertion) } : {}),
        }
      : {}),
  };
}

function fileFromSnapshot(
  snapshot: ConversationResourceNodeSnapshot,
): PluginFile {
  if (snapshot.kind !== "file") throw new Error("资源快照不是文件。");
  return {
    id: snapshot.id,
    path: snapshot.path,
    name: snapshot.name,
    icon: snapshot.icon,
    treeOrder: snapshot.treeOrder,
    kind: "file",
    content: clone(snapshot.content),
    order: snapshot.order ?? 100,
    ...(snapshot.insertion ? { insertion: clone(snapshot.insertion) } : {}),
  };
}

function normalizePath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function ensureFolders(plugin: Plugin, parentPath: string) {
  let current = "";
  for (const part of normalizePath(parentPath).split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    const existing = findPluginNodeByPath(plugin, current);
    if (existing?.kind === "file")
      throw new Error(`父路径不是文件夹：${current}`);
    if (existing) continue;
  }
}

function clearEmptyAncestors(plugin: Plugin, path: string) {
  plugin.emptyFolders = plugin.emptyFolders.filter(
    (folder) => path !== folder && !path.startsWith(`${folder}/`),
  );
}

function keepParentIfEmpty(plugin: Plugin, formerPath: string) {
  const parent = pluginParentPath(formerPath);
  if (!parent) return;
  const prefix = `${parent}/`;
  if (
    !plugin.files.some((file) => file.path.startsWith(prefix)) &&
    !plugin.emptyFolders.some(
      (folder) => folder === parent || folder.startsWith(prefix),
    )
  )
    plugin.emptyFolders.push(parent);
}

function findPlugin(plugins: Plugin[], pluginId: string) {
  const plugin = plugins.find((item) => item.id === pluginId);
  if (!plugin) throw new Error(`Overlay 中不存在插件：${pluginId}`);
  return plugin;
}

function findNode(plugin: Plugin, resourceId: string) {
  const node = findPluginTreeNode(plugin, resourceId);
  if (!node) throw new Error(`Overlay 中不存在资源：${resourceId}`);
  return node;
}

function moveNode(
  plugin: Plugin,
  node: PluginTreeNode,
  targetParentPath: string,
) {
  const parent = normalizePath(targetParentPath);
  if (parent) {
    if (!pluginDirectoryExists(plugin, parent))
      throw new Error(`移动目标不是文件夹：${targetParentPath}`);
  }
  if (
    node.kind === "folder" &&
    (parent === node.path || parent.startsWith(`${node.path}/`))
  ) {
    throw new Error("不能把文件夹移动到自身或其子目录。");
  }
  const nextPath = parent ? `${parent}/${node.name}` : node.name;
  const collision = findPluginNodeByPath(plugin, nextPath);
  if (collision && collision.id !== node.id) {
    throw new Error(`移动后路径已存在：${nextPath}`);
  }
  const formerPath = node.path;
  if (parent) clearEmptyAncestors(plugin, `${parent}/occupied`);
  if (node.kind === "folder") {
    const prefix = `${formerPath}/`;
    for (const descendant of plugin.files) {
      if (descendant.path.startsWith(prefix)) {
        descendant.path = `${nextPath}${descendant.path.slice(formerPath.length)}`;
      }
    }
    plugin.emptyFolders = plugin.emptyFolders.map((folder) =>
      folder === formerPath || folder.startsWith(prefix)
        ? `${nextPath}${folder.slice(formerPath.length)}`
        : folder,
    );
  } else {
    node.path = nextPath;
  }
  keepParentIfEmpty(plugin, formerPath);
}

/**
 * A mutable generation view. It never touches the persisted Plugin store:
 * messages are the only durable source of Overlay operations.
 */
export class ConversationResourceOverlay {
  plugins: Plugin[];
  private readonly createdAt = new Date().toISOString();
  private readonly onUpdate?: ConversationResourceOverlayOptions["onUpdate"];
  private operations: ConversationResourceOperation[] = [];
  private codeAct = emptyStats().codeAct;
  private transaction: OverlaySnapshot | null = null;
  private logger: PluginLogger | null = null;

  constructor(options: ConversationResourceOverlayOptions) {
    this.plugins = clone(options.plugins);
    this.onUpdate = options.onUpdate;
    for (const container of options.activePath) {
      const message =
        container.activeMessage === null
          ? null
          : container.content[container.activeMessage];
      for (const operation of message?.meta.resourceUpdate?.operations ?? []) {
        this.apply(operation);
      }
    }
  }

  setLogger(logger: PluginLogger) {
    this.logger = logger;
  }

  begin() {
    if (this.transaction)
      throw new Error("不能嵌套执行 CodeAct Overlay 事务。");
    this.transaction = {
      plugins: clone(this.plugins),
      operations: clone(this.operations),
      stats: this.stats(),
    };
    this.codeAct.attempted += 1;
    this.logger?.append("开始 CodeAct Overlay 事务。", 0, "info");
  }

  commit() {
    if (!this.transaction) return;
    this.transaction = null;
    this.codeAct.committed += 1;
    this.logger?.append("提交 CodeAct Overlay 事务。", 0, "info");
    this.publish();
  }

  rollback() {
    if (!this.transaction) return;
    const snapshot = this.transaction;
    this.plugins = clone(snapshot.plugins);
    this.operations = clone(snapshot.operations);
    this.transaction = null;
    this.codeAct = {
      ...snapshot.stats.codeAct,
      attempted: snapshot.stats.codeAct.attempted + 1,
      rolledBack: snapshot.stats.codeAct.rolledBack + 1,
    };
    this.logger?.append("回滚 CodeAct Overlay 事务。", 0, "error");
    this.publish();
  }

  writeFile(pluginId: string, path: string, content: string | ArrayBuffer) {
    const plugin = findPlugin(this.plugins, pluginId);
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) throw new Error("不能写入插件根目录。");
    const current = findPluginNodeByPath(plugin, normalizedPath);
    if (current?.kind === "folder")
      throw new Error(`不能向文件夹写入：${path}`);
    if (current?.kind === "file") {
      current.content =
        content instanceof ArrayBuffer ? content.slice(0) : content;
      this.record({
        type: "edit",
        target: { kind: "plugin-node", pluginId, resourceId: current.id },
        value: snapshotNode(current),
      });
      return;
    }
    const parentPath = pluginParentPath(normalizedPath);
    ensureFolders(plugin, parentPath);
    const file: PluginFile = {
      id: crypto.randomUUID(),
      path: normalizedPath,
      name: normalizedPath.split("/").pop()!,
      icon: "",
      treeOrder: pluginChildNodes(plugin, parentPath).length,
      kind: "file",
      content: content instanceof ArrayBuffer ? content.slice(0) : content,
      order: 100,
    };
    plugin.files.push(file);
    clearEmptyAncestors(plugin, normalizedPath);
    this.record({
      type: "create",
      pluginId,
      parentPath,
      node: snapshotNode(file),
    });
  }

  editFile(pluginId: string, path: string, find: string, replace: string) {
    const plugin = findPlugin(this.plugins, pluginId);
    const node = findPluginNodeByPath(plugin, normalizePath(path));
    if (node?.kind !== "file" || typeof node.content !== "string")
      throw new Error(`edit 只支持文本资源：${path}`);
    if (!node.content.includes(find))
      throw new Error(`未找到待替换文本：${find}`);
    node.content = node.content.replace(find, replace);
    this.record({
      type: "edit",
      target: { kind: "plugin-node", pluginId, resourceId: node.id },
      value: snapshotNode(node),
    });
  }

  /** Applies an editor save to this conversation-local view and records it for replay. */
  updateFile(
    pluginId: string,
    resourceId: string,
    patch: Pick<PluginFile, "content" | "order" | "insertion">,
  ) {
    const plugin = findPlugin(this.plugins, pluginId);
    const node = findNode(plugin, resourceId);
    if (node.kind !== "file") throw new Error("只能编辑插件文件。");
    if ("content" in patch) {
      node.content =
        patch.content instanceof ArrayBuffer
          ? patch.content.slice(0)
          : clone(patch.content);
    }
    if ("order" in patch && patch.order !== undefined) node.order = patch.order;
    if ("insertion" in patch) {
      node.insertion = patch.insertion ? clone(patch.insertion) : undefined;
    }
    this.record({
      type: "edit",
      target: { kind: "plugin-node", pluginId, resourceId: node.id },
      value: snapshotNode(node),
    });
    return node;
  }

  mkdir(pluginId: string, path: string) {
    const plugin = findPlugin(this.plugins, pluginId);
    const normalizedPath = normalizePath(path);
    if (!normalizedPath || findPluginNodeByPath(plugin, normalizedPath)) return;
    const parentPath = pluginParentPath(normalizedPath);
    ensureFolders(plugin, parentPath);
    clearEmptyAncestors(plugin, normalizedPath);
    plugin.emptyFolders.push(normalizedPath);
    const folder = pluginFolder(normalizedPath);
    this.record({
      type: "create",
      pluginId,
      parentPath,
      node: snapshotNode(folder),
    });
  }

  move(pluginId: string, from: string, targetPath: string) {
    const plugin = findPlugin(this.plugins, pluginId);
    const node = findPluginNodeByPath(plugin, normalizePath(from));
    if (!node) throw new Error(`资源不存在：${from}`);
    const targetParentPath = pluginParentPath(normalizePath(targetPath));
    moveNode(plugin, node, targetParentPath);
    this.record({
      type: "move",
      pluginId,
      resourceId: node.id,
      targetPluginId: pluginId,
      targetParentPath,
      name: node.name,
    });
  }

  remove(pluginId: string, path: string) {
    const plugin = findPlugin(this.plugins, pluginId);
    const node = findPluginNodeByPath(plugin, normalizePath(path));
    if (!node) return;
    plugin.files = plugin.files.filter(
      (item) => item.id !== node.id && !item.path.startsWith(`${node.path}/`),
    );
    plugin.emptyFolders = plugin.emptyFolders.filter(
      (folder) => folder !== node.path && !folder.startsWith(`${node.path}/`),
    );
    keepParentIfEmpty(plugin, node.path);
    this.record({
      type: "remove",
      target: { kind: "plugin-node", pluginId, resourceId: node.id },
    });
  }

  stats() {
    return statsFor(
      this.operations,
      this.codeAct,
      this.logger?.logs.length ?? 0,
    );
  }

  resourceUpdate(): ConversationResourceUpdate {
    return {
      operations: clone(this.operations),
      createdAt: this.createdAt,
      stats: this.stats(),
    };
  }

  finalize() {
    if (this.codeAct.attempted > 0 || this.operations.length > 0)
      this.publish();
  }

  private record(operation: ConversationResourceOperation) {
    this.operations.push(clone(operation));
    this.logger?.append(`Overlay ${operation.type} 操作已暂存。`, 0, "api");
  }

  private publish() {
    if (!this.onUpdate) return;
    void Promise.resolve(this.onUpdate(this.resourceUpdate())).catch(
      (error) => {
        this.logger?.append(
          `Overlay 持久化失败：${error instanceof Error ? error.message : String(error)}`,
          0,
          "error",
        );
      },
    );
  }

  private apply(operation: ConversationResourceOperation) {
    if (operation.type === "edit") {
      if (operation.target.kind !== "plugin-node") return;
      const plugin = this.plugins.find(
        (item) => item.id === operation.target.pluginId,
      );
      const node = plugin
        ? findPluginTreeNode(plugin, operation.target.resourceId)
        : null;
      if (!node) return;
      Object.assign(
        node,
        fileFromSnapshot(operation.value as ConversationResourceNodeSnapshot),
      );
      return;
    }
    if (operation.type === "create") {
      const plugin = this.plugins.find(
        (item) => item.id === operation.pluginId,
      );
      if (!plugin) return;
      ensureFolders(plugin, operation.parentPath);
      if (operation.node.kind === "folder") {
        if (!pluginDirectoryExists(plugin, operation.node.path))
          plugin.emptyFolders.push(operation.node.path);
      } else if (
        !plugin.files.some(
          (file) =>
            file.id === operation.node.id || file.path === operation.node.path,
        )
      ) {
        plugin.files.push(fileFromSnapshot(operation.node));
        clearEmptyAncestors(plugin, operation.node.path);
      }
      return;
    }
    if (operation.type === "move") {
      if (operation.pluginId !== operation.targetPluginId) return;
      const plugin = this.plugins.find(
        (item) => item.id === operation.pluginId,
      );
      if (!plugin) return;
      const node = findPluginTreeNode(plugin, operation.resourceId);
      if (!node) return;
      moveNode(
        plugin,
        node,
        operation.targetParentPath,
      );
      return;
    }
    if (
      operation.type === "remove" &&
      operation.target.kind === "plugin-node"
    ) {
      const plugin = this.plugins.find(
        (item) => item.id === operation.target.pluginId,
      );
      const node = plugin
        ? findPluginTreeNode(plugin, operation.target.resourceId)
        : null;
      if (!node || !plugin) return;
      plugin.files = plugin.files.filter(
        (item) => item.id !== node.id && !item.path.startsWith(`${node.path}/`),
      );
      plugin.emptyFolders = plugin.emptyFolders.filter(
        (folder) => folder !== node.path && !folder.startsWith(`${node.path}/`),
      );
      keepParentIfEmpty(plugin, node.path);
    }
  }
}
