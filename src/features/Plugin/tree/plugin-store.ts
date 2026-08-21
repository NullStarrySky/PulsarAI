import { isTauri } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { usePackageStore } from "@/features/Package/package-store";
import type { PluginConfig, PluginConfigValue } from "@/features/Plugin/editors/config/plugin-config";
import { createBuiltinPlugins } from "@/features/Plugin/tree/builtin-plugins";
import { parsePluginSlots, type PluginSlot, useSlotStore } from "@/features/Plugin/tree/slot-store";
import { backgroundPathSelectionOptions } from "@/features/Plugin/tree/plugin-path-selection";
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
  type PluginFolder,
  type PluginNodeBase,
  type PluginTreeNode,
  pluginChildNodes,
  pluginConventions,
  pluginFiles,
  pluginFileType,
  pluginParentPath,
  type ResolvedPluginAction,
  sortPluginTreeNodes,
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
}

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

function createFolderNode(
  path: string,
  input: Partial<PluginNodeBase> = {},
): PluginFolder {
  return {
    id: input.id ?? crypto.randomUUID(),
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    icon: input.icon ?? "",
    treeOrder: input.treeOrder ?? 0,
    kind: "folder",
    collapsed: false,
  };
}

function ensureParentFolders(
  plugin: Plugin,
  parentPath: string,
): PluginFolder | null {
  const normalized = parentPath.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) return null;
  const segments = normalized.split("/").filter(Boolean);
  let currentPath = "";
  let lastFolder: PluginFolder | null = null;
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    let existing = findPluginNodeByPath(plugin, currentPath);
    if (!existing) {
      const parentOfCurrent = pluginParentPath(currentPath);
      const siblings = pluginChildNodes(plugin, parentOfCurrent);
      existing = createFolderNode(currentPath, {
        treeOrder:
          Math.max(-1, ...siblings.map((child) => child.treeOrder ?? -1)) + 1,
      });
      plugin.nodes.push(existing);
    } else if (existing.kind !== "folder") {
      return null;
    }
    lastFolder = existing as PluginFolder;
  }
  return lastFolder;
}

function createStarterNodes(): PluginTreeNode[] {
  return [
    createFileNode(
      pluginConventions.config,
      {
        model: {
          renderer: {
            name: "ModelSelect",
            title: "模型",
            description: "留空时继承全局默认模型；引用可附带思考强度。",
          },
          value: null,
        },
        background: {
          renderer: {
            name: "PathSelect",
            title: "会话背景",
            description: "从 background slot 选择扩展名无关的路径 ID。",
            slotId: "background",
            allowEmpty: true,
          },
          value: "background/classroom",
        },
      },
      { treeOrder: 0 },
    ),
    createSlotDefinitionsNode(
      [
        {
          id: "generatePath",
          title: "生成入口",
          scope: "global",
          description: "注册生成流程入口脚本。",
          contentSuffixes: ["js"],
          selectionMode: "single",
          overrideStrategy: "override",
        },
        {
          id: "context",
          title: "会话上下文",
          scope: "local",
          description: "角色设定与会话生成所需的共享上下文。",
          contentSuffixes: ["md", "chat.json"],
          selectionMode: "none",
          overrideStrategy: "override",
        },
      ],
      { treeOrder: 2 },
    ),
    createFileNode(pluginConventions.regex, [], {
      treeOrder: 3,
      insertion: { slot: "REGEX" },
    }),
    createFileNode("default.chat.json", createDefaultContextDocument(), {
      treeOrder: 4,
    }),
    createFileNode(
      "instruction/default.md",
      [
        "You are Pulsar's conversation agent.",
        "Use the single codeAct tool for API work and keep the final answer grounded in the referenced context.",
        "Every codeAct call must be one function with an explicit return.",
        "Inspect Plugin slots through slot and keep selection, transformation, and templates in explicit resources.",
      ].join("\n"),
      { treeOrder: 0 },
    ),
    createFileNode("generate.js", createDefaultGenerateSource(), {
      treeOrder: 6,
      insertion: { slot: "generatePath" },
    }),
    createFileNode(
      "character/default.md",
      "保持清晰、可靠，并尊重当前对话上下文。",
      { treeOrder: 0, insertion: { slot: "context" } },
    ),
    createFolderNode(pluginConventions.componentsFolder, { treeOrder: 7 }),
    createFolderNode(pluginConventions.backgroundFolder, { treeOrder: 8 }),
    createFolderNode(pluginConventions.cacheFolder, { treeOrder: 8.5 }),
    createFolderNode(pluginConventions.tempFolder, { treeOrder: 8.6 }),
    createFolderNode("character", { treeOrder: 9 }),
    createFolderNode("instruction", { treeOrder: 5 }),
    createFolderNode(pluginConventions.toolsFolder, { treeOrder: 10 }),
    createFolderNode(pluginConventions.actionFolder, { treeOrder: 11 }),
  ];
}

function createDefaultContextDocument() {
  return {
    message: [{ role: "system", content: "[[ chat ]]" }],
  };
}

function createDefaultGenerateSource() {
  return [
    'const messages = [...bootstrapMessages, ...compileChat(imports("./default.chat.json"))];',
    "const runner = new agent.ToolLoopAgent({ container: reply });",
    "await runner.stream({ messages });",
  ].join("\n");
}

function createSlotDefinitionsNode(
  slots: PluginSlot[] = [],
  input: Partial<PluginNodeBase> = {},
) {
  return createFileNode(
    pluginConventions.slots,
    { slots: structuredClone(slots) },
    input,
  );
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

function cloneStarterNodes(nodes: PluginTreeNode[]): PluginTreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "folder") {
      return {
        id: crypto.randomUUID(),
        path: node.path,
        name: node.name,
        icon: node.icon,
        treeOrder: node.treeOrder,
        kind: "folder",
        collapsed: node.collapsed,
      };
    }
    return {
      id: crypto.randomUUID(),
      path: node.path,
      name: node.name,
      icon: node.icon,
      treeOrder: node.treeOrder,
      kind: "file",
      content: structuredClone(node.content),
      order: node.order,
      ...(node.insertion ? { insertion: structuredClone(node.insertion) } : {}),
    };
  });
}

function createStarterPlugin(
  packageId: string | null,
  global = false,
  existingPlugins: Plugin[] = [],
): Plugin {
  const name = global ? "新全局插件" : "新插件";
  const defaultTemplate =
    existingPlugins.find((item) => item.id === builtinDefaultPluginId) ??
    createBuiltinPlugins().find((item) => item.id === builtinDefaultPluginId);
  const starterNodes = defaultTemplate
    ? cloneStarterNodes(defaultTemplate.nodes)
    : createStarterNodes();
  return {
    id: availablePluginId(
      existingPlugins,
      global ? "global-plugin" : "character-plugin",
    ),
    packageId,
    name,
    icon: "",
    shortDescription: "",
    nodes: starterNodes,
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

function configuredBackground(plugin: Plugin) {
  const config = configNode(plugin);
  const value = config?.content && typeof config.content === "object"
    ? (config.content as PluginConfig).background?.value
    : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clearConfiguredBackground(plugin: Plugin) {
  const config = configNode(plugin);
  if (!config?.content || typeof config.content !== "object") return false;
  const entry = (config.content as PluginConfig).background;
  if (!entry) return false;
  entry.value = null;
  return true;
}

function normalizePluginNode(value: unknown): PluginTreeNode | null {
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

  if (source.kind === "folder") {
    return {
      ...base,
      kind: "folder",
      collapsed: source.collapsed === true,
    };
  }

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
    Array.isArray(source.nodes)
  );
}

function normalizePlugin(value: Plugin): Plugin {
  const seenPaths = new Set<string>();
  const nodes: PluginTreeNode[] = [];
  for (const raw of value.nodes) {
    const node = normalizePluginNode(raw);
    if (!node || seenPaths.has(node.path)) continue;
    seenPaths.add(node.path);
    nodes.push(node);
  }
  if (!nodes.length) {
    throw new Error("插件根目录无效");
  }
  nodes.sort((left, right) => left.path.localeCompare(right.path));
  return {
    id: value.id,
    packageId: value.packageId ?? null,
    name: value.name.trim() || "未命名插件",
    icon: typeof value.icon === "string" ? value.icon : "",
    shortDescription:
      typeof value.shortDescription === "string" ? value.shortDescription : "",
    nodes,
    enabled: value.enabled !== false,
    builtIn: value.builtIn === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeBuiltinSlots(source: unknown, persisted: unknown) {
  if (!isRecord(source) || !isRecord(persisted)) return clonePlain(persisted);
  const sourceSlots = Array.isArray(source.slots)
    ? source.slots
    : [];
  const persistedSlots = Array.isArray(persisted.slots)
    ? persisted.slots
    : [];
  const persistedById = new Map(
    persistedSlots.flatMap((item) =>
      isRecord(item) && typeof item.id === "string"
        ? [[item.id, item] as const]
        : [],
    ),
  );
  const merged = sourceSlots.map((item) => {
    const id = isRecord(item) && typeof item.id === "string" ? item.id : "";
    return clonePlain(
      id && persistedById.has(id) ? persistedById.get(id)! : item,
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

function isKnownInvalidBuiltinProcessScript(content: unknown) {
  if (typeof content !== "string") return false;
  const legacySource = [
    'const goalState = read("@/goal/goal.data");',
    'if (!String(goalState || "").trim()) {',
    '  await reply.setContent("当前没有可执行的 goal。先使用 /goal 设置目标和待办。");',
    "  return;",
    "}",
    "const messages = [",
    "  ...bootstrapMessages,",
    "  {",
    '    role: "system",',
    "    content: [",
    '      "依据下面的 goal.data 执行一个最小、可见、可回应的下一步。",',
    '      "完成后用 edit 更新完成项、事实和下一步；保持 Markdown 清晰。",',
    '      "不得替玩家做选择、行动、内心或不可逆结果。若下一步需要玩家决定，给出场景状态或选项并在 goal.data 标明等待。",',
    '      "goal.data：\\n" + goalState,',
    '    ].join("\\n\\n"),',
    "  },",
    "];",
    "const runner = new agent.ToolLoopAgent({ container: reply });",
    "await runner.stream({ messages });",
  ].join("\n");
  return content.replace(/\r\n/g, "\n").trim() === legacySource;
}

function mergeBuiltinPlugin(bundled: Plugin, persisted: Plugin): Plugin {
  const savedByPath = new Map(persisted.nodes.map((node) => [node.path, node]));
  const bundledPaths = new Set(bundled.nodes.map((node) => node.path));
  const nodes: PluginTreeNode[] = [
    ...bundled.nodes.map((node) => {
      const saved = savedByPath.get(node.path);
      if (!saved || saved.kind !== node.kind) return clonePlain(node);
      if (node.kind === "file" && saved.kind === "file") {
        let content = clonePlain(saved.content);
        if (node.path === pluginConventions.slots) {
          content = mergeBuiltinSlots(
            node.content,
            saved.content,
          );
        } else if (
          node.path === "default.chat.json" &&
          isLegacyBuiltinDefaultChat(saved.content)
        ) {
          content = clonePlain(node.content);
        } else if (
          node.path === "action/process.js" &&
          isKnownInvalidBuiltinProcessScript(saved.content)
        ) {
          content = clonePlain(node.content);
        } else if (pluginFileType(node.name) === "media") {
          content = clonePlain(node.content);
        }
        return { ...clonePlain(node), ...clonePlain(saved), content };
      }
      return { ...clonePlain(node), ...clonePlain(saved) };
    }),
    ...persisted.nodes
      .filter((node) => !bundledPaths.has(node.path))
      .map((node) => clonePlain(node)),
  ];
  return {
    ...clonePlain(bundled),
    ...clonePlain(persisted),
    id: bundled.id,
    packageId: null,
    builtIn: true,
    nodes,
  };
}

function removeCancelledOverride(plugin: Plugin) {
  const before = plugin.nodes.length;
  plugin.nodes = plugin.nodes.filter(
    (node) => node.path.trim().toLocaleLowerCase() !== "override.vue",
  );
  let changed = plugin.nodes.length !== before;
  if (plugin.builtIn) {
    const slots = findPluginNodeByPath(
      plugin,
      pluginConventions.slots,
    );
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

function pluginNamespaceNames(plugin: Plugin) {
  const toolsPrefix = `${pluginConventions.toolsFolder}/`;
  const toolNames = [
    ...new Set(
      plugin.nodes
        .filter(
          (node) =>
            node.kind === "file" &&
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
        plugin.nodes.some(
          (node) => node.path === entry && node.kind === "file",
        ) &&
        plugin.nodes.some(
          (node) => node.path === prompt && node.kind === "file",
        )
      );
    })
    .map((toolPath) =>
      toolPath.slice(toolsPrefix.length).trim().toLocaleLowerCase(),
    );
  const slots = findPluginNodeByPath(plugin, pluginConventions.slots);
  const actionNames = pluginFiles(plugin)
    .filter(
      (file) =>
        file.insertion?.slot === "COMMAND" &&
        ["javascript", "markdown", "component"].includes(
          pluginFileType(file.name),
        ),
    )
    .map((file) =>
      file.name
        .replace(/\.[^.]+$/, "")
        .trim()
        .toLocaleLowerCase(),
    )
    .filter(Boolean);
  const globalSlotNames = (slots?.kind === "file" ? parsePluginSlots(slots.content) : [])
    .filter((slot) => slot.scope === "global")
    .map((slot) => slot.id.trim().toLocaleLowerCase());
  for (const [label, names] of [
    ["Action", actionNames],
    ["自定义工具", toolNames],
    ["全局 Slot", globalSlotNames],
  ] as const) {
    const seen = new Set<string>();
    const duplicate = names.find((name) => {
      if (seen.has(name)) return true;
      seen.add(name);
      return false;
    });
    if (duplicate) {
      throw new Error(`${label} 名称冲突：${duplicate}（${plugin.name}）`);
    }
  }
  return {
    actions: new Set(actionNames),
    tools: new Set(toolNames),
    globalContainers: new Set(globalSlotNames),
  };
}

function assertPluginNamespaceCompatibility(plugins: Plugin[]) {
  const indexed = plugins.map((plugin) => ({
    plugin,
    names: pluginNamespaceNames(plugin),
  }));
  for (let leftIndex = 0; leftIndex < indexed.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < indexed.length;
      rightIndex += 1
    ) {
      const left = indexed[leftIndex]!;
      const right = indexed[rightIndex]!;
      if (
        left.plugin.packageId !== null &&
        right.plugin.packageId !== null &&
        left.plugin.packageId !== right.plugin.packageId
      )
        continue;
      for (const [label, key] of [
        ["Action", "actions"],
        ["自定义工具", "tools"],
        ["全局容器", "globalContainers"],
      ] as const) {
        const collision = [...left.names[key]].find((name) =>
          right.names[key].has(name),
        );
        if (collision) {
          throw new Error(
            `${label} 名称冲突：${collision}（${left.plugin.name} / ${right.plugin.name}）`,
          );
        }
      }
    }
  }
}

function pluginStateItems(state: unknown) {
  return (state as { plugins: Plugin[] }).plugins;
}

function setPluginStateItems(state: unknown, plugins: Plugin[]) {
  (state as { plugins: Plugin[] }).plugins = plugins;
}

export const usePluginStore = defineStore("plugin-resource", {
  state: () => ({
    loaded: false,
    loadError: "",
    activePluginId: "",
    search: "",
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
    activeBackgroundResourceForPackage(): (
      packageId?: string | null,
      enabledGlobalPluginIds?: string[],
      mainPluginId?: string,
    ) => PluginFile | null {
      return (
        packageId?: string | null,
        enabledGlobalPluginIds: string[] = [],
        mainPluginId?: string,
      ) => {
        const enabled = this.enabledPluginsForPackage(
          packageId,
          enabledGlobalPluginIds,
          mainPluginId,
        );
        const slotStore = useSlotStore();
        const bgSlot = slotStore.getSlot(
          "background",
          "global",
          enabled,
        );
        if (!bgSlot || !bgSlot.resources.length) return null;
        const firstResource = bgSlot.resources[0]!;
        const targetPlugin = enabled.find(
          (p) => p.id === firstResource.pluginId,
        );
        if (!targetPlugin) return null;
        const node = findPluginNodeByPath(
          targetPlugin,
          firstResource.path.replace(/^\//, ""),
        );
        return node?.kind === "file" ? node : null;
      };
    },
    actionResourcesForPackage(): (
      packageId?: string | null,
      enabledGlobalPluginIds?: string[],
      mainPluginId?: string,
    ) => ResolvedPluginAction[] {
      return (
        packageId?: string | null,
        enabledGlobalPluginIds: string[] = [],
        mainPluginId?: string,
      ) => {
        const claimedNames = new Set<string>();
        const actions: ResolvedPluginAction[] = [];
        const enabledPlugins = this.enabledPluginsForPackage(
          packageId,
          enabledGlobalPluginIds,
          mainPluginId,
        );
        const slotStore = useSlotStore();
        const commandSlot = slotStore.getSlot(
          "COMMAND",
          "global",
          enabledPlugins,
        );
        for (const entry of commandSlot?.resources ?? []) {
          const plugin = enabledPlugins.find(
            (item) => item.id === entry.pluginId,
          );
          const resource = plugin
            ? pluginFiles(plugin).find((item) => item.id === entry.id)
            : undefined;
          if (!plugin || !resource) continue;
          const commandName = resource.name
            .replace(/\.[^.]+$/, "")
            .trim()
            .toLocaleLowerCase();
          const type = pluginFileType(resource.name);
          if (
            (type !== "javascript" &&
              type !== "markdown" &&
              type !== "component") ||
            !commandName
          ) {
            continue;
          }
          if (claimedNames.has(commandName)) {
            throw new Error(
              `Action 名称冲突：${commandName}（${plugin.name}/${resource.name}）`,
            );
          }
          claimedNames.add(commandName);
          actions.push({
            pluginId: plugin.id,
            pluginName: plugin.name,
            kind:
              type === "markdown"
                ? "prompt"
                : type === "component"
                  ? "view"
                  : "process",
            resource: {
              ...resource,
              name: resource.name.replace(/\.[^.]+$/, ""),
            },
          });
        }
        return actions;
      };
    },
  },
  actions: {
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
      if (!isTauri()) {
        this.activePluginId = bundledPlugins[0]?.id ?? "";
        this.loaded = true;
        return;
      }
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
      await this.pruneInvalidBackgroundSelections();
      this.activePluginId = this.sortedPlugins[0]?.id ?? "";
      this.loaded = true;
    },
    async persistPlugin(plugin: Plugin) {
      if (!isTauri()) return;
      await savePersistedPlugin(clonePlain(plugin));
    },
    async searchPluginNodes(query: string, limit = 40) {
      await this.initialize();
      return searchPersistedPluginNodes(query, limit);
    },
    async pruneInvalidBackgroundSelections() {
      const builtin = pluginStateItems(this).find(
        (plugin) => plugin.id === builtinCorePluginId,
      );
      if (!builtin) return;
      const selection = configuredBackground(builtin);
      if (!selection) return;
      const exists = backgroundPathSelectionOptions(
        pluginStateItems(this),
      ).some((candidate) => candidate.value === selection);
      if (!exists && clearConfiguredBackground(builtin))
        await this.persistPlugin(builtin);
    },
    openPlugin(pluginId: string) {
      if (pluginStateItems(this).some((plugin) => plugin.id === pluginId)) {
        this.activePluginId = pluginId;
      }
    },
    async createPlugin(packageId: string) {
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
      assertPluginNamespaceCompatibility([...pluginStateItems(this), plugin]);
      pluginStateItems(this).push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async updatePlugin(
      pluginId: string,
      patch: Partial<Omit<Plugin, "id" | "nodes" | "builtIn">>,
    ) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      if (!plugin) return;
      Object.assign(plugin, patch);
      await this.persistPlugin(plugin);
    },
    async setConfigValue(pluginId: string, key: string, value: PluginConfigValue) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      const config = plugin ? configNode(plugin) : null;
      if (!plugin || !config || !config.content || typeof config.content !== "object") {
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
      await this.pruneInvalidBackgroundSelections();
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
      const parent = parentPath
        ? (findPluginNodeByPath(plugin, parentPath) ??
          ensureParentFolders(plugin, parentPath))
        : null;
      if (parentPath && parent?.kind !== "folder") return null;
      const path = joinPluginPath(parentPath, name);
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
      const siblings = pluginChildNodes(plugin, parentPath);
      const file = createFileNode(path, input.content ?? "", {
        treeOrder:
          Math.max(-1, ...siblings.map((child) => child.treeOrder ?? -1)) + 1,
        order:
          typeof input.order === "number" && Number.isFinite(input.order)
            ? Math.round(input.order)
            : 100,
        insertion:
          input.insertion ??
          (parentPath === pluginConventions.actionFolder &&
          ["javascript", "markdown", "component"].includes(pluginFileType(name))
            ? { slot: "COMMAND" }
            : undefined),
      });
      const previousNodes = clonePlain(plugin.nodes);
      plugin.nodes.push(file);
      if (parent?.kind === "folder") parent.collapsed = false;
      try {
        assertPluginNamespaceCompatibility(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.nodes = previousNodes;
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
      const parent = parentPath
        ? (findPluginNodeByPath(plugin, parentPath) ??
          ensureParentFolders(plugin, parentPath))
        : null;
      if (parentPath && parent?.kind !== "folder") return null;
      const path = joinPluginPath(parentPath, trimmed);
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
      const siblings = pluginChildNodes(plugin, parentPath);
      const folder = createFolderNode(path, {
        treeOrder:
          Math.max(-1, ...siblings.map((child) => child.treeOrder ?? -1)) + 1,
      });
      const previousNodes = clonePlain(plugin.nodes);
      plugin.nodes.push(folder);
      if (parent?.kind === "folder") parent.collapsed = false;
      try {
        assertPluginNamespaceCompatibility(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.nodes = previousNodes;
        throw error;
      }
      return folder;
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
      const previousNodes = clonePlain(plugin.nodes);
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
          for (const other of plugin.nodes) {
            if (other.path.startsWith(prefix)) {
              other.path = `${nextPath}${other.path.slice(node.path.length)}`;
            }
          }
        }
        node.path = nextPath;
        node.name = nextName;
      }
      if (typeof patch.icon === "string") node.icon = patch.icon;
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
      if (node.kind === "folder" && typeof patch.collapsed === "boolean") {
        node.collapsed = patch.collapsed;
      }
      try {
        assertPluginNamespaceCompatibility(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.nodes = previousNodes;
        throw error;
      }
      await this.pruneInvalidBackgroundSelections();
    },

    async deleteNode(pluginId: string, nodeId: string) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      const node = plugin ? findPluginTreeNode(plugin, nodeId) : null;
      if (!plugin || !node || isFixedConventionPath(node.path)) return;
      const prefix = `${node.path}/`;
      plugin.nodes = plugin.nodes.filter(
        (candidate) =>
          candidate.id !== nodeId && !candidate.path.startsWith(prefix),
      );
      await this.persistPlugin(plugin);
      await this.pruneInvalidBackgroundSelections();
    },
    async moveNode(
      pluginId: string,
      nodeId: string,
      targetFolderPath: string,
      beforeNodeId?: string,
    ) {
      const plugin = pluginStateItems(this).find(
        (item) => item.id === pluginId,
      );
      const node = plugin ? findPluginTreeNode(plugin, nodeId) : null;
      const target = targetFolderPath
        ? findPluginNodeByPath(plugin!, targetFolderPath)
        : null;
      if (
        !plugin ||
        !node ||
        (targetFolderPath && target?.kind !== "folder") ||
        isFixedConventionPath(node.path) ||
        (node.kind === "folder" && targetFolderPath.startsWith(`${node.path}/`))
      ) {
        return;
      }
      const previousNodes = clonePlain(plugin.nodes);
      const oldPrefix = `${node.path}/`;
      const nextPath = joinPluginPath(targetFolderPath, node.name);
      if (
        plugin.nodes.some(
          (candidate) =>
            candidate.path === nextPath && candidate.id !== node.id,
        )
      ) {
        return;
      }
      node.path = nextPath;
      if (node.kind === "folder") {
        for (const other of plugin.nodes) {
          if (other.path.startsWith(oldPrefix)) {
            other.path = `${nextPath}${other.path.slice(oldPrefix.length - 1)}`;
          }
        }
      }
      const siblings = sortPluginTreeNodes(
        pluginChildNodes(plugin, targetFolderPath).filter(
          (child) => child.id !== node.id,
        ),
      );
      const beforeIndex = beforeNodeId
        ? siblings.findIndex((child) => child.id === beforeNodeId)
        : -1;
      siblings.splice(beforeIndex < 0 ? siblings.length : beforeIndex, 0, node);
      siblings.forEach((child, index) => {
        child.treeOrder = index;
      });
      if (target?.kind === "folder") target.collapsed = false;
      try {
        assertPluginNamespaceCompatibility(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.nodes = previousNodes;
        throw error;
      }
      await this.pruneInvalidBackgroundSelections();
    },
    openFileEditor(
      plugin: Plugin,
      file: PluginFile,
      path: string,
      mode: "preview" | "source" = "preview",
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
      this.activeEditorState = { plugin, file, path, editorMode: mode };
    },
    closeFileEditor() {
      this.activeEditorState = null;
    },
  },
});
