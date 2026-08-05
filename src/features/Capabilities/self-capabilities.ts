import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "./domain/capability";

export const capabilities: CapabilityDefinition = {
  id: "capabilitySystem",
  title: "Feature API 文档",
  description: "查询当前 Feature API 注册表公开的 Feature 与函数元数据。",
  documentation: {
    overview: "提供注册表自身的只读元数据；普通公开 API 始终可用，少数特殊操作由运行时策略封锁。",
    notes: [
      "list、get、readDocs 与人类文档使用同一份定义。",
      "被策略封锁的函数不会出现在普通生成运行时中。",
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
        description: "一个 Feature 的完整文档与 API 元数据。",
        definition: `interface CapabilityDefinition {
  id: string;
  title: string;
  description: string;
  documentation?: CapabilityHumanDocumentation;
  subCaps: Record<string, string>;
  api: Record<string, CapabilityApiDoc[]>;
}`,
      },
    ],
  },
  subCaps: {
    all: "全部文档元数据",
    read: "读取 API 文档",
  },
  api: {
    read: [
      {
        name: "list",
        signature: "list(): Promise<CapabilityDefinition[]>",
        description: "列出全部 Feature 的文档和 API 元数据。",
        example: "await capabilitySystem.list()",
      },
      {
        name: "get",
        signature: "get(featureId: string): Promise<CapabilityDefinition | null>",
        description: "按 Feature id 查询文档和 API 元数据。",
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
