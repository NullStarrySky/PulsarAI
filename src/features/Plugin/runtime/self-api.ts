import { getActivePinia } from "pinia";
import type { ModelMessage } from "ai";
import { PluginLogger } from "@/features/Plugin/environment/logger";
import {
  binaryContent,
  isTextResource,
  textContent,
} from "@/features/Plugin/resources/resource-types";
import {
  type ResourceImportEnvironment,
  wrapResource,
} from "@/features/Plugin/resources/resource-wrapper";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import {
  findPluginNodeByPath,
  type Plugin,
  type PluginFile,
  type PluginTreeNode,
  pluginChildNodes,
  pluginFiles,
  pluginParentPath,
} from "@/features/Plugin/tree/plugin-types";
import { useSlotStore } from "@/features/Plugin/tree/slot-store";
import {
  executeSandboxCode,
  resolveSandboxMessagesAsync,
  resolveSandboxTextAsync,
} from "@/features/Sandbox/sandbox";

export interface PluginSelfApiMutation {
  writeFile: (
    pluginId: string,
    path: string,
    content: string | ArrayBuffer,
  ) => void;
  editFile: (
    pluginId: string,
    path: string,
    find: string,
    replace: string,
  ) => void;
  mkdir: (pluginId: string, path: string) => void;
  move: (pluginId: string, from: string, targetPath: string) => void;
  remove: (pluginId: string, path: string) => void;
}

export interface PluginSelfApiOptions {
  plugins?: Plugin[];
  logger?: PluginLogger;
  mutation?: PluginSelfApiMutation;
  conversationId?: string;
}
type ResolvedFile = { plugin: Plugin; file: PluginFile; path: string };
type PluginUiTarget =
  | { kind: "panel"; plugin: Plugin; path: "" }
  | { kind: "resource"; plugin: Plugin; file: PluginFile; path: string };

function normalizePluginPath(value: string) {
  return value.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

function resolvePluginPath(fromPath: string, request: string) {
  if (request.startsWith("@")) return request;
  const parent = fromPath.split("/").slice(0, -1);
  for (const part of request.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parent.pop(); else parent.push(part);
  }
  return `@/${normalizePluginPath(parent.join("/"))}`;
}

function isModelMessage(value: unknown): value is ModelMessage {
  return Boolean(value && typeof value === "object" && "role" in value && "content" in value);
}

function installedPlugins() {
  return getActivePinia() ? usePluginStore().plugins : [];
}
function nodeMetadata(node: PluginTreeNode) {
  return {
    id: node.id,
    name: node.name,
    path: `/${node.path}`,
    kind: node.kind,
    ...(node.kind === "file"
      ? { order: node.order, insertion: node.insertion }
      : {}),
  };
}
function withoutExtension(path: string) {
  return path.replace(/(?:\.chat|\.data)?\.[^./]+$/i, "");
}

export function createPluginSelfApi(
  pluginId: string,
  options: PluginSelfApiOptions = {},
) {
  const list = () => options.plugins ?? installedPlugins();
  const logger = options.logger ?? new PluginLogger();
  const store = () => usePluginStore();
  const findPlugin = (id: string) => {
    const plugin = list().find((item) => item.id === id);
    if (!plugin) throw new Error(`插件不存在：${id}`);
    return plugin;
  };
  const resolve = (request: string, fileOnly = false) => {
    const match = request.trim().match(/^@(?:(?<id>[^/]+))?\/?(?<path>.*)$/);
    const plugin = findPlugin(match?.groups?.id || pluginId);
    const path = normalizePluginPath(match?.groups?.path ?? request);
    const exact = path ? findPluginNodeByPath(plugin, path) : null;
    if (exact || !fileOnly || !path || /\.[^/]+$/.test(path))
      return { plugin, path, node: exact };
    const candidates = pluginFiles(plugin).filter(
      (file) => withoutExtension(file.path) === path,
    );
    if (candidates.length === 1)
      return { plugin, path: candidates[0]!.path, node: candidates[0]! };
    if (candidates.length > 1)
      throw new Error(
        `无后缀路径不唯一：${request}（${candidates.map((file) => file.path).join("、")}）`,
      );
    return { plugin, path, node: null };
  };
  const requireFile = (request: string): ResolvedFile => {
    const target = resolve(request, true);
    if (target.node?.kind !== "file") throw new Error(`文件不存在：${request}`);
    return { plugin: target.plugin, file: target.node, path: target.path };
  };
  const scopeText = (source: string, ownerPluginId: string) =>
    source.split("@/").join(`@${ownerPluginId}/`);
  const scopeRequest = (request: string, ownerPluginId: string) =>
    request.startsWith("@/")
      ? `@${ownerPluginId}/${request.slice(2)}`
      : request;
  const scopedFile = (target: ResolvedFile): PluginFile =>
    isTextResource(target.file)
      ? {
          ...target.file,
          content: scopeText(textContent(target.file), target.plugin.id),
        }
      : target.file;
  const resolveUiTarget = (request: string): PluginUiTarget => {
    const target = resolve(request, true);
    if (!target.path) return { kind: "panel", plugin: target.plugin, path: "" };
    if (target.node?.kind !== "file")
      throw new Error(`只能操作资源文件或插件面板：${request}`);
    return {
      kind: "resource",
      plugin: target.plugin,
      file: target.node,
      path: target.path,
    };
  };
  const show = (request: string, action: "open" | "close" | "toggle") => {
    const target = resolveUiTarget(request);
    if (target.kind === "panel") {
      if (action === "open") store().openAssetPanel(target.plugin.id);
      else if (action === "close") store().closeAssetPanel(target.plugin.id);
      else store().toggleAssetPanel(target.plugin.id);
      logger.append(`${action} 插件面板`, 0, "api", `@${target.plugin.id}/`);
      return {
        open: store().assetPanelPluginId === target.plugin.id,
        kind: "panel" as const,
        pluginId: target.plugin.id,
        path: "",
      };
    }
    const context = {
      conversationId: options.conversationId,
      overlayPlugins: list(),
    };
    if (action === "open")
      store().showFileEditor(
        target.plugin,
        target.file,
        target.path,
        "preview",
        context,
      );
    else if (action === "close") {
      const active = store().activeEditorState;
      if (
        active?.plugin.id === target.plugin.id &&
        (active.file.id === target.file.id || active.path === target.path)
      )
        store().closeFileEditor();
    } else
      store().toggleFileEditor(
        target.plugin,
        target.file,
        target.path,
        "preview",
        context,
      );
    const active = store().activeEditorState;
    logger.append(
      `${action} 资源`,
      0,
      "api",
      `@${target.plugin.id}/${target.path}`,
    );
    return {
      open: Boolean(
        active &&
        active.plugin.id === target.plugin.id &&
        (active.file.id === target.file.id || active.path === target.path),
      ),
      kind: "resource" as const,
      pluginId: target.plugin.id,
      path: target.path,
      resourceId: target.file.id,
    };
  };
  const conditionPasses = (
    target: ResolvedFile,
    environment: ResourceImportEnvironment,
  ) => {
    const insertion = target.file.insertion;
    if (!insertion?.condition && !insertion?.conditionPath) return true;
    const execute = (source: string) =>
      Boolean(executeSandboxCode(source, [environment]));
    let pass =
      !insertion.conditionPath ||
      execute(
        scopeText(
          textContent(
            requireFile(
              scopeRequest(
                resolvePluginPath(target.path, insertion.conditionPath),
                target.plugin.id,
              ),
            ).file,
          ),
          target.plugin.id,
        ),
      );
    if (pass && insertion.condition)
      pass = execute(scopeText(insertion.condition, target.plugin.id));
    logger.append(
      `条件结果：${pass}`,
      1,
      "condition",
      `@${target.plugin.id}/${target.path}`,
    );
    return pass;
  };
  const importFile = (
    request: string | string[],
    input: ResourceImportEnvironment = {},
  ): unknown | Promise<unknown> => {
    if (Array.isArray(request)) {
      const values = request.map((path) => importFile(path, input));
      return values.some((value) => value instanceof Promise)
        ? Promise.all(values).then((resolved) => resolved.flat())
        : values.flat();
    }
    const target = requireFile(request);
    const environment: ResourceImportEnvironment = { ...input, logger };
    if (!conditionPasses(target, environment)) return null;
    return wrapResource(scopedFile(target)).import(environment);
  };
  const parse = async (
    request: string | string[],
    input: ResourceImportEnvironment = {},
  ) => {
    const environment: ResourceImportEnvironment = {
      ...input,
      imports: input.imports ?? importFile,
      logger,
    };
    const imported = await importFile(request, environment);
    if (typeof imported === "string")
      return resolveSandboxTextAsync(imported, [environment], { logger });
    if (Array.isArray(imported) && imported.every(isModelMessage))
      return resolveSandboxMessagesAsync(imported, [environment], { logger });
    return imported;
  };
  const persistInBackground = (
    operation: Promise<unknown>,
    action: string,
    path: string,
  ) => {
    void operation.catch((error) => {
      logger.append(
        `${action}持久化失败：${error instanceof Error ? error.message : String(error)}`,
        0,
        "error",
        path,
      );
    });
  };
  const slotPaths = (id: string, scope?: "local" | "global") =>
    (useSlotStore().getSlot(id, scope, list())?.resources ?? []).map(
      (resource) => `@${resource.pluginId}/${resource.path}`,
    );
  const api = {
    read(path: string) {
      const target = requireFile(path);
      const value = isTextResource(target.file)
        ? scopeText(textContent(target.file), target.plugin.id)
        : binaryContent(target.file);
      logger.append(
        "读取资源",
        0,
        "api",
        `@${target.plugin.id}/${target.path}`,
      );
      return value;
    },
    readMeta(path: string) {
      const target = resolve(path);
      return target.node
        ? nodeMetadata(target.node)
        : {
            id: "",
            name: target.plugin.id,
            path: "/",
            kind: "folder" as const,
          };
    },
    write(path: string, content: string | ArrayBuffer) {
      const target = resolve(path);
      if (!target.path) throw new Error("不能写入插件根目录。");
      if (options.mutation)
        options.mutation.writeFile(target.plugin.id, target.path, content);
      else if (target.node?.kind === "file")
        persistInBackground(
          store().updateNode(target.plugin.id, target.node.id, {
            content:
              content instanceof ArrayBuffer ? content.slice(0) : content,
          }),
          "写入资源",
          `@${target.plugin.id}/${target.path}`,
        );
      else
        persistInBackground(
          store().createFile(target.plugin.id, pluginParentPath(target.path), {
            name: target.path.split("/").pop()!,
            content,
          }),
          "写入资源",
          `@${target.plugin.id}/${target.path}`,
        );
      logger.append(
        "写入资源",
        0,
        "api",
        `@${target.plugin.id}/${target.path}`,
      );
    },
    edit(path: string, find: string, replace: string) {
      const target = requireFile(path);
      if (!isTextResource(target.file))
        throw new Error(`edit 只支持文本资源：${path}`);
      const before = textContent(target.file);
      if (!before.includes(find)) throw new Error(`未找到待替换文本：${find}`);
      if (options.mutation)
        options.mutation.editFile(target.plugin.id, target.path, find, replace);
      else
        persistInBackground(
          store().updateNode(target.plugin.id, target.file.id, {
            content: before.replace(find, replace),
          }),
          "编辑资源",
          `@${target.plugin.id}/${target.path}`,
        );
      logger.append(
        "编辑资源",
        0,
        "api",
        `@${target.plugin.id}/${target.path}`,
      );
    },
    ls(path = "@/") {
      const target = resolve(path);
      return pluginChildNodes(
        target.plugin,
        target.node?.path ?? target.path,
      ).map(nodeMetadata);
    },
    exists(path: string) {
      try {
        return Boolean(resolve(path, true).node);
      } catch {
        return false;
      }
    },
    mkdir(path: string) {
      const target = resolve(path);
      if (!target.path) return;
      if (target.node) throw new Error(`路径已存在：${path}`);
      if (options.mutation)
        options.mutation.mkdir(target.plugin.id, target.path);
      else
        persistInBackground(
          store().createFolder(
            target.plugin.id,
            pluginParentPath(target.path),
            target.path.split("/").pop()!,
          ),
          "创建文件夹",
          `@${target.plugin.id}/${target.path}`,
        );
      logger.append(
        "创建文件夹",
        0,
        "api",
        `@${target.plugin.id}/${target.path}`,
      );
    },
    move(from: string, to: string) {
      const source = resolve(from);
      if (!source.node) throw new Error(`资源不存在：${from}`);
      const target = resolve(to);
      if (target.plugin.id !== source.plugin.id)
        throw new Error("当前不支持跨插件移动资源。");
      if (options.mutation)
        options.mutation.move(source.plugin.id, source.path, target.path);
      else
        persistInBackground(
          store().moveNode(
            source.plugin.id,
            source.node.id,
            pluginParentPath(target.path),
          ),
          "移动资源",
          `@${source.plugin.id}/${source.path}`,
        );
      logger.append(
        "移动资源",
        0,
        "api",
        `@${source.plugin.id}/${source.path}`,
      );
    },
    remove(path: string) {
      const target = resolve(path);
      if (!target.path) throw new Error("Overlay 中不能删除插件根目录。");
      if (options.mutation)
        options.mutation.remove(target.plugin.id, target.path);
      else if (target.node)
        persistInBackground(
          store().deleteNode(target.plugin.id, target.node.id),
          "删除资源",
          `@${target.plugin.id}/${target.path}`,
        );
      logger.append(
        "删除资源",
        0,
        "api",
        `@${target.plugin.id}/${target.path}`,
      );
    },
    open: (path: string) => show(path, "open"),
    close: (path: string) => show(path, "close"),
    toggle: (path: string) => show(path, "toggle"),
    import: importFile,
    run: importFile,
    parse,
    slot: {
      list: (scope?: "local" | "global") =>
        useSlotStore()
          .listSlots(list())
          .filter((item) => !scope || item.scope === scope),
      get: (id: string, scope?: "local" | "global") =>
        useSlotStore().getSlot(id, scope, list()),
      import: slotPaths,
      paths: slotPaths,
    },
    logger,
  };
  return api;
}
