import { defineStore } from "pinia";
import { remove, selectAll, upsert } from "@/features/Database/application/database-service";
import type {
  Plugin,
  PluginMetaEntry,
  PluginResource,
  PluginResourceCondition,
  PluginResourceContainer,
  ResolvedPluginAction,
} from "@/features/Resources/Plugin/domain/plugin-types";
import { builtinPluginContainerIds } from "@/features/Resources/Plugin/domain/plugin-types";
import { createPluginMediaContent } from "@/features/Resources/Plugin/domain/plugin-media";
import {
  defaultPluginInsertDepth,
  normalizePluginInsertDepth,
} from "@/features/Resources/Plugin/application/plugin-condition-environment";
import builtinClassroomBackgroundUrl from "@/features/Resources/Plugin/assets/builtin-classroom-background.png";

const pluginTable = "resource_plugins";
const builtinCorePluginId = "builtin-core-plugin";
const builtinClassroomBackgroundId = "builtin-background-classroom";
const builtinGetTimeActionId = "builtin-action-get-time";
const builtinExecuteJavaScriptToolId = "builtin-tool-execute-javascript";
const builtinApiDocumentationId = "builtin-api-documentation";
let initializePromise: Promise<void> | null = null;

function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function createMeta(key: string, value: string): PluginMetaEntry {
  return {
    id: crypto.randomUUID(),
    key,
    value,
  };
}

function createMarkdownResource(input: Partial<PluginResource> & Pick<PluginResource, "name" | "content">): PluginResource {
  return {
    id: crypto.randomUUID(),
    icon: "",
    description: "",
    enabled: true,
    inserted: false,
    insertPosition: "",
    insertDepth: defaultPluginInsertDepth,
    insertCondition: [],
    isTemplate: false,
    meta: {},
    order: 0,
    ...input,
  };
}

function createResourceContainer(input: PluginResourceContainer): PluginResourceContainer {
  return input;
}

function createBuiltinContainers(): PluginResourceContainer[] {
  return [
    createResourceContainer({
      id: builtinPluginContainerIds.background,
      name: "背景",
      icon: "",
      description: "会话区域背景资源，同一时间只采用优先级最高插件中的一个启用背景。",
      contentControl: {
        selectable: "single",
        insertable: false,
        templatable: false,
        importable: true,
        resourcesType: "media",
        defaultResource: {
          kind: "media",
          url: "",
          mediaType: "image",
        },
        allowFolder: false,
      },
      resources: [
        {
          id: builtinClassroomBackgroundId,
          name: "午后教室",
          icon: "",
          description: "Pulsar 内置的安静教室背景，适合小说阅读器。",
          enabled: true,
          inserted: false,
          insertPosition: "",
          insertDepth: defaultPluginInsertDepth,
          insertCondition: [],
          isTemplate: false,
          meta: { kind: "media", mediaType: "image" },
          content: createPluginMediaContent(builtinClassroomBackgroundUrl, "image"),
          order: 0,
        },
      ],
    }),
    createResourceContainer({
      id: builtinPluginContainerIds.character,
      name: "角色",
      icon: "",
      description: "角色设定片段，可多选并参与后续生成流程。",
      contentControl: {
        selectable: "multi",
        insertable: false,
        templatable: true,
        importable: true,
        resourcesType: "markdown",
        defaultResource: "",
        allowFolder: true,
      },
      resources: [],
    }),
    createResourceContainer({
      id: builtinPluginContainerIds.contextStructure,
      name: "上下文结构",
      icon: "",
      description: "对话上下文组织模板，同一插件容器中只启用一个。",
      contentControl: {
        selectable: "single",
        insertable: false,
        templatable: true,
        importable: true,
        resourcesType: "markdown",
        defaultResource: "",
        allowFolder: false,
      },
      resources: [],
    }),
    createResourceContainer({
      id: builtinPluginContainerIds.insertable,
      name: "可插入项",
      icon: "",
      description: "可按位置插入的 markdown 片段，资源元信息中记录插入位置。",
      contentControl: {
        selectable: "multi",
        insertable: true,
        templatable: true,
        importable: true,
        resourcesType: "markdown",
        defaultResource: "",
        allowFolder: true,
      },
      resources: [
        {
          id: builtinApiDocumentationId,
          name: "Feature API 文档",
          icon: "",
          description: "由权限系统生成并插入上下文的当前角色包 API 文档。",
          enabled: true,
          inserted: true,
          insertPosition: "API_DOCUMENTATION",
          insertDepth: defaultPluginInsertDepth,
          insertCondition: [],
          isTemplate: false,
          meta: { builtIn: true, source: "capabilities" },
          content: "{{CAPABILITIES_PROMPT}}",
          order: 0,
        },
      ],
    }),
    createResourceContainer({
      id: builtinPluginContainerIds.action,
      name: "Action",
      icon: "",
      description: "可在对话输入框中通过 / 调用的单次 JavaScript 动作。",
      contentControl: {
        selectable: "multi",
        insertable: true,
        templatable: false,
        importable: true,
        resourcesType: "action",
        defaultResource: "return { text: \"\", modelName: \"action\" };",
        allowFolder: false,
      },
      resources: [
        {
          id: builtinGetTimeActionId,
          name: "getTime",
          icon: "",
          description: "返回当前时间，不调用模型。",
          enabled: true,
          inserted: true,
          insertPosition: "ACTION",
          insertDepth: defaultPluginInsertDepth,
          insertCondition: [],
          isTemplate: false,
          meta: { builtIn: true },
          content: "return {\n  text: new Date().toLocaleString(),\n  modelName: \"action:getTime\",\n};",
          order: 0,
        },
      ],
    }),
    createResourceContainer({
      id: builtinPluginContainerIds.tool,
      name: "工具",
      icon: "",
      description: "内置 Agent 可调用的工具说明。具体实现仍由所属 Feature 注册。",
      contentControl: {
        selectable: "none",
        insertable: false,
        templatable: false,
        importable: false,
        resourcesType: "tool",
        allowFolder: false,
      },
      resources: [
        {
          id: builtinExecuteJavaScriptToolId,
          name: "executeJavaScript",
          icon: "",
          description: "在当前权限环境中执行 JavaScript，并调用已授权的 Feature API。",
          enabled: true,
          inserted: false,
          insertPosition: "",
          insertDepth: defaultPluginInsertDepth,
          insertCondition: [],
          isTemplate: false,
          meta: { builtIn: true, owner: "Agent" },
          content: {
            toolName: "executeJavaScript",
            environment: "capabilities",
          },
          order: 0,
        },
      ],
    }),
    createResourceContainer({
      id: builtinPluginContainerIds.component,
      name: "组件",
      icon: "",
      description: "组件资源仅作为内容资产存在，阶段 1 不参与选择状态。",
      contentControl: {
        selectable: "none",
        insertable: false,
        templatable: false,
        importable: true,
        resourcesType: "component",
        defaultResource: "<template>\n  <div />\n</template>",
        allowFolder: true,
      },
      resources: [],
    }),
  ];
}

function createBuiltinPlugin(): Plugin {
  return {
    id: builtinCorePluginId,
    packageId: null,
    name: "内置会话资源",
    icon: "",
    shortDescription: "Pulsar 默认资源容器",
    description: "内置插件提供固定容器 id，排在普通插件之后，用作会话资源的兜底来源。",
    meta: [
      createMeta("开发者", "Pulsar"),
      createMeta("类别", "内置"),
      createMeta("阶段", "资源控制"),
      createMeta("版本", "1"),
    ],
    resources: createBuiltinContainers(),
    enabled: true,
    main: false,
    builtIn: true,
    order: 10_000,
  };
}

function upgradeBuiltinPlugin(plugin: Plugin): Plugin {
  const defaults = createBuiltinPlugin();
  const backgroundDefault = defaults.resources.find(
    (container) => container.id === builtinPluginContainerIds.background,
  )!;
  const existingBackground = plugin.resources.find(
    (container) => container.id === builtinPluginContainerIds.background,
  );

  if (!existingBackground) {
    plugin.resources.push(backgroundDefault);
  } else {
    existingBackground.name = backgroundDefault.name;
    existingBackground.description = backgroundDefault.description;
    existingBackground.contentControl = clonePlain(backgroundDefault.contentControl);
    const classroom = existingBackground.resources.find(
      (resource) => resource.id === builtinClassroomBackgroundId,
    );
    const classroomDefault = backgroundDefault.resources[0]!;
    if (classroom) {
      classroom.name = classroomDefault.name;
      classroom.description = classroomDefault.description;
      classroom.meta = clonePlain(classroomDefault.meta);
      classroom.content = clonePlain(classroomDefault.content);
    } else {
      const hasEnabledBackground = existingBackground.resources.some((resource) => resource.enabled);
      existingBackground.resources.push({
        ...clonePlain(classroomDefault),
        enabled: !hasEnabledBackground,
        order: Math.max(-1, ...existingBackground.resources.map((resource) => resource.order ?? -1)) + 1,
      });
    }
  }

  for (const container of defaults.resources) {
    const existingContainer = plugin.resources.find((item) => item.id === container.id);
    if (!existingContainer) {
      plugin.resources.push(clonePlain(container));
      continue;
    }
    for (const resource of container.resources) {
      if (
        resource.meta.builtIn
        && !existingContainer.resources.some((item) => item.id === resource.id)
      ) {
        existingContainer.resources.push(clonePlain(resource));
      }
    }
  }
  return plugin;
}

function createStarterPlugin(packageId: string | null): Plugin {
  return {
    id: crypto.randomUUID(),
    packageId,
    name: "默认资源插件",
    icon: "",
    shortDescription: "用于普通对话的可编辑资源包",
    description: "",
    meta: [
      createMeta("开发者", "本地"),
      createMeta("类别", "会话资源"),
      createMeta("状态", "草稿"),
    ],
    generationProcess: "",
    resources: [
      {
        id: builtinPluginContainerIds.background,
        name: "背景",
        icon: "",
        description: "对话背景，单选。",
        contentControl: {
          selectable: "single",
          insertable: false,
          templatable: false,
          importable: true,
          resourcesType: "media",
          defaultResource: {
            kind: "media",
            url: "",
            mediaType: "image",
          },
          allowFolder: false,
        },
        resources: [
          {
            id: crypto.randomUUID(),
            name: "柔和背景",
            icon: "",
            description: "淡色渐变背景。",
            enabled: false,
            inserted: false,
            insertPosition: "",
            insertDepth: defaultPluginInsertDepth,
            insertCondition: [],
            isTemplate: false,
            meta: { kind: "media" },
            content: {
              kind: "media",
              url: "",
              mediaType: "image",
            },
            order: 0,
          },
        ],
      },
      {
        id: builtinPluginContainerIds.character,
        name: "角色",
        icon: "",
        description: "角色设定，可多选。",
        contentControl: {
          selectable: "multi",
          insertable: false,
          templatable: true,
          importable: true,
          resourcesType: "markdown",
          defaultResource: "## 角色\n\n",
          allowFolder: true,
        },
        resources: [
          createMarkdownResource({
            name: "默认助手",
            description: "基础助手人格片段。",
            content: "## 默认助手\n\n保持清晰、可靠，并尊重当前对话上下文。",
            order: 0,
          }),
        ],
      },
      {
        id: builtinPluginContainerIds.contextStructure,
        name: "上下文结构",
        icon: "",
        description: "上下文结构，单选。",
        contentControl: {
          selectable: "single",
          insertable: false,
          templatable: true,
          importable: true,
          resourcesType: "markdown",
          defaultResource: "## 上下文结构\n\n",
          allowFolder: false,
        },
        resources: [],
      },
      {
        id: builtinPluginContainerIds.insertable,
        name: "可插入项",
        icon: "",
        description: "可插入片段，可多选。",
        contentControl: {
          selectable: "multi",
          insertable: true,
          templatable: true,
          importable: true,
          resourcesType: "markdown",
          defaultResource: "",
          allowFolder: true,
        },
        resources: [],
      },
      {
        id: builtinPluginContainerIds.action,
        name: "Action",
        icon: "",
        description: "可在对话输入框中通过 / 调用的单次 JavaScript 动作。",
        contentControl: {
          selectable: "multi",
          insertable: true,
          templatable: false,
          importable: true,
          resourcesType: "action",
          defaultResource: "return { text: \"\", modelName: \"action\" };",
          allowFolder: false,
        },
        resources: [],
      },
      {
        id: builtinPluginContainerIds.tool,
        name: "工具",
        icon: "",
        description: "Agent 工具说明，无选择状态。",
        contentControl: {
          selectable: "none",
          insertable: false,
          templatable: false,
          importable: false,
          resourcesType: "tool",
          allowFolder: false,
        },
        resources: [],
      },
      {
        id: builtinPluginContainerIds.component,
        name: "组件",
        icon: "",
        description: "组件资产，无选择状态。",
        contentControl: {
          selectable: "none",
          insertable: false,
          templatable: false,
          importable: true,
          resourcesType: "component",
          defaultResource: "<template>\n  <div />\n</template>",
          allowFolder: true,
        },
        resources: [],
      },
    ],
    enabled: true,
    main: false,
    builtIn: false,
    order: 0,
  };
}

function compareLocalPlugins(a: Plugin, b: Plugin) {
  if (a.main !== b.main) {
    return a.main ? -1 : 1;
  }
  return (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "zh-Hans") || a.id.localeCompare(b.id);
}

function sortGlobalPlugins(plugins: Plugin[], localOrder: string[] = []) {
  const orderIndex = new Map(localOrder.map((pluginId, index) => [pluginId, index]));
  return [...plugins].sort((a, b) => {
    if (a.builtIn !== b.builtIn) {
      return a.builtIn ? 1 : -1;
    }
    const aIndex = orderIndex.get(a.id);
    const bIndex = orderIndex.get(b.id);
    if (aIndex !== undefined || bIndex !== undefined) {
      return (aIndex ?? Number.POSITIVE_INFINITY) - (bIndex ?? Number.POSITIVE_INFINITY);
    }
    return (a.order ?? 0) - (b.order ?? 0)
      || a.name.localeCompare(b.name, "zh-Hans")
      || a.id.localeCompare(b.id);
  });
}

function sortResources(resources: PluginResource[]) {
  return [...resources].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "zh-Hans"));
}

function normalizeImportedGlobalPlugin(value: unknown, order: number): Plugin {
  const candidate =
    value && typeof value === "object" && "plugin" in value
      ? (value as { plugin?: unknown }).plugin
      : value;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("插件文件必须包含一个 JSON 对象。");
  }

  const source = candidate as Partial<Plugin>;
  if (!Array.isArray(source.resources)) {
    throw new Error("插件文件缺少 resources 数组。");
  }
  const base = createStarterPlugin(null);

  return {
    ...base,
    id: crypto.randomUUID(),
    packageId: null,
    name: typeof source.name === "string" && source.name.trim()
      ? source.name.trim()
      : "导入的全局插件",
    icon: typeof source.icon === "string" ? source.icon : "",
    shortDescription:
      typeof source.shortDescription === "string" ? source.shortDescription : "",
    description: typeof source.description === "string" ? source.description : "",
    meta: Array.isArray(source.meta)
      ? source.meta
        .filter((entry): entry is PluginMetaEntry =>
          Boolean(entry)
          && typeof entry === "object"
          && typeof entry.key === "string"
          && typeof entry.value === "string",
        )
        .map((entry) => ({
          id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
          key: entry.key,
          value: entry.value,
        }))
      : [],
    generationProcess:
      typeof source.generationProcess === "string" ? source.generationProcess : "",
    resources: normalizeImportedContainers(source.resources),
    enabled: source.enabled !== false,
    main: false,
    builtIn: false,
    order,
  };
}

function normalizeImportedContainers(values: unknown[]): PluginResourceContainer[] {
  const builtinDefaults = createBuiltinContainers();
  const containerIds = new Set<string>();

  return values.map((value, containerIndex) => {
    if (!value || typeof value !== "object") {
      throw new Error(`第 ${containerIndex + 1} 个资源容器不是对象。`);
    }
    const source = value as Partial<PluginResourceContainer>;
    if (!Array.isArray(source.resources)) {
      throw new Error(`资源容器 ${source.name || containerIndex + 1} 缺少 resources 数组。`);
    }
    let id = typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : crypto.randomUUID();
    if (containerIds.has(id)) {
      id = crypto.randomUUID();
    }
    containerIds.add(id);

    const fallback = builtinDefaults.find((container) => container.id === id)
      ?? {
        id,
        name: "资源容器",
        icon: "",
        description: "",
        contentControl: {
          selectable: "multi" as const,
          insertable: false,
          templatable: false,
          importable: true,
          resourcesType: "markdown",
          defaultResource: "",
          allowFolder: false,
        },
        resources: [],
      };
    const control = source.contentControl;
    const selectable = control?.selectable;

    return {
      id,
      name: typeof source.name === "string" && source.name.trim()
        ? source.name.trim()
        : fallback.name,
      icon: typeof source.icon === "string" ? source.icon : "",
      description: typeof source.description === "string" ? source.description : "",
      contentControl: {
        ...fallback.contentControl,
        ...(control && typeof control === "object" ? clonePlain(control) : {}),
        selectable:
          selectable === "none" || selectable === "single" || selectable === "multi"
            ? selectable
            : fallback.contentControl.selectable,
        resourcesType:
          typeof control?.resourcesType === "string"
            ? control.resourcesType
            : fallback.contentControl.resourcesType,
      },
      resources: normalizeImportedResources(source.resources),
      collapsed: Boolean(source.collapsed),
    };
  });
}

function normalizeImportedResources(values: unknown[]): PluginResource[] {
  const resourceIds = new Set<string>();
  return values.map((value, resourceIndex) => {
    if (!value || typeof value !== "object") {
      throw new Error(`第 ${resourceIndex + 1} 个资源不是对象。`);
    }
    const source = value as Partial<PluginResource>;
    let id = typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : crypto.randomUUID();
    if (resourceIds.has(id)) {
      id = crypto.randomUUID();
    }
    resourceIds.add(id);

    const meta =
      source.meta && typeof source.meta === "object" && !Array.isArray(source.meta)
        ? clonePlain(source.meta)
        : {};
    return {
      id,
      name: typeof source.name === "string" && source.name.trim()
        ? source.name.trim()
        : `资源 ${resourceIndex + 1}`,
      icon: typeof source.icon === "string" ? source.icon : "",
      description: typeof source.description === "string" ? source.description : "",
      enabled: source.enabled !== false,
      inserted: source.inserted === true,
      insertPosition: normalizeInsertPosition(source, meta),
      insertDepth: normalizePluginInsertDepth(source.insertDepth),
      insertCondition: normalizePluginResourceConditions(source.insertCondition),
      isTemplate: source.isTemplate === true,
      meta,
      content: clonePlain(source.content ?? ""),
      order: typeof source.order === "number" ? source.order : resourceIndex,
      folderId: typeof source.folderId === "string" ? source.folderId : null,
    };
  });
}

function normalizePluginResourceConditions(value: unknown): PluginResourceCondition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((condition) => {
    if (typeof condition === "string" && condition.trim()) {
      return [{
        id: crypto.randomUUID(),
        functionName: "custom",
        arguments: [condition.trim()],
      }];
    }
    if (!condition || typeof condition !== "object") {
      return [];
    }
    const source = condition as Partial<PluginResourceCondition>;
    const functionName = typeof source.functionName === "string"
      ? source.functionName.trim()
      : "";
    if (!functionName) {
      return [];
    }
    return [{
      id: typeof source.id === "string" && source.id ? source.id : crypto.randomUUID(),
      functionName,
      arguments: Array.isArray(source.arguments)
        ? source.arguments.map((argument) => String(argument ?? ""))
        : [],
    }];
  });
}

function normalizeInsertPosition(
  source: Partial<PluginResource>,
  meta: Record<string, unknown>,
) {
  if (Object.prototype.hasOwnProperty.call(source, "insertPosition")) {
    return typeof source.insertPosition === "string"
      ? source.insertPosition.trim()
      : "";
  }
  for (const key of ["位置", "position", "insertPosition"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeStoredResource(resource: PluginResource): PluginResource {
  const meta = resource.meta && typeof resource.meta === "object" ? resource.meta : {};
  return {
    ...resource,
    insertPosition: normalizeInsertPosition(resource, meta),
    insertDepth: normalizePluginInsertDepth(resource.insertDepth),
    insertCondition: normalizePluginResourceConditions(resource.insertCondition),
    meta,
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
      const local = state.plugins.filter((plugin) => plugin.packageId !== null).sort(compareLocalPlugins);
      const global = sortGlobalPlugins(state.plugins.filter((plugin) => plugin.packageId === null));
      return [...local, ...global];
    },
    externalGlobalPlugins(state): Plugin[] {
      return sortGlobalPlugins(
        state.plugins.filter((plugin) => plugin.packageId === null && !plugin.builtIn),
      );
    },
    globalPlugins(state): Plugin[] {
      return sortGlobalPlugins(state.plugins.filter((plugin) => plugin.packageId === null));
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
    visiblePluginsForPackage(): (packageId?: string | null, globalOrder?: string[]) => Plugin[] {
      return (packageId?: string | null, globalOrder: string[] = []) => {
        const keyword = this.search.trim().toLowerCase();
        return this.sortedPluginsForPackage(packageId, globalOrder).filter((plugin) =>
          !keyword
          || plugin.name.toLowerCase().includes(keyword)
          || plugin.shortDescription.toLowerCase().includes(keyword),
        );
      };
    },
    enabledPluginsForPackage(): (packageId?: string | null, globalOrder?: string[]) => Plugin[] {
      return (packageId?: string | null, globalOrder: string[] = []) =>
        this.sortedPluginsForPackage(packageId, globalOrder).filter((plugin) => plugin.enabled);
    },
    activePlugin(state): Plugin | undefined {
      return state.plugins.find((plugin) => plugin.id === state.activePluginId);
    },
    activeBackgroundResourceForPackage(): (packageId?: string | null, globalOrder?: string[]) => PluginResource | null {
      return (packageId?: string | null, globalOrder: string[] = []) => {
        for (const plugin of this.enabledPluginsForPackage(packageId, globalOrder)) {
          const match = plugin.resources.find((item) => item.id === builtinPluginContainerIds.background);
          const selected = match
            ? sortResources(match.resources).find((resource) => resource.enabled)
            : null;
          if (selected) {
            return selected;
          }
        }
        return null;
      };
    },
    actionResourcesForPackage(): (packageId?: string | null, globalOrder?: string[]) => ResolvedPluginAction[] {
      return (packageId?: string | null, globalOrder: string[] = []) => {
        const claimedNames = new Set<string>();
        const actions: ResolvedPluginAction[] = [];
        for (const plugin of this.enabledPluginsForPackage(packageId, globalOrder)) {
          const container = plugin.resources.find(
            (item) => item.id === builtinPluginContainerIds.action,
          );
          for (const resource of sortResources(container?.resources ?? [])) {
            const commandName = resource.name.trim().toLocaleLowerCase();
            if (!resource.enabled || !commandName || claimedNames.has(commandName)) {
              continue;
            }
            claimedNames.add(commandName);
            actions.push({
              pluginId: plugin.id,
              pluginName: plugin.name,
              resource,
            });
          }
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
      const records = await selectAll<Plugin>(pluginTable);
      this.plugins = records.map((record) => record.value);

      const hasBuiltin = this.plugins.some((plugin) => plugin.id === builtinCorePluginId);
      if (!hasBuiltin) {
        this.plugins.push(createBuiltinPlugin());
      }

      this.plugins = this.plugins.map((plugin) => ({
        ...(plugin.builtIn ? upgradeBuiltinPlugin(plugin) : plugin),
        packageId: plugin.builtIn ? null : plugin.packageId ?? null,
        resources: plugin.resources.map((container) => ({
          ...container,
          resources: sortResources(container.resources.map(normalizeStoredResource)),
        })),
      }));

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
      plugin.name = "新插件";
      plugin.shortDescription = "";
      plugin.description = "";
      plugin.resources = createBuiltinContainers().map((container) => ({
        ...container,
        resources: [],
      }));
      plugin.order = Math.max(-1, ...this.plugins.filter((item) => !item.builtIn && item.packageId === packageId).map((item) => item.order ?? -1)) + 1;
      this.plugins.push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async createGlobalPlugin() {
      const plugin = createStarterPlugin(null);
      plugin.name = "新全局插件";
      plugin.shortDescription = "";
      plugin.description = "";
      plugin.resources = createBuiltinContainers().map((container) => ({
        ...container,
        resources: [],
      }));
      plugin.order = Math.max(-1, ...this.externalGlobalPlugins.map((item) => item.order ?? -1)) + 1;
      this.plugins.push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async importGlobalPlugin(value: unknown) {
      const plugin = normalizeImportedGlobalPlugin(
        value,
        Math.max(-1, ...this.externalGlobalPlugins.map((item) => item.order ?? -1)) + 1,
      );
      this.plugins.push(plugin);
      this.activePluginId = plugin.id;
      await this.persistPlugin(plugin);
      return plugin;
    },
    async updatePlugin(pluginId: string, patch: Partial<Omit<Plugin, "id" | "resources" | "builtIn">>) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      if (!plugin) {
        return;
      }
      Object.assign(plugin, patch);
      await this.persistPlugin(plugin);
    },
    async deletePlugin(pluginId: string) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      if (!plugin || plugin.builtIn) {
        return;
      }
      this.plugins = this.plugins.filter((item) => item.id !== pluginId);
      await remove(pluginTable, pluginId);
      this.activePluginId = this.sortedPlugins[0]?.id ?? "";
    },
    async movePluginBefore(pluginId: string, beforePluginId: string, packageId?: string | null) {
      if (pluginId === beforePluginId) {
        return;
      }
      const moving = this.plugins.find((plugin) => plugin.id === pluginId);
      const target = this.plugins.find((plugin) => plugin.id === beforePluginId);
      if (!moving || !target || moving.builtIn) {
        return;
      }

      if (!packageId || moving.packageId !== packageId || target?.packageId !== packageId) {
        return;
      }
      const ordered = this.sortedPluginsForPackage(packageId)
        .filter((plugin) => plugin.packageId === packageId && plugin.id !== moving.id);
      const targetIndex = ordered.findIndex((plugin) => plugin.id === target.id);
      ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, moving);
      ordered.forEach((plugin, index) => {
        plugin.order = index;
      });
      await Promise.all(ordered.map((plugin) => this.persistPlugin(plugin)));
    },
    async moveGlobalPluginBefore(pluginId: string, beforePluginId?: string) {
      const moving = this.plugins.find((plugin) => plugin.id === pluginId);
      if (!moving || moving.packageId !== null || moving.builtIn) {
        return;
      }
      const ordered = this.externalGlobalPlugins.filter((plugin) => plugin.id !== moving.id);
      const targetIndex = beforePluginId
        ? ordered.findIndex((plugin) => plugin.id === beforePluginId)
        : -1;
      ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, moving);
      ordered.forEach((plugin, index) => {
        plugin.order = index;
      });
      await Promise.all(ordered.map((plugin) => this.persistPlugin(plugin)));
    },
    effectiveContainer(
      containerId: string,
      packageId?: string | null,
      globalOrder: string[] = [],
    ): PluginResourceContainer | null {
      for (const plugin of this.enabledPluginsForPackage(packageId, globalOrder)) {
        const container = plugin.resources.find((item) => item.id === containerId);
        if (container) {
          return container;
        }
      }
      return null;
    },
    findContainer(pluginId: string, containerId: string) {
      return this.plugins.find((plugin) => plugin.id === pluginId)?.resources.find((container) => container.id === containerId);
    },
    findResource(pluginId: string, containerId: string, resourceId: string) {
      return this.findContainer(pluginId, containerId)?.resources.find((resource) => resource.id === resourceId);
    },
    async createResource(pluginId: string, containerId: string, input?: Partial<PluginResource>) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const container = plugin?.resources.find((item) => item.id === containerId);
      if (!plugin || !container) {
        return null;
      }
      const resource: PluginResource = {
        id: crypto.randomUUID(),
        name: input?.name?.trim() || "新资源",
        icon: input?.icon || "",
        description: input?.description || "",
        enabled: container.contentControl.selectable === "single" && container.resources.length === 0,
        inserted: false,
        insertPosition:
          container.id === builtinPluginContainerIds.action ? "ACTION" : "",
        insertDepth: defaultPluginInsertDepth,
        insertCondition: [],
        isTemplate: false,
        meta: {},
        content: clonePlain(input?.content ?? container.contentControl.defaultResource ?? ""),
        order: Math.max(-1, ...container.resources.map((item) => item.order ?? -1)) + 1,
      };
      container.resources.push(resource);
      await this.persistPlugin(plugin);
      return resource;
    },
    async updateResource(pluginId: string, containerId: string, resourceId: string, patch: Partial<Omit<PluginResource, "id">>) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const resource = plugin?.resources.find((item) => item.id === containerId)?.resources.find((item) => item.id === resourceId);
      if (!plugin || !resource) {
        return;
      }
      Object.assign(resource, patch);
      await this.persistPlugin(plugin);
    },
    async deleteResource(pluginId: string, containerId: string, resourceId: string) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const container = plugin?.resources.find((item) => item.id === containerId);
      if (!plugin || !container) {
        return;
      }
      container.resources = container.resources.filter((resource) => resource.id !== resourceId);
      await this.persistPlugin(plugin);
    },
    async toggleResourceEnabled(pluginId: string, containerId: string, resourceId: string, enabled: boolean) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const container = plugin?.resources.find((item) => item.id === containerId);
      const resource = container?.resources.find((item) => item.id === resourceId);
      if (!plugin || !container || !resource || container.contentControl.selectable === "none") {
        return;
      }
      if (enabled && container.contentControl.selectable === "single") {
        for (const item of container.resources) {
          item.enabled = item.id === resourceId;
        }
      } else {
        resource.enabled = enabled;
      }
      await this.persistPlugin(clonePlain(plugin));
    },
    async toggleResourceInserted(pluginId: string, containerId: string, resourceId: string, inserted: boolean) {
      const plugin = this.plugins.find((item) => item.id === pluginId);
      const container = plugin?.resources.find((item) => item.id === containerId);
      const resource = container?.resources.find((item) => item.id === resourceId);
      if (!plugin || !container || !resource || !container.contentControl.insertable) {
        return;
      }
      resource.inserted = inserted;
      await this.persistPlugin(plugin);
    },
  },
});
