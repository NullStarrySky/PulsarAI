import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { detectEnvironmentTools } from "./application/environment-check";

export const capabilities: CapabilityDefinition = {
  id: "about",
  title: "关于与环境检查",
  description: "读取本地开发工具的可用状态。",
  subCaps: {
    all: "全部环境检查权限",
    checkEnvironment: "检查开发环境",
  },
  api: {
    checkEnvironment: [{
      name: "checkEnvironment",
      signature: "checkEnvironment(): Promise<EnvironmentToolStatus[]>",
      description: "检查应用已知的本地环境工具。",
      example: "await about.checkEnvironment()",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("checkEnvironment") ? { checkEnvironment: detectEnvironmentTools } : {}),
}));
