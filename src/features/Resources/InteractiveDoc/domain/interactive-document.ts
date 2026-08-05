import type { ModelMessage } from "ai";
import {
  createSandboxFunction,
  resolveSandboxMessages,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import { findPluginImportCalls } from "@/features/Resources/Plugin/domain/plugin-import";

export type ContextPromptRole = "system" | "user" | "assistant";
export type ContextDataValue =
  | string
  | number
  | boolean
  | null
  | ContextDataValue[]
  | { [key: string]: ContextDataValue };

export interface ContextPromptSegment {
  id: string;
  name: string;
  role: ContextPromptRole;
  content: string;
}

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

export interface ContextDataValueBinding {
  readonly value: ContextDataValue;
  replace(value: ContextDataValue): void;
}

/**
 * Parsed context Markdown. Data does not live in this source: literal imports
 * identify zero or more .data bindings before the compiler runs.
 */
export interface ContextDocumentSource {
  source: string;
  templates: ContextPromptSegment[];
  errors: ContextDocumentCompileError[];
}

export interface ContextDocumentCompileError {
  sourceId: string;
  message: string;
}

export interface ContextDocumentDataBinding {
  alias: string;
  dataId: string;
  stateKey: string;
  resourceId: string;
  path: string;
  pluginId: string;
  pluginName: string;
  isolation: "resource" | "conversation";
  initialValue: ContextDataValue;
  description?: string;
  enableUpdater?: boolean;
  wrapperSource?: string;
}

export interface ContextDocumentCompileResult {
  messages: ModelMessage[];
  markdown: string;
  data: Record<string, ContextDataValue>;
  dataDefinitions: ContextDataDefinition[];
  dataDescriptionContainer: string;
  errors: ContextDocumentCompileError[];
  dependencies: string[];
}

export interface ContextDocumentCompileOptions {
  environment?: SandboxEnvironment;
  dataOverrides?: Record<string, ContextDataValue>;
  dataBindings?: ContextDocumentDataBinding[];
}

const roleOpenPattern = /^\s*:::pulsar\s+role\s*=\s*(system|user|assistant)\s*$/i;
const roleClosePattern = /^\s*:::\s*$/;
const codeFencePattern = /^\s*(`{3,}|~{3,})/;

/**
 * Parse role-aware Markdown. Text outside a Pulsar role block is a system
 * message. Pulsar blocks are ignored inside normal Markdown code fences.
 */
export function parseContextDocumentSource(input: string | unknown): ContextDocumentSource {
  const source = typeof input === "string" ? input : "";
  const templates: ContextPromptSegment[] = [];
  const errors: ContextDocumentCompileError[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let role: ContextPromptRole = "system";
  let explicitRole = false;
  let buffer: string[] = [];
  let codeFence: { marker: string; length: number } | null = null;

  const flush = () => {
    const content = trimBlankLines(buffer.join("\n"));
    buffer = [];
    if (!content) return;
    templates.push({
      id: `message:${templates.length}`,
      name: `message-${templates.length + 1}`,
      role,
      content,
    });
  };

  lines.forEach((line, lineIndex) => {
    if (/^(?: {4}|\t)/.test(line) || /^\s*\\:::(?:pulsar\b|\s*$)/i.test(line)) {
      buffer.push(line.replace(/^(\s*)\\:::/, "$1:::"));
      return;
    }
    const fence = codeFencePattern.exec(line);
    if (fence) {
      const token = fence[1]!;
      const marker = token[0]!;
      if (!codeFence) {
        codeFence = { marker, length: token.length };
      } else if (codeFence.marker === marker && token.length >= codeFence.length) {
        codeFence = null;
      }
      buffer.push(line);
      return;
    }
    if (codeFence) {
      buffer.push(line);
      return;
    }

    const roleMatch = roleOpenPattern.exec(line);
    if (roleMatch) {
      if (explicitRole) {
        errors.push({
          sourceId: `line:${lineIndex + 1}`,
          message: "Pulsar 角色区块不能嵌套。",
        });
        buffer.push(line);
        return;
      }
      flush();
      role = roleMatch[1]!.toLowerCase() as ContextPromptRole;
      explicitRole = true;
      return;
    }
    if (roleClosePattern.test(line)) {
      if (!explicitRole) {
        errors.push({
          sourceId: `line:${lineIndex + 1}`,
          message: "发现没有对应角色区块的关闭标记。",
        });
        buffer.push(line);
        return;
      }
      flush();
      role = "system";
      explicitRole = false;
      return;
    }
    if (/^\s*:::pulsar\b/i.test(line)) {
      errors.push({
        sourceId: `line:${lineIndex + 1}`,
        message: "角色区块格式应为 :::pulsar role=system|user|assistant。",
      });
    }
    buffer.push(line);
  });

  if (explicitRole) {
    errors.push({
      sourceId: "document",
      message: "存在未闭合的 Pulsar 角色区块。",
    });
  }
  flush();
  return {
    source,
    templates,
    errors,
  };
}

export function compileContextDocumentSource(
  input: string | unknown,
  options: ContextDocumentCompileOptions = {},
): ContextDocumentCompileResult {
  const document = parseContextDocumentSource(input);
  const errors = [...document.errors];
  const dependencies = new Set<string>();
  const localData: Record<string, ContextDataValue> = {};
  const localFacades: Record<string, unknown> = {};
  const dataDefinitions = collectContextDataDefinitions(
    input,
    options.dataBindings,
  );
  const aliases = new Set<string>();

  for (const binding of options.dataBindings ?? []) {
    if (!binding.alias.trim()) {
      errors.push({ sourceId: binding.dataId, message: "数据引用 alias 不能为空。" });
      continue;
    }
    if (aliases.has(binding.alias)) {
      errors.push({
        sourceId: binding.dataId,
        message: `数据引用 alias 重复：${binding.alias}`,
      });
      continue;
    }
    aliases.add(binding.alias);
    const value = structuredClone(
      Object.prototype.hasOwnProperty.call(options.dataOverrides ?? {}, binding.alias)
        ? options.dataOverrides![binding.alias]!
        : Object.prototype.hasOwnProperty.call(options.dataOverrides ?? {}, binding.stateKey)
          ? options.dataOverrides![binding.stateKey]!
        : binding.initialValue,
    );
    localData[binding.alias] = value;
    localFacades[binding.alias] = createContextDataFacade(
      { name: binding.alias, wrapper: binding.wrapperSource ?? "" },
      value,
      { readonly: true },
    );
  }

  const messages: ModelMessage[] = [];
  for (const template of document.templates) {
    findPluginImportCalls(template.content).forEach((call) =>
      dependencies.add(JSON.stringify(call))
    );
    try {
      messages.push(...resolveSandboxMessages(
        [{ role: template.role, content: template.content } as ModelMessage],
        [{
          ...(options.environment ?? {}),
          data: localFacades,
          DATA: localFacades,
        }],
      ));
    } catch (error) {
      errors.push({
        sourceId: template.id,
        message: error instanceof Error ? error.message : String(error),
      });
      messages.push({ role: template.role, content: template.content });
    }
  }

  return {
    messages,
    markdown: messagesToMarkdown(messages),
    data: localData,
    dataDefinitions,
    dataDescriptionContainer: createDataDescriptionContainer(dataDefinitions),
    errors,
    dependencies: [...dependencies],
  };
}

export function collectContextDataDefinitions(
  _input: string | unknown,
  bindings: ContextDocumentDataBinding[] = [],
): ContextDataDefinition[] {
  return bindings.map((binding) => ({
      id: binding.stateKey,
      name: binding.stateKey,
      dataId: binding.dataId,
      resourceId: binding.resourceId,
      path: binding.path,
      pluginId: binding.pluginId,
      pluginName: binding.pluginName,
      isolation: binding.isolation,
      enableUpdater: binding.enableUpdater === true,
      description: binding.description?.trim() ?? "",
      initialValue: structuredClone(binding.initialValue),
      wrapperSource: binding.wrapperSource ?? "",
  }));
}

export function createContextDataFacade(
  definition: { name: string; wrapper?: string; wrapperSource?: string },
  value: ContextDataValue,
  options: {
    readonly?: boolean;
    onReplace?: (value: ContextDataValue) => void;
  } = {},
) {
  let current = options.readonly
    ? deepFreezeContextDataValue(structuredClone(value))
    : value;
  const wrapperSource = definition.wrapperSource ?? definition.wrapper ?? "";
  if (!wrapperSource.trim()) return current;
  const binding: ContextDataValueBinding = {
    get value() {
      return current;
    },
    replace(nextValue) {
      if (options.readonly) {
        throw new Error(`${definition.name} 在当前上下文中是只读变量。`);
      }
      current = structuredClone(nextValue);
      options.onReplace?.(current);
    },
  };
  const wrapper = createSandboxFunction(wrapperSource, []);
  const facade = wrapper(current, binding);
  if (facade === undefined) {
    throw new Error(`${definition.name} 的 wrapper 必须返回包装后的变量。`);
  }
  return options.readonly && facade
      && (typeof facade === "object" || typeof facade === "function")
    ? Object.freeze(facade)
    : facade;
}

export function createDataDescriptionContainer(
  definitions: ContextDataDefinition[],
) {
  if (!definitions.length) return "";
  return [
    "# Data 容器",
    "",
    "以下数据由资源中的字面量 imports 调用显式导入。普通 codeAct 可使用 `data.readForResource(resourceId, dataId)` 读取；需要写入时使用 `variable-update` 意图调用 `data.writeForResource(resourceId, dataId, value)`。接口结果保留资源 ID 与路径，隔离级别只由 `.data` 定义决定。",
    "",
    ...definitions.flatMap((definition) => [
      `## ${definition.path}`,
      "",
      `- Data ID: ${definition.dataId}`,
      `- Resource ID: ${definition.resourceId}`,
      `- Source Plugin: ${definition.pluginName} (${definition.pluginId})`,
      `- Isolation: ${definition.isolation}`,
      `- Writable: ${definition.enableUpdater ? "yes" : "no"}`,
      "",
      definition.description || "未提供说明。",
      "",
    ]),
  ].join("\n").trim();
}


function messagesToMarkdown(messages: ModelMessage[]) {
  return messages.map((message) => {
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2);
    return `<!-- role:${message.role} -->\n\n${content}`;
  }).join("\n\n");
}

function trimBlankLines(value: string) {
  return value.replace(/^\n+|\n+$/g, "");
}

function deepFreezeContextDataValue<T extends ContextDataValue>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) {
    deepFreezeContextDataValue(child as ContextDataValue);
  }
  return Object.freeze(value);
}
