import type { ModelMessage } from "ai";
import {
  createSandboxFunction,
  resolveSandboxMessages,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import { findPluginImportCalls } from "./plugin-import";
import type { PluginDataValue } from "./plugin-data";

export type ContextDataValue = PluginDataValue;

export interface ContextDataDefinition {
  id: string;
  name: string;
  dataId: string;
  resourceId: string;
  path: string;
  pluginId: string;
  pluginName: string;
  isolation: "resource" | "conversation";
  enableUpdater: boolean;
  description: string;
  initialValue: ContextDataValue;
  wrapperSource: string;
}

export interface ContextDocumentDataBinding extends ContextDataDefinition {
  alias: string;
  stateKey: string;
}

export interface PluginChatContext {
  message: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}

export interface PluginChatCompileResult {
  messages: ModelMessage[];
  dataDefinitions: ContextDataDefinition[];
  dependencies: string[];
}

export function parsePluginChatContext(input: unknown): PluginChatContext {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new Error(`chat.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("chat.json 根节点必须是对象。");
  }
  const messages = (value as { message?: unknown }).message;
  if (!Array.isArray(messages)) throw new Error("chat.json.message 必须是数组。");
  return {
    message: messages.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`chat.json.message[${index}] 必须是对象。`);
      }
      const { role, content } = item as { role?: unknown; content?: unknown };
      if (role !== "system" && role !== "user" && role !== "assistant") {
        throw new Error(`chat.json.message[${index}].role 无效。`);
      }
      if (typeof content !== "string") {
        throw new Error(`chat.json.message[${index}].content 必须是字符串。`);
      }
      return { role, content };
    }),
  };
}

export function compilePluginChatContext(
  input: unknown,
  options: {
    environment?: SandboxEnvironment;
    dataOverrides?: Record<string, ContextDataValue>;
    dataBindings?: ContextDocumentDataBinding[];
  } = {},
): PluginChatCompileResult {
  const context = parsePluginChatContext(input);
  const bindings = options.dataBindings ?? [];
  const data = Object.fromEntries(bindings.map((binding) => {
    const value = Object.prototype.hasOwnProperty.call(options.dataOverrides ?? {}, binding.stateKey)
      ? options.dataOverrides![binding.stateKey]!
      : binding.initialValue;
    return [binding.alias, createContextDataFacade(
      { name: binding.alias, wrapperSource: binding.wrapperSource },
      structuredClone(value),
      { readonly: true },
    )];
  }));
  const dependencies = new Set<string>();
  const messages = context.message.flatMap((message) => {
    findPluginImportCalls(message.content).forEach((call) => dependencies.add(JSON.stringify(call)));
    return resolveSandboxMessages([message as ModelMessage], [{
      ...(options.environment ?? {}),
      data,
      DATA: data,
    }]);
  });
  return {
    messages,
    dataDefinitions: bindings.map(({ alias: _alias, stateKey: _stateKey, ...binding }) => binding),
    dependencies: [...dependencies],
  };
}

export function createContextDataFacade(
  definition: { name: string; wrapper?: string; wrapperSource?: string },
  value: ContextDataValue,
  options: { readonly?: boolean; onReplace?: (value: ContextDataValue) => void } = {},
) {
  let current = options.readonly ? deepFreeze(structuredClone(value)) : value;
  const wrapperSource = definition.wrapperSource ?? definition.wrapper ?? "";
  if (!wrapperSource.trim()) return current;
  const wrapper = createSandboxFunction(wrapperSource, []);
  const facade = wrapper(current, {
    get value() {
      return current;
    },
    replace(next: ContextDataValue) {
      if (options.readonly) throw new Error(`${definition.name} 在当前上下文中是只读变量。`);
      current = structuredClone(next);
      options.onReplace?.(current);
    },
  });
  if (facade === undefined) throw new Error(`${definition.name} 的 wrapper 必须返回值。`);
  return options.readonly && facade && (typeof facade === "object" || typeof facade === "function")
    ? Object.freeze(facade)
    : facade;
}

export function createDataDescriptionContainer(definitions: ContextDataDefinition[]) {
  if (!definitions.length) return "";
  return [
    "# Data",
    "",
    "使用 data.readForResource(resourceId, dataId) 读取；写入仅允许在 variable-update 中调用 data.writeForResource(resourceId, dataId, value)。",
    ...definitions.flatMap((item) => [
      "",
      `## ${item.path}`,
      `- Data ID: ${item.dataId}`,
      `- Resource ID: ${item.resourceId}`,
      `- Isolation: ${item.isolation}`,
      `- Writable: ${item.enableUpdater ? "yes" : "no"}`,
      "",
      item.description || "未提供说明。",
    ]),
  ].join("\n");
}

export const chatContextFormatPrompt = [
  "带角色上下文使用 *.chat.json。",
  '格式：{ "message": [{ "role": "system|user|assistant", "content": "..." }] }。',
  "content 可以使用 {{ expression }} 和 [[ expression ]]，资源通过 imports 显式导入。",
].join("\n");

function deepFreeze<T extends ContextDataValue>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach((child) => deepFreeze(child as ContextDataValue));
  return Object.freeze(value);
}
