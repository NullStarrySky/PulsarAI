import type {
  CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";

export const pluginCapabilitiesDefinition: CapabilityDefinition = {
  id: "plugin",
  title: "插件文件",
  description: "查询可见插件；插件流程还可以在继承角色包权限的基础上管理自己的文件树。",
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
        example: "plugin.list()",
      },
      {
        name: "getTree",
        signature: "getTree(pluginId: string): PluginTreeNodeSummary | null",
        description: "读取一个插件的嵌套文件树、容器声明和显式引用。",
        example: "plugin.getTree('builtin-core-plugin')",
      },
      {
        name: "getSelf",
        signature: "getSelf(): PluginSummary",
        description: "返回当前正在执行的插件。只在插件流程中可用。",
        example: "plugin.getSelf()",
      },
      {
        name: "read",
        signature: "read(path: string): PluginNode",
        description: "读取当前插件中的文件或文件夹。",
        example: "plugin.read('/info.md')",
      },
      {
        name: "write",
        signature: "write(path: string, content: unknown): Promise<PluginNode>",
        description: "更新当前插件已有文件的内容。",
        example: "await plugin.write('/state.json', { count: 1 })",
      },
      {
        name: "create",
        signature: "create(path: string, input?: { kind?: 'file' | 'folder'; content?: unknown; priority?: number }): Promise<PluginNode>",
        description: "在当前插件中创建文件或文件夹。",
        example: "await plugin.create('/notes/example.md', { content: '# Example' })",
      },
      {
        name: "move",
        signature: "move(from: string, toFolder: string, beforeName?: string): Promise<PluginNode>",
        description: "在当前插件文件树中移动节点。",
        example: "await plugin.move('/draft.md', '/notes')",
      },
      {
        name: "remove",
        signature: "remove(path: string): Promise<void>",
        description: "删除当前插件中的非固定约定节点。",
        example: "await plugin.remove('/notes/example.md')",
      },
    ],
  },
};
