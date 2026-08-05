import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { executeSandboxCodeAsync } from "./domain/sandbox";

export const capabilities: CapabilityDefinition = {
  id: "sandbox",
  title: "代码执行",
  description: "执行局部 JavaScript 辅助逻辑。Feature 操作仍受各自权限对象限制。",
  documentation: {
    overview: "执行短小 JavaScript 表达式或语句，用于数据转换、条件判断和组合运行时可用的 Feature API。它是应用级权限边界，不是操作系统安全沙箱。",
    notes: [
      "values 中的键会作为本次代码执行的局部变量，并优先于普通全局对象。",
      "浏览器高风险全局对象由独立 globals 权限控制。",
    ],
    types: [{
      name: "SandboxValues",
      description: "一次执行显式注入的局部变量。",
      definition: `type SandboxValues = Record<string, unknown>;`,
    }],
  },
  subCaps: {
    all: "全部代码执行权限",
    execute: "执行 JavaScript",
  },
  api: {
    execute: [{
      name: "execute",
      signature: "execute(code: string, values?: Record<string, unknown>): Promise<unknown>",
      description: "使用可选局部变量执行 JavaScript。",
      example: "await sandbox.execute('items.map(x => x.id)', { items })",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("execute") ? {
    execute: (code: string, values: Record<string, unknown> = {}) =>
      executeSandboxCodeAsync(code, [values]),
  } : {}),
}));
