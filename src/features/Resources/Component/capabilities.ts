import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { createDefaultComponentContent } from "./domain/component-resource";

export const capabilities: CapabilityDefinition = {
  id: "component",
  title: "组件资源",
  description: "生成 Pulsar 组件资源的基础内容。",
  subCaps: {
    all: "全部组件资源权限",
    createTemplate: "创建组件模板",
  },
  api: {
    createTemplate: [{
      name: "createTemplate",
      signature: "createTemplate(name?: string): string",
      description: "返回一个可编辑的默认 Vue 组件资源。",
      example: "component.createTemplate('CounterButton')",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("createTemplate") ? {
    createTemplate: createDefaultComponentContent,
  } : {}),
}));
