import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { popOutTarget } from "./application/sub-window-service";
import type { SubWindowTarget } from "./domain/sub-window-protocol";

export const capabilities: CapabilityDefinition = {
  id: "subWindow",
  title: "子窗口",
  description: "将资源或已注册组件打开到独立窗口。",
  subCaps: {
    all: "全部子窗口权限",
    open: "打开子窗口",
  },
  api: {
    open: [{
      name: "open",
      signature: "open(target: SubWindowTarget, title?: string): Promise<void>",
      description: "按资源、内置页面或组件目标打开子窗口。",
      example: "await subWindow.open({ type: 'resource', resourceType: 'plugin', resourceId: id })",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("open") ? {
    open: (target: SubWindowTarget, title?: string) => popOutTarget(target, title),
  } : {}),
}));
