import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "plugin",
  title: "插件",
  description: "文件系统与插件、容器、配置的高效直接交互方案。",
  documentation: {
    overview: "插件是数据库中的元信息与文件树。FS 函数已扁平置于环境顶层，支持 URI 前缀（@/ 为本地插件，@plugin-id/ 为目标插件）。",
    notes: [
      "路径前缀：@/ 表示当前插件，@xxx/ 表示指定插件 ID。read(\"@/\") 可读取当前插件摘要；write(\"@new-plugin/\") 在目标不存在时自动创建全局插件。",
      "容器 API 收拢在 container.*（list, get, read, import）；配置 API 收拢在 config.*（list, get, set）。",
      "remove(\"@/path\") 移除文件节点；remove(\"@xxx/\") 移除整个插件。",
      "import(\"@/path.js\") 替代原有 files.run，直接运行 JS 文件并包含静态依赖跟踪。",
      "grep(\"@/path\", \"pattern\") 提效全文正则或关键字匹配。",
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
  api: [
    {
      name: "read",
      signature: "read(path: string): Promise<unknown>",
      description: "读取文件内容或插件摘要。@/ 为当前插件，@xxx/ 为指定插件。",
    },
    {
      name: "readMeta",
      signature: "readMeta(path: string): PluginNode",
      description: "读取节点元信息。",
    },
    {
      name: "write",
      signature: "write(path: string, content: unknown, meta?: object): Promise<PluginNode | PluginSummary>",
      description: "写入文件或元信息。Conversation 生成期写入当前消息的资源 Overlay；管理界面调用则持久化基础节点。只有非 Overlay 调用可通过不存在的 @new-plugin/ 创建全局插件。",
    },
    {
      name: "edit",
      signature: "edit(path: string, find: string, replace: string): Promise<PluginNode>",
      description: "对文本文件执行唯一精准替换；Conversation 生成期结果进入资源 Overlay。",
    },
    {
      name: "ls",
      signature: "ls(path?: string): PluginNode[] | PluginSummary[]",
      description: "列出节点或插件。ls(\"@\") 列出所有插件；ls(\"@/\") 列出当前插件根节点。",
    },
    {
      name: "exists",
      signature: "exists(path: string): boolean",
      description: "判断节点或插件是否存在。",
    },
    {
      name: "mkdir",
      signature: "mkdir(path: string): Promise<PluginNode>",
      description: "创建文件夹；Conversation 生成期结果进入资源 Overlay。",
    },
    {
      name: "move",
      signature: "move(from: string, to: string): Promise<PluginNode>",
      description: "移动或重命名节点；Conversation Overlay 不移动插件根。",
    },
    {
      name: "remove",
      signature: "remove(targetPath: string): Promise<void>",
      description: "删除节点或插件。Conversation 生成期只把节点删除写入资源 Overlay，不能删除插件根；非 Overlay 调用可用 remove(\"@xxx/\") 删除插件。",
    },
    {
      name: "import",
      signature: "import(path: string, environment?: string | Record<string, unknown>): Promise<unknown>",
      description: "在作用域内导入并解析资源内容（包括 .js 宏文本、.md、.chat.json），只解析文本宏而不执行代码。environment 可直接传入会话 ID。",
    },
    {
      name: "run",
      signature: "run(path: string, environment?: string | Record<string, unknown>): Promise<unknown>",
      description: "专门用于 JavaScript 脚本，在 Sandbox 中解析并执行脚本，返回执行后的结果。environment 可直接传入会话 ID。",
    },
    {
      name: "test",
      signature: "test(path: string, environment?: string | Record<string, unknown>, options?: { textTruncateLength?: number }): Promise<{ value?: unknown; diagnostics: unknown }>",
      description: "测试/调试解析或执行文件，返回 AST Parts、Sources、条件结果与字符截断数。environment 可直接传入会话 ID。",
    },
    {
      name: "test_condition",
      signature: "test_condition(conditionCode: string, environment?: string | Record<string, unknown>): Promise<ConditionResults>",
      description: "评估并计算单个条件表达式的匹配结果与组合结构。environment 可直接传入会话 ID。",
    },
    {
      name: "container.test_condition",
      signature: "container.test_condition(containerId: string, scope?: 'local' | 'global', environment?: string | Record<string, unknown>): Promise<Array<{ resourcePath: string; conditionResult: ConditionResults; isMatch: boolean }>>",
      description: "评估指定容器内各注册资源的条件匹配判定集。environment 可直接传入会话 ID。",
    },
    {
      name: "grep",
      signature: "grep(path: string, pattern: string): Promise<Array<{ path: string; line: number; content: string }>>",
      description: "在指定插件或路径下进行文本正则/关键字匹配搜索。",
    },
  ],
};
