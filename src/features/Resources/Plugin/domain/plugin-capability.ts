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
      "getSelf、文件写入和 Container CRUD 只在插件流程中可用，并且只能修改当前正在执行的插件。",
      "容器定义保存在根 containers.xml；内容关系保存在文件 memberships 元数据中，API 不会把成员声明写进正文。",
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
  builtIn?: boolean;
  main?: boolean;
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
  type?: "markdown" | "interactive-document" | "javascript" | "json" | "media" | "component" | "text";
  content?: unknown;
  priority?: number;
  references?: string[];
  memberships?: Array<{ container: string; alias: string }>;
  containers?: PluginContainerDeclaration[];
  children?: PluginNode[];
};`,
      },
      {
        name: "PluginContainerDeclaration",
        description: "写入 containers.xml 的容器声明。",
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
  type: "markdown" | "interactive-document" | "javascript" | "json" | "media" | "component" | "text";
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
  contents: Array<PluginContainerResource & { alias: string }>;
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
        description: "列出当前角色包可见的插件。",
        returns: "插件 ID、名称、来源角色包、启用状态与系统标记。",
        example: "plugin.list()",
      },
      {
        name: "getTree",
        signature: "getTree(pluginId: string): PluginNode | null",
        description: "读取一个插件的嵌套文件树、容器声明和显式引用。",
        returns: "嵌套插件节点；插件不存在时返回 null。",
        example: "plugin.getTree('builtin-core-plugin')",
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
        name: "createContainer",
        signature: "createContainer(input: { name: string; scope?: 'root' | 'plugin' | 'global'; description?: string; imports?: Array<{ alias: string; target: string }> }): Promise<PluginContainerDefinition>",
        description: "在当前插件根 containers.xml 中创建容器；说明会规范为单行短文本。",
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
        signature: "addContainerContent(containerId: string, path: string, input?: { alias?: string; priority?: number }): Promise<PluginNode>",
        description: "把当前插件中的文件加入容器，并可同时设置别名与文件优先级。",
        returns: "更新后的文件节点，包含 ID 与插件内路径。",
        example: "await plugin.addContainerContent(containerId, '/knowledge/world.md', { alias: 'world', priority: 120 })",
      },
      {
        name: "updateContainerContent",
        signature: "updateContainerContent(containerId: string, path: string, patch: { alias?: string; priority?: number }): Promise<PluginNode>",
        description: "更新当前插件中一个容器成员的别名或文件优先级。",
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
        name: "getSelf",
        signature: "getSelf(): PluginSummary",
        description: "返回当前正在执行的插件。只在插件流程中可用。",
        returns: "当前插件的 ID、名称、角色包、启用状态和主要插件标记。",
        example: "plugin.getSelf()",
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
