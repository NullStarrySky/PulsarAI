import { defineStore, type Pinia } from "pinia";
import { isRef, type MaybeRefOrGetter } from "vue";
import { createConversationPluginStore } from "./conversation-plugin-store";
import { usePackageStore } from "@/features/Package/package-store";
import type { PluginLogger } from "@/features/Plugin/runtime/logger";
import {
  binaryContent,
  isTextResource,
  textContent,
} from "@/features/Plugin/resources/resource-types";
import {
  type ResourceImportEnvironment,
  wrapResource,
} from "@/features/Plugin/resources/resource-wrapper";
import { executeSandboxCode } from "@/features/Sandbox/sandbox";
import type {
  PluginConfig,
  PluginConfigValue,
} from "@/features/Plugin/editors/config/plugin-config";
import { createBuiltinPlugins } from "@/features/Plugin/tree/builtin-plugins";
import {
  deletePersistedPlugin,
  loadPersistedPlugins,
  savePersistedPlugin,
  searchPersistedPluginNodes,
} from "@/features/Plugin/tree/plugin-persistence";
import {
  findPluginNodeByPath,
  findPluginTreeNode,
  type Plugin,
  type PluginFile,
  type PluginNodeBase,
  type PluginTreeNode,
  pluginDirectoryExists,
  pluginFolder,
  pluginChildNodes,
  pluginConventions,
  pluginFileType,
  pluginParentPath,
} from "@/features/Plugin/tree/plugin-types";

export const builtinCorePluginId = "builtin-core-plugin";
export const builtinBlankPluginId = "builtin-blank-plugin";
export const builtinDefaultPluginId = "builtin-default-plugin";
let initializePromise: Promise<void> | null = null;

export interface ActivePluginFileEditorState {
  plugin: Plugin;
  file: PluginFile;
  path: string;
  editorMode: "preview" | "source";
  conversationId?: string;
}

export interface PluginStoreApiMutation {
  writeFile(pluginId: string, path: string, content: string | ArrayBuffer): void;
  editFile(pluginId: string, path: string, find: string, replace: string): void;
  mkdir(pluginId: string, path: string): void;
  move(pluginId: string, from: string, targetPluginId: string, targetPath: string): void;
  remove(pluginId: string, path: string): void;
}

export interface PluginStoreApiOptions {
  plugins?: Plugin[];
  logger?: PluginLogger;
  mutation?: PluginStoreApiMutation;
  conversationId?: string;
}

type ResolvedPluginFile = { plugin: Plugin; file: PluginFile; path: string };
type PluginUiTarget =
  | { kind: "panel"; plugin: Plugin; path: "" }
  | { kind: "resource"; plugin: Plugin; file: PluginFile; path: string };

function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function joinPluginPath(parentPath: string, name: string) {
  return parentPath ? `${parentPath}/${name}` : name;
}

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

function withoutExtension(path: string) {
  return path.replace(/(?:\.chat|\.data)?\.[^./]+$/i, "");
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
  ) {
    plugin.emptyFolders.push(parent);
  }
}

function pathHasFileAncestor(plugin: Plugin, path: string) {
  let parent = pluginParentPath(path);
  while (parent) {
    if (plugin.files.some((file) => file.path === parent)) return true;
    parent = pluginParentPath(parent);
  }
  return false;
}

function createFileNode(
  path: string,
  content: unknown = "",
  input: Partial<PluginNodeBase> & {
    order?: number;
    insertion?: PluginFile["insertion"];
  } = {},
): PluginFile {
  return {
    id: input.id ?? crypto.randomUUID(),
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    icon: input.icon ?? "",
    treeOrder: input.treeOrder ?? 0,
    kind: "file",
    order: input.order ?? 100,
    ...(input.insertion ? { insertion: clonePlain(input.insertion) } : {}),
    content: clonePlain(content),
  };
}

function availablePluginId(plugins: Plugin[], base: string) {
  const used = new Set(plugins.map((plugin) => plugin.id.toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

function assertPluginId(id: string) {
  if (!id || id === "." || id === ".." || /[\\/\u0000-\u001f]/.test(id)) {
    throw new Error(
      "插件 ID 必须是一个有效的顶层路径名称，不能包含斜杠或控制字符。",
    );
  }
}

export function isVisiblePlugin(plugin: Plugin): boolean {
  return !(plugin as any).hidden && plugin.id !== builtinDefaultPluginId;
}

function cloneStarterFiles(files: PluginFile[]): PluginFile[] {
  return files.map((node) => {
    return {
      id: crypto.randomUUID(),
      path: node.path,
      name: node.name,
      icon: node.icon,
      treeOrder: node.treeOrder,
      kind: "file",
      content: clonePlain(node.content),
      order: node.order,
      ...(node.insertion ? { insertion: clonePlain(node.insertion) } : {}),
    };
  });
}

function createStarterPlugin(
  packageId: string | null,
  global = false,
  existingPlugins: Plugin[] = [],
): Plugin {
  const name = global ? "新全局插件" : "新插件";
  const defaultTemplate = existingPlugins.find(
    (item) => item.id === builtinDefaultPluginId,
  );
  if (!defaultTemplate) throw new Error("默认插件模板尚未载入。");
  return {
    id: availablePluginId(
      existingPlugins,
      global ? "global-plugin" : "character-plugin",
    ),
    packageId,
    name,
    icon: "",
    shortDescription: "",
    files: cloneStarterFiles(defaultTemplate.files),
    emptyFolders: [...defaultTemplate.emptyFolders],
    enabled: true,
    builtIn: false,
  };
}

function comparePlugins(a: Plugin, b: Plugin) {
  return a.name.localeCompare(b.name, "zh-Hans") || a.id.localeCompare(b.id);
}

function configNode(plugin: Plugin) {
  const node = findPluginNodeByPath(plugin, pluginConventions.config);
  return node?.kind === "file" ? node : null;
}

function normalizePluginFile(value: unknown): PluginFile | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<PluginTreeNode> & {
    insertion?: unknown;
    order?: unknown;
  };
  const rawPath = typeof source.path === "string" ? source.path.trim() : "";
  const rawName =
    typeof source.name === "string" && source.name.trim()
      ? source.name.trim()
      : rawPath.slice(rawPath.lastIndexOf("/") + 1);
  if (!rawPath || !rawName) return null;
  const path = rawPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
  const name = path.slice(path.lastIndexOf("/") + 1);
  const base = {
    id:
      typeof source.id === "string" && source.id
        ? source.id
        : crypto.randomUUID(),
    path,
    name,
    icon: typeof source.icon === "string" ? source.icon : "",
    treeOrder:
      typeof source.treeOrder === "number" && Number.isFinite(source.treeOrder)
        ? source.treeOrder
        : 0,
  };

  if (source.kind !== "file") return null;
  return {
    ...base,
    kind: "file",
    order:
      typeof source.order === "number" && Number.isFinite(source.order)
        ? source.order
        : 100,
    ...(source.insertion &&
    typeof source.insertion === "object" &&
    !Array.isArray(source.insertion) &&
    typeof (source.insertion as { slot?: unknown }).slot === "string" &&
    (source.insertion as { slot: string }).slot.trim()
      ? {
          insertion: {
            slot: (source.insertion as { slot: string }).slot.trim(),
            ...(typeof (source.insertion as { condition?: unknown })
              .condition === "string" &&
            (source.insertion as { condition: string }).condition.trim()
              ? {
                  condition: (
                    source.insertion as { condition: string }
                  ).condition.trim(),
                }
              : {}),
            ...(typeof (source.insertion as { conditionPath?: unknown })
              .conditionPath === "string" &&
            (source.insertion as { conditionPath: string }).conditionPath.trim()
              ? {
                  conditionPath: (
                    source.insertion as { conditionPath: string }
                  ).conditionPath.trim(),
                }
              : {}),
          },
        }
      : {}),
    content: clonePlain(source.content ?? ""),
  };
}

function isPluginRecord(value: unknown): value is Plugin {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<Plugin>;
  return (
    typeof source.id === "string" &&
    typeof source.name === "string" &&
    Array.isArray(source.files) &&
    Array.isArray(source.emptyFolders)
  );
}

function normalizePlugin(value: Plugin): Plugin {
  const seenPaths = new Set<string>();
  const files: PluginFile[] = [];
  for (const raw of value.files) {
    const file = normalizePluginFile(raw);
    if (!file || seenPaths.has(file.path)) continue;
    seenPaths.add(file.path);
    files.push(file);
  }
  if (!files.length) {
    throw new Error("插件根目录无效");
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const emptyFolders = [
    ...new Set(
      value.emptyFolders
        .flatMap((path) =>
          typeof path === "string"
            ? [path.trim().replace(/^\/+|\/+$/g, "")]
            : [],
        )
        .filter(
          (path) =>
            path && !files.some((file) => file.path.startsWith(`${path}/`)),
        ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  return {
    id: value.id,
    packageId: value.packageId ?? null,
    name: value.name.trim() || "未命名插件",
    icon: typeof value.icon === "string" ? value.icon : "",
    shortDescription:
      typeof value.shortDescription === "string" ? value.shortDescription : "",
    files,
    emptyFolders,
    enabled: value.enabled !== false,
    builtIn: value.builtIn === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeBuiltinSlots(source: unknown, persisted: unknown) {
  if (!isRecord(source) || !isRecord(persisted)) return clonePlain(persisted);
  const sourceSlots = Array.isArray(source.slots) ? source.slots : [];
  const persistedSlots = Array.isArray(persisted.slots) ? persisted.slots : [];
  const persistedById = new Map(
    persistedSlots.flatMap((item) =>
      isRecord(item) && typeof item.id === "string"
        ? [[item.id, item] as const]
        : [],
    ),
  );
  const merged = sourceSlots.map((item) => {
    const id = isRecord(item) && typeof item.id === "string" ? item.id : "";
    const saved = id ? persistedById.get(id) : undefined;
    return clonePlain(
      isRecord(item) && isRecord(saved) ? { ...item, ...saved } : saved ?? item,
    );
  });
  const sourceIds = new Set(
    sourceSlots.flatMap((item) =>
      isRecord(item) && typeof item.id === "string" ? [item.id] : [],
    ),
  );
  merged.push(
    ...persistedSlots
      .filter(
        (item) =>
          !isRecord(item) ||
          typeof item.id !== "string" ||
          !sourceIds.has(item.id),
      )
      .map((item) => clonePlain(item)),
  );
  return {
    ...clonePlain(source),
    ...clonePlain(persisted),
    slots: merged,
  };
}

function isLegacyBuiltinDefaultChat(content: unknown) {
  let value = content;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return false;
    }
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.message) ||
    value.message.length !== 2
  )
    return false;
  const [bootstrap, chat] = value.message;
  return (
    isRecord(bootstrap) &&
    bootstrap.role === "system" &&
    bootstrap.content === '{{ imports("./prompt.md") }}' &&
    isRecord(chat) &&
    chat.role === "system" &&
    chat.content === "[[ chat ]]"
  );
}

function mergeBuiltinPlugin(bundled: Plugin, persisted: Plugin): Plugin {
  const savedByPath = new Map(persisted.files.map((file) => [file.path, file]));
  const bundledPaths = new Set(bundled.files.map((file) => file.path));
  const retiredPaths =
    bundled.id === builtinDefaultPluginId
      ? new Set(["generate.js"])
      : new Set<string>();
  const files: PluginFile[] = [
    ...bundled.files.map((node) => {
      const saved = savedByPath.get(node.path);
      if (!saved) return clonePlain(node);
      {
        let content = clonePlain(saved.content);
        if (node.path === pluginConventions.slots) {
          content = mergeBuiltinSlots(node.content, saved.content);
        } else if (
          node.path === "default.chat.json" &&
          isLegacyBuiltinDefaultChat(saved.content)
        ) {
          content = clonePlain(node.content);
        } else if (pluginFileType(node.name) === "media") {
          content = clonePlain(node.content);
        }
        return { ...clonePlain(node), ...clonePlain(saved), content };
      }
    }),
    ...persisted.files
      .filter(
        (node) => !bundledPaths.has(node.path) && !retiredPaths.has(node.path),
      )
      .map((node) => clonePlain(node)),
  ];
  return {
    ...clonePlain(bundled),
    ...clonePlain(persisted),
    id: bundled.id,
    packageId: null,
    ...(bundled.id === builtinDefaultPluginId ? { enabled: false } : {}),
    builtIn: true,
    files,
    emptyFolders: [
      ...new Set([...bundled.emptyFolders, ...persisted.emptyFolders]),
    ],
  };
}

function removeCancelledOverride(plugin: Plugin) {
  const before = plugin.files.length;
  plugin.files = plugin.files.filter(
    (node) => node.path.trim().toLocaleLowerCase() !== "override.vue",
  );
  let changed = plugin.files.length !== before;
  if (plugin.builtIn) {
    const slots = findPluginNodeByPath(plugin, pluginConventions.slots);
    if (
      slots?.kind === "file" &&
      slots.content &&
      typeof slots.content === "object"
    ) {
      const content = slots.content as { slots?: unknown };
      if (Array.isArray(content.slots)) {
        const filtered = content.slots.filter(
          (item) =>
            !item ||
            typeof item !== "object" ||
            (item as { id?: unknown }).id !== "OVERRIDE",
        );
        if (filtered.length !== content.slots.length) {
          content.slots = filtered;
          changed = true;
        }
      }
    }
  }
  return changed;
}

function isFixedConventionPath(path: string) {
  const fixed: string[] = [
    pluginConventions.config,
    pluginConventions.slots,
    pluginConventions.regex,
    pluginConventions.componentsFolder,
    pluginConventions.toolsFolder,
  ];
  return fixed.includes(path);
}

function normalizeImportedGlobalPlugin(value: unknown): Plugin {
  if (!isPluginRecord(value)) {
    throw new Error("文件不是有效的文件树插件");
  }
  const plugin = normalizePlugin(value);
  assertPluginId(plugin.id);
  return {
    ...plugin,
    packageId: null,
    builtIn: false,
  };
}

function assertPluginToolNames(plugin: Plugin) {
  const toolsPrefix = `${pluginConventions.toolsFolder}/`;
  const toolNames = [
    ...new Set(
      plugin.files
        .filter(
          (node) =>
            node.path.startsWith(toolsPrefix) &&
            node.path.slice(toolsPrefix.length).includes("/"),
        )
        .map((node) => pluginParentPath(node.path)),
    ),
  ]
    .filter((toolPath) => {
      const entry = `${toolPath}/${pluginConventions.toolEntry}`;
      const prompt = `${toolPath}/${pluginConventions.toolPrompt}`;
      return (
        plugin.files.some((node) => node.path === entry) &&
        plugin.files.some((node) => node.path === prompt)
      );
    })
    .map((toolPath) =>
      toolPath.slice(toolsPrefix.length).trim().toLocaleLowerCase(),
    );
  const seen = new Set<string>();
  const duplicate = toolNames.find((name) => {
    if (seen.has(name)) return true;
    seen.add(name);
    return false;
  });
  if (duplicate) {
    throw new Error(`自定义工具名称冲突：${duplicate}（${plugin.name}）`);
  }
}

function assertPluginToolNamesCompatible(plugins: Plugin[]) {
  for (const plugin of plugins) assertPluginToolNames(plugin);
}

function pluginStateItems(state: unknown) {
  return (state as { plugins: Plugin[] }).plugins;
}

function setPluginStateItems(state: unknown, plugins: Plugin[]) {
  (state as { plugins: Plugin[] }).plugins = plugins;
}

const usePluginStateStore = defineStore("plugin-resource", {
  state: () => ({
    loaded: false,
    loadError: "",
    activePluginId: "",
    assetPanelPluginId: null as string | null,
    search: "",
    treeRevision: 0,
    plugins: [] as Plugin[],
    activeEditorState: null as ActivePluginFileEditorState | null,
  }),
  getters: {
    sortedPlugins(state): Plugin[] {
      const local = pluginStateItems(state)
        .filter(
          (plugin) => plugin.packageId !== null && isVisiblePlugin(plugin),
        )
        .sort(comparePlugins);
      const global = pluginStateItems(state)
        .filter(
          (plugin) => plugin.packageId === null && isVisiblePlugin(plugin),
        )
        .sort(comparePlugins);
      return [...local, ...global];
    },
    globalPlugins(state): Plugin[] {
      return pluginStateItems(state)
        .filter(
          (plugin) => plugin.packageId === null && isVisiblePlugin(plugin),
        )
        .sort(comparePlugins);
    },
    sortedPluginsForPackage:
      (state) =>
      (
        packageId?: string | null,
        enabledGlobalPluginIds: string[] = [],
        mainPluginId?: string,
      ): Plugin[] => {
        const enabledGlobal = new Set(enabledGlobalPluginIds);
        const selected = pluginStateItems(state).filter(
          (plugin) =>
            (Boolean(packageId) && plugin.packageId === packageId) ||
            (plugin.packageId === null &&
              (plugin.id === mainPluginId || enabledGlobal.has(plugin.id))),
        );
        return selected.sort((a, b) => {
          if (a.id === mainPluginId) return -1;
          if (b.id === mainPluginId) return 1;
          if (a.packageId !== b.packageId)
            return a.packageId === packageId ? -1 : 1;
          return comparePlugins(a, b);
        });
      },
    visiblePluginsForPackage(): (
      packageId?: string | null,
      enabledGlobalPluginIds?: string[],
      mainPluginId?: string,
    ) => Plugin[] {
      return (
        packageId?: string | null,
        enabledGlobalPluginIds: string[] = [],
        mainPluginId?: string,
      ) => {
        const keyword = this.search.trim().toLocaleLowerCase();
        return this.sortedPluginsForPackage(
          packageId,
          enabledGlobalPluginIds,
          mainPluginId,
        ).filter(
          (plugin) =>
            !keyword ||
            plugin.name.toLocaleLowerCase().includes(keyword) ||
            plugin.shortDescription.toLocaleLowerCase().includes(keyword),
        );
      };
    },
    enabledPluginsForPackage(): (
      packageId?: string | null,
      enabledGlobalPluginIds?: string[],
      mainPluginId?: string,
    ) => Plugin[] {
      return (
        packageId?: string | null,
        enabledGlobalPluginIds: string[] = [],
        mainPluginId?: string,
      ) =>
        this.sortedPluginsForPackage(
          packageId,
          enabledGlobalPluginIds,
          mainPluginId,
        ).filter((plugin) => plugin.enabled || plugin.id === mainPluginId);
    },
    activePlugin(state): Plugin | undefined {
      return pluginStateItems(state).find(
        (plugin) => plugin.id === state.activePluginId,
      );
    },
  },
  actions: {
    api(pluginId: string, options: PluginStoreApiOptions = {}) {
      const plugins = () => options.plugins ?? pluginStateItems(this);
      const log = (
        message: string,
        path: string,
        type: "import" | "condition" | "api" | "sandbox" | "error" | "info" = "api",
        depth = 0,
      ) => options.logger?.append(message, depth, type, path);
      const findPlugin = (id: string) => {
        const plugin = plugins().find((item) => item.id === id);
        if (!plugin) throw new Error(`插件不存在：${id}`);
        return plugin;
      };
      const resolve = (request: string, fileOnly = false) => {
        const match = request.trim().match(/^@(?:(?<id>[^/]+))?\/?(?<path>.*)$/);
        const plugin = findPlugin(match?.groups?.id || pluginId);
        const path = normalizePluginPath(match?.groups?.path ?? request);
        const node = path ? findPluginNodeByPath(plugin, path) : null;
        if (node || !fileOnly || !path || /\.[^/]+$/.test(path)) {
          return { plugin, path, node };
        }
        const candidates = plugin.files.filter(
          (file) => withoutExtension(file.path) === path,
        );
        if (candidates.length === 1) {
          return { plugin, path: candidates[0]!.path, node: candidates[0]! };
        }
        if (candidates.length > 1) {
          throw new Error(
            `无后缀路径不唯一：${request}（${candidates.map((file) => file.path).join("、")}）`,
          );
        }
        return { plugin, path, node: null };
      };
      const requireFile = (request: string): ResolvedPluginFile => {
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
      const scopedFile = (target: ResolvedPluginFile): PluginFile =>
        isTextResource(target.file)
          ? {
              ...target.file,
              content: scopeText(textContent(target.file), target.plugin.id),
            }
          : target.file;
      const uiTarget = (request: string): PluginUiTarget => {
        const target = resolve(request, true);
        if (!target.path) return { kind: "panel", plugin: target.plugin, path: "" };
        if (target.node?.kind !== "file") {
          throw new Error(`只能操作资源文件或插件面板：${request}`);
        }
        return {
          kind: "resource",
          plugin: target.plugin,
          file: target.node,
          path: target.path,
        };
      };
      const persist = (operation: Promise<unknown>, action: string, path: string) => {
        void operation.catch((error) => {
          log(
            `${action}持久化失败：${error instanceof Error ? error.message : String(error)}`,
            path,
            "error",
          );
        });
      };
      const conditionPasses = (
        target: ResolvedPluginFile,
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
        if (pass && insertion.condition) {
          pass = execute(scopeText(insertion.condition, target.plugin.id));
        }
        log(`条件结果：${pass}`, `@${target.plugin.id}/${target.path}`, "condition", 1);
        return pass;
      };
      const importFile = (
        request: string | string[],
        environment: ResourceImportEnvironment = {},
      ): unknown | Promise<unknown> => {
        if (Array.isArray(request)) {
          const values = request.map((path) => importFile(path, environment));
          return values.some((value) => value instanceof Promise)
            ? Promise.all(values).then((resolved) => resolved.flat())
            : values.flat();
        }
        const target = requireFile(request);
        const input = { ...environment, ...(options.logger ? { logger: options.logger } : {}) };
        if (!conditionPasses(target, input)) return null;
        log("导入资源", `@${target.plugin.id}/${target.path}`, "import");
        return wrapResource(scopedFile(target)).import(input);
      };
      const show = (request: string, action: "open" | "close" | "toggle") => {
        const target = uiTarget(request);
        if (target.kind === "panel") {
          if (action === "open") this.openAssetPanel(target.plugin.id);
          else if (action === "close") this.closeAssetPanel(target.plugin.id);
          else this.toggleAssetPanel(target.plugin.id);
          log(`${action} 插件面板`, `@${target.plugin.id}/`);
          return {
            open: this.assetPanelPluginId === target.plugin.id,
            kind: "panel" as const,
            pluginId: target.plugin.id,
            path: "",
          };
        }
        const context = {
          conversationId: options.conversationId,
        };
        if (action === "open") {
          this.showFileEditor(target.plugin, target.file, target.path, "preview", context);
        } else if (action === "close") {
          const active = this.activeEditorState;
          if (active?.plugin.id === target.plugin.id &&
            (active.file.id === target.file.id || active.path === target.path)) {
            this.closeFileEditor();
          }
        } else {
          this.toggleFileEditor(target.plugin, target.file, target.path, "preview", context);
        }
        const active = this.activeEditorState;
        log(`${action} 资源`, `@${target.plugin.id}/${target.path}`);
        return {
          open: Boolean(active && active.plugin.id === target.plugin.id &&
            (active.file.id === target.file.id || active.path === target.path)),
          kind: "resource" as const,
          pluginId: target.plugin.id,
          path: target.path,
          resourceId: target.file.id,
        };
      };
      return {
        read: (path: string) => {
          const target = requireFile(path);
          const value = isTextResource(target.file)
            ? scopeText(textContent(target.file), target.plugin.id)
            : binaryContent(target.file);
          log("读取资源", `@${target.plugin.id}/${target.path}`);
          return value;
        },
        readMeta: (path: string) => {
          const target = resolve(path);
          return target.node
            ? nodeMetadata(target.node)
            : { id: "", name: target.plugin.id, path: "/", kind: "folder" as const };
        },
        write: (path: string, content: string | ArrayBuffer) => {
          const target = resolve(path);
          if (!target.path) throw new Error("不能写入插件根目录。");
          if (options.mutation) {
            options.mutation.writeFile(target.plugin.id, target.path, content);
          } else if (target.node?.kind === "file") {
            persist(this.updateNode(target.plugin.id, target.node.id, {
              content: content instanceof ArrayBuffer ? content.slice(0) : content,
            }), "写入资源", `@${target.plugin.id}/${target.path}`);
          } else {
            persist(this.createFile(target.plugin.id, pluginParentPath(target.path), {
              name: target.path.split("/").pop()!, content,
            }), "写入资源", `@${target.plugin.id}/${target.path}`);
          }
          log("写入资源", `@${target.plugin.id}/${target.path}`);
        },
        edit: (path: string, find: string, replace: string) => {
          const target = requireFile(path);
          if (!isTextResource(target.file)) throw new Error(`edit 只支持文本资源：${path}`);
          const before = textContent(target.file);
          if (!before.includes(find)) throw new Error(`未找到待替换文本：${find}`);
          if (options.mutation) {
            options.mutation.editFile(target.plugin.id, target.path, find, replace);
          } else {
            persist(this.updateNode(target.plugin.id, target.file.id, {
              content: before.replace(find, replace),
            }), "编辑资源", `@${target.plugin.id}/${target.path}`);
          }
          log("编辑资源", `@${target.plugin.id}/${target.path}`);
        },
        ls: (path = "@/") => {
          const target = resolve(path);
          return pluginChildNodes(target.plugin, target.node?.path ?? target.path).map(nodeMetadata);
        },
        exists: (path: string) => {
          try { return Boolean(resolve(path, true).node); } catch { return false; }
        },
        mkdir: (path: string) => {
          const target = resolve(path);
          if (!target.path) return;
          if (target.node) throw new Error(`路径已存在：${path}`);
          if (options.mutation) options.mutation.mkdir(target.plugin.id, target.path);
          else persist(this.createFolder(target.plugin.id, pluginParentPath(target.path), target.path.split("/").pop()!), "创建文件夹", `@${target.plugin.id}/${target.path}`);
          log("创建文件夹", `@${target.plugin.id}/${target.path}`);
        },
        move: (from: string, to: string) => {
          const source = resolve(from);
          if (!source.node) throw new Error(`资源不存在：${from}`);
          const target = resolve(to);
          if (options.mutation) options.mutation.move(
            source.plugin.id,
            source.path,
            target.plugin.id,
            target.path,
          );
          else {
            if (target.plugin.id !== source.plugin.id)
              throw new Error("跨插件移动只支持会话 Plugin 工作区。");
            persist(this.moveNode(source.plugin.id, source.node.id, pluginParentPath(target.path)), "移动资源", `@${source.plugin.id}/${source.path}`);
          }
          log("移动资源", `@${source.plugin.id}/${source.path}`);
        },
        remove: (path: string) => {
          const target = resolve(path);
          if (!target.path) throw new Error("Overlay 中不能删除插件根目录。");
          if (options.mutation) options.mutation.remove(target.plugin.id, target.path);
          else if (target.node) persist(this.deleteNode(target.plugin.id, target.node.id), "删除资源", `@${target.plugin.id}/${target.path}`);
          log("删除资源", `@${target.plugin.id}/${target.path}`);
        },
        open: (path: string) => show(path, "open"),
        close: (path: string) => show(path, "close"),
        toggle: (path: string) => show(path, "toggle"),
        import: importFile,
        run: importFile,
      };
    },
    async initialize() {
      if (this.loaded) {
        return;
      }
      if (initializePromise) {
        await initializePromise;
        return;
      }
      initializePromise = this.loadInitialData();
      try {
        await initializePromise;
      } finally {
        initializePromise = null;
      }
    },
    async loadInitialData() {
      const bundledPlugins = createBuiltinPlugins();
      setPluginStateItems(this, bundledPlugins);
      this.loadError = "";
      let records: Plugin[];
      try {
        records = await loadPersistedPlugins();
      } catch (error) {
        this.loadError = error instanceof Error ? error.message : String(error);
        console.error("Unable to load persisted plugins", error);
        this.activePluginId = bundledPlugins[0]?.id ?? "";
        this.loaded = true;
        return;
      }
      const bundledIds = new Set(bundledPlugins.map((plugin) => plugin.id));
      const refreshedBuiltinIds = new Set<string>();
      setPluginStateItems(
        this,
        records
          .filter(
            (record) => isPluginRecord(record) && !bundledIds.has(record.id),
          )
          .map(normalizePlugin),
      );
      pluginStateItems(this).push(
        ...bundledPlugins.map((bundled) => {
          const persisted = records.find(
            (record) => isPluginRecord(record) && record.id === bundled.id,
          );
          if (!persisted) return bundled;
          const merged = mergeBuiltinPlugin(
            bundled,
            normalizePlugin(persisted),
          );
          if (JSON.stringify(merged) !== JSON.stringify(persisted)) {
            refreshedBuiltinIds.add(merged.id);
          }
          return merged;
        }),
      );
      for (const plugin of pluginStateItems(this)) {
        if (
          removeCancelledOverride(plugin) ||
          refreshedBuiltinIds.has(plugin.id)
        ) {
          await this.persistPlugin(plugin);
        }
      }
      this.activePluginId = this.sortedPlugins[0]?.id ?? "";
      this.loaded = true;
      this.treeRevision += 1;
    },
    async persistPlugin(plugin: Plugin) {
      await savePersistedPlugin(clonePlain(plugin));
      this.treeRevision += 1;
    },
    async searchPluginNodes(query: string, limit = 40) {
      await this.initialize();
      return searchPersistedPluginNodes(query, limit);
    },
    openPlugin(pluginId: string) {
      if (pluginStateItems(this).some((plugin) => plugin.id === pluginId)) {
        this.activePluginId = pluginId;
      }
    },
    openAssetPanel(pluginId: string) {
      if (!pluginStateItems(this).some((plugin) => plugin.id === pluginId)) {
        throw new Error(`插件不存在：${pluginId}`);
      }
      this.activePluginId = pluginId;
      this.assetPanelPluginId = pluginId;
    },
    closeAssetPanel(pluginId?: string) {
      if (!pluginId || this.assetPanelPluginId === pluginId) {
        this.assetPanelPluginId = null;
      }
    },
    toggleAssetPanel(pluginId: string) {
      if (this.assetPanelPluginId === pluginId) this.assetPanelPluginId = null;
      else this.openAssetPanel(pluginId);
    },
    async createPlugin(packageId: string) {
      await this.initialize();
      if (pluginStateItems(this).some((item) => item.packageId === packageId)) {
        throw new Error(`角色包 ${packageId} 已经拥有资源插件。`);
      }
      const plugin = createStarterPlugin(
        packageId,
        false,
        pluginStateItems(this),
      );
      pluginStateItems(this).push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async createGlobalPlugin() {
      await this.initialize();
      const plugin = createStarterPlugin(null, true, pluginStateItems(this));
      pluginStateItems(this).push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async importGlobalPlugin(value: unknown) {
      const plugin = normalizeImportedGlobalPlugin(value);
      if (
        pluginStateItems(this).some(
          (item) =>
            item.id.toLocaleLowerCase() === plugin.id.toLocaleLowerCase(),
        )
      ) {
        throw new Error(`插件 ID 已存在：${plugin.id}`);
      }
      assertPluginToolNamesCompatible([...pluginStateItems(this), plugin]);
      pluginStateItems(this).push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async updatePlugin(
      pluginId: string,
      patch: Partial<
        Omit<Plugin, "id" | "files" | "emptyFolders" | "builtIn">
      >,
    ) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      if (!plugin) return;
      Object.assign(plugin, patch);
      await this.persistPlugin(plugin);
    },
    async setConfigValue(
      pluginId: string,
      key: string,
      value: PluginConfigValue,
    ) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      const config = plugin ? configNode(plugin) : null;
      if (
        !plugin ||
        !config ||
        !config.content ||
        typeof config.content !== "object"
      ) {
        throw new Error("插件 config.json 不存在。");
      }
      const entry = (config.content as PluginConfig)[key];
      if (!entry) throw new Error(`config.json 不存在键：${key}`);
      const previousContent = clonePlain(config.content);
      entry.value = value;
      try {
        await this.persistPlugin(plugin);
      } catch (error) {
        config.content = previousContent;
        throw error;
      }
    },
    async renamePluginId(pluginId: string, requestedId: string) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      if (!plugin) return null;
      if (plugin.builtIn) throw new Error("内置插件 ID 由内置资源路径固定。");
      const nextId = requestedId.trim();
      assertPluginId(nextId);
      if (nextId === pluginId) return plugin;
      if (
        pluginStateItems(this).some(
          (item) =>
            item !== plugin &&
            item.id.toLocaleLowerCase() === nextId.toLocaleLowerCase(),
        )
      ) {
        throw new Error(`插件 ID 已存在：${nextId}`);
      }

      const previous = clonePlain(plugin);
      plugin.id = nextId;
      const packages = usePackageStore();
      try {
        await this.persistPlugin(plugin);
        for (const item of packages.packages) {
          let changed = false;
          if (item.pluginId === pluginId) {
            item.pluginId = nextId;
            changed = true;
          }
          if (item.mainPluginId === pluginId) {
            item.mainPluginId = nextId;
            changed = true;
          }
          if (item.enabledGlobalPluginIds.includes(pluginId)) {
            item.enabledGlobalPluginIds = item.enabledGlobalPluginIds.map(
              (id) => (id === pluginId ? nextId : id),
            );
            changed = true;
          }
          if (changed) await packages.persist(item);
        }
        await deletePersistedPlugin(previous);
      } catch (error) {
        plugin.id = pluginId;
        throw error;
      }
      if (this.activePluginId === pluginId) this.activePluginId = nextId;
      return plugin;
    },
    async restoreBuiltInPlugin(pluginId: string) {
      const restored = createBuiltinPlugins().find(
        (plugin) => plugin.id === pluginId,
      );
      if (!restored) return null;
      const index = pluginStateItems(this).findIndex(
        (item) => item.id === pluginId,
      );
      if (index >= 0) {
        pluginStateItems(this).splice(index, 1, restored);
      } else {
        pluginStateItems(this).push(restored);
      }
      await this.persistPlugin(restored);
      return restored;
    },
    async deletePlugin(pluginId: string) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      if (!plugin || plugin.builtIn) return;
      const packages = usePackageStore();
      if (
        plugin.packageId === null &&
        packages.packages.some((item) => item.mainPluginId === pluginId)
      ) {
        throw new Error("该全局插件仍是角色包的主要插件，不能删除。");
      }
      if (plugin.packageId === null) {
        for (const packageItem of packages.packages) {
          if (!packageItem.enabledGlobalPluginIds.includes(pluginId)) continue;
          await packages.update(packageItem.id, {
            enabledGlobalPluginIds: packageItem.enabledGlobalPluginIds.filter(
              (id) => id !== pluginId,
            ),
          });
        }
      }
      setPluginStateItems(
        this,
        pluginStateItems(this).filter((item) => item.id !== pluginId),
      );
      await deletePersistedPlugin(plugin);
      this.activePluginId = this.sortedPlugins[0]?.id ?? "";
    },
    findNode(pluginId: string, nodeId: string) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      return plugin ? findPluginTreeNode(plugin, nodeId) : null;
    },
    async createFile(
      pluginId: string,
      parentPath: string,
      input: {
        name?: string;
        content?: unknown;
        order?: number;
        insertion?: PluginFile["insertion"];
      } = {},
    ) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      if (!plugin) return null;
      const name = input.name?.trim() || "untitled.md";
      const path = joinPluginPath(parentPath, name);
      if (pathHasFileAncestor(plugin, path)) return null;
      if (
        !parentPath &&
        [
          pluginConventions.config,
          pluginConventions.slots,
          pluginConventions.regex,
        ].some(
          (fixed) => name.toLocaleLowerCase() === fixed.toLocaleLowerCase(),
        )
      ) {
        const existing = findPluginNodeByPath(plugin, path);
        if (existing?.kind === "file") return existing;
      }
      if (findPluginNodeByPath(plugin, path)) return null;
      const siblings = pluginChildNodes(plugin, parentPath);
      const file = createFileNode(path, input.content ?? "", {
        treeOrder:
          Math.max(-1, ...siblings.map((child) => child.treeOrder ?? -1)) + 1,
        order:
          typeof input.order === "number" && Number.isFinite(input.order)
            ? Math.round(input.order)
            : 100,
        insertion: input.insertion,
      });
      const previousFiles = clonePlain(plugin.files);
      const previousEmptyFolders = [...plugin.emptyFolders];
      plugin.files.push(file);
      clearEmptyAncestors(plugin, path);
      try {
        assertPluginToolNamesCompatible(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.files = previousFiles;
        plugin.emptyFolders = previousEmptyFolders;
        throw error;
      }
      return file;
    },
    async createFolder(
      pluginId: string,
      parentPath: string,
      name = "新文件夹",
    ) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      if (!plugin) return null;
      const trimmed = name.trim();
      const path = joinPluginPath(parentPath, trimmed);
      if (!trimmed || pathHasFileAncestor(plugin, path)) return null;
      if (
        !parentPath &&
        [
          pluginConventions.componentsFolder,
          pluginConventions.toolsFolder,
        ].some(
          (fixed) => trimmed.toLocaleLowerCase() === fixed.toLocaleLowerCase(),
        )
      ) {
        const existing = findPluginNodeByPath(plugin, path);
        if (existing?.kind === "folder") return existing;
      }
      if (pluginDirectoryExists(plugin, path)) return pluginFolder(path);
      const previousEmptyFolders = [...plugin.emptyFolders];
      clearEmptyAncestors(plugin, path);
      plugin.emptyFolders.push(path);
      try {
        assertPluginToolNamesCompatible(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.emptyFolders = previousEmptyFolders;
        throw error;
      }
      return pluginFolder(path);
    },
    async importFile(
      pluginId: string,
      parentPath: string,
      name: string,
      content: unknown,
    ) {
      return this.createFile(pluginId, parentPath, { name, content });
    },
    async updateNode(
      pluginId: string,
      nodeId: string,
      patch: Partial<
        PluginNodeBase & {
          content: unknown;
          collapsed: boolean;
          order: number;
          insertion?: PluginFile["insertion"];
        }
      >,
    ) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      const node = plugin ? findPluginTreeNode(plugin, nodeId) : null;
      if (!plugin || !node) return;
      const previousFiles = clonePlain(plugin.files);
      const previousEmptyFolders = [...plugin.emptyFolders];
      if (
        !isFixedConventionPath(node.path) &&
        typeof patch.name === "string" &&
        patch.name.trim()
      ) {
        const nextName = patch.name.trim();
        const parentPath = pluginParentPath(node.path);
        const nextPath = joinPluginPath(parentPath, nextName);
        if (node.kind === "folder") {
          const prefix = `${node.path}/`;
          for (const other of plugin.files) {
            if (other.path.startsWith(prefix)) {
              other.path = `${nextPath}${other.path.slice(node.path.length)}`;
            }
          }
          plugin.emptyFolders = plugin.emptyFolders.map((folder) =>
            folder === node.path || folder.startsWith(prefix)
              ? `${nextPath}${folder.slice(node.path.length)}`
              : folder,
          );
        } else {
          node.path = nextPath;
          node.name = nextName;
        }
      }
      if (node.kind === "file" && typeof patch.icon === "string")
        node.icon = patch.icon;
      if (
        typeof patch.treeOrder === "number" &&
        Number.isFinite(patch.treeOrder)
      ) {
        node.treeOrder = Math.round(patch.treeOrder);
      }
      if (node.kind === "file" && "content" in patch) {
        node.content = clonePlain(patch.content);
      }
      if (
        node.kind === "file" &&
        typeof patch.order === "number" &&
        Number.isFinite(patch.order)
      ) {
        node.order = Math.round(patch.order);
      }
      if (node.kind === "file" && "insertion" in patch) {
        if (patch.insertion) {
          node.insertion = clonePlain(patch.insertion);
        } else {
          delete node.insertion;
        }
      }
      try {
        assertPluginToolNamesCompatible(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.files = previousFiles;
        plugin.emptyFolders = previousEmptyFolders;
        throw error;
      }
    },

    async deleteNode(pluginId: string, nodeId: string) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      const node = plugin ? findPluginTreeNode(plugin, nodeId) : null;
      if (!plugin || !node || isFixedConventionPath(node.path)) return;
      const prefix = `${node.path}/`;
      plugin.files = plugin.files.filter(
        (candidate) =>
          candidate.id !== nodeId && !candidate.path.startsWith(prefix),
      );
      plugin.emptyFolders = plugin.emptyFolders.filter(
        (folder) => folder !== node.path && !folder.startsWith(prefix),
      );
      keepParentIfEmpty(plugin, node.path);
      await this.persistPlugin(plugin);
    },
    async moveNode(
      pluginId: string,
      nodeId: string,
      targetFolderPath: string,
      _beforeNodeId?: string,
    ) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      const node = plugin ? findPluginTreeNode(plugin, nodeId) : null;
      if (
        !plugin ||
        !node ||
        !pluginDirectoryExists(plugin, targetFolderPath) ||
        isFixedConventionPath(node.path) ||
        (node.kind === "folder" && targetFolderPath.startsWith(`${node.path}/`))
      ) {
        return;
      }
      const previousFiles = clonePlain(plugin.files);
      const previousEmptyFolders = [...plugin.emptyFolders];
      const formerPath = node.path;
      const oldPrefix = `${node.path}/`;
      const nextPath = joinPluginPath(targetFolderPath, node.name);
      const collision = findPluginNodeByPath(plugin, nextPath);
      if (collision && collision.id !== node.id) return;
      if (targetFolderPath)
        clearEmptyAncestors(plugin, `${targetFolderPath}/occupied`);
      if (node.kind === "folder") {
        for (const other of plugin.files) {
          if (other.path.startsWith(oldPrefix)) {
            other.path = `${nextPath}${other.path.slice(oldPrefix.length - 1)}`;
          }
        }
        plugin.emptyFolders = plugin.emptyFolders.map((folder) =>
          folder === node.path || folder.startsWith(oldPrefix)
            ? `${nextPath}${folder.slice(node.path.length)}`
            : folder,
        );
      } else {
        node.path = nextPath;
      }
      keepParentIfEmpty(plugin, formerPath);
      try {
        assertPluginToolNamesCompatible(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.files = previousFiles;
        plugin.emptyFolders = previousEmptyFolders;
        throw error;
      }
    },
    openFileEditor(
      plugin: Plugin,
      file: PluginFile,
      path: string,
      mode: "preview" | "source" = "preview",
      context: Pick<
        ActivePluginFileEditorState,
        "conversationId"
      > = {},
    ) {
      if (
        this.activeEditorState &&
        this.activeEditorState.plugin.id === plugin.id &&
        (this.activeEditorState.file.id === file.id ||
          this.activeEditorState.path === path)
      ) {
        this.activeEditorState = null;
        return;
      }
      this.activeEditorState = {
        plugin,
        file,
        path,
        editorMode: mode,
        ...context,
      };
    },
    showFileEditor(
      plugin: Plugin,
      file: PluginFile,
      path: string,
      mode: "preview" | "source" = "preview",
      context: Pick<
        ActivePluginFileEditorState,
        "conversationId"
      > = {},
    ) {
      this.activeEditorState = {
        plugin,
        file,
        path,
        editorMode: mode,
        ...context,
      };
    },
    toggleFileEditor(
      plugin: Plugin,
      file: PluginFile,
      path: string,
      mode: "preview" | "source" = "preview",
      context: Pick<
        ActivePluginFileEditorState,
        "conversationId"
      > = {},
    ) {
      if (
        this.activeEditorState?.plugin.id === plugin.id &&
        (this.activeEditorState.file.id === file.id ||
          this.activeEditorState.path === path)
      ) {
        this.activeEditorState = null;
      } else {
        this.activeEditorState = {
          plugin,
          file,
          path,
          editorMode: mode,
          ...context,
        };
      }
    },
    closeFileEditor() {
      this.activeEditorState = null;
    },
  },
});

export type PluginBaseStore = ReturnType<typeof usePluginStateStore>;

/**
 * Returns either the persistent Plugin owner, or a conversation-local Plugin
 * view. The latter exposes the materialized tree and an API whose mutations
 * become ordered operations on that conversation's active message path.
 */
export function usePluginStore(pinia?: Pinia): PluginBaseStore;
export function usePluginStore(
  conversationId: MaybeRefOrGetter<string | null | undefined>,
): ReturnType<typeof createConversationPluginStore>;
export function usePluginStore(pinia?: Pinia): PluginBaseStore;
export function usePluginStore(
  conversationIdOrPinia?: MaybeRefOrGetter<string | null | undefined> | Pinia,
) {
  if (
    typeof conversationIdOrPinia === "string" ||
    typeof conversationIdOrPinia === "function" ||
    isRef(conversationIdOrPinia)
  ) {
    return createConversationPluginStore(
      usePluginStateStore(),
      conversationIdOrPinia,
    );
  }
  return usePluginStateStore(conversationIdOrPinia);
}
