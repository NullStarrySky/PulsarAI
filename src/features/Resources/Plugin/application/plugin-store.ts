import { defineStore } from "pinia";
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
  pluginNodePath,
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
import { createPluginMediaContent } from "@/features/Resources/Plugin/domain/plugin-media";
import {
  isJsonValue,
  manifestValueAt,
  parsePluginManifest,
  setManifestValue,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import builtinClassroomBackgroundUrl from "@/features/Resources/Plugin/assets/builtin-classroom-background.png";

export const builtinCorePluginId = "builtin-core-plugin";
let initializePromise: Promise<void> | null = null;

function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function assertContextPlacementAvailable(
  plugins: Plugin[],
  input: {
    fileId?: string;
    name: string;
    contextPlacement?: PluginFile["contextPlacement"];
  },
) {
  const depth = input.contextPlacement?.depth;
  if (depth === undefined) return;
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error("深度容器 K 必须是非负整数。");
  }
  const normalizedName = input.name.trim().toLocaleLowerCase();
  const conflict = plugins.flatMap((item) => flattenPluginFiles(item.root)).find(
    (file) => file.id !== input.fileId
      && file.contextPlacement?.depth === depth
      && file.name.trim().toLocaleLowerCase() === normalizedName,
  );
  if (conflict) {
    throw new Error(`深度容器 ${depth} 中已存在同名资源：${conflict.name}`);
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
    order: input.order ?? 0,
  };
}

function createFile(
  name: string,
  content: unknown = "",
  input: Partial<PluginTreeNodeBase> & {
    priority?: number;
    memberships?: PluginFile["memberships"];
    contextConfig?: PluginFile["contextConfig"];
    contextPlacement?: PluginFile["contextPlacement"];
  } = {},
): PluginFile {
  return {
    ...createNodeBase(name, input),
    kind: "file",
    priority: input.priority ?? 100,
    memberships: clonePlain(input.memberships ?? []),
    ...(input.contextConfig ? { contextConfig: clonePlain(input.contextConfig) } : {}),
    ...(input.contextPlacement
      ? { contextPlacement: clonePlain(input.contextPlacement) }
      : {}),
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

function starterInfo(name: string) {
  return [
    `# ${name}`,
    "",
    "在这里记录插件用途、约定和使用方式。",
    "",
    "容器在根目录 `containers.json` 中声明；文件的成员关系保存在资源元数据中，正文和脚本通过 `imports` 函数导入资源。",
  ].join("\n");
}

function createStarterRoot(name: string): PluginFolder {
  return createFolder("/", [
    createFile(pluginConventions.info, starterInfo(name), { order: 0 }),
    createFile(pluginConventions.manifest, [], { order: 1 }),
    createContainerDefinitionsFile([
      {
        name: "会话上下文",
        scope: "local",
        description: "角色设定与会话生成所需的共享上下文。",
      },
    ], { order: 2 }),
    createFile(pluginConventions.regex, [], {
      order: 3,
      memberships: [{
        container: "container:global/正则",
        alias: "regex",
      }],
    }),
    createFile(
      pluginConventions.context,
      createDefaultContextDocument(),
      { order: 4 },
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
        { order: 0 },
      ),
    ], { order: 5 }),
    createAgentProcessFolder({ order: 6 }),
    createFile(
      pluginConventions.override,
      [
        "<template>",
        "  <slot />",
        "</template>",
        "",
      ].join("\n"),
      { order: 7 },
    ),
    createFolder(pluginConventions.componentsFolder, [], { order: 8 }),
    createFolder(pluginConventions.backgroundFolder, [], { order: 9 }),
    createFolder("character", [
      createFile(
        "default.md",
        "保持清晰、可靠，并尊重当前对话上下文。",
        {
          order: 0,
          memberships: [{
            container: "container:local/会话上下文",
            alias: "character",
          }],
        },
      ),
    ], { order: 10 }),
    createFolder(pluginConventions.toolsFolder, [], { order: 11 }),
    createFolder(pluginConventions.actionFolder, [], { order: 12 }),
  ], { id: crypto.randomUUID() });
}

function createDefaultContextDocument() {
  return [
    ":::pulsar role=system",
    '{{ imports.container("local", "会话上下文").get("character") }}',
    "",
    "[[chat]]",
    ":::",
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

function createAgentProcessFolder(
  input: Partial<PluginTreeNodeBase> = {},
  fileIdPrefix = "",
) {
  return createFolder(pluginConventions.agentProcessFolder, [
    createFile(
      pluginConventions.agentProcessEntry,
      [
        "const messages = await api.runProcess(",
        '  imports.resource("./step1-prepare.js"),',
        ");",
        "const result = await api.runProcess(",
        '  imports.resource("./step2-generate.js"),',
        "  { processInput: messages },",
        ");",
        "return api.runProcess(",
        '  imports.resource("./step3-finalize.js"),',
        "  { processInput: result },",
        ");",
      ].join("\n"),
      {
        id: fileIdPrefix ? `${fileIdPrefix}-index` : undefined,
        order: 0,
      },
    ),
    createFile(
      "step1-prepare.js",
      "return contextMessages;",
      {
        id: fileIdPrefix ? `${fileIdPrefix}-step1` : undefined,
        order: 1,
      },
    ),
    createFile(
      "step2-generate.js",
      [
        "const runtime = await agent.prepare();",
        "const runner = new agent.ToolLoopAgent({",
        "  model: runtime.model,",
        "  reasoning: runtime.reasoning,",
        "  allowSystemInMessages: true,",
        '  instructions: [String(imports.resource("../instruction/default.md")), runtime.instructions].join(\'\\n\\n\'),',
        "  tools: runtime.tools,",
        "  stopWhen: runtime.stopWhen,",
        "  onStepStart: runtime.onStepStart,",
        "});",
        "const result = await runner.generate({ messages: processInput });",
        "await runtime.finish();",
        "return { text: result.text, modelName: runtime.modelName };",
      ].join("\n"),
      {
        id: fileIdPrefix ? `${fileIdPrefix}-step2` : undefined,
        order: 2,
      },
    ),
    createFile(
      "step3-finalize.js",
      "return processInput;",
      {
        id: fileIdPrefix ? `${fileIdPrefix}-step3` : undefined,
        order: 3,
      },
    ),
  ], input);
}

function createBuiltinPlugin(): Plugin {
  const root = createStarterRoot("内置会话资源");
  const manifest = findPluginNodeByPath(root, pluginConventions.manifest);
  if (manifest?.kind === "file") {
    manifest.content = [{
      group: {
        id: "appearance",
        title: "外观",
        description: "配置内置会话界面的资源。",
      },
      content: [{
        id: "background",
        title: "会话背景",
        description: "选择主要插件或已启用全局插件中的背景媒体。",
        component: "MediaSelect",
        props: { allowEmpty: true },
        value: {
          pluginId: builtinCorePluginId,
          path: `${pluginConventions.backgroundFolder}/classroom.png`,
        },
      }],
    }];
  }
  const context = findPluginNodeByPath(root, pluginConventions.context);
  if (context?.kind === "file") {
    context.content = [
      ":::pulsar role=system",
      '{{ imports.container("global", "会话上下文").get("character") }}',
      "",
      "[[chat]]",
      ":::",
    ].join("\n");
  }
  const containers = findPluginNodeByPath(root, pluginConventions.containers);
  if (containers?.kind === "file") {
    containers.content = {
      containers: [
        {
          name: "会话上下文",
          scope: "global",
          description: "角色包唯一资源插件向主要插件提供的角色与剧情上下文。",
        },
        {
          name: "基础上下文",
          scope: "global",
          description: "所有启用插件都可以显式引用的 PulsarAI 基础上下文。",
        },
        {
          name: "正则",
          scope: "global",
          description: "按插件与文件优先级应用的根级 regex.json 规则。",
        },
        {
          name: "自定义工具",
          scope: "global",
          description: "tools/<name>/tool.js 中可由 ctx.tools 调用的函数。",
        },
        {
          name: "自定义工具文档",
          scope: "global",
          description: "tools/<name>/prompt.md 中注入模型上下文的函数说明。",
        },
      ],
    };
  }
  const background = findPluginNodeByPath(root, pluginConventions.backgroundFolder);
  if (background?.kind === "folder") {
    background.children.push(
      createFile(
        "classroom.png",
        createPluginMediaContent(builtinClassroomBackgroundUrl, "image"),
        {
          id: "builtin-background-classroom",
          order: 0,
        },
      ),
    );
  }

  const character = findPluginNodeByPath(root, "character");
  if (character?.kind === "folder") {
    character.children = [];
  }

  const action = findPluginNodeByPath(root, pluginConventions.actionFolder);
  if (action?.kind === "folder") {
    action.children.push(
      createFile(
        "getTime.js",
        [
          "return {",
          "  text: new Date().toLocaleString(),",
          '  modelName: "action:getTime",',
          "};",
        ].join("\n"),
        {
          id: "builtin-action-get-time",
          order: 0,
        },
      ),
    );
  }

  return {
    id: builtinCorePluginId,
    packageId: null,
    name: "内置会话资源",
    icon: "",
    shortDescription: "Pulsar 默认文件与生成约定",
    root,
    enabled: true,
    builtIn: true,
  };
}

function createStarterPlugin(packageId: string | null, global = false): Plugin {
  const name = global ? "新全局插件" : "新插件";
  return {
    id: crypto.randomUUID(),
    packageId,
    name,
    icon: "",
    shortDescription: "",
    root: createStarterRoot(name),
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
    value = manifestValueAt(parsed.manifest, "appearance", "background");
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
    setManifestValue(parsed.manifest, "appearance", "background", null);
    manifest.content = parsed.manifest;
    return true;
  } catch {
    return false;
  }
}

function normalizeTreeNode(value: unknown, order = 0): PluginTreeNode | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<PluginTreeNode> & {
    children?: unknown;
    content?: unknown;
    priority?: unknown;
    memberships?: unknown;
    contextConfig?: unknown;
    contextPlacement?: unknown;
  };
  const name = typeof source.name === "string" && source.name.trim()
    ? source.name.trim()
    : source.kind === "folder"
      ? "新文件夹"
      : "untitled.md";
  const base = createNodeBase(name, {
    id: typeof source.id === "string" ? source.id : crypto.randomUUID(),
    icon: typeof source.icon === "string" ? source.icon : "",
    order: typeof source.order === "number" ? source.order : order,
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
    priority:
      typeof source.priority === "number" && Number.isFinite(source.priority)
        ? source.priority
        : 100,
    memberships: Array.isArray(source.memberships)
      ? source.memberships.flatMap((membership) => {
          if (!membership || typeof membership !== "object") return [];
          const item = membership as {
            container?: unknown;
            alias?: unknown;
            condition?: unknown;
          };
          if (typeof item.container !== "string" || !item.container.trim()) {
            return [];
          }
          const condition = item.condition && typeof item.condition === "object"
            && !Array.isArray(item.condition)
            ? item.condition as { reference?: unknown; equals?: unknown }
            : null;
          return [{
            container: item.container.trim(),
            alias: typeof item.alias === "string" ? item.alias.trim() : "",
            ...(condition
              && typeof condition.reference === "string"
              && condition.reference.trim()
              ? {
                  condition: {
                    reference: condition.reference.trim(),
                    ...(Object.prototype.hasOwnProperty.call(condition, "equals")
                      && isJsonValue(condition.equals)
                      ? {
                          equals: clonePlain(condition.equals),
                        }
                      : {}),
                  },
                }
              : {}),
          }];
        })
      : [],
    ...(source.contextConfig && typeof source.contextConfig === "object"
      ? {
          contextConfig: {
            compressionThreshold: Math.max(
              0,
              Math.round(Number(
                (source.contextConfig as { compressionThreshold?: unknown })
                  .compressionThreshold,
              ) || 0),
            ),
          },
        }
      : {}),
    ...(source.contextPlacement && typeof source.contextPlacement === "object"
      && Number.isInteger(
        Number((source.contextPlacement as { depth?: unknown }).depth),
      )
      && Number((source.contextPlacement as { depth?: unknown }).depth) >= 0
      ? {
          contextPlacement: {
            depth: Number(
              (source.contextPlacement as { depth?: unknown }).depth,
            ),
            ...normalizeInsertionCondition(
              (source.contextPlacement as { condition?: unknown }).condition,
            ),
          },
        }
      : {}),
    content: clonePlain(source.content ?? ""),
  };
}

function normalizeInsertionCondition(condition: unknown): {
  condition?: PluginFile["memberships"][number]["condition"];
} {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
    return {};
  }
  const source = condition as { reference?: unknown; equals?: unknown };
  if (typeof source.reference !== "string" || !source.reference.trim()) {
    return {};
  }
  return {
    condition: {
      reference: source.reference.trim(),
      ...(Object.prototype.hasOwnProperty.call(source, "equals")
        && isJsonValue(source.equals)
        ? { equals: clonePlain(source.equals) }
        : {}),
    },
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

function isFixedConventionNode(plugin: Plugin, nodeId: string) {
  return [
    pluginConventions.manifest,
    pluginConventions.containers,
    pluginConventions.regex,
    pluginConventions.override,
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
  return {
    ...plugin,
    id: crypto.randomUUID(),
    packageId: null,
    builtIn: false,
  };
}

function conventionalToolMemberships(
  plugin: Plugin,
  parent: PluginFolder,
  fileName: string,
): PluginFile["memberships"] {
  const parentPath = pluginNodePath(plugin.root, parent.id);
  if (
    parentPath.length !== 2
    || parentPath[0]?.toLocaleLowerCase()
      !== pluginConventions.toolsFolder.toLocaleLowerCase()
  ) {
    return [];
  }
  const alias = parentPath[1]?.trim() ?? "";
  const normalizedName = fileName.trim().toLocaleLowerCase();
  if (normalizedName === pluginConventions.toolEntry.toLocaleLowerCase()) {
    return [{
      container: "container:global/自定义工具",
      alias,
    }];
  }
  if (normalizedName === pluginConventions.toolPrompt.toLocaleLowerCase()) {
    return [{
      container: "container:global/自定义工具文档",
      alias,
    }];
  }
  return [];
}

function syncConventionalToolMemberships(
  plugin: Plugin,
  parent: PluginFolder,
  file: PluginFile,
) {
  const reservedContainers = new Set([
    "container:global/自定义工具",
    "container:global/自定义工具文档",
  ]);
  file.memberships = [
    ...file.memberships.filter(
      (membership) => !reservedContainers.has(membership.container),
    ),
    ...conventionalToolMemberships(plugin, parent, file.name),
  ];
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
    .map((container) => container.name.trim().toLocaleLowerCase());
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
      const records = await loadPersistedPlugins();
      const persistedBuiltin = records
        .find(
          (record) =>
            isPluginRecord(record)
            && record.id === builtinCorePluginId,
        );
      setPluginStateItems(this, records
        .filter(
          (record) =>
            isPluginRecord(record)
            && record.id !== builtinCorePluginId,
        )
        .map(normalizePlugin));
      pluginStateItems(this).push(
        persistedBuiltin
          ? {
              ...normalizePlugin(persistedBuiltin),
              id: builtinCorePluginId,
              packageId: null,
              builtIn: true,
            }
          : createBuiltinPlugin(),
      );
      await this.pruneInvalidBackgroundSelections();
      this.activePluginId = this.sortedPlugins[0]?.id ?? "";
      this.loaded = true;
    },
    async persistPlugin(plugin: Plugin) {
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
      const plugin = createStarterPlugin(packageId);
      pluginStateItems(this).push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async createGlobalPlugin() {
      const plugin = createStarterPlugin(null, true);
      pluginStateItems(this).push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async importGlobalPlugin(value: unknown) {
      const plugin = normalizeImportedGlobalPlugin(value);
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
    async restoreBuiltInPlugin(pluginId: string) {
      if (pluginId !== builtinCorePluginId) return null;
      const restored = createBuiltinPlugin();
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
        priority?: number;
        contextConfig?: PluginFile["contextConfig"];
        contextPlacement?: PluginFile["contextPlacement"];
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
          pluginConventions.override,
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
          order:
            Math.max(-1, ...parent.children.map((child) => child.order ?? -1)) + 1,
          priority:
            typeof input.priority === "number" && Number.isFinite(input.priority)
              ? Math.round(input.priority)
              : 100,
          memberships: conventionalToolMemberships(
            plugin,
            parent,
            input.name?.trim() || "untitled.md",
          ),
          contextConfig: input.contextConfig,
          contextPlacement: input.contextPlacement,
        },
      );
      assertContextPlacementAvailable(pluginStateItems(this), {
        fileId: file.id,
        name: file.name,
        contextPlacement: file.contextPlacement,
      });
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
        order:
          Math.max(-1, ...parent.children.map((child) => child.order ?? -1)) + 1,
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
          priority: number;
          memberships: PluginFile["memberships"];
          contextConfig: PluginFile["contextConfig"];
          contextPlacement: PluginFile["contextPlacement"];
        }
      >,
    ) {
      const plugin = pluginStateItems(this).find((item) => item.id === pluginId);
      const node = plugin ? findPluginTreeNode(plugin.root, nodeId) : null;
      if (!plugin || !node) return;
      const previousRoot = clonePlain(plugin.root);
      if (node.kind === "file") {
        assertContextPlacementAvailable(pluginStateItems(this), {
          fileId: node.id,
          name: typeof patch.name === "string" && patch.name.trim()
            ? patch.name.trim()
            : node.name,
          contextPlacement: "contextPlacement" in patch
            ? patch.contextPlacement
            : node.contextPlacement,
        });
      }
      if (
        !isFixedConventionNode(plugin, nodeId)
        && typeof patch.name === "string"
        && patch.name.trim()
      ) {
        node.name = patch.name.trim();
        const parent = node.kind === "file"
          ? findPluginTreeParent(plugin.root, node.id)
          : null;
        if (node.kind === "file" && parent && !Array.isArray(patch.memberships)) {
          syncConventionalToolMemberships(plugin, parent, node);
        }
      }
      if (typeof patch.icon === "string") node.icon = patch.icon;
      if (node.kind === "file" && "content" in patch) {
        node.content = clonePlain(patch.content);
      }
      if (
        node.kind === "file"
        && typeof patch.priority === "number"
        && Number.isFinite(patch.priority)
      ) {
        node.priority = Math.round(patch.priority);
      }
      if (node.kind === "file" && Array.isArray(patch.memberships)) {
        node.memberships = clonePlain(patch.memberships);
      }
      if (node.kind === "file" && patch.contextConfig) {
        node.contextConfig = clonePlain(patch.contextConfig);
      }
      if (node.kind === "file" && "contextPlacement" in patch) {
        if (patch.contextPlacement) {
          node.contextPlacement = clonePlain(patch.contextPlacement);
        } else {
          delete node.contextPlacement;
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
        child.order = index;
      });
      target.children = ordered;
      target.collapsed = false;
      if (node.kind === "file") {
        syncConventionalToolMemberships(plugin, target, node);
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
  },
});
