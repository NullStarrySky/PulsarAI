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
  ConversationResourceNodeSnapshot,
  ConversationResourceOperation,
  ConversationResourceOperationStats,
} from "@/features/Conversation/messages/conversation-types";
import type { WorldConfig } from "@/features/Package/package-types";
import { createWorldConfig } from "./world-config";

export interface ConversationResourceOverlayOptions {
  plugins: Plugin[];
  config: WorldConfig;
  /** A cached conversation view already owns this tree. */
  copy?: boolean;
  onChange?: (
    change: ConversationResourceOperation,
    stats: ConversationResourceOperationStats,
  ) => void | Promise<void>;
}

function clone<T>(value: T): T {
  return cloneValue(value, new WeakMap()) as T;
}

function replaceConfig(target: WorldConfig, value: WorldConfig) {
  const next = createWorldConfig(value);
  target.slots = next.slots;
  target.disabled = next.disabled;
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
    configure: 0,
    codeAct: { attempted: 0, committed: 0, rolledBack: 0 },
    logCount: 0,
  };
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

function fileFromSnapshot(snapshot: ConversationResourceNodeSnapshot): PluginFile {
  if (snapshot.kind !== "file") throw new Error("资源快照不是文件。");
  return {
    id: snapshot.id, path: snapshot.path, name: snapshot.name, icon: snapshot.icon,
    treeOrder: snapshot.treeOrder, kind: "file", content: clone(snapshot.content),
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
  sourcePlugin: Plugin,
  node: PluginTreeNode,
  targetPlugin: Plugin,
  targetParentPath: string,
  targetName = node.name,
) {
  const parent = normalizePath(targetParentPath);
  if (parent) {
    if (!pluginDirectoryExists(targetPlugin, parent))
      throw new Error(`移动目标不是文件夹：${targetParentPath}`);
  }
  if (
    sourcePlugin === targetPlugin &&
    node.kind === "folder" &&
    (parent === node.path || parent.startsWith(`${node.path}/`))
  ) {
    throw new Error("不能把文件夹移动到自身或其子目录。");
  }
  const nextPath = parent ? `${parent}/${targetName}` : targetName;
  const collision = findPluginNodeByPath(targetPlugin, nextPath);
  if (collision && collision.id !== node.id) {
    throw new Error(`移动后路径已存在：${nextPath}`);
  }
  const formerPath = node.path;
  if (parent) clearEmptyAncestors(targetPlugin, `${parent}/occupied`);
  if (node.kind === "folder") {
    const prefix = `${formerPath}/`;
    const movingFiles = sourcePlugin.files.filter((file) =>
      file.path.startsWith(prefix),
    );
    const movingFolders = sourcePlugin.emptyFolders.filter((folder) =>
      folder === formerPath || folder.startsWith(prefix),
    );
    for (const descendant of movingFiles) {
      if (descendant.path.startsWith(prefix)) {
        descendant.path = `${nextPath}${descendant.path.slice(formerPath.length)}`;
      }
    }
    if (sourcePlugin === targetPlugin) {
      sourcePlugin.emptyFolders = sourcePlugin.emptyFolders.map((folder) =>
        folder === formerPath || folder.startsWith(prefix)
          ? `${nextPath}${folder.slice(formerPath.length)}`
          : folder,
      );
    } else {
      const movingIds = new Set(movingFiles.map((file) => file.id));
      sourcePlugin.files = sourcePlugin.files.filter((file) => !movingIds.has(file.id));
      sourcePlugin.emptyFolders = sourcePlugin.emptyFolders.filter(
        (folder) => folder !== formerPath && !folder.startsWith(prefix),
      );
      targetPlugin.files.push(...movingFiles);
      targetPlugin.emptyFolders.push(...movingFolders.map((folder) =>
        `${nextPath}${folder.slice(formerPath.length)}`,
      ).filter((folder) => !targetPlugin.emptyFolders.includes(folder)));
    }
  } else {
    node.path = nextPath;
    node.name = targetName;
    if (sourcePlugin !== targetPlugin) {
      sourcePlugin.files = sourcePlugin.files.filter((file) => file.id !== node.id);
      targetPlugin.files.push(node);
    }
  }
  keepParentIfEmpty(sourcePlugin, formerPath);
}

/**
 * A mutable generation view. It never touches the persisted Plugin store:
 * messages are the only durable source of Overlay operations.
 */
export class ConversationResourceOverlay {
  plugins: Plugin[];
  config: WorldConfig;
  private readonly onChange?: ConversationResourceOverlayOptions["onChange"];
  private readonly operationStats = emptyStats();
  private logger: PluginLogger | null = null;

  constructor(options: ConversationResourceOverlayOptions) {
    this.plugins = options.copy === false ? options.plugins : clone(options.plugins);
    this.config = options.copy === false ? options.config : createWorldConfig(options.config);
    this.onChange = options.onChange;
  }

  setLogger(logger: PluginLogger) {
    this.logger = logger;
  }

  recordCodeAct() {
    this.operationStats.codeAct.attempted += 1;
    this.publish();
  }

  /** Applies a persisted structural change to the cached final tree. */
  applyChange(operation: ConversationResourceOperation) {
    if (operation.type === "configure") {
      replaceConfig(this.config, operation.value);
      return;
    }
    if (operation.type === "edit") {
      if (operation.target.kind !== "plugin-node") return;
      const plugin = this.plugins.find((item) => item.id === operation.target.pluginId);
      const node = plugin ? findPluginTreeNode(plugin, operation.target.resourceId) : null;
      if (node) Object.assign(node, fileFromSnapshot(operation.value as ConversationResourceNodeSnapshot));
      return;
    }
    if (operation.type === "create") {
      const plugin = this.plugins.find((item) => item.id === operation.pluginId);
      if (!plugin) return;
      ensureFolders(plugin, operation.parentPath);
      if (operation.node.kind === "folder") {
        if (!pluginDirectoryExists(plugin, operation.node.path)) plugin.emptyFolders.push(operation.node.path);
      } else if (!plugin.files.some((file) => file.id === operation.node.id)) {
        plugin.files.push(fileFromSnapshot(operation.node));
        clearEmptyAncestors(plugin, operation.node.path);
      }
      return;
    }
    if (operation.type === "move") {
      const plugin = this.plugins.find((item) => item.id === operation.pluginId);
      const node = plugin ? findPluginTreeNode(plugin, operation.resourceId) : null;
      const targetPlugin = this.plugins.find((item) => item.id === operation.targetPluginId);
      if (plugin && node && targetPlugin)
        moveNode(plugin, node, targetPlugin, operation.targetParentPath, operation.name);
      return;
    }
    if (operation.type === "remove" && operation.target.kind === "plugin-node") {
      const plugin = this.plugins.find((item) => item.id === operation.target.pluginId);
      const node = plugin ? findPluginTreeNode(plugin, operation.target.resourceId) : null;
      if (!plugin || !node) return;
      plugin.files = plugin.files.filter((item) => item.id !== node.id && !item.path.startsWith(`${node.path}/`));
      plugin.emptyFolders = plugin.emptyFolders.filter((folder) => folder !== node.path && !folder.startsWith(`${node.path}/`));
      keepParentIfEmpty(plugin, node.path);
    }
  }

  writeFile(pluginId: string, path: string, content: unknown) {
    const plugin = findPlugin(this.plugins, pluginId);
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) throw new Error("不能写入插件根目录。");
    const current = findPluginNodeByPath(plugin, normalizedPath);
    if (current?.kind === "folder")
      throw new Error(`不能向文件夹写入：${path}`);
    if (current?.kind === "file") {
      current.content = content instanceof ArrayBuffer ? content.slice(0) : clone(content);
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
      content: content instanceof ArrayBuffer ? content.slice(0) : clone(content),
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
    patch: Partial<Pick<PluginFile, "content" | "order" | "insertion">>,
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

  move(pluginId: string, from: string, targetPluginId: string, targetPath: string) {
    const plugin = findPlugin(this.plugins, pluginId);
    const targetPlugin = findPlugin(this.plugins, targetPluginId);
    const node = findPluginNodeByPath(plugin, normalizePath(from));
    if (!node) throw new Error(`资源不存在：${from}`);
    const normalizedTarget = normalizePath(targetPath);
    const targetParentPath = pluginParentPath(normalizedTarget);
    const targetName = normalizedTarget.split("/").pop() || node.name;
    moveNode(plugin, node, targetPlugin, targetParentPath, targetName);
    this.record({
      type: "move",
      pluginId,
      resourceId: node.id,
      targetPluginId,
      targetParentPath,
      name: targetName,
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

  configure(config: WorldConfig) {
    replaceConfig(this.config, config);
    this.record({ type: "configure", value: this.config });
  }

  stats() {
    return {
      ...clone(this.operationStats),
      logCount: this.logger?.logs.length ?? 0,
    };
  }

  private record(operation: ConversationResourceOperation) {
    this.operationStats.total += 1;
    this.operationStats[operation.type] += 1;
    this.logger?.append(`Overlay ${operation.type} 操作已暂存。`, 0, "api");
    this.publish(operation);
  }

  private publish(change?: ConversationResourceOperation) {
    if (!this.onChange || !change) return;
    try {
      void Promise.resolve(this.onChange(clone(change), this.stats())).catch((error) => {
        this.logger?.append(
          `Overlay 持久化失败：${error instanceof Error ? error.message : String(error)}`,
          0,
          "error",
        );
      });
    } catch (error) {
      this.logger?.append(
        `Overlay 持久化失败：${error instanceof Error ? error.message : String(error)}`,
        0,
        "error",
      );
    }
  }

}
