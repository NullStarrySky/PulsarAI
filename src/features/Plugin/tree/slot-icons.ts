import type { Component } from "vue";
import {
  Braces,
  Database,
  FileText,
  Image,
  MessagesSquare,
  PanelLeft,
  PanelRight,
  Play,
  Regex,
  Terminal,
  UserRound,
  Workflow,
  Wrench,
} from "lucide-vue-next";

export const slotIconOptions = [
  { value: "braces", label: "代码" },
  { value: "database", label: "数据" },
  { value: "file-text", label: "文档" },
  { value: "image", label: "图像" },
  { value: "messages-square", label: "消息" },
  { value: "panel-left", label: "左侧面板" },
  { value: "panel-right", label: "右侧面板" },
  { value: "play", label: "运行" },
  { value: "regex", label: "正则" },
  { value: "terminal", label: "命令" },
  { value: "user-round", label: "用户" },
  { value: "workflow", label: "流程" },
  { value: "wrench", label: "工具" },
] as const;

const slotIcons: Record<string, Component> = {
  braces: Braces,
  database: Database,
  "file-text": FileText,
  image: Image,
  "messages-square": MessagesSquare,
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  play: Play,
  regex: Regex,
  terminal: Terminal,
  "user-round": UserRound,
  workflow: Workflow,
  wrench: Wrench,
};

export function slotIconComponent(icon?: string) {
  return icon ? slotIcons[icon] ?? null : null;
}
