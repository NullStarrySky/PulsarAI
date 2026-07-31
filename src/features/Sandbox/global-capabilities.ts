import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { createSandboxGlobalApi } from "./domain/sandbox-globals";

export const capabilities: CapabilityDefinition = {
  id: "globals",
  title: "全局对象",
  description: "控制 Sandbox JavaScript 对浏览器全局对象的直接访问。未授权对象仍提供可识别的 Proxy 占位，并在读取、调用或写入时抛出权限错误。",
  documentation: {
    overview: "把具有网络、持久化、页面控制、跨上下文或动态代码生成能力的浏览器对象划分为独立授权组。普通语言内建、计时器和编码工具不需要这些权限。",
    notes: [
      "window、self 与 globalThis 只暴露同一份过滤后的对象视图。",
      "未授权对象会在访问时抛出明确权限错误，但这不等同于隔离同一 JavaScript Realm 中的恶意代码。",
    ],
    types: [{
      name: "ControlledGlobalGroup",
      description: "高风险浏览器全局对象的权限分组。",
      definition: `type ControlledGlobalGroup =
  | "network"
  | "storage"
  | "page"
  | "workers"
  | "codeGeneration";`,
    }],
  },
  subCaps: {
    all: "全部全局对象权限",
    network: "主动网络访问（fetch、WebSocket、XHR、媒体加载）",
    storage: "浏览器存储（localStorage、IndexedDB、Cache）",
    page: "页面、导航与浏览器状态（document、location、navigator）",
    workers: "Worker 与跨上下文消息通道",
    codeGeneration: "动态代码生成（eval、Function）",
  },
  api: {
    network: [{
      name: "fetch",
      signature: "fetch(input, init?): Promise<Response>",
      description: "访问浏览器网络请求相关全局对象；也可直接使用 fetch、WebSocket 或 XMLHttpRequest。",
    }],
    storage: [{
      name: "localStorage",
      signature: "localStorage: Storage",
      description: "访问浏览器存储相关全局对象。",
    }],
    page: [{
      name: "document",
      signature: "document: Document",
      description: "访问页面、地址、导航器、父窗口和打开窗口等广泛的浏览器能力。",
    }],
    workers: [{
      name: "Worker",
      signature: "Worker: typeof Worker",
      description: "创建 Worker 或跨上下文消息通道。",
    }],
    codeGeneration: [{
      name: "Function",
      signature: "Function: FunctionConstructor",
      description: "允许通过 eval 或 Function 动态编译代码。",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) =>
  createSandboxGlobalApi(granted),
);
