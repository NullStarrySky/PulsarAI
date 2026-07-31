import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { executeSandboxCodeAsync } from "@/features/Sandbox/domain/sandbox";

export const capabilities: CapabilityDefinition = {
  id: "preset",
  title: "预设流程",
  description: "执行一段预设 JavaScript。通常应由正常会话启动序列调用，而不是自行创建生成环境。",
  documentation: {
    overview: "在受控 Sandbox 中运行一段预设源码，并把调用方提供的 environment 作为局部环境。适合复用已经保存的确定性脚本。",
    notes: [
      "environment 只影响本次执行，不会自动写回预设或应用状态。",
      "需要 Feature 操作时仍必须通过 environment 中已授权的 capability 对象。",
    ],
    types: [{
      name: "PresetEnvironment",
      description: "注入到预设源码的键值环境。",
      definition: `type PresetEnvironment = Record<string, unknown>;`,
    }],
  },
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
