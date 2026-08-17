import { createSandboxFunction } from "@/features/Sandbox/sandbox";
import type { PluginDataValue } from "@/features/Plugin/editors/data/plugin-data";

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
  varName?: string;
}

export interface ContextDocumentDataBinding extends ContextDataDefinition {
  alias: string;
  stateKey: string;
}

export interface PluginChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Optional author-facing label; never enters the compiled context. */
  name?: string;
  /** Defaults to true; disabled messages stay persisted but are excluded from compilation. */
  enabled?: boolean;
}

export interface PluginChatContext {
  message: PluginChatMessage[];
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
      const { role, content, name, enabled } = item as {
        role?: unknown;
        content?: unknown;
        name?: unknown;
        enabled?: unknown;
      };
      if (role !== "system" && role !== "user" && role !== "assistant") {
        throw new Error(`chat.json.message[${index}].role 无效。`);
      }
      if (typeof content !== "string") {
        throw new Error(`chat.json.message[${index}].content 必须是字符串。`);
      }
      if (name !== undefined && typeof name !== "string") {
        throw new Error(`chat.json.message[${index}].name 必须是字符串。`);
      }
      if (enabled !== undefined && typeof enabled !== "boolean") {
        throw new Error(`chat.json.message[${index}].enabled 必须是布尔值。`);
      }
      return {
        role,
        content,
        ...(name ? { name } : {}),
        ...(enabled === false ? { enabled } : {}),
      };
    }),
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
  if (facade === undefined || facade === null || typeof facade !== "object") {
    throw new Error(`${definition.name} 的 wrapper 必须且只能返回单个包装对象。`);
  }
  return options.readonly && facade && (typeof facade === "object" || typeof facade === "function")
    ? Object.freeze(facade)
    : facade;
}

function deepFreeze<T extends ContextDataValue>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach((child) => deepFreeze(child as ContextDataValue));
  return Object.freeze(value);
}
