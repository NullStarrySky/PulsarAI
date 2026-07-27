import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useCommandStore } from "./application/command-store";

export const capabilities: CapabilityDefinition = {
  id: "hotkey",
  title: "命令与快捷键",
  description: "查询或执行已经注册到 Pulsar 的命令。",
  subCaps: {
    all: "全部命令权限",
    read: "读取命令",
    execute: "执行命令",
  },
  api: {
    read: [{
      name: "listCommands",
      signature: "listCommands(): CommandSummary[]",
      description: "列出命令 id、标题、说明、分类和默认快捷键。",
      example: "hotkey.listCommands()",
    }],
    execute: [{
      name: "execute",
      signature: "execute(commandId: string): Promise<void>",
      description: "按 id 执行一个已注册命令。",
      example: "await hotkey.execute('ui.open-settings')",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    listCommands: () => useCommandStore().commands.map((command) => ({
      id: command.id,
      title: command.title,
      description: command.description,
      category: command.category,
      defaultHotkey: command.defaultHotkey,
    })),
  } : {}),
  ...(granted.has("execute") ? {
    execute: (commandId: string) => useCommandStore().executeCommand(commandId),
  } : {}),
}));
