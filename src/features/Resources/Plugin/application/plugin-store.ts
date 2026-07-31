import { defineStore } from "pinia";
import { remove, selectAll, upsert } from "@/features/Database/application/database-service";
import {
  normalizeInteractiveDocumentSource,
} from "@/features/Resources/InteractiveDoc/domain/interactive-document";
import {
  findPluginNodeByPath,
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
  serializePluginContainerDefinitions,
  type PluginContainerDeclaration,
} from "@/features/Resources/Plugin/domain/plugin-reference";
import { createPluginMediaContent } from "@/features/Resources/Plugin/domain/plugin-media";
import builtinClassroomBackgroundUrl from "@/features/Resources/Plugin/assets/builtin-classroom-background.png";

const pluginTable = "resource_plugins";
const builtinCorePluginId = "builtin-core-plugin";
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
    order: input.order ?? 0,
  };
}

function createFile(
  name: string,
  content: unknown = "",
  input: Partial<PluginTreeNodeBase> & {
    priority?: number;
    memberships?: PluginFile["memberships"];
  } = {},
): PluginFile {
  return {
    ...createNodeBase(name, input),
    kind: "file",
    priority: input.priority ?? 100,
    memberships: clonePlain(input.memberships ?? []),
    content:
      pluginFileType(name) === "interactive-document"
        ? normalizeInteractiveDocumentSource(content)
        : clonePlain(content),
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
    "容器在根目录 `containers.xml` 中声明；文件的容器成员关系保存在资源元数据中，正文只使用 `<@...>` 显式引用。",
  ].join("\n");
}

function createStarterRoot(name: string): PluginFolder {
  return createFolder("/", [
    createFile(pluginConventions.info, starterInfo(name), { order: 0 }),
    createFile(pluginConventions.manifest, {}, { order: 1 }),
    createContainerDefinitionsFile([
      {
        name: "会话上下文",
        scope: "plugin",
        description: "角色设定与会话生成所需的共享上下文。",
        imports: [],
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
          "Treat Feature API documentation as the exact permission boundary.",
          "Read the custom tool documentation block and call plugin functions through ctx.tools when relevant.",
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
            container: "container:plugin/会话上下文",
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
    '<prompt_template name="main" role="system">',
    '{{ <@会话上下文>.get("character") }}',
    "",
    "[[chat]]",
    "</prompt_template>",
    "",
    "<data>",
    "</data>",
  ].join("\n");
}

function createContainerDefinitionsFile(
  containers: PluginContainerDeclaration[] = [],
  input: Partial<PluginTreeNodeBase> = {},
) {
  return createFile(
    pluginConventions.containers,
    serializePluginContainerDefinitions({ containers }),
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
        "  <@path:./step1-prepare.js>,",
        ");",
        "const result = await api.runProcess(",
        "  <@path:./step2-generate.js>,",
        "  { processInput: messages },",
        ");",
        "return api.runProcess(",
        "  <@path:./step3-finalize.js>,",
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
        "  instructions: [String(<@path:../instruction/default.md>), runtime.instructions].join('\\n\\n'),",
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
  const context = findPluginNodeByPath(root, pluginConventions.context);
  if (context?.kind === "file") {
    context.content = [
      '<prompt_template name="fallback" role="system">',
      "[[chat]]",
      "</prompt_template>",
      "",
      "<data>",
      "</data>",
    ].join("\n");
  }
  const containers = findPluginNodeByPath(root, pluginConventions.containers);
  if (containers?.kind === "file") {
    containers.content = serializePluginContainerDefinitions({
      containers: [
        {
          name: "基础上下文",
          scope: "global",
          description: "所有启用插件都可以显式引用的 PulsarAI 基础上下文。",
          imports: [],
        },
        {
          name: "正则",
          scope: "global",
          description: "按插件与文件优先级应用的根级 regex.json 规则。",
          imports: [],
        },
        {
          name: "自定义工具",
          scope: "global",
          description: "tools/<name>/tool.js 中可由 ctx.tools 调用的函数。",
          imports: [],
        },
        {
          name: "自定义工具文档",
          scope: "global",
          description: "tools/<name>/prompt.md 中注入模型上下文的函数说明。",
          imports: [],
        },
      ],
    });
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

  root.children.push(
    createFile(
      "api-documentation.md",
      "{{CAPABILITIES_PROMPT}}",
      {
        id: "builtin-api-documentation",
        order: 7,
        memberships: [{
          container: "container:global/基础上下文",
          alias: "apiDocumentation",
        }],
      },
    ),
  );

  return {
    id: builtinCorePluginId,
    packageId: null,
    name: "内置会话资源",
    icon: "",
    shortDescription: "Pulsar 默认文件与生成约定",
    root,
    enabled: true,
    main: false,
    builtIn: true,
    order: 10_000,
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
    main: false,
    builtIn: false,
    order: 0,
  };
}

function compareLocalPlugins(a: Plugin, b: Plugin) {
  if (a.main !== b.main) return a.main ? -1 : 1;
  return (
    (a.order ?? 0) - (b.order ?? 0)
    || a.name.localeCompare(b.name, "zh-Hans")
    || a.id.localeCompare(b.id)
  );
}

function sortGlobalPlugins(plugins: Plugin[], localOrder: string[] = []) {
  const orderIndex = new Map(localOrder.map((pluginId, index) => [pluginId, index]));
  return [...plugins].sort((a, b) => {
    if (a.builtIn !== b.builtIn) return a.builtIn ? 1 : -1;
    const aIndex = orderIndex.get(a.id);
    const bIndex = orderIndex.get(b.id);
    if (aIndex !== undefined || bIndex !== undefined) {
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      if (aIndex !== bIndex) return aIndex - bIndex;
    }
    return (
      (a.order ?? 0) - (b.order ?? 0)
      || a.name.localeCompare(b.name, "zh-Hans")
      || a.id.localeCompare(b.id)
    );
  });
}

function normalizeTreeNode(value: unknown, order = 0): PluginTreeNode | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<PluginTreeNode> & {
    children?: unknown;
    content?: unknown;
    priority?: unknown;
    memberships?: unknown;
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
          const item = membership as { container?: unknown; alias?: unknown };
          if (typeof item.container !== "string" || !item.container.trim()) {
            return [];
          }
          return [{
            container: item.container.trim(),
            alias: typeof item.alias === "string" ? item.alias.trim() : "",
          }];
        })
      : [],
    content:
      pluginFileType(name) === "interactive-document"
        ? normalizeInteractiveDocumentSource(source.content)
        : clonePlain(source.content ?? ""),
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
    main: value.main === true,
    builtIn: value.builtIn === true,
    order: typeof value.order === "number" ? value.order : 0,
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

function normalizeImportedGlobalPlugin(value: unknown, order: number): Plugin {
  if (!isPluginRecord(value)) {
    throw new Error("文件不是有效的文件树插件");
  }
  const plugin = normalizePlugin(value);
  return {
    ...plugin,
    id: crypto.randomUUID(),
    packageId: null,
    builtIn: false,
    main: false,
    order,
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

export const usePluginStore = defineStore("plugin-resource", {
  state: () => ({
    loaded: false,
    activePluginId: "",
    search: "",
    plugins: [] as Plugin[],
  }),
  getters: {
    sortedPlugins(state): Plugin[] {
      const local = state.plugins
        .filter((plugin) => plugin.packageId !== null)
        .sort(compareLocalPlugins);
      const global = sortGlobalPlugins(
        state.plugins.filter((plugin) => plugin.packageId === null),
      );
      return [...local, ...global];
    },
    externalGlobalPlugins(state): Plugin[] {
      return sortGlobalPlugins(
        state.plugins.filter(
          (plugin) => plugin.packageId === null && !plugin.builtIn,
        ),
      );
    },
    globalPlugins(state): Plugin[] {
      return sortGlobalPlugins(
        state.plugins.filter((plugin) => plugin.packageId === null),
      );
    },
    sortedPluginsForPackage: (state) => (
      packageId?: string | null,
      globalOrder: string[] = [],
    ): Plugin[] => {
      const local = state.plugins
        .filter((plugin) => Boolean(packageId && plugin.packageId === packageId))
        .sort(compareLocalPlugins);
      const global = sortGlobalPlugins(
        state.plugins.filter((plugin) => plugin.packageId === null),
        globalOrder,
      );
      return [...local, ...global];
    },
    visiblePluginsForPackage(): (
      packageId?: string | null,
      globalOrder?: string[],
    ) => Plugin[] {
      return (packageId?: string | null, globalOrder: string[] = []) => {
        const keyword = this.search.trim().toLocaleLowerCase();
        return this.sortedPluginsForPackage(packageId, globalOrder).filter(
          (plugin) =>
            !keyword
            || plugin.name.toLocaleLowerCase().includes(keyword)
            || plugin.shortDescription.toLocaleLowerCase().includes(keyword),
        );
      };
    },
    enabledPluginsForPackage(): (
      packageId?: string | null,
      globalOrder?: string[],
    ) => Plugin[] {
      return (packageId?: string | null, globalOrder: string[] = []) =>
        this.sortedPluginsForPackage(packageId, globalOrder).filter(
          (plugin) => plugin.enabled,
        );
    },
    activePlugin(state): Plugin | undefined {
      return state.plugins.find((plugin) => plugin.id === state.activePluginId);
    },
    activeBackgroundResourceForPackage(): (
      packageId?: string | null,
      globalOrder?: string[],
    ) => PluginFile | null {
      return (packageId?: string | null, globalOrder: string[] = []) => {
        for (const plugin of this.enabledPluginsForPackage(packageId, globalOrder)) {
          const folder = findPluginNodeByPath(
            plugin.root,
            pluginConventions.backgroundFolder,
          );
          if (!folder || folder.kind !== "folder") continue;
          const match = flattenPluginFiles(folder).find(
            (file) =>
              pluginFileType(file.name) === "media",
          );
          if (match) return match;
        }
        return null;
      };
    },
    actionResourcesForPackage(): (
      packageId?: string | null,
      globalOrder?: string[],
    ) => ResolvedPluginAction[] {
      return (packageId?: string | null, globalOrder: string[] = []) => {
        const claimedNames = new Set<string>();
        const actions: ResolvedPluginAction[] = [];
        for (const plugin of this.enabledPluginsForPackage(packageId, globalOrder)) {
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
              || claimedNames.has(commandName)
            ) {
              continue;
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
      const records = await selectAll<Plugin>(pluginTable);
      const persistedBuiltin = records
        .map((record) => record.value)
        .find(
          (record) =>
            isPluginRecord(record)
            && record.id === builtinCorePluginId,
        );
      this.plugins = records
        .map((record) => record.value)
        .filter(
          (record) =>
            isPluginRecord(record)
            && record.id !== builtinCorePluginId,
        )
        .map(normalizePlugin);
      this.plugins.push(
        persistedBuiltin
          ? {
              ...normalizePlugin(persistedBuiltin),
              id: builtinCorePluginId,
              packageId: null,
              builtIn: true,
            }
          : createBuiltinPlugin(),
      );
      this.activePluginId = this.sortedPlugins[0]?.id ?? "";
      this.loaded = true;
    },
    async persistPlugin(plugin: Plugin) {
      await upsert(pluginTable, plugin.id, clonePlain(plugin));
    },
    openPlugin(pluginId: string) {
      if (this.plugins.some((plugin) => plugin.id === pluginId)) {
        this.activePluginId = pluginId;
      }
    },
    async createPlugin(packageId: string) {
      const plugin = createStarterPlugin(packageId);
      plugin.order =
        Math.max(
          -1,
          ...this.plugins
            .filter((item) => !item.builtIn && item.packageId === packageId)
            .map((item) => item.order ?? -1),
        ) + 1;
      this.plugins.push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async createGlobalPlugin() {
      const plugin = createStarterPlugin(null, true);
      plugin.order =
        Math.max(-1, ...this.externalGlobalPlugins.map((item) => item.order ?? -1))
        + 1;
      this.plugins.push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async importGlobalPlugin(value: unknown) {
      const plugin = normalizeImportedGlobalPlugin(
        value,
        Math.max(-1, ...this.externalGlobalPlugins.map((item) => item.order ?? -1))
          + 1,
      );
      this.plugins.push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async updatePlugin(
      pluginId: string,
      patch: Partial<Omit<Plugin, "id" | "root" | "builtIn">>,
    ) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      if (!plugin) return;
      Object.assign(plugin, patch);
      await this.persistPlugin(plugin);
    },
    async restoreBuiltInPlugin(pluginId: string) {
      if (pluginId !== builtinCorePluginId) return null;
      const restored = createBuiltinPlugin();
      const index = this.plugins.findIndex((item) => item.id === pluginId);
      if (index >= 0) {
        this.plugins.splice(index, 1, restored);
      } else {
        this.plugins.push(restored);
      }
      await this.persistPlugin(restored);
      return restored;
    },
    async deletePlugin(pluginId: string) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      if (!plugin || plugin.builtIn) return;
      const { useConversationStore } = await import(
        "@/features/Resources/Conversation/application/conversation-store"
      );
      const conversation = useConversationStore();
      await conversation.initialize();
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
      this.plugins = this.plugins.filter((item) => item.id !== pluginId);
      await remove(pluginTable, pluginId);
      this.activePluginId = this.sortedPlugins[0]?.id ?? "";
    },
    async movePluginBefore(
      pluginId: string,
      beforePluginId: string,
      packageId?: string | null,
    ) {
      if (pluginId === beforePluginId) return;
      const moving = this.plugins.find((plugin) => plugin.id === pluginId);
      const target = this.plugins.find((plugin) => plugin.id === beforePluginId);
      if (
        !moving
        || !target
        || moving.builtIn
        || !packageId
        || moving.packageId !== packageId
        || target.packageId !== packageId
      ) {
        return;
      }
      const ordered = this.sortedPluginsForPackage(packageId)
        .filter(
          (plugin) => plugin.packageId === packageId && plugin.id !== moving.id,
        );
      const targetIndex = ordered.findIndex((plugin) => plugin.id === target.id);
      ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, moving);
      ordered.forEach((plugin, index) => {
        plugin.order = index;
      });
      await Promise.all(ordered.map((plugin) => this.persistPlugin(plugin)));
    },
    async moveGlobalPluginBefore(pluginId: string, beforePluginId?: string) {
      const moving = this.plugins.find((plugin) => plugin.id === pluginId);
      if (!moving || moving.packageId !== null || moving.builtIn) return;
      const ordered = this.externalGlobalPlugins.filter(
        (plugin) => plugin.id !== moving.id,
      );
      const targetIndex = beforePluginId
        ? ordered.findIndex((plugin) => plugin.id === beforePluginId)
        : -1;
      ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, moving);
      ordered.forEach((plugin, index) => {
        plugin.order = index;
      });
      await Promise.all(ordered.map((plugin) => this.persistPlugin(plugin)));
    },
    findNode(pluginId: string, nodeId: string) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      return plugin ? findPluginTreeNode(plugin.root, nodeId) : null;
    },
    async createFile(
      pluginId: string,
      parentFolderId: string,
      input: { name?: string; content?: unknown; priority?: number } = {},
    ) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const parent = plugin
        ? findPluginTreeNode(plugin.root, parentFolderId)
        : null;
      if (!plugin || parent?.kind !== "folder") return null;
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
        },
      );
      parent.children.push(file);
      parent.collapsed = false;
      await this.persistPlugin(plugin);
      return file;
    },
    async createFolder(
      pluginId: string,
      parentFolderId: string,
      name = "新文件夹",
    ) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
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
        }
      >,
    ) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const node = plugin ? findPluginTreeNode(plugin.root, nodeId) : null;
      if (!plugin || !node) return;
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
        node.content =
          pluginFileType(node.name) === "interactive-document"
            ? normalizeInteractiveDocumentSource(patch.content)
            : clonePlain(patch.content);
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
      if (node.kind === "folder" && typeof patch.collapsed === "boolean") {
        node.collapsed = patch.collapsed;
      }
      await this.persistPlugin(plugin);
    },
    async deleteNode(pluginId: string, nodeId: string) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
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
    },
    async moveNode(
      pluginId: string,
      nodeId: string,
      targetFolderId: string,
      beforeNodeId?: string,
    ) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
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
      await this.persistPlugin(plugin);
    },
  },
});
