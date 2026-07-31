import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "./domain/capability";

export const capabilities: CapabilityDefinition = {
  id: "capabilitySystem",
  title: "权限与 API 文档",
  description: "查询当前权限系统公开的 Feature、子权限与 API 元数据。",
  documentation: {
    overview: "提供权限注册表自身的只读元数据，便于工具检查 Feature id、权限标识与函数说明。读取元数据不会授予被查询 Feature 的执行权限。",
    notes: [
      "list 和 get 返回的对象与设置、模型提示词和文档生成器使用同一份定义。",
      "all 是配置时的便捷授权，运行时会展开为该 Feature 的全部显式子权限。",
    ],
    types: [
      {
        name: "CapabilityApiDoc",
        description: "一个公开函数的人类与模型共用说明。",
        definition: `interface CapabilityApiDoc {
  name: string;
  signature: string;
  description: string;
  returns?: string;
  example?: string;
}`,
      },
      {
        name: "CapabilityTypeDoc",
        description: "人类文档中展示的 TypeScript 类型片段。",
        definition: `interface CapabilityTypeDoc {
  name: string;
  description?: string;
  definition: string;
}`,
      },
      {
        name: "CapabilityHumanDocumentation",
        description: "只进入人类文档的 Feature 介绍、说明与类型清单。",
        definition: `interface CapabilityHumanDocumentation {
  overview: string;
  notes?: string[];
  types?: CapabilityTypeDoc[];
}`,
      },
      {
        name: "CapabilityDefinition",
        description: "一个 Feature 的完整权限、文档与 API 元数据。",
        definition: `interface CapabilityDefinition {
  id: string;
  title: string;
  description: string;
  documentation?: CapabilityHumanDocumentation;
  subCaps: Record<string, string>;
  api: Record<string, CapabilityApiDoc[]>;
}`,
      },
      {
        name: "CapabilityGrants",
        description: "按 Feature id 保存的子权限授权表。",
        definition: `type CapabilityGrants = Record<string, string[]>;`,
      },
    ],
  },
  subCaps: {
    all: "全部权限元数据权限",
    read: "读取权限与 API 文档",
  },
  api: {
    read: [
      {
        name: "list",
        signature: "list(): Promise<CapabilityDefinition[]>",
        description: "列出全部 Feature 的权限和 API 元数据。",
        example: "await capabilitySystem.list()",
      },
      {
        name: "get",
        signature: "get(featureId: string): Promise<CapabilityDefinition | null>",
        description: "按 Feature id 查询权限和 API 元数据。",
        example: "await capabilitySystem.get('conversation')",
      },
    ],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    list: async () => {
      const { capabilityDefinitions } = await import("./application/capability-registry");
      return capabilityDefinitions;
    },
    get: async (featureId: string) => {
      const { capabilityDefinitions } = await import("./application/capability-registry");
      return capabilityDefinitions.find((item) => item.id === featureId) ?? null;
    },
  } : {}),
}));
