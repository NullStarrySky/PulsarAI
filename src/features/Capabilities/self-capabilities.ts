import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "./domain/capability";

export const capabilities: CapabilityDefinition = {
  id: "capabilitySystem",
  title: "权限与 API 文档",
  description: "查询当前权限系统公开的 Feature、子权限与 API 元数据。",
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
