import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "hotkey",
  title: "命令与快捷键",
  description: "查询或执行已经注册到 Pulsar 的命令。",
  documentation: {
    overview: "命令注册表把可搜索命令、菜单动作和快捷键入口统一为稳定的 commandId。自动化代码应先查询命令，再按 id 执行。",
    notes: [
      "执行行为仍由命令所属 Feature 的 actions.ts 负责。",
      "默认快捷键是显示元数据，用户实际绑定可能已在外观或快捷键设置中调整。",
    ],
    types: [{
      name: "CommandSummary",
      description: "命令目录返回的轻量元数据。",
      definition: `interface CommandSummary {
  id: string;
  title: string;
  description?: string;
  category?: string;
  defaultHotkey?: string;
}`,
    }],
  },
  api: [
    {
      name: "listCommands",
      signature: "listCommands(): CommandSummary[]",
      description: "列出命令 id、标题、说明、分类和默认快捷键。",
      example: "hotkey.listCommands()",
    },
    {
      name: "execute",
      signature: "execute(commandId: string): Promise<void>",
      description: "按 id 执行一个已注册命令。",
      example: "await hotkey.execute('ui.open-settings')",
    },
  ],
};
