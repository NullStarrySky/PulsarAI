import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { executeSandboxCodeAsync } from "./domain/sandbox";

export const capabilities: CapabilityDefinition = {
  id: "sandbox",
  title: "代码执行",
  description: "执行局部 JavaScript 辅助逻辑。Feature 操作仍受各自权限对象限制。",
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
