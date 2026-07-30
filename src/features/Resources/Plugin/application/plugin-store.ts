import { defineStore } from "pinia";
import { remove, selectAll, upsert } from "@/features/Database/application/database-service";
import {
  builtinProjectAgentPackageId,
  builtinProjectAgentPluginId,
} from "@/features/Agent/domain/project-agent";
import {
  normalizeInteractiveDocumentSource,
} from "@/features/Resources/InteractiveDoc/domain/interactive-document";
import {
  interactiveDocumentFormatPrompt,
} from "@/features/Resources/InteractiveDoc/domain/interactive-document-format";
import {
  findPluginNodeByPath,
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
  input: Partial<PluginTreeNodeBase> = {},
): PluginFile {
  return {
    ...createNodeBase(name, input),
    kind: "file",
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
    "文件通过容器声明和 `<@...>` 显式引用参与解析；文件类型由名称后缀决定。",
  ].join("\n");
}

function createStarterRoot(name: string): PluginFolder {
  return createFolder("/", [
    createFile(pluginConventions.info, starterInfo(name), { order: 0 }),
    createFile(
      pluginConventions.context,
      createDefaultContextDocument(),
      { order: 1 },
    ),
    createFile(
      pluginConventions.generation,
      "",
      { order: 2 },
    ),
    createFolder(pluginConventions.backgroundFolder, [], { order: 3 }),
    createFolder("character", [
      createFile(
        "default.md",
        [
          '<member_of container="container:plugin/会话上下文" as="character" />',
          "",
          "保持清晰、可靠，并尊重当前对话上下文。",
        ].join("\n"),
        { order: 0 },
      ),
    ], { order: 4 }),
    createFolder(pluginConventions.actionFolder, [], { order: 5 }),
    createFolder("components", [], { order: 6 }),
  ], { id: crypto.randomUUID() });
}

function createDefaultContextDocument() {
  return [
    '<container name="会话上下文" scope="plugin" />',
    "",
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
      [
        '<container name="基础上下文" scope="global" />',
        '<member_of container="container:global/基础上下文" as="apiDocumentation" />',
        "",
        "{{CAPABILITIES_PROMPT}}",
      ].join("\n"),
      {
        id: "builtin-api-documentation",
        order: 7,
      },
    ),
    createFolder("tool", [
      createFile(
        "executeJavaScript.json",
        {
          toolName: "executeJavaScript",
          environment: "capabilities",
        },
        {
          id: "builtin-tool-execute-javascript",
          order: 0,
        },
      ),
    ], { order: 8 }),
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

function createProjectAgentPlugin(): Plugin {
  const root = createFolder("/", [
    createFile(
      pluginConventions.info,
      [
        "# PulsarAI Project Agent",
        "",
        "这个内置插件把项目级 Agent 接入 PulsarAI 角色包。",
        "项目由会话的 `projectPackageId` 指定，Agent 通过受限的文件系统式 API 读取和修改该项目。",
      ].join("\n"),
      { id: "builtin-project-agent-info", order: 0 },
    ),
    createFile(
      pluginConventions.context,
      [
        '<container name="项目上下文" scope="plugin">',
        '  <include as="base">container:global/基础上下文</include>',
        "</container>",
        "",
        '<prompt_template name="project-agent" role="system">',
        "{{PROJECT_AGENT_PROMPT}}",
        "",
        "[[chat]]",
        "</prompt_template>",
        "",
        "<data>",
        "</data>",
      ].join("\n"),
      {
        id: "builtin-project-agent-context-file",
        order: 1,
      },
    ),
    createFile(
      pluginConventions.generation,
      "",
      { id: "builtin-project-agent-generation", order: 2 },
    ),
    createFile(
      "AGENTS.md",
      [
        "# Project Agent Instructions",
        "",
        "- Inspect before editing.",
        "- Treat a role-playing package as one coherent system.",
        "- Keep existing ids stable and create UUIDs for new structured nodes.",
        "- Modify only the selected project's conversations and local plugins.",
        "- Read back important writes and summarize changed paths.",
      ].join("\n"),
      { id: "builtin-project-agent-instructions", order: 3 },
    ),
    createFolder("reference", [
      createFile(
        "interactive-document.md",
        interactiveDocumentFormatPrompt,
        { id: "builtin-project-agent-imd-reference", order: 0 },
      ),
      createFile(
        "plugin-files.md",
        [
          "# Plugin file conventions",
          "",
          "- `info.md` documents a plugin.",
          "- Root `context.imd` is the role-aware generation entry document.",
          "- `generation.js` may override the default Agent process.",
          "- File semantics come from suffixes such as `.md`, `.imd`, `.js`, `.json`, media, and component files.",
          "- Cross-resource access uses explicit `<@local:...>`, `<@path:...>`, `<@id:...>`, or `<@container:scope/name>` references.",
          "- Containers are declared in files and remain lazy namespaces instead of being flattened into the Sandbox environment.",
        ].join("\n"),
        { id: "builtin-project-agent-plugin-reference", order: 1 },
      ),
    ], { id: "builtin-project-agent-reference", order: 4 }),
  ], { id: "builtin-project-agent-root" });

  return {
    id: builtinProjectAgentPluginId,
    packageId: builtinProjectAgentPackageId,
    name: "项目 Agent",
    icon: "",
    shortDescription: "读取并修改指定角色包项目",
    root,
    enabled: true,
    main: true,
    builtIn: true,
    order: -10_000,
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
            if (
              pluginFileType(resource.name) !== "javascript"
              || !commandName
              || claimedNames.has(commandName)
            ) {
              continue;
            }
            claimedNames.add(commandName);
            actions.push({
              pluginId: plugin.id,
              pluginName: plugin.name,
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
      this.plugins = records
        .map((record) => record.value)
        .filter(
          (record) =>
            isPluginRecord(record)
            && record.id !== builtinCorePluginId
            && record.id !== builtinProjectAgentPluginId,
        )
        .map(normalizePlugin);
      this.plugins.push(createBuiltinPlugin(), createProjectAgentPlugin());
      await Promise.all(this.plugins.map((plugin) => this.persistPlugin(plugin)));
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
      if (plugin.builtIn) {
        if (typeof patch.enabled === "boolean") {
          plugin.enabled = patch.enabled;
          await this.persistPlugin(plugin);
        }
        return;
      }
      Object.assign(plugin, patch);
      await this.persistPlugin(plugin);
    },
    async deletePlugin(pluginId: string) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      if (!plugin || plugin.builtIn) return;
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
      input: { name?: string; content?: unknown } = {},
    ) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const parent = plugin
        ? findPluginTreeNode(plugin.root, parentFolderId)
        : null;
      if (!plugin || plugin.builtIn || parent?.kind !== "folder") return null;
      const file = createFile(
        input.name?.trim() || "untitled.md",
        input.content ?? "",
        {
          order:
            Math.max(-1, ...parent.children.map((child) => child.order ?? -1)) + 1,
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
      if (!plugin || plugin.builtIn || parent?.kind !== "folder") return null;
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
        PluginTreeNodeBase & { content: unknown; collapsed: boolean }
      >,
    ) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const node = plugin ? findPluginTreeNode(plugin.root, nodeId) : null;
      if (!plugin || plugin.builtIn || !node) return;
      if (typeof patch.name === "string" && patch.name.trim()) {
        node.name = patch.name.trim();
      }
      if (typeof patch.icon === "string") node.icon = patch.icon;
      if (node.kind === "file" && "content" in patch) {
        node.content =
          pluginFileType(node.name) === "interactive-document"
            ? normalizeInteractiveDocumentSource(patch.content)
            : clonePlain(patch.content);
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
      if (!plugin || plugin.builtIn || !parent) return;
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
        || plugin.builtIn
        || !sourceParent
        || target?.kind !== "folder"
        || !node
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
      await this.persistPlugin(plugin);
    },
  },
});
