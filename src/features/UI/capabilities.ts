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
  description: "打开设置或工作区资源，并控制主界面的侧栏。",
  documentation: {
    overview: "提供应用壳层的可见交互入口，包括设置、资源标签、侧栏、顶栏标签状态和输入框工具栏布局。领域操作仍由对应 Feature 自己负责。",
    notes: [
      "openResource 只负责打开标签，不负责创建或验证资源内容。",
      "工具栏布局中的每个已知工具只保留一次，缺失工具会按默认分区补回。",
    ],
    types: [
      {
        name: "ComposerToolId",
        description: "当前输入框工具栏目录中的工具标识。",
        definition: `type ComposerToolId =
  | "model"
  | "reasoning"
  | "attachment"
  | "whiteboard"
  | "map"
  | "fullscreen";`,
      },
      {
        name: "TopBarStatus",
        description: "资源标签可以显示的短期状态。",
        definition: `interface TopBarStatus {
  kind: "loading" | "success" | "warning" | "error";
  label?: string;
}`,
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
    resources: "打开工作区资源",
    layout: "控制侧栏布局",
    topBarStatus: "改变顶栏标签状态",
    composerToolbar: "配置会话输入框工具栏",
  },
  api: {
    settings: [{
      name: "setSettingsOpen",
      signature: "setSettingsOpen(open: boolean): void",
      description: "打开或关闭设置窗口。",
      example: "ui.setSettingsOpen(true)",
    }],
    resources: [{
      name: "openResource",
      signature: "openResource(input: { type: string; id: string; title: string; packageId?: string }): void",
      description: "在主工作区打开资源标签。",
      example: "ui.openResource({ type: 'plugin', id: pluginId, title: '插件' })",
    }],
    layout: [{
      name: "setSidebars",
      signature: "setSidebars(input: { left?: boolean; right?: boolean }): void",
      description: "显式设置左右侧栏是否打开。",
      example: "ui.setSidebars({ right: true })",
    }],
    topBarStatus: [{
      name: "setTopBarStatus",
      signature: "setTopBarStatus(tabId: string, status?: { kind: 'loading' | 'success' | 'warning' | 'error'; label?: string }): void",
      description: "设置或清除指定顶栏标签的状态。loading 状态会显示旋转指示器。",
      example: "ui.setTopBarStatus('conversation:id', { kind: 'loading', label: '生成中' })",
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
        example: "ui.setComposerToolbar({ left: ['model', 'attachment'], right: ['map', 'fullscreen'], unused: ['whiteboard'] })",
      },
    ],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("settings") ? {
    setSettingsOpen: (open: boolean) => useLayoutStore().setSettingsOpen(open),
  } : {}),
  ...(granted.has("resources") ? {
    openResource: (input: { type: string; id: string; title: string; packageId?: string }) =>
      useLayoutStore().openResourceTab({
        resourceType: input.type,
        resourceId: input.id,
        title: input.title,
        packageId: input.packageId,
      }),
  } : {}),
  ...(granted.has("layout") ? {
    setSidebars: (input: { left?: boolean; right?: boolean }) => {
      const layout = useLayoutStore();
      if (input.left !== undefined) {
        layout.leftSidebarOpen = input.left;
      }
      if (input.right !== undefined) {
        layout.rightSidebarOpen = input.right;
      }
    },
  } : {}),
  ...(granted.has("topBarStatus") ? {
    setTopBarStatus: (
      tabId: string,
      status?: {
        kind: "loading" | "success" | "warning" | "error";
        label?: string;
      },
    ) => useLayoutStore().setTabStatus(tabId, status),
  } : {}),
  ...(granted.has("composerToolbar") ? {
    getComposerToolbar: () => structuredClone(useAppearanceStore().composerToolbar),
    setComposerToolbar: (layout: ComposerToolbarLayout) =>
      useAppearanceStore().setComposerToolbar(layout),
  } : {}),
}));
