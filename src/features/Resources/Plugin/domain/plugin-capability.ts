import type { CapabilityDefinition } from "@/features/Capabilities/domain/capability";

export const pluginCapabilitiesDefinition: CapabilityDefinition = {
  id: "plugin",
  title: "插件",
  description: "查询插件与容器；插件流程通过 files 操作自己的文件树。",
  documentation: {
    overview: "插件是数据库中的元信息与文件树。容器只索引资源，不会自动参与生成。",
    notes: [
      "主要插件必须具有有效的 manifest runtime/generatePath；生成流程自行读取容器并构造上下文。",
      "每个文件最多选择一个 insertion.target；order 越大，在容器查询结果中越靠前。",
      "imports.containers(scope, pattern) 使用 * 和 ? 匹配容器 ID，例如 depth:*。",
      "容器成员使用 <pluginId>/<插件内路径>；同名文件不会跨插件冲突。",
      "files 路径不能跨出插件根目录；edit 只接受唯一精准匹配。",
    ],
    types: [
      {
        name: "PluginSummary",
        definition: `type PluginSummary = {
  id: string; name: string; icon: string; description: string;
  packageId: string | null; enabled: boolean; builtIn: boolean; active: boolean;
};`,
      },
      {
        name: "PluginNode",
        definition: `type PluginNode = {
  id: string; name: string; path: string; kind: "file" | "folder";
  icon: string; treeOrder: number;
  type?: "markdown" | "chat" | "data" | "javascript" | "json" | "media" | "component" | "text";
  order?: number;
  insertion?: { target: string; condition?: string };
};`,
      },
      {
        name: "PluginContainer",
        definition: `type PluginContainer = {
  id: string; name: string; title: string; scope: "local" | "global";
  description?: string; contentSuffixes: string[];
  pluginId: string; pluginName: string; path: string;
};`,
      },
    ],
  },
  subCaps: {
    all: "全部插件权限",
    read: "读取插件与操作当前插件文件",
  },
  api: {
    read: [
      {
        name: "list",
        signature: "list(input?: { packageId?: string; activeOnly?: boolean }): PluginSummary[]",
        description: "列出插件，可按角色包或当前激活状态筛选。",
      },
      {
        name: "get",
        signature: "get(pluginId: string): PluginSummary | null",
        description: "按插件 ID 读取插件摘要。",
      },
      {
        name: "main",
        signature: "main(packageId?: string): PluginSummary",
        description: "读取角色包的主要插件；目标不存在或 generatePath 无效时抛错。",
      },
      {
        name: "createGlobal",
        signature: "createGlobal(input: { name: string; icon?: string; description?: string }): Promise<PluginSummary>",
        description: "创建空白全局插件。",
      },
      {
        name: "update",
        signature: "update(pluginId: string, patch: { id?: string; name?: string; icon?: string; description?: string; enabled?: boolean }): Promise<PluginSummary>",
        description: "更新插件元信息或启用状态。",
      },
      {
        name: "remove",
        signature: "remove(pluginId: string): Promise<void>",
        description: "删除非内置全局插件。",
      },
      {
        name: "restore",
        signature: "restore(pluginId: string): Promise<PluginSummary>",
        description: "把内置插件恢复为随应用发布的文件版本。",
      },
      {
        name: "listContainers",
        signature: "listContainers(input?: { scope?: 'local' | 'global' }): PluginContainer[]",
        description: "列出当前可见容器。",
      },
      {
        name: "getContainer",
        signature: "getContainer(scope: 'local' | 'global', id: string): PluginContainer | null",
        description: "读取指定容器及其资源索引。",
      },
      {
        name: "readContainer",
        signature: "readContainer(scope: 'local' | 'global', id: string): PluginContainer",
        description: "读取指定容器的全部资源内容。",
      },
      {
        name: "readContainers",
        signature: "readContainers(scope: 'local' | 'global', pattern: string): PluginContainer[]",
        description: "用 glob 一次取得多个容器，例如 depth:*。",
      },
      {
        name: "files.read",
        signature: "files.read(path: string): unknown",
        description: "读取当前插件文件内容。",
      },
      {
        name: "files.readMeta",
        signature: "files.readMeta(path: string): PluginNode",
        description: "读取当前插件节点元信息。",
      },
      {
        name: "files.write",
        signature: "files.write(path: string, content: unknown, meta?: { icon?: string; treeOrder?: number; order?: number; insertion?: { target: string; condition?: string } | null }): Promise<PluginNode>",
        description: "写入文件内容和可选元信息。",
      },
      {
        name: "files.edit",
        signature: "files.edit(path: string, find: string, replace: string): Promise<PluginNode>",
        description: "对文本文件执行唯一精准替换。",
      },
      {
        name: "files.exists",
        signature: "files.exists(path: string): boolean",
        description: "判断路径是否存在。",
      },
      {
        name: "files.list",
        signature: "files.list(path?: string): PluginNode[]",
        description: "列出文件夹直属节点。",
      },
      {
        name: "files.mkdir",
        signature: "files.mkdir(path: string): Promise<PluginNode>",
        description: "创建文件夹。",
      },
      {
        name: "files.move",
        signature: "files.move(from: string, to: string): Promise<PluginNode>",
        description: "移动或重命名节点。",
      },
      {
        name: "files.remove",
        signature: "files.remove(path: string): Promise<void>",
        description: "删除非固定约定节点。",
      },
      {
        name: "files.run",
        signature: "files.run(path: string, environment?: Record<string, unknown>): Promise<unknown>",
        description: "在当前插件的 imports 作用域内执行 JavaScript 文件。",
      },
    ],
  },
};
