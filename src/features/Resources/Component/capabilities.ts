import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { createDefaultComponentContent } from "./domain/component-resource";

export const capabilities: CapabilityDefinition = {
  id: "component",
  title: "组件资源",
  description: "生成 Pulsar 组件资源的基础内容。",
  documentation: {
    overview: "创建一个可以继续编辑的 Vue 单文件组件模板。返回值只是源码文本，不会自动保存资源或执行组件脚本。",
    notes: [
      "name 只用于模板中的初始展示文本，调用方仍需通过所属资源 Feature 完成持久化。",
      "插件动态预览对脚本执行有独立限制，生成模板不代表获得运行权限。",
    ],
    types: [{
      name: "ComponentSource",
      description: "完整 Vue SFC 源码。",
      definition: `type ComponentSource = string;`,
    }],
  },
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
