import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { executeSandboxCodeAsync } from "@/features/Sandbox/domain/sandbox";

export const capabilities: CapabilityDefinition = {
  id: "preset",
  title: "预设流程",
  description: "执行一段预设 JavaScript。通常应由正常会话启动序列调用，而不是自行创建生成环境。",
  subCaps: {
    all: "全部预设流程权限",
    execute: "执行预设流程",
  },
  api: {
    execute: [{
      name: "execute",
      signature: "execute(source: string, environment?: Record<string, unknown>): Promise<unknown>",
      description: "在给定环境中执行预设源码。",
      example: "await preset.execute(source, { prompt })",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("execute") ? {
    execute: (source: string, environment: Record<string, unknown> = {}) =>
      executeSandboxCodeAsync(source, [environment]),
  } : {}),
}));
