import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useLayoutStore } from "./application/layout-store";
import { useAppearanceStore } from "./theme/application/appearance-store";
import type { ComposerToolbarLayout } from "./domain/composer-toolbar";

export const capabilities: CapabilityDefinition = {
  id: "ui",
  title: "界面",
  description: "控制设置窗口和会话输入框工具栏。",
  documentation: {
    overview: "提供应用壳层的设置入口和输入框工具栏布局。领域操作仍由对应 Feature 自己负责。",
    notes: [
      "工具栏布局中的每个已知工具只保留一次，缺失工具会按默认分区补回。",
    ],
    types: [
      {
        name: "ComposerToolId",
        description: "当前输入框工具栏目录中的工具标识。",
        definition: `type ComposerToolId =
  | "model"
  | "optimize"
  | "attachment"
  | "whiteboard"
  | "map"
  | "fullscreen";`,
      },
      {
        name: "ComposerToolbarLayout",
        description: "输入框工具在左侧、右侧与未使用分区中的顺序。",
        definition: `interface ComposerToolbarLayout {
  left: ComposerToolId[];
  right: ComposerToolId[];
  unused: ComposerToolId[];
}`,
      },
    ],
  },
  subCaps: {
    all: "全部界面权限",
    settings: "打开或关闭设置",
    composerToolbar: "配置会话输入框工具栏",
  },
  api: {
    settings: [{
      name: "setSettingsOpen",
      signature: "setSettingsOpen(open: boolean): void",
      description: "打开或关闭设置窗口。",
      example: "ui.setSettingsOpen(true)",
    }],
    composerToolbar: [
      {
        name: "getComposerToolbar",
        signature: "getComposerToolbar(): ComposerToolbarLayout",
        description: "读取输入框工具栏的 left、right 和 unused 数组。",
        example: "ui.getComposerToolbar()",
      },
      {
        name: "setComposerToolbar",
        signature: "setComposerToolbar(layout: ComposerToolbarLayout): void",
        description: "保存输入框工具栏布局；每个已知工具只会保留一次。",
        example: "ui.setComposerToolbar({ left: ['attachment'], right: ['model', 'map', 'fullscreen'], unused: ['whiteboard', 'optimize'] })",
      },
    ],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("settings") ? {
    setSettingsOpen: (open: boolean) => useLayoutStore().setSettingsOpen(open),
  } : {}),
  ...(granted.has("composerToolbar") ? {
    getComposerToolbar: () => structuredClone(useAppearanceStore().composerToolbar),
    setComposerToolbar: (layout: ComposerToolbarLayout) =>
      useAppearanceStore().setComposerToolbar(layout),
  } : {}),
}));
