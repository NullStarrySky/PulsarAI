import type {
  CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";

export const pluginCapabilitiesDefinition: CapabilityDefinition = {
  id: "plugin",
  title: "插件文件",
  description: "查询可见插件；插件流程还可以在继承角色包权限的基础上管理自己的文件树。",
  documentation: {
    overview: "用于检查当前角色包实际启用的插件与容器拓扑，并让正在执行的插件在自身文件树内读取或维护资源。",
    notes: [
      "容器查询只包含当前生成上下文中已启用的插件；使用文档只统计直接显式引用该容器的文件。",
      "容器、使用文档和现有内容都返回资源 ID 与插件内路径，便于继续查询或显式引用。",
      "角色包只拥有一个本地资源插件；主要插件和全局启用集合通过稳定 ID 显式配置，不存在插件顺序。",
      "setMainPlugin 同时要求有效的 context.md 与 agentprocess/index.js；同名 Action、Tool 或全局容器会阻止组合。",
      "getSelf、文件写入和 Container CRUD 只在插件流程中可用，并且只能修改当前正在执行的插件。",
      "容器定义保存在根 containers.json；内容关系保存在文件 memberships 元数据中，API 不会把成员声明写进正文。",
      "manifest.json 的根类型固定为 PluginManifestGroupContent[]；配置值统一通过 group.id/content.id 寻址。",
      "Markdown 可用 <@config:local/group/content> 读取当前插件配置，或用 <@config:global/pluginId/group/content> 读取已启用全局插件配置。容器成员条件只允许 local 引用。",
    ],
    types: [
      {
        name: "PluginSummary",
        description: "插件身份与启用状态摘要。",
        definition: `type PluginSummary = {
  id: string;
  name: string;
  shortDescription: string;
  packageId: string | null;
  enabled: boolean;
  builtIn: boolean;
  active: boolean;
  local: boolean;
  main: boolean;
};`,
      },
      {
        name: "PluginNode",
        description: "插件文件树节点；文件节点包含内容、优先级、引用和容器成员关系。",
        definition: `type PluginNode = {
  id: string;
  name: string;
  path?: string;
  kind: "file" | "folder";
  icon: string;
  type?: "markdown" | "data" | "javascript" | "json" | "media" | "component" | "text";
  content?: unknown;
  priority?: number;
  references?: string[];
  memberships?: Array<{
    container: string;
    alias: string;
    condition?: PluginContainerCondition;
  }>;
  dataReferences?: Array<{ alias: string; dataId: string }>;
  containers?: PluginContainerDeclaration[];
  children?: PluginNode[];
};`,
      },
      {
        name: "PluginManifestValue",
        description: "manifest.json 配置项可以保存的 JSON 值。",
        definition: `type PluginManifestValue =
  | null | boolean | number | string
  | PluginManifestValue[]
  | { [key: string]: PluginManifestValue };`,
      },
      {
        name: "PluginManifestGroupContent",
        description: "manifest.json 的唯一根结构；组和配置项都使用稳定 ID。",
        definition: `type PluginManifestGroupContent = {
  group: { id: string; title: string; description?: string };
  content: Array<{
    id: string;
    title: string;
    description?: string;
    component: string;
    props?: Record<string, PluginManifestValue>;
    value: PluginManifestValue;
  }>;
};`,
      },
      {
        name: "PluginManifestQuery",
        description: "Manifest API 返回的配置内容、文件定位和校验信息。",
        definition: `type PluginManifestQuery = {
  id: string;
  path: "/manifest.json";
  pluginId: string;
  pluginName: string;
  groups: PluginManifestGroupContent[];
  diagnostics: Array<{ path: string; message: string }>;
};`,
      },
      {
        name: "PluginContainerCondition",
        description: "容器成员的本地 manifest 注入条件；省略 equals 时按配置值真假判断。",
        definition: `type PluginContainerCondition = {
  reference: \`config:local/\${string}/\${string}\`;
  equals?: PluginManifestValue;
};`,
      },
      {
        name: "PluginContainerDeclaration",
        description: "写入 containers.json 的容器声明。",
        definition: `type PluginContainerDeclaration = {
  name: string;
  scope: "root" | "plugin" | "global";
  description?: string;
  imports: Array<{ alias: string; target: string }>;
};`,
      },
      {
        name: "PluginContainerSummary",
        description: "一个可查询容器及其定义来源和数量摘要。",
        definition: `type PluginContainerSummary = {
  id: string;
  name: string;
  scope: "root" | "plugin" | "global";
  description?: string;
  pluginId: string;
  pluginName: string;
  definitionId: string;
  path: string;
  usedByCount: number;
  contentCount: number;
};`,
      },
      {
        name: "PluginContainerResource",
        description: "使用容器或作为容器内容的插件资源定位信息。",
        definition: `type PluginContainerResource = {
  id: string;
  name: string;
  path: string;
  type: "markdown" | "data" | "javascript" | "json" | "media" | "component" | "text";
  priority: number;
  pluginId: string;
  pluginName: string;
};`,
      },
      {
        name: "PluginContainerDetails",
        description: "容器摘要、直接使用文档和已解析内容。",
        definition: `type PluginContainerDetails = PluginContainerSummary & {
  usedBy: PluginContainerResource[];
  contents: Array<PluginContainerResource & {
    alias: string;
    condition?: PluginContainerCondition;
  }>;
};`,
      },
      {
        name: "PluginContainerDefinition",
        description: "Container CRUD 返回的当前插件容器定位信息。",
        definition: `type PluginContainerDefinition = PluginContainerDeclaration & {
  id: string;
  pluginId: string;
  pluginName: string;
  definitionId: string;
  path: string;
};`,
      },
      {
        name: "PluginDataBinding",
        description: "资源元数据中的 .data 引用及实时解析的定位与隔离信息。",
        definition: `type PluginDataBinding = {
  alias: string;
  dataId: string;
  resourceId: string;
  path: string;
  isolation: "resource" | "conversation";
  writable: boolean;
  pluginId: string;
  pluginName: string;
};`,
      },
    ],
  },
  subCaps: {
    all: "全部插件文件权限",
    read: "读取可见插件并管理当前插件自身",
  },
  api: {
    read: [
      {
        name: "list",
        signature: "list(): PluginSummary[]",
        description: "列出当前角色包唯一的本地资源插件以及所有已安装全局插件，不使用插件顺序。",
        returns: "插件 ID、名称、来源角色包、安装启用状态，以及 active、local、main 和 builtIn 标记。",
        example: "plugin.list()",
      },
      {
        name: "getPackageConfiguration",
        signature: "getPackageConfiguration(): { packageId: string; pluginId: string; mainPluginId: string; enabledGlobalPluginIds: string[] } | null",
        description: "读取当前角色包唯一资源插件、显式主要插件和无顺序的全局插件启用集合。",
        returns: "所有关系均使用稳定 ID；没有活动角色包时返回 null。",
        example: "plugin.getPackageConfiguration()",
      },
      {
        name: "setMainPlugin",
        signature: "setMainPlugin(pluginId: string): Promise<ReturnType<typeof plugin.getPackageConfiguration>>",
        description: "把当前角色资源插件或一个全局插件设为主要插件；目标必须包含有效的 context.md 与 agentprocess/index.js。",
        returns: "更新后的角色包插件配置；选择全局插件时同时启用它。",
        example: "await plugin.setMainPlugin('builtin-core-plugin')",
      },
      {
        name: "setGlobalPluginEnabled",
        signature: "setGlobalPluginEnabled(pluginId: string, enabled: boolean): Promise<ReturnType<typeof plugin.getPackageConfiguration>>",
        description: "为当前角色包启用或停用全局插件。主要插件不能直接停用，必须先切换主要插件。",
        returns: "更新后的无顺序全局启用集合。",
        example: "await plugin.setGlobalPluginEnabled(pluginId, true)",
      },
      {
        name: "getTree",
        signature: "getTree(pluginId: string): PluginNode | null",
        description: "读取一个插件的嵌套文件树、容器声明和显式引用。",
        returns: "嵌套插件节点；插件不存在时返回 null。",
        example: "plugin.getTree('builtin-core-plugin')",
      },
      {
        name: "getPluginManifest",
        signature: "getPluginManifest(pluginId: string): PluginManifestQuery | null",
        description: "读取当前角色资源插件或任一全局插件的 manifest.json。",
        returns: "返回配置文件 ID、固定路径、来源插件、GroupContent[] 内容和校验诊断；插件不可见时返回 null。",
        example: "plugin.getPluginManifest(pluginId)",
      },
      {
        name: "resolveConfig",
        signature: "resolveConfig(reference: string): PluginManifestValue",
        description: "按与文档 <@...> 相同的命名空间解析配置值。local 指当前角色资源插件，global 必须显式携带已启用全局插件 ID。",
        returns: "group.id/content.id 对应配置项的 JSON 值；同时跟踪实际 manifest 资源。",
        example: "plugin.resolveConfig('<@config:global/builtin-core-plugin/appearance/background>')",
      },
      {
        name: "listContainers",
        signature: "listContainers(): PluginContainerSummary[]",
        description: "列出当前生成上下文中已启用的容器，并返回容器 ID、定义文件 ID/路径、来源插件和使用/内容数量。",
        returns: "数组条目包含 `{ id, name, scope, description?, pluginId, pluginName, definitionId, path, usedByCount, contentCount }`；id 可继续传给 getContainer。",
        example: "plugin.listContainers()",
      },
      {
        name: "getContainer",
        signature: "getContainer(containerId: string): PluginContainerDetails | null",
        description: "查询容器的直接使用文档与现有内容；每一项都包含资源 ID、插件内路径和来源插件。",
        returns: "`usedBy` 条目包含 `{ id, name, path, type, priority, pluginId, pluginName }`；`contents` 额外包含 `alias`。查询 ID 不存在时返回 null。",
        example: "plugin.getContainer(plugin.listContainers()[0].id)",
      },
      {
        name: "getDataReferences",
        signature: "getDataReferences(resourceId: string): PluginDataBinding[]",
        description: "查询资源元数据中的 .data 引用，并解析实际隔离级别和来源。",
        returns: "每项包含 alias、dataId、resourceId、path、isolation、pluginId 和 pluginName；ID 与路径可继续查询。",
        example: "plugin.getDataReferences(resourceId)",
      },
      {
        name: "createContainer",
        signature: "createContainer(input: { name: string; scope?: 'root' | 'plugin' | 'global'; description?: string; imports?: Array<{ alias: string; target: string }> }): Promise<PluginContainerDefinition>",
        description: "在当前插件根 containers.json 中创建容器；说明会规范为单行短文本。",
        returns: "新容器的 ID、定义文件 ID/路径、来源插件和完整声明。",
        example: "await plugin.createContainer({ name: '知识', scope: 'plugin', description: '按需加载的知识文档。' })",
      },
      {
        name: "updateContainer",
        signature: "updateContainer(containerId: string, patch: Partial<PluginContainerDeclaration>): Promise<PluginContainerDefinition>",
        description: "更新当前插件中的容器名称、作用域、说明或命名空间引用。",
        returns: "更新后的容器定位信息；名称或作用域变化时 ID 也会变化。",
        example: "await plugin.updateContainer(containerId, { description: '角色可选知识。' })",
      },
      {
        name: "removeContainer",
        signature: "removeContainer(containerId: string): Promise<PluginContainerDefinition>",
        description: "删除当前插件中的容器声明，不自动改写文档引用或文件成员元数据。",
        returns: "被删除的容器定位信息。",
        example: "await plugin.removeContainer(containerId)",
      },
      {
        name: "addContainerContent",
        signature: "addContainerContent(containerId: string, path: string, input?: { alias?: string; priority?: number; condition?: PluginContainerCondition }): Promise<PluginNode>",
        description: "把当前插件中的文件加入容器，并可同时设置别名、文件优先级和基于当前插件 manifest 的注入条件。",
        returns: "更新后的文件节点，包含 ID 与插件内路径。",
        example: "await plugin.addContainerContent(containerId, '/knowledge/world.md', { alias: 'world', priority: 120, condition: { reference: 'config:local/story/world', equals: true } })",
      },
      {
        name: "updateContainerContent",
        signature: "updateContainerContent(containerId: string, path: string, patch: { alias?: string; priority?: number; condition?: PluginContainerCondition | null }): Promise<PluginNode>",
        description: "更新当前插件中一个容器成员的别名、文件优先级或注入条件；condition: null 清除条件。",
        returns: "更新后的文件节点。",
        example: "await plugin.updateContainerContent(containerId, '/knowledge/world.md', { priority: 140 })",
      },
      {
        name: "removeContainerContent",
        signature: "removeContainerContent(containerId: string, path: string): Promise<PluginNode>",
        description: "移除当前插件文件与容器的成员关系，不删除文件本身。",
        returns: "更新后的文件节点。",
        example: "await plugin.removeContainerContent(containerId, '/knowledge/world.md')",
      },
      {
        name: "addDataReference",
        signature: "addDataReference(path: string, input: { alias: string; dataId: string }): Promise<PluginNode>",
        description: "在当前插件资源元数据中加入 .data 引用；隔离级别由目标 .data 自身定义。",
        returns: "更新后的资源节点，包含 dataReferences、资源 ID 与路径。",
        example: "await plugin.addDataReference('/character/alice.md', { alias: 'stats', dataId })",
      },
      {
        name: "removeDataReference",
        signature: "removeDataReference(path: string, alias: string): Promise<PluginNode>",
        description: "按 alias 移除当前插件资源元数据中的 .data 引用，不修改 .data 内容。",
        returns: "更新后的资源节点。",
        example: "await plugin.removeDataReference('/character/alice.md', 'stats')",
      },
      {
        name: "getSelf",
        signature: "getSelf(): PluginSummary",
        description: "返回当前正在执行的插件。只在插件流程中可用。",
        returns: "当前插件的 ID、名称、角色包、启用状态，以及 local/main 标记。",
        example: "plugin.getSelf()",
      },
      {
        name: "getManifest",
        signature: "getManifest(): PluginManifestQuery",
        description: "读取当前正在执行插件的 manifest.json 及资源 ID、路径和校验诊断。只在插件流程中可用。",
        returns: "当前插件的 PluginManifestQuery。",
        example: "plugin.getManifest()",
      },
      {
        name: "getConfig",
        signature: "getConfig(groupId: string, contentId: string): PluginManifestValue",
        description: "按 group.id/content.id 读取当前插件的一个配置值。只在插件流程中可用。",
        returns: "对应配置项的 JSON 值。",
        example: "plugin.getConfig('appearance', 'background')",
      },
      {
        name: "setConfig",
        signature: "setConfig(groupId: string, contentId: string, value: PluginManifestValue): Promise<PluginManifestQuery>",
        description: "修改当前插件已有配置项的 value，不改变组件和说明定义。只在插件流程中可用。",
        returns: "更新后的 manifest 定位和 GroupContent[]。",
        example: "await plugin.setConfig('story', 'world', true)",
      },
      {
        name: "replaceManifest",
        signature: "replaceManifest(manifest: PluginManifestGroupContent[]): Promise<PluginManifestQuery>",
        description: "校验并整体替换当前插件的 GroupContent[] manifest。只在插件流程中可用。",
        returns: "更新后的 manifest 定位、内容和诊断。",
        example: "await plugin.replaceManifest([{ group: { id: 'story', title: '剧情' }, content: [] }])",
      },
      {
        name: "read",
        signature: "read(path: string): PluginNode",
        description: "读取当前插件中的文件或文件夹。",
        returns: "带资源 ID 与插件内路径的文件或文件夹节点。",
        example: "plugin.read('/info.md')",
      },
      {
        name: "write",
        signature: "write(path: string, content: unknown): Promise<PluginNode>",
        description: "更新当前插件已有文件的内容。",
        returns: "更新后的文件节点。",
        example: "await plugin.write('/state.json', { count: 1 })",
      },
      {
        name: "create",
        signature: "create(path: string, input?: { kind?: 'file' | 'folder'; content?: unknown; priority?: number }): Promise<PluginNode>",
        description: "在当前插件中创建文件或文件夹。",
        returns: "新节点及其 ID 和插件内路径。",
        example: "await plugin.create('/notes/example.md', { content: '# Example' })",
      },
      {
        name: "move",
        signature: "move(from: string, toFolder: string, beforeName?: string): Promise<PluginNode>",
        description: "在当前插件文件树中移动节点。",
        returns: "移动后的节点及新路径。",
        example: "await plugin.move('/draft.md', '/notes')",
      },
      {
        name: "remove",
        signature: "remove(path: string): Promise<void>",
        description: "删除当前插件中的非固定约定节点。",
        returns: "删除完成后无返回值。",
        example: "await plugin.remove('/notes/example.md')",
      },
    ],
  },
};
