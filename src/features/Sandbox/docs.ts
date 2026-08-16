import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "sandbox",
  title: "代码执行",
  description: "执行局部 JavaScript 辅助逻辑。危险方法由运行时策略按需屏蔽。",
  documentation: {
    overview: "执行短小 JavaScript 表达式或语句，用于数据转换、条件判断和组合运行时可用的 Feature API。它是应用级权限边界，不是操作系统安全沙箱。",
    notes: [
      "values 中的键会作为本次代码执行的局部变量，并优先于普通全局对象。",
      "浏览器高风险全局对象由独立的 globals 对象控制。",
    ],
    types: [{
      name: "SandboxValues",
      description: "一次执行显式注入的局部变量。",
      definition: `type SandboxValues = Record<string, unknown>;`,
    }],
  },
  api: [{
    name: "execute",
    signature: "execute(code: string, values?: Record<string, unknown>): Promise<unknown>",
    description: "使用可选局部变量执行 JavaScript。",
    example: "await sandbox.execute('items.map(x => x.id)', { items })",
  }],
};

export const globalDocs: FeatureDocs = {
  id: "globals",
  title: "全局对象",
  description: "Sandbox JavaScript 对浏览器全局对象的直接访问。被屏蔽对象仍提供可识别的 Proxy 占位，并在读取、调用或写入时抛出权限错误。",
  documentation: {
    overview: "把具有网络、持久化、页面控制、跨上下文或动态代码生成能力的浏览器对象整体开放；需要收紧时由运行时策略按需屏蔽。",
    notes: [
      "window、self 与 globalThis 只暴露同一份过滤后的对象视图。",
      "被屏蔽对象会在访问时抛出明确权限错误，但这不等同于隔离同一 JavaScript Realm 中的恶意代码。",
    ],
    types: [{
      name: "ControlledGlobalGroup",
      description: "高风险浏览器全局对象的分组。",
      definition: `type ControlledGlobalGroup =
  | "network"
  | "storage"
  | "page"
  | "workers"
  | "codeGeneration";`,
    }],
  },
  api: [
    {
      name: "fetch",
      signature: "fetch(input, init?): Promise<Response>",
      description: "访问浏览器网络请求相关全局对象；也可直接使用 fetch、WebSocket 或 XMLHttpRequest。",
    },
    {
      name: "localStorage",
      signature: "localStorage: Storage",
      description: "访问浏览器存储相关全局对象。",
    },
    {
      name: "document",
      signature: "document: Document",
      description: "访问页面、地址、导航器、父窗口和打开窗口等广泛的浏览器能力。",
    },
    {
      name: "Worker",
      signature: "Worker: typeof Worker",
      description: "创建 Worker 或跨上下文消息通道。",
    },
    {
      name: "Function",
      signature: "Function: FunctionConstructor",
      description: "允许通过 eval 或 Function 动态编译代码。",
    },
  ],
};
