import { defineStore } from "pinia";
import { isTauri } from "@tauri-apps/api/core";
import {
  deletePersistedPlugin,
  loadPersistedPlugins,
  savePersistedPlugin,
  searchPersistedPluginNodes,
} from "@/features/Resources/Plugin/application/plugin-persistence";
import {
  findPluginNodeByPath,
  findPluginChildByName,
  findPluginTreeNode,
  findPluginTreeParent,
  flattenPluginFiles,
  pluginConventions,
  pluginFileType,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFile,
  type PluginFolder,
  type PluginTreeNode,
  type PluginTreeNodeBase,
  type ResolvedPluginAction,
} from "@/features/Resources/Plugin/domain/plugin-types";
import {
  parsePluginContainerDefinitions,
  type PluginContainerDeclaration,
} from "@/features/Resources/Plugin/domain/plugin-reference";
import {
  pluginManifestFixedValue,
  parsePluginManifest,
  setPluginManifestFixedValue,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import { createBuiltinPlugins } from "@/features/Resources/Plugin/application/builtin-plugins";

export const builtinCorePluginId = "builtin-core-plugin";
let initializePromise: Promise<void> | null = null;

function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function createNodeBase(
  name: string,
  input: Partial<PluginTreeNodeBase> = {},
): PluginTreeNodeBase {
  return {
    id: input.id ?? crypto.randomUUID(),
    name,
    icon: input.icon ?? "",
    treeOrder: input.treeOrder ?? 0,
  };
}

function createFile(
  name: string,
  content: unknown = "",
  input: Partial<PluginTreeNodeBase> & {
    order?: number;
    insertion?: PluginFile["insertion"];
  } = {},
): PluginFile {
  return {
    ...createNodeBase(name, input),
    kind: "file",
    order: input.order ?? 100,
    ...(input.insertion ? { insertion: clonePlain(input.insertion) } : {}),
    content: clonePlain(content),
  };
}

function createFolder(
  name: string,
  children: PluginTreeNode[] = [],
  input: Partial<PluginTreeNodeBase> = {},
): PluginFolder {
  return {
    ...createNodeBase(name, input),
    kind: "folder",
    children,
    collapsed: false,
  };
}

function createStarterRoot(): PluginFolder {
  return createFolder("/", [
    createFile(pluginConventions.manifest, [
      {
        group: { id: "runtime", title: "运行" },
        content: [{
          id: "generatePath",
          title: "生成流程",
          description: "主插件执行的 JavaScript 文件路径。",
          component: "Input",
          value: "generate.js",
        }],
      },
      {
        group: { id: "generation", title: "生成" },
        content: [
          {
            id: "model",
            title: "模型",
            description: "留空时继承全局默认模型；引用可附带思考强度。",
            component: "ModelSelect",
            value: null,
          },
        ],
      },
      {
        group: { id: "appearance", title: "外观" },
        content: [{
          id: "background",
          title: "会话背景",
          description: "留空时读取内置插件的背景配置。",
          component: "MediaSelect",
          value: null,
        }],
      },
    ], { treeOrder: 0 }),
    createContainerDefinitionsFile([
      {
        id: "context",
        title: "会话上下文",
        scope: "local",
        description: "角色设定与会话生成所需的共享上下文。",
        contentSuffixes: ["md", "chat.json"],
      },
    ], { treeOrder: 2 }),
    createFile(pluginConventions.regex, [], {
      treeOrder: 3,
      insertion: { target: "REGEX" },
    }),
    createFile(
      "default.chat.json",
      createDefaultContextDocument(),
      { treeOrder: 4 },
    ),
    createFolder("instruction", [
      createFile(
        "default.md",
        [
          "You are Pulsar's conversation agent.",
          "Use the single codeAct tool for API work and keep the final answer grounded in the referenced context.",
          "Every codeAct call must be one function with an explicit return.",
          "Call readDocs() before using an unfamiliar Feature API; blocked entries are not callable.",
          "Read the custom tool documentation block and call plugin functions through ctx.tools when relevant.",
          "Inspect pure Plugin containers through ctx.containers and keep selection, transformation, and templates in explicit resources.",
          "When a real user decision is required, call agent.askUser(...) or api.askUser(...) inside codeAct and continue from its result.",
        ].join("\n"),
        { treeOrder: 0 },
      ),
    ], { treeOrder: 5 }),
    createFile("generate.js", createDefaultGenerateSource(), { treeOrder: 6 }),
    createFolder(pluginConventions.componentsFolder, [], { treeOrder: 7 }),
    createFolder(pluginConventions.backgroundFolder, [], { treeOrder: 8 }),
    createFolder("character", [
      createFile(
        "default.md",
        "保持清晰、可靠，并尊重当前对话上下文。",
        {
          treeOrder: 0,
          insertion: { target: "context" },
        },
      ),
    ], { treeOrder: 9 }),
    createFolder(pluginConventions.toolsFolder, [], { treeOrder: 10 }),
    createFolder(pluginConventions.actionFolder, [], { treeOrder: 11 }),
  ], { id: crypto.randomUUID() });
}

function createDefaultContextDocument() {
  return {
    message: [
      { role: "system", content: '[[ chat ]]' },
    ],
  };
}

function createDefaultGenerateSource() {
  return [
    'const messages = [...bootstrapMessages, ...compileChat(imports.resource("./default.chat.json"))];',
    "const runtime = await agent.prepare();",
    "const runner = new agent.ToolLoopAgent({",
    "  model: runtime.model, reasoning: runtime.reasoning, allowSystemInMessages: true,",
    "  instructions: runtime.instructions, tools: runtime.tools,",
    "  stopWhen: runtime.stopWhen, onStepStart: runtime.onStepStart,",
    "});",
    "try {",
    "  await reply.setModelName(runtime.modelName);",
    "  const result = await runner.stream({ messages });",
    "  let thinking = \"\";",
    "  for await (const part of result.stream) {",
    "    if (part.type === \"text-delta\") {",
    "      await reply.appendContent(part.text);",
    "    } else if (part.type === \"reasoning-start\") {",
    "      thinking = \"\";",
    "    } else if (part.type === \"reasoning-delta\") {",
    "      thinking += part.text;",
    "    } else if (part.type === \"reasoning-end\" && thinking.trim()) {",
    "      await reply.addStep({ name: \"thinking\", message: thinking });",
    "      thinking = \"\";",
    "    } else if (part.type === \"error\") {",
    "      throw part.error instanceof Error ? part.error : new Error(String(part.error));",
    "    } else if (part.type === \"abort\") {",
    "      throw new Error(part.reason || \"生成已中止。\");",
    "    }",
    "  }",
    "  if (thinking.trim()) {",
    "    await reply.addStep({ name: \"thinking\", message: thinking });",
    "  }",
    "} finally { await runtime.finish(); }",
  ].join("\n");
}

function createContainerDefinitionsFile(
  containers: PluginContainerDeclaration[] = [],
  input: Partial<PluginTreeNodeBase> = {},
) {
  return createFile(
    pluginConventions.containers,
    { containers: structuredClone(containers) },
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
    throw new Error("插件 ID 必须是一个有效的顶层路径名称，不能包含斜杠或控制字符。");
  }
}

function createStarterPlugin(
  packageId: string | null,
  global = false,
  existingPlugins: Plugin[] = [],
): Plugin {
  const name = global ? "新全局插件" : "新插件";
  return {
    id: availablePluginId(existingPlugins, global ? "global-plugin" : "character-plugin"),
    packageId,
    name,
    icon: "",
    shortDescription: "",
    root: createStarterRoot(),
    enabled: true,
    builtIn: false,
  };
}

function comparePlugins(a: Plugin, b: Plugin) {
  return a.name.localeCompare(b.name, "zh-Hans") || a.id.localeCompare(b.id);
}

function configuredBackground(plugin: Plugin) {
  const manifest = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
  if (manifest?.kind !== "file") return null;
  const parsed = parsePluginManifest(manifest.content);
  let value: unknown;
  try {
    value = pluginManifestFixedValue(parsed.manifest, "background");
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const pluginId = (value as Record<string, unknown>).pluginId;
  const path = (value as Record<string, unknown>).path;
  return typeof pluginId === "string" && pluginId.trim()
    && typeof path === "string" && path.trim()
    ? { pluginId: pluginId.trim(), path: path.trim() }
    : null;
}

function clearConfiguredBackground(plugin: Plugin) {
  const manifest = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
  if (manifest?.kind !== "file") return false;
  const parsed = parsePluginManifest(manifest.content);
  try {
    setPluginManifestFixedValue(parsed.manifest, "background", null);
    manifest.content = parsed.manifest;
    return true;
  } catch {
    return false;
  }
}

function normalizeTreeNode(value: unknown, treeOrder = 0): PluginTreeNode | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<PluginTreeNode> & {
    children?: unknown;
    content?: unknown;
    insertion?: unknown;
    order?: unknown;
  };
  const name = typeof source.name === "string" && source.name.trim()
    ? source.name.trim()
    : source.kind === "folder"
      ? "新文件夹"
      : "untitled.md";
  const base = createNodeBase(name, {
    id: typeof source.id === "string" ? source.id : crypto.randomUUID(),
    icon: typeof source.icon === "string" ? source.icon : "",
    treeOrder: typeof source.treeOrder === "number" ? source.treeOrder : treeOrder,
  });

  if (source.kind === "folder") {
    const children = Array.isArray(source.children)
      ? source.children.flatMap((child, index) => {
          const normalized = normalizeTreeNode(child, index);
          return normalized ? [normalized] : [];
        })
      : [];
    return {
      ...base,
      kind: "folder",
      children,
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
    ...(source.insertion && typeof source.insertion === "object" && !Array.isArray(source.insertion)
      && typeof (source.insertion as { target?: unknown }).target === "string"
      && (source.insertion as { target: string }).target.trim()
      ? {
          insertion: {
            target: (source.insertion as { target: string }).target.trim(),
            ...(typeof (source.insertion as { condition?: unknown }).condition === "string"
              && (source.insertion as { condition: string }).condition.trim()
              ? { condition: (source.insertion as { condition: string }).condition.trim() }
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
    typeof source.id === "string"
    && typeof source.name === "string"
    && source.root?.kind === "folder"
    && Array.isArray(source.root.children)
  );
}

function normalizePlugin(value: Plugin): Plugin {
  const root = normalizeTreeNode(value.root);
  if (!root || root.kind !== "folder") {
    throw new Error("插件根目录无效");
  }
  return {
    id: value.id,
    packageId: value.packageId ?? null,
    name: value.name.trim() || "未命名插件",
    icon: typeof value.icon === "string" ? value.icon : "",
    shortDescription:
      typeof value.shortDescription === "string" ? value.shortDescription : "",
    root,
    enabled: value.enabled !== false,
    builtIn: value.builtIn === true,
  };
}

function removeCancelledOverride(plugin: Plugin) {
  const before = plugin.root.children.length;
  plugin.root.children = plugin.root.children.filter(
    (node) => node.name.trim().toLocaleLowerCase() !== "override.vue",
  );
  let changed = plugin.root.children.length !== before;
  if (plugin.builtIn) {
    const containers = findPluginNodeByPath(plugin.root, pluginConventions.containers);
    if (containers?.kind === "file" && containers.content && typeof containers.content === "object") {
      const content = containers.content as { containers?: unknown };
      if (Array.isArray(content.containers)) {
        const filtered = content.containers.filter(
          (item) => !item || typeof item !== "object" || (item as { id?: unknown }).id !== "OVERRIDE",
        );
        if (filtered.length !== content.containers.length) {
          content.containers = filtered;
          changed = true;
        }
      }
    }
  }
  return changed;
}

function isFixedConventionNode(plugin: Plugin, nodeId: string) {
  return [
    pluginConventions.manifest,
    pluginConventions.containers,
    pluginConventions.regex,
    pluginConventions.componentsFolder,
    pluginConventions.toolsFolder,
  ].some(
    (path) => findPluginNodeByPath(plugin.root, path)?.id === nodeId,
  );
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
  const actions = findPluginNodeByPath(plugin.root, pluginConventions.actionFolder);
  const tools = findPluginNodeByPath(plugin.root, pluginConventions.toolsFolder);
  const containers = findPluginNodeByPath(plugin.root, pluginConventions.containers);
  const actionNames = actions?.kind === "folder"
    ? flattenPluginFiles(actions)
      .filter((file) => ["javascript", "markdown"].includes(pluginFileType(file.name)))
      .map((file) => file.name.replace(/\.[^.]+$/, "").trim().toLocaleLowerCase())
      .filter(Boolean)
    : [];
  const toolNames = tools?.kind === "folder"
    ? tools.children.flatMap((child) =>
      child.kind === "folder"
      && findPluginChildByName(child, pluginConventions.toolEntry)?.kind === "file"
      && findPluginChildByName(child, pluginConventions.toolPrompt)?.kind === "file"
        ? [child.name.trim().toLocaleLowerCase()]
        : []
    )
    : [];
  const parsedContainers = containers?.kind === "file"
    ? parsePluginContainerDefinitions(containers.content)
    : { containers: [], diagnostics: [] };
  if (parsedContainers.diagnostics.length) {
    const diagnostic = parsedContainers.diagnostics[0]!;
    throw new Error(
      `containers.json 无效：${diagnostic.path}：${diagnostic.message}（${plugin.name}）`,
    );
  }
  const globalContainerNames = parsedContainers.containers
    .filter((container) => container.scope === "global")
    .map((container) => container.id.trim().toLocaleLowerCase());
  for (const [label, names] of [
    ["Action", actionNames],
    ["自定义工具", toolNames],
    ["全局容器", globalContainerNames],
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
    globalContainers: new Set(globalContainerNames),
  };
}

function assertPluginNamespaceCompatibility(plugins: Plugin[]) {
  const indexed = plugins.map((plugin) => ({
    plugin,
    names: pluginNamespaceNames(plugin),
  }));
  for (let leftIndex = 0; leftIndex < indexed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < indexed.length; rightIndex += 1) {
      const left = indexed[leftIndex]!;
      const right = indexed[rightIndex]!;
      if (
        left.plugin.packageId !== null
        && right.plugin.packageId !== null
        && left.plugin.packageId !== right.plugin.packageId
      ) continue;
      for (const [label, key] of [
        ["Action", "actions"],
        ["自定义工具", "tools"],
        ["全局容器", "globalContainers"],
      ] as const) {
        const collision = [...left.names[key]].find((name) => right.names[key].has(name));
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
  }),
  getters: {
    sortedPlugins(state): Plugin[] {
      const local = pluginStateItems(state)
        .filter((plugin) => plugin.packageId !== null)
        .sort(comparePlugins);
      const global = pluginStateItems(state)
        .filter((plugin) => plugin.packageId === null)
        .sort(comparePlugins);
      return [...local, ...global];
    },
    globalPlugins(state): Plugin[] {
      return pluginStateItems(state)
        .filter((plugin) => plugin.packageId === null)
        .sort(comparePlugins);
    },
    sortedPluginsForPackage: (state) => (
      packageId?: string | null,
      enabledGlobalPluginIds: string[] = [],
      mainPluginId?: string,
    ): Plugin[] => {
      const enabledGlobal = new Set(enabledGlobalPluginIds);
      const selected = pluginStateItems(state).filter((plugin) =>
        (Boolean(packageId) && plugin.packageId === packageId)
        || (
          plugin.packageId === null
          && (plugin.id === mainPluginId || enabledGlobal.has(plugin.id))
        )
      );
      return selected.sort((a, b) => {
        if (a.id === mainPluginId) return -1;
        if (b.id === mainPluginId) return 1;
        if (a.packageId !== b.packageId) return a.packageId === packageId ? -1 : 1;
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
            !keyword
            || plugin.name.toLocaleLowerCase().includes(keyword)
            || plugin.shortDescription.toLocaleLowerCase().includes(keyword),
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
        ).filter(
          (plugin) =>
            plugin.enabled
            || plugin.id === mainPluginId
        );
    },
    activePlugin(state): Plugin | undefined {
      return pluginStateItems(state).find((plugin) => plugin.id === state.activePluginId);
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
        const candidates: Plugin[] = [];
        const main = enabled.find((plugin) => plugin.id === mainPluginId);
        const fallback = pluginStateItems(this).find(
          (plugin) => plugin.id === builtinCorePluginId,
        );
        if (main) candidates.push(main);
        if (fallback && fallback.id !== main?.id) candidates.push(fallback);
        for (const plugin of candidates) {
          const selection = configuredBackground(plugin);
          if (!selection) continue;
          const sourcePlugin = enabled.find(
            (candidate) => candidate.id === selection.pluginId,
          ) ?? (selection.pluginId === fallback?.id ? fallback : null);
          const match = sourcePlugin
            ? findPluginNodeByPath(sourcePlugin.root, selection.path)
            : null;
          if (match?.kind === "file" && pluginFileType(match.name) === "media") {
            return match;
          }
        }
        return null;
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
        for (const plugin of this.enabledPluginsForPackage(
          packageId,
          enabledGlobalPluginIds,
          mainPluginId,
        )) {
          const folder = findPluginNodeByPath(
            plugin.root,
            pluginConventions.actionFolder,
          );
          if (!folder || folder.kind !== "folder") continue;
          for (const resource of flattenPluginFiles(folder)) {
            const commandName = resource.name
              .replace(/\.[^.]+$/, "")
              .trim()
              .toLocaleLowerCase();
            const type = pluginFileType(resource.name);
            if (
              (type !== "javascript" && type !== "markdown")
              || !commandName
            ) {
              continue;
            }
            if (claimedNames.has(commandName)) {
              throw new Error(`Action 名称冲突：${commandName}（${plugin.name}/${resource.name}）`);
            }
            claimedNames.add(commandName);
            actions.push({
              pluginId: plugin.id,
              pluginName: plugin.name,
              kind: type === "markdown" ? "prompt" : "process",
              resource: {
                ...resource,
                name: resource.name.replace(/\.[^.]+$/, ""),
              },
            });
          }
        }
        return actions;
      };
    },
  },
  actions: {
    async initialize() {
      if (this.loaded) return;
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
      setPluginStateItems(this, records
        .filter(
          (record) =>
            isPluginRecord(record)
            && !bundledIds.has(record.id),
        )
        .map(normalizePlugin));
      pluginStateItems(this).push(...bundledPlugins.map((bundled) => {
        const persisted = records.find((record) => isPluginRecord(record) && record.id === bundled.id);
        return persisted ? { ...normalizePlugin(persisted), id: bundled.id, packageId: null, builtIn: true } : bundled;
      }));
      for (const plugin of pluginStateItems(this)) {
        if (removeCancelledOverride(plugin)) await this.persistPlugin(plugin);
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
      for (const plugin of pluginStateItems(this)) {
        const selection = configuredBackground(plugin);
        if (!selection) continue;
        const sourcePlugin = pluginStateItems(this).find(
          (candidate) => candidate.id === selection.pluginId,
        );
        const resource = sourcePlugin
          ? findPluginNodeByPath(sourcePlugin.root, selection.path)
          : null;
        if (resource?.kind === "file" && pluginFileType(resource.name) === "media") {
          continue;
        }
        if (clearConfiguredBackground(plugin)) await this.persistPlugin(plugin);
      }
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
      const plugin = createStarterPlugin(packageId, false, pluginStateItems(this));
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
      if (pluginStateItems(this).some(
        (item) => item.id.toLocaleLowerCase() === plugin.id.toLocaleLowerCase(),
      )) {
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
      patch: Partial<Omit<Plugin, "id" | "root" | "builtIn">>,
    ) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      if (!plugin) return;
      Object.assign(plugin, patch);
      await this.persistPlugin(plugin);
    },
    async renamePluginId(pluginId: string, requestedId: string) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      if (!plugin) return null;
      if (plugin.builtIn) throw new Error("内置插件 ID 由内置资源路径固定。");
      const nextId = requestedId.trim();
      assertPluginId(nextId);
      if (nextId === pluginId) return plugin;
      if (pluginStateItems(this).some(
        (item) => item !== plugin && item.id.toLocaleLowerCase() === nextId.toLocaleLowerCase(),
      )) {
        throw new Error(`插件 ID 已存在：${nextId}`);
      }

      const previous = clonePlain(plugin);
      const relatedPluginSnapshots = new Map<string, Plugin>();
      plugin.id = nextId;
      const { useConversationStore } = await import(
        "@/features/Resources/Conversation/application/conversation-store"
      );
      const conversation = useConversationStore();
      await conversation.initialize();
      try {
        for (const candidate of pluginStateItems(this)) {
          const manifest = findPluginNodeByPath(candidate.root, pluginConventions.manifest);
          if (manifest?.kind !== "file") continue;
          const parsed = parsePluginManifest(manifest.content);
          if (parsed.diagnostics.length) continue;
          const background = pluginManifestFixedValue(parsed.manifest, "background");
          if (
            !background
            || typeof background !== "object"
            || Array.isArray(background)
            || background.pluginId !== pluginId
          ) continue;
          relatedPluginSnapshots.set(candidate.id, clonePlain(candidate));
          setPluginManifestFixedValue(parsed.manifest, "background", {
            ...background,
            pluginId: nextId,
          });
          manifest.content = parsed.manifest;
        }
        await this.persistPlugin(plugin);
        for (const candidate of pluginStateItems(this)) {
          if (candidate !== plugin && relatedPluginSnapshots.has(candidate.id)) {
            await this.persistPlugin(candidate);
          }
        }
        for (const item of conversation.packages) {
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
              (id) => id === pluginId ? nextId : id,
            );
            changed = true;
          }
          if (changed) await conversation.persistPackage(item);
        }
        for (const item of conversation.conversations) {
          const binding = item.binding;
          if (!binding) continue;
          let changed = false;
          if (binding.pluginId === pluginId) {
            binding.pluginId = nextId;
            changed = true;
          }
          if (binding.resourceType === "plugin" && binding.resourceId === pluginId) {
            binding.resourceId = nextId;
            changed = true;
          }
          if (changed) await conversation.persistConversation(item);
        }
        for (const container of conversation.containers) {
          let changed = false;
          for (const message of container.content) {
            if (message.meta.environmentInfo?.pluginId === pluginId) {
              message.meta.environmentInfo.pluginId = nextId;
              changed = true;
            }
            for (const part of message.parts ?? []) {
              if (part.type === "action" && part.pluginId === pluginId) {
                part.pluginId = nextId;
                changed = true;
              }
            }
          }
          if (changed) await conversation.persistContainer(container);
        }
        await deletePersistedPlugin(previous);
      } catch (error) {
        plugin.id = pluginId;
        for (const [id, snapshot] of relatedPluginSnapshots) {
          const index = pluginStateItems(this).findIndex((item) => item.id === id);
          if (index >= 0) pluginStateItems(this).splice(index, 1, snapshot);
        }
        throw error;
      }
      if (this.activePluginId === pluginId) this.activePluginId = nextId;
      return plugin;
    },
    async restoreBuiltInPlugin(pluginId: string) {
      const restored = createBuiltinPlugins().find((plugin) => plugin.id === pluginId);
      if (!restored) return null;
      const index = pluginStateItems(this).findIndex((item) => item.id === pluginId);
      if (index >= 0) {
        pluginStateItems(this).splice(index, 1, restored);
      } else {
        pluginStateItems(this).push(restored);
      }
      await this.persistPlugin(restored);
      return restored;
    },
    async deletePlugin(pluginId: string) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      if (!plugin || plugin.builtIn) return;
      const { useConversationStore } = await import(
        "@/features/Resources/Conversation/application/conversation-store"
      );
      const conversation = useConversationStore();
      await conversation.initialize();
      if (
        plugin.packageId === null
        && conversation.packages.some((item) => item.mainPluginId === pluginId)
      ) {
        throw new Error("该全局插件仍是角色包的主要插件，不能删除。");
      }
      if (plugin.packageId === null) {
        for (const packageItem of conversation.packages) {
          if (!packageItem.enabledGlobalPluginIds.includes(pluginId)) continue;
          await conversation.updatePackage(packageItem.id, {
            enabledGlobalPluginIds: packageItem.enabledGlobalPluginIds.filter(
              (id) => id !== pluginId,
            ),
          });
        }
      }
      for (const item of conversation.conversations.filter(
        (candidate) =>
          candidate.kind === "test"
          && (candidate.binding?.pluginId === pluginId
            || (
              candidate.binding?.resourceType === "plugin"
              && candidate.binding.resourceId === pluginId
            )),
      )) {
        await conversation.deleteConversation(item.id, {
          activateFallback: false,
        });
      }
      setPluginStateItems(this, pluginStateItems(this).filter((item) => item.id !== pluginId));
      await deletePersistedPlugin(plugin);
      await this.pruneInvalidBackgroundSelections();
      this.activePluginId = this.sortedPlugins[0]?.id ?? "";
    },
    findNode(pluginId: string, nodeId: string) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      return plugin ? findPluginTreeNode(plugin.root, nodeId) : null;
    },
    async createFile(
      pluginId: string,
      parentFolderId: string,
      input: {
        name?: string;
        content?: unknown;
        order?: number;
        insertion?: PluginFile["insertion"];
      } = {},
    ) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      const parent = plugin
        ? findPluginTreeNode(plugin.root, parentFolderId)
        : null;
      if (!plugin || parent?.kind !== "folder") return null;
      const previousRoot = clonePlain(plugin.root);
      if (
        parent.id === plugin.root.id
        && [
          pluginConventions.manifest,
          pluginConventions.containers,
          pluginConventions.regex,
        ].some(
          (name) =>
            input.name?.trim().toLocaleLowerCase()
              === name.toLocaleLowerCase(),
        )
      ) {
        const existing = findPluginNodeByPath(
          plugin.root,
          input.name?.trim() ?? "",
        );
        if (existing?.kind === "file") return existing;
      }
      const file = createFile(
        input.name?.trim() || "untitled.md",
        input.content ?? "",
        {
          treeOrder:
            Math.max(-1, ...parent.children.map((child) => child.treeOrder ?? -1)) + 1,
          order: typeof input.order === "number" && Number.isFinite(input.order)
            ? Math.round(input.order)
            : 100,
          insertion: input.insertion,
        },
      );
      parent.children.push(file);
      parent.collapsed = false;
      try {
        assertPluginNamespaceCompatibility(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.root = previousRoot;
        throw error;
      }
      return file;
    },
    async createFolder(
      pluginId: string,
      parentFolderId: string,
      name = "新文件夹",
    ) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      const parent = plugin
        ? findPluginTreeNode(plugin.root, parentFolderId)
        : null;
      if (!plugin || parent?.kind !== "folder") return null;
      if (
        parent.id === plugin.root.id
        && [
          pluginConventions.componentsFolder,
          pluginConventions.toolsFolder,
        ].some(
          (folderName) =>
            name.trim().toLocaleLowerCase()
              === folderName.toLocaleLowerCase(),
        )
      ) {
        const existing = findPluginNodeByPath(
          plugin.root,
          name.trim(),
        );
        if (existing?.kind === "folder") return existing;
      }
      const folder = createFolder(name, [], {
        treeOrder:
          Math.max(-1, ...parent.children.map((child) => child.treeOrder ?? -1)) + 1,
      });
      parent.children.push(folder);
      parent.collapsed = false;
      await this.persistPlugin(plugin);
      return folder;
    },
    async importFile(
      pluginId: string,
      parentFolderId: string,
      name: string,
      content: unknown,
    ) {
      return this.createFile(pluginId, parentFolderId, { name, content });
    },
    async updateNode(
      pluginId: string,
      nodeId: string,
      patch: Partial<
        PluginTreeNodeBase & {
          content: unknown;
          collapsed: boolean;
          order: number;
          insertion?: PluginFile["insertion"];
        }
      >,
    ) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      const node = plugin ? findPluginTreeNode(plugin.root, nodeId) : null;
      if (!plugin || !node) return;
      const previousRoot = clonePlain(plugin.root);
      if (
        !isFixedConventionNode(plugin, nodeId)
        && typeof patch.name === "string"
        && patch.name.trim()
      ) {
        node.name = patch.name.trim();
      }
      if (typeof patch.icon === "string") node.icon = patch.icon;
      if (typeof patch.treeOrder === "number" && Number.isFinite(patch.treeOrder)) {
        node.treeOrder = Math.round(patch.treeOrder);
      }
      if (node.kind === "file" && "content" in patch) {
        node.content = clonePlain(patch.content);
      }
      if (
        node.kind === "file"
        && typeof patch.order === "number"
        && Number.isFinite(patch.order)
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
        plugin.root = previousRoot;
        throw error;
      }
      await this.pruneInvalidBackgroundSelections();
    },
    async deleteNode(pluginId: string, nodeId: string) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      const parent = plugin
        ? findPluginTreeParent(plugin.root, nodeId)
        : null;
      if (
        !plugin
        || !parent
        || isFixedConventionNode(plugin, nodeId)
      ) return;
      parent.children = parent.children.filter((child) => child.id !== nodeId);
      await this.persistPlugin(plugin);
      await this.pruneInvalidBackgroundSelections();
    },
    async moveNode(
      pluginId: string,
      nodeId: string,
      targetFolderId: string,
      beforeNodeId?: string,
    ) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      const sourceParent = plugin
        ? findPluginTreeParent(plugin.root, nodeId)
        : null;
      const target = plugin
        ? findPluginTreeNode(plugin.root, targetFolderId)
        : null;
      const node = plugin ? findPluginTreeNode(plugin.root, nodeId) : null;
      if (
        !plugin
        || !sourceParent
        || target?.kind !== "folder"
        || !node
        || isFixedConventionNode(plugin, nodeId)
        || node.id === target.id
        || (node.kind === "folder" && findPluginTreeNode(node, target.id))
      ) {
        return;
      }
      const previousRoot = clonePlain(plugin.root);
      sourceParent.children = sourceParent.children.filter(
        (child) => child.id !== node.id,
      );
      const ordered = sortPluginTreeNodes(
        target.children.filter((child) => child.id !== node.id),
      );
      const beforeIndex = beforeNodeId
        ? ordered.findIndex((child) => child.id === beforeNodeId)
        : -1;
      ordered.splice(beforeIndex < 0 ? ordered.length : beforeIndex, 0, node);
      ordered.forEach((child, index) => {
        child.treeOrder = index;
      });
      target.children = ordered;
      target.collapsed = false;
      try {
        assertPluginNamespaceCompatibility(pluginStateItems(this));
        await this.persistPlugin(plugin);
      } catch (error) {
        plugin.root = previousRoot;
        throw error;
      }
      await this.pruneInvalidBackgroundSelections();
    },
  },
});
