import {
  createCapabilityBuilder,
} from "@/features/Capabilities/domain/capability";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import {
  pluginConventions,
  flattenPluginFiles,
  findPluginNodeByPath,
  findPluginTreeParent,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFile,
  pluginFileType,
  type PluginTreeNode,
} from "./domain/plugin-types";
import {
  findPluginReferenceTokens,
  parsePluginContainerDefinitions,
  type PluginContainerDeclaration,
  type PluginContainerImport,
  type PluginContainerScope,
} from "./domain/plugin-reference";
import { usePluginStore } from "./application/plugin-store";
import {
  createPluginContainerQueryId,
  createPluginReferenceResolver,
} from "./application/plugin-reference-resolver";
import {
  pluginCapabilitiesDefinition,
} from "./domain/plugin-capability";
import {
  isJsonValue,
  manifestValueAt,
  parsePluginManifest,
  parsePluginManifestReference,
  setManifestValue,
  type PluginManifest,
  type PluginManifestValue,
} from "./domain/plugin-manifest";

export const capabilities = pluginCapabilitiesDefinition;

function activePackagePluginConfiguration() {
  const activePackage = useConversationStore().activePackage;
  return activePackage
    ? {
        packageId: activePackage.id,
        pluginId: activePackage.pluginId,
        mainPluginId: activePackage.mainPluginId,
        enabledGlobalPluginIds: [...activePackage.enabledGlobalPluginIds],
      }
    : null;
}

function nodeSummary(
  node: PluginTreeNode,
  path: string[] = [],
): Record<string, unknown> {
  const nodePath = node.kind === "folder" && path.length === 0
    ? path
    : [...path, node.name];
  const source =
    node.kind === "file" && typeof node.content === "string"
      ? node.content
      : "";
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    icon: node.icon,
    ...(node.kind === "file"
      ? {
          type: pluginFileType(node.name),
          priority: node.priority,
          references: findPluginReferenceTokens(source).map(
            ({ target }) => target,
          ),
          containers:
            nodePath.join("/").toLocaleLowerCase()
              === pluginConventions.containers.toLocaleLowerCase()
              ? parsePluginContainerDefinitions(node.content).containers
              : [],
          memberships: node.memberships,
          dataReferences: node.dataReferences,
          ...(node.contextConfig ? { contextConfig: node.contextConfig } : {}),
          ...(node.contextPlacement
            ? { contextPlacement: node.contextPlacement }
            : {}),
        }
      : { children: node.children.map((child) => nodeSummary(child, nodePath)) }),
  };
}

function manifestSummary(plugin: Plugin) {
  const file = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
  if (file?.kind !== "file") return null;
  const parsed = parsePluginManifest(file.content);
  return {
    id: file.id,
    path: `/${pluginConventions.manifest}`,
    pluginId: plugin.id,
    pluginName: plugin.name,
    groups: structuredClone(parsed.manifest),
    diagnostics: structuredClone(parsed.diagnostics),
  };
}

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    list: () => {
      const conversation = useConversationStore();
      const activePackage = conversation.activePackage;
      return usePluginStore().plugins
        .filter((plugin) =>
          plugin.packageId === null || plugin.id === activePackage?.pluginId
        )
        .map(({ id, name, shortDescription, enabled, builtIn, packageId }) => ({
        id,
        name,
        shortDescription,
        enabled,
        builtIn,
        packageId,
        local: id === activePackage?.pluginId,
        main: id === activePackage?.mainPluginId,
        active: id === activePackage?.pluginId
          || id === activePackage?.mainPluginId
          || (
            enabled
            && activePackage?.enabledGlobalPluginIds.includes(id) === true
          ),
      }));
    },
    getPackageConfiguration: activePackagePluginConfiguration,
    async setMainPlugin(pluginId: string) {
      const conversation = useConversationStore();
      const activePackage = conversation.activePackage;
      const plugin = usePluginStore().plugins.find((item) => item.id === pluginId);
      if (!activePackage || !plugin) throw new Error("角色包或插件不存在。");
      if (plugin.packageId !== null && plugin.id !== activePackage.pluginId) {
        throw new Error("主要插件必须是当前角色资源插件或全局插件。");
      }
      const process = findPluginNodeByPath(plugin.root, [
        pluginConventions.agentProcessFolder,
        pluginConventions.agentProcessEntry,
      ]);
      const context = findPluginNodeByPath(plugin.root, pluginConventions.context);
      if (
        context?.kind !== "file"
        || pluginFileType(context.name) !== "markdown"
        || process?.kind !== "file"
        || pluginFileType(process.name) !== "javascript"
        || typeof process.content !== "string"
        || !process.content.trim()
      ) {
        throw new Error(`插件 ${plugin.name} 缺少有效的 context.md 或 agentprocess/index.js。`);
      }
      if (!plugin.enabled) {
        await usePluginStore().updatePlugin(plugin.id, { enabled: true });
      }
      await conversation.updatePackage(activePackage.id, {
        mainPluginId: plugin.id,
        enabledGlobalPluginIds: plugin.packageId === null
          ? [...new Set([...activePackage.enabledGlobalPluginIds, plugin.id])]
          : activePackage.enabledGlobalPluginIds,
      });
      return activePackagePluginConfiguration();
    },
    async setGlobalPluginEnabled(pluginId: string, enabled: boolean) {
      const conversation = useConversationStore();
      const activePackage = conversation.activePackage;
      const plugin = usePluginStore().plugins.find((item) => item.id === pluginId);
      if (!activePackage || !plugin || plugin.packageId !== null) {
        throw new Error("全局插件不存在。");
      }
      if (!enabled && activePackage.mainPluginId === plugin.id) {
        throw new Error("主要插件不能停用，请先选择另一个主要插件。");
      }
      if (enabled && !plugin.enabled) {
        throw new Error("该全局插件已在默认项中停用，需先启用安装级开关。");
      }
      await conversation.updatePackage(activePackage.id, {
        enabledGlobalPluginIds: enabled
          ? [...new Set([...activePackage.enabledGlobalPluginIds, plugin.id])]
          : activePackage.enabledGlobalPluginIds.filter((id) => id !== plugin.id),
      });
      return activePackagePluginConfiguration();
    },
    getTree: (pluginId: string) => {
      const activePackage = useConversationStore().activePackage;
      const plugin = usePluginStore().plugins.find((item) =>
        item.id === pluginId
        && (item.packageId === null || item.id === activePackage?.pluginId)
      );
      return plugin ? nodeSummary(plugin.root) : null;
    },
    getPluginManifest: (pluginId: string) => {
      const activePackage = useConversationStore().activePackage;
      const plugin = usePluginStore().plugins.find((item) =>
        item.id === pluginId
        && (item.packageId === null || item.id === activePackage?.pluginId)
      );
      return plugin ? manifestSummary(plugin) : null;
    },
    resolveConfig: (reference: string) => {
      const conversation = useConversationStore();
      const plugin = usePluginStore().plugins.find(
        (item) => item.id === conversation.activePackage?.pluginId,
      );
      const manifest = plugin
        ? findPluginNodeByPath(plugin.root, pluginConventions.manifest)
        : null;
      if (manifest?.kind !== "file") throw new Error("当前角色资源插件缺少 manifest.json。");
      return createVisibleContainerResolver().resolveFromResource(
        manifest.id,
        reference.trim().replace(/^<@|>$/g, ""),
      );
    },
    listContainers: () => createVisibleContainerResolver().listContainers(),
    getContainer: (containerId: string) =>
      createVisibleContainerResolver().getContainer(containerId),
    listContainerContents: (
      containerId: string,
      input?: { cursor?: number; limit?: number },
    ) => createVisibleContainerResolver().listContainerContents(containerId, input),
    readContainer: (
      containerId: string,
      resourceIds?: string[],
    ) => createVisibleContainerResolver().readContainer(containerId, resourceIds),
    getDataReferences: (resourceId: string) =>
      createVisibleContainerResolver().getDataReferences(resourceId),
  } : {}),
}));

function createVisibleContainerResolver() {
  const conversation = useConversationStore();
  const plugins = usePluginStore().enabledPluginsForPackage(
    conversation.activePackageId,
    conversation.activePackage?.enabledGlobalPluginIds,
    conversation.activePackage?.mainPluginId,
  );
  return createPluginReferenceResolver(plugins);
}

function normalizePath(path: string) {
  return path.trim().replace(/\\/g, "/").split("/").filter(Boolean);
}

function scopedNodeSummary(plugin: Plugin, node: PluginTreeNode) {
  return {
    ...nodeSummary(node, pluginNodePath(plugin.root, node.id).slice(0, -1)),
    path: `/${pluginNodePath(plugin.root, node.id).join("/")}`,
    ...(node.kind === "file" ? { content: structuredClone(node.content) } : {}),
  };
}

export function createPluginSelfApi(
  pluginId: string,
  grantedSubCaps: string[] = [],
) {
  const store = usePluginStore();
  const requirePlugin = () => {
    const plugin = store.plugins.find((item) => item.id === pluginId);
    if (!plugin) throw new Error("当前插件不存在。");
    return plugin;
  };
  const requireNode = (path: string) => {
    const plugin = requirePlugin();
    const node = findPluginNodeByPath(plugin.root, normalizePath(path));
    if (!node) throw new Error(`插件路径不存在：${path}`);
    return { plugin, node };
  };
  const requireContainersFile = () => {
    const plugin = requirePlugin();
    const node = findPluginNodeByPath(
      plugin.root,
      pluginConventions.containers,
    );
    if (node?.kind !== "file") {
      throw new Error("当前插件缺少根 containers.json。");
    }
    return { plugin, node };
  };
  const requireOwnContainer = (containerId: string) => {
    const { plugin, node } = requireContainersFile();
    const definitions = parsePluginContainerDefinitions(node.content);
    assertValidContainerDefinitions(definitions);
    const index = definitions.containers.findIndex(
      (container) =>
        createPluginContainerQueryId(
          container.scope,
          container.name,
          plugin.id,
        ) === containerId,
    );
    if (index < 0) {
      throw new Error(`当前插件没有容器：${containerId}`);
    }
    return {
      plugin,
      node,
      definitions,
      index,
      container: definitions.containers[index]!,
    };
  };
  const requireWrite = () => {
    if (!grantedSubCaps.includes("read") && !grantedSubCaps.includes("all")) {
      throw new Error("当前角色包没有授权 Plugin Feature。");
    }
  };
  const requireRead = () => {
    if (
      !grantedSubCaps.includes("read")
      && !grantedSubCaps.includes("all")
    ) {
      throw new Error("当前角色包没有授权插件读取权限。");
    }
  };

  return {
    getSelf() {
      requireRead();
      const plugin = requirePlugin();
      const activePackage = useConversationStore().activePackage;
      const main = activePackage?.mainPluginId === plugin.id;
      const local = activePackage?.pluginId === plugin.id;
      return {
        id: plugin.id,
        name: plugin.name,
        shortDescription: plugin.shortDescription,
        packageId: plugin.packageId,
        enabled: plugin.enabled,
        builtIn: plugin.builtIn,
        main,
        local,
        active: local
          || main
          || (
            plugin.enabled
            && activePackage?.enabledGlobalPluginIds.includes(plugin.id) === true
          ),
      };
    },
    getManifest() {
      requireRead();
      const summary = manifestSummary(requirePlugin());
      if (!summary) throw new Error("当前插件缺少 manifest.json。");
      return summary;
    },
    getConfig(groupId: string, contentId: string) {
      requireRead();
      const plugin = requirePlugin();
      const summary = manifestSummary(plugin);
      if (!summary) throw new Error("当前插件缺少 manifest.json。");
      if (summary.diagnostics.length) {
        throw new Error(`manifest.json 无效：${summary.diagnostics[0]!.message}`);
      }
      return manifestValueAt(summary.groups, groupId, contentId);
    },
    async setConfig(
      groupId: string,
      contentId: string,
      value: PluginManifestValue,
    ) {
      requireWrite();
      if (!isJsonValue(value)) throw new Error("Manifest 配置只能写入 JSON 值。");
      const plugin = requirePlugin();
      const node = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
      if (node?.kind !== "file") throw new Error("当前插件缺少 manifest.json。");
      const parsed = parsePluginManifest(node.content);
      if (parsed.diagnostics.length) {
        throw new Error(`manifest.json 无效：${parsed.diagnostics[0]!.message}`);
      }
      setManifestValue(parsed.manifest, groupId, contentId, value);
      await store.updateNode(plugin.id, node.id, { content: parsed.manifest });
      return manifestSummary(plugin);
    },
    async replaceManifest(manifest: PluginManifest) {
      requireWrite();
      const plugin = requirePlugin();
      const node = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
      if (node?.kind !== "file") throw new Error("当前插件缺少 manifest.json。");
      const parsed = parsePluginManifest(manifest);
      if (parsed.diagnostics.length) {
        throw new Error(`manifest.json 无效：${parsed.diagnostics[0]!.message}`);
      }
      await store.updateNode(plugin.id, node.id, { content: parsed.manifest });
      return manifestSummary(plugin);
    },
    read(path: string) {
      requireRead();
      const { plugin, node } = requireNode(path);
      return scopedNodeSummary(plugin, node);
    },
    async setContextDepth(path: string, depth: number | null) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只有文件可以加入深度容器。");
      if (depth !== null && (!Number.isInteger(depth) || depth < 0)) {
        throw new Error("深度 K 必须是非负整数或 null。");
      }
      if (depth !== null) {
        const conflict = store.plugins.flatMap((item) =>
          flattenPluginFiles(item.root).map((resource) => ({ plugin: item, resource })),
        ).find(({ resource }) =>
          resource.id !== node.id
          && resource.contextPlacement?.depth === depth
          && resource.name.toLocaleLowerCase() === node.name.toLocaleLowerCase()
        );
        if (conflict) {
          throw new Error(
            `深度容器 ${depth} 已有同名内容：${conflict.plugin.name}/${conflict.resource.name}`,
          );
        }
      }
      await store.updateNode(plugin.id, node.id, {
        contextPlacement: depth === null ? undefined : { depth },
      });
      return scopedNodeSummary(plugin, node);
    },
    async createContainer(input: {
      name: string;
      scope?: PluginContainerScope;
      description?: string;
      imports?: PluginContainerImport[];
    }) {
      requireWrite();
      const { plugin, node } = requireContainersFile();
      const definitions = parsePluginContainerDefinitions(node.content);
      assertValidContainerDefinitions(definitions);
      const container = normalizeContainerDeclaration(input);
      assertUniqueContainer(definitions.containers, container);
      definitions.containers.push(container);
      await store.updateNode(plugin.id, node.id, {
        content: { containers: structuredClone(definitions.containers) },
      });
      return selfContainerSummary(plugin, node.id, container);
    },
    async updateContainer(
      containerId: string,
      patch: Partial<{
        name: string;
        scope: PluginContainerScope;
        description: string;
        imports: PluginContainerImport[];
      }>,
    ) {
      requireWrite();
      const { plugin, node, definitions, index, container } =
        requireOwnContainer(containerId);
      const updated = normalizeContainerDeclaration({
        ...container,
        ...patch,
      });
      assertUniqueContainer(definitions.containers, updated, index);
      definitions.containers[index] = updated;
      await store.updateNode(plugin.id, node.id, {
        content: { containers: structuredClone(definitions.containers) },
      });
      return selfContainerSummary(plugin, node.id, updated);
    },
    async removeContainer(containerId: string) {
      requireWrite();
      const { plugin, node, definitions, index, container } =
        requireOwnContainer(containerId);
      definitions.containers.splice(index, 1);
      await store.updateNode(plugin.id, node.id, {
        content: { containers: structuredClone(definitions.containers) },
      });
      return selfContainerSummary(plugin, node.id, container);
    },
    async addContainerContent(
      containerId: string,
      path: string,
      input: {
        alias?: string;
        priority?: number;
        condition?: PluginFile["memberships"][number]["condition"];
      } = {},
    ) {
      requireWrite();
      const { container } = requireOwnContainer(containerId);
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只有文件可以加入容器。");
      if (
        container.scope === "root"
        && pluginNodePath(plugin.root, node.id).length > 1
      ) {
        throw new Error("root 容器只对插件根目录中的文件可见。");
      }
      const target = explicitContainerTarget(container);
      if (node.memberships.some((item) => item.container === target)) {
        throw new Error(`资源已经属于容器：${container.name}`);
      }
      const memberships = [
        ...node.memberships,
        {
          container: target,
          alias: input.alias?.trim() ?? "",
          ...(input.condition ? { condition: normalizeMembershipCondition(input.condition) } : {}),
        },
      ];
      await store.updateNode(plugin.id, node.id, {
        memberships,
        ...(typeof input.priority === "number"
          ? { priority: input.priority }
          : {}),
      });
      return scopedNodeSummary(plugin, node);
    },
    async updateContainerContent(
      containerId: string,
      path: string,
      patch: {
        alias?: string;
        priority?: number;
        condition?: PluginFile["memberships"][number]["condition"] | null;
      },
    ) {
      requireWrite();
      const { container } = requireOwnContainer(containerId);
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只有文件可以属于容器。");
      const target = explicitContainerTarget(container);
      const membership = node.memberships.find(
        (item) => item.container === target,
      );
      if (!membership) throw new Error(`资源不属于容器：${container.name}`);
      const memberships = node.memberships.map((item) =>
        item === membership
          ? {
              ...item,
              alias: patch.alias?.trim() ?? item.alias,
              ...("condition" in patch
                ? {
                    condition: patch.condition
                      ? normalizeMembershipCondition(patch.condition)
                      : undefined,
                  }
                : {}),
            }
          : item
      );
      await store.updateNode(plugin.id, node.id, {
        memberships,
        ...(typeof patch.priority === "number"
          ? { priority: patch.priority }
          : {}),
      });
      return scopedNodeSummary(plugin, node);
    },
    async removeContainerContent(containerId: string, path: string) {
      requireWrite();
      const { container } = requireOwnContainer(containerId);
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只有文件可以属于容器。");
      const target = explicitContainerTarget(container);
      const memberships = node.memberships.filter(
        (item) => item.container !== target,
      );
      if (memberships.length === node.memberships.length) {
        throw new Error(`资源不属于容器：${container.name}`);
      }
      await store.updateNode(plugin.id, node.id, { memberships });
      return scopedNodeSummary(plugin, node);
    },
    getDataReferences(path: string) {
      requireRead();
      const { node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只有文件可以引用 .data。");
      return createVisibleContainerResolver().getDataReferences(node.id);
    },
    async addDataReference(
      path: string,
      input: { alias: string; dataId: string },
    ) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只有文件可以引用 .data。");
      const alias = input.alias.trim();
      const dataId = input.dataId.trim();
      if (!alias || !dataId) throw new Error("alias 与 dataId 不能为空。");
      if (node.dataReferences.some((item) => item.alias === alias)) {
        throw new Error(`Data 引用 alias 已存在：${alias}`);
      }
      const target = createVisibleContainerResolver().resourceById(dataId);
      if (!target || target.type !== "data") {
        throw new Error(`可见的 .data 资源不存在：${dataId}`);
      }
      await store.updateNode(plugin.id, node.id, {
        dataReferences: [...node.dataReferences, { alias, dataId }],
      });
      return scopedNodeSummary(plugin, node);
    },
    async removeDataReference(path: string, alias: string) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只有文件可以引用 .data。");
      const normalizedAlias = alias.trim();
      const dataReferences = node.dataReferences.filter(
        (item) => item.alias !== normalizedAlias,
      );
      if (dataReferences.length === node.dataReferences.length) {
        throw new Error(`Data 引用不存在：${normalizedAlias}`);
      }
      await store.updateNode(plugin.id, node.id, { dataReferences });
      return scopedNodeSummary(plugin, node);
    },
    async write(path: string, content: unknown) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      if (node.kind !== "file") throw new Error("只能写入文件。");
      await store.updateNode(plugin.id, node.id, { content });
      return scopedNodeSummary(plugin, node);
    },
    async create(
      path: string,
      input: {
        kind?: "file" | "folder";
        content?: unknown;
        priority?: number;
      } = {},
    ) {
      requireWrite();
      const plugin = requirePlugin();
      const parts = normalizePath(path);
      const name = parts.pop();
      if (!name) throw new Error("创建路径不能为空。");
      const parent = findPluginNodeByPath(plugin.root, parts);
      if (parent?.kind !== "folder") throw new Error("目标父路径不是文件夹。");
      const created = input.kind === "folder"
        ? await store.createFolder(plugin.id, parent.id, name)
        : await store.createFile(plugin.id, parent.id, {
            name,
            content: input.content ?? "",
            priority: input.priority,
          });
      if (!created) throw new Error(`无法创建插件路径：${path}`);
      return scopedNodeSummary(plugin, created);
    },
    async move(from: string, toFolder: string, beforeName?: string) {
      requireWrite();
      const plugin = requirePlugin();
      const source = findPluginNodeByPath(plugin.root, normalizePath(from));
      const target = findPluginNodeByPath(plugin.root, normalizePath(toFolder));
      if (!source || target?.kind !== "folder") throw new Error("移动路径不存在。");
      const before = beforeName
        ? sortPluginTreeNodes(target.children).find((item) => item.name === beforeName)
        : undefined;
      await store.moveNode(plugin.id, source.id, target.id, before?.id);
      return scopedNodeSummary(plugin, source);
    },
    async remove(path: string) {
      requireWrite();
      const { plugin, node } = requireNode(path);
      if (node.id === plugin.root.id) throw new Error("不能删除插件根目录。");
      const parent = findPluginTreeParent(plugin.root, node.id);
      await store.deleteNode(plugin.id, node.id);
      if (parent?.children.some((item) => item.id === node.id)) {
        throw new Error("该节点是固定插件约定，不能删除。");
      }
    },
  };
}

function normalizeContainerDeclaration(input: {
  name?: string;
  scope?: PluginContainerScope;
  description?: string;
  imports?: PluginContainerImport[];
}): PluginContainerDeclaration {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("容器名称不能为空。");
  const scope =
    input.scope === "root" || input.scope === "global"
      ? input.scope
      : "plugin";
  const description = input.description?.trim().replace(/\s+/g, " ") ?? "";
  const imports = (input.imports ?? []).map((item) => ({
    alias: item.alias.trim(),
    target: item.target.trim(),
  }));
  if (imports.some((item) => !item.alias || !item.target)) {
    throw new Error("容器引用必须同时包含 alias 与 target。");
  }
  if (new Set(imports.map((item) => item.alias)).size !== imports.length) {
    throw new Error("容器引用别名不能重复。");
  }
  return {
    name,
    scope,
    description,
    imports,
  };
}

function assertUniqueContainer(
  containers: PluginContainerDeclaration[],
  candidate: PluginContainerDeclaration,
  ignoredIndex = -1,
) {
  if (
    containers.some(
      (item, index) =>
        index !== ignoredIndex
        && item.scope === candidate.scope
        && item.name === candidate.name,
    )
  ) {
    throw new Error(
      `容器已经存在：${candidate.scope}/${candidate.name}`,
    );
  }
}

function explicitContainerTarget(container: PluginContainerDeclaration) {
  return `container:${container.scope}/${container.name}`;
}

function selfContainerSummary(
  plugin: Plugin,
  definitionId: string,
  container: PluginContainerDeclaration,
) {
  return {
    id: createPluginContainerQueryId(
      container.scope,
      container.name,
      plugin.id,
    ),
    name: container.name,
    scope: container.scope,
    description: container.description,
    imports: structuredClone(container.imports),
    pluginId: plugin.id,
    pluginName: plugin.name,
    definitionId,
    path: `/${pluginConventions.containers}`,
  };
}

function normalizeMembershipCondition(
  condition: NonNullable<PluginFile["memberships"][number]["condition"]>,
) {
  const parsed = parsePluginManifestReference(condition.reference);
  if (parsed.scope !== "local") {
    throw new Error("容器成员注入条件只允许引用 config:local/group/content。");
  }
  if (
    Object.prototype.hasOwnProperty.call(condition, "equals")
    && !isJsonValue(condition.equals)
  ) {
    throw new Error("容器成员注入条件的 equals 必须是 JSON 值。");
  }
  return {
    reference: `config:local/${parsed.groupId}/${parsed.contentId}`,
    ...(Object.prototype.hasOwnProperty.call(condition, "equals")
      ? { equals: structuredClone(condition.equals ?? null) }
      : {}),
  };
}

function assertValidContainerDefinitions(
  definitions: ReturnType<typeof parsePluginContainerDefinitions>,
) {
  if (!definitions.diagnostics.length) return;
  const diagnostic = definitions.diagnostics[0]!;
  throw new Error(`containers.json 无效：${diagnostic.path}：${diagnostic.message}`);
}
