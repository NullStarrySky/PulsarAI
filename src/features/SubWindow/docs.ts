import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "subWindow",
  title: "子窗口",
  description: "将资源或已注册组件打开到独立窗口。",
  documentation: {
    overview: "通过统一目标协议把资源、内置页面或组件弹出为 Tauri WebviewWindow。目标数据会被编码到子窗口启动参数中。",
    notes: [
      "resource 目标需要资源类型与 id，component 目标只接受已注册组件 id。",
      "重复目标的窗口标签由协议稳定生成，调用方不应自行拼接 WebviewWindow label。",
    ],
    types: [{
      name: "SubWindowTarget",
      description: "可由公开 API 打开的三类子窗口目标。",
      definition: `type SubWindowTarget =
  | {
      type: "resource";
      resourceType: string;
      resourceId: string;
      packageId?: string;
      title?: string;
      resourceParams?: Record<string, unknown>;
    }
  | {
      type: "builtin";
      resourceId: string;
      title?: string;
      resourceParams?: Record<string, unknown>;
    }
  | {
      type: "component";
      componentId: string;
      title?: string;
      props?: Record<string, unknown>;
    };`,
    }],
  },
  api: [{
    name: "open",
    signature: "open(target: SubWindowTarget, title?: string): Promise<void>",
    description: "按资源、内置页面或组件目标打开子窗口。",
    example: "await subWindow.open({ type: 'resource', resourceType: 'plugin', resourceId: id })",
  }],
};
