import type { ModelMessage } from "ai";
import {
  createSandboxFunction,
  resolveSandboxMessages,
  stringifySandboxValue,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import {
  findPluginReferenceTokens,
  normalizePluginReferenceTarget,
  replacePluginReferenceTokens,
} from "@/features/Resources/Plugin/domain/plugin-reference";

export type InteractivePromptRole = "system" | "user" | "assistant";
export type InteractiveDataContentType = "json" | "value";
export type InteractiveValue =
  | string
  | number
  | boolean
  | null
  | InteractiveValue[]
  | { [key: string]: InteractiveValue };

export interface InteractivePromptTemplate {
  id: string;
  name: string;
  role: InteractivePromptRole;
  content: string;
}

export interface InteractiveSubData {
  id: string;
  name: string;
  enableUpdater: boolean;
  description: string;
  contentType: InteractiveDataContentType;
  content: string;
  wrapper: string;
}

export interface InteractiveMemoryConfig {
  compressionThreshold: number;
}

export interface InteractiveVariableDefinition {
  id: string;
  name: string;
  description: string;
  initialValue: InteractiveValue;
  wrapperSource: string;
}

export interface InteractiveVariableBinding {
  readonly value: InteractiveValue;
  replace(value: InteractiveValue): void;
}

export interface InteractiveDocumentSource {
  prologue: string;
  templates: InteractivePromptTemplate[];
  data: InteractiveSubData[];
  memory: InteractiveMemoryConfig;
}

export interface InteractiveDocumentCompileError {
  sourceId: string;
  message: string;
}

export interface InteractiveDocumentCompileResult {
  messages: ModelMessage[];
  markdown: string;
  data: Record<string, InteractiveValue>;
  variableDefinitions: InteractiveVariableDefinition[];
  variableDescriptionContainer: string;
  memory: InteractiveMemoryConfig;
  errors: InteractiveDocumentCompileError[];
  dependencies: string[];
}

export interface InteractiveDocumentCompileOptions {
  environment?: SandboxEnvironment;
  dataOverrides?: Record<string, InteractiveValue>;
  resolveReference?: (target: string) => unknown;
}

const promptPattern =
  /<prompt_template\b([^>]*)>([\s\S]*?)<\/prompt_template\s*>/gi;
const dataPattern = /<data\b[^>]*>([\s\S]*?)<\/data\s*>/i;
const memoryPattern = /<memory\b[^>]*>([\s\S]*?)<\/memory\s*>/i;
const subDataPattern =
  /<sub_data\b([^>]*)>([\s\S]*?)<\/sub_data\s*>/gi;
const attributePattern =
  /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseInteractiveDocumentSource(
  input: string | unknown,
): InteractiveDocumentSource {
  const source = normalizeInteractiveDocumentSource(input);
  const templates: InteractivePromptTemplate[] = [];
  const data: InteractiveSubData[] = [];

  for (const match of source.matchAll(promptPattern)) {
    const attributes = parseAttributes(match[1] ?? "");
    const index = templates.length;
    templates.push({
      id: `prompt:${index}`,
      name: attributes.name?.trim() || `template-${index + 1}`,
      role: normalizeRole(attributes.role),
      content: trimRawBlock(match[2] ?? ""),
    });
  }

  const dataMatch = source.match(dataPattern);
  if (dataMatch) {
    for (const match of (dataMatch[1] ?? "").matchAll(subDataPattern)) {
      const attributes = parseAttributes(match[1] ?? "");
      const body = match[2] ?? "";
      const index = data.length;
      const name = attributes.name?.trim() || `data-${index + 1}`;
      const contentMatch = body.match(
        /<content\b([^>]*)>([\s\S]*?)<\/content\s*>/i,
      );
      const contentAttributes = parseAttributes(contentMatch?.[1] ?? "");
      data.push({
        id: `data:${name}:${index}`,
        name,
        enableUpdater:
          parseRawElement(body, "enable_updater").trim().toLocaleLowerCase()
          === "true",
        description: trimRawBlock(parseRawElement(body, "description")),
        contentType:
          contentAttributes.type?.toLocaleLowerCase() === "json"
            ? "json"
            : "value",
        content: trimRawBlock(contentMatch?.[2] ?? ""),
        wrapper: trimRawBlock(parseRawElement(body, "wrapper")),
      });
    }
  }

  const memoryBody = source.match(memoryPattern)?.[1] ?? "";
  const compressionThreshold = normalizeCompressionThreshold(
    parseRawElement(memoryBody, "compression_threshold"),
  );

  const prologue = source
    .replace(promptPattern, "")
    .replace(dataPattern, "")
    .replace(memoryPattern, "")
    .trim();

  return {
    prologue,
    templates,
    data,
    memory: { compressionThreshold },
  };
}

export function serializeInteractiveDocumentSource(
  document: InteractiveDocumentSource,
) {
  const sections: string[] = [];
  if (document.prologue.trim()) {
    sections.push(document.prologue.trim());
  }

  for (const template of document.templates) {
    sections.push([
      `<prompt_template name="${escapeAttribute(template.name)}" role="${template.role}">`,
      template.content.trim(),
      "</prompt_template>",
    ].join("\n"));
  }

  if (document.data.length) {
    const rows = document.data.map((item) => [
      `  <sub_data name="${escapeAttribute(item.name)}">`,
      "    <enable_updater>",
      `      ${item.enableUpdater ? "true" : "false"}`,
      "    </enable_updater>",
      "    <description>",
      indentRawBlock(item.description, 6),
      "    </description>",
      `    <content type="${item.contentType}">`,
      indentRawBlock(item.content, 6),
      "    </content>",
      "    <wrapper>",
      indentRawBlock(item.wrapper, 6),
      "    </wrapper>",
      "  </sub_data>",
    ].join("\n"));
    sections.push(["<data>", ...rows, "</data>"].join("\n"));
  }


  if (document.memory.compressionThreshold > 0) {
    sections.push([
      "<memory>",
      "  <compression_threshold>",
      `    ${document.memory.compressionThreshold}`,
      "  </compression_threshold>",
      "</memory>",
    ].join("\n"));
  }

  return `${sections.join("\n\n").trim()}\n`;
}

export function compileInteractiveDocumentSource(
  input: string | unknown,
  options: InteractiveDocumentCompileOptions = {},
): InteractiveDocumentCompileResult {
  const normalizedSource = normalizeInteractiveDocumentSource(input);
  const document = parseInteractiveDocumentSource(input);
  const errors: InteractiveDocumentCompileError[] = [];
  const dependencies = new Set<string>();
  const localData: Record<string, InteractiveValue> = {};
  const localFacades: Record<string, unknown> = {};
  const variableDefinitions: InteractiveVariableDefinition[] = [];

  const promptOpenCount =
    normalizedSource.match(/<prompt_template\b/gi)?.length ?? 0;
  if (promptOpenCount !== document.templates.length) {
    errors.push({
      sourceId: "document",
      message: "存在未闭合或格式无效的 prompt_template。",
    });
  }
  if (!document.templates.length) {
    errors.push({
      sourceId: "document",
      message: "IMD 至少需要一个 prompt_template。",
    });
  }
  const dataOpenCount = normalizedSource.match(/<data\b/gi)?.length ?? 0;
  const dataCloseCount =
    normalizedSource.match(/<\/data\s*>/gi)?.length ?? 0;
  if (dataOpenCount > 1 || dataOpenCount !== dataCloseCount) {
    errors.push({
      sourceId: "data",
      message: "IMD 只能包含一个成对闭合的 data 区块。",
    });
  }
  const memoryOpenCount = normalizedSource.match(/<memory\b/gi)?.length ?? 0;
  const memoryCloseCount = normalizedSource.match(/<\/memory\s*>/gi)?.length ?? 0;
  if (memoryOpenCount > 1 || memoryOpenCount !== memoryCloseCount) {
    errors.push({
      sourceId: "memory",
      message: "IMD 只能包含一个成对闭合的 memory 区块。",
    });
  }
  const subDataOpenCount =
    normalizedSource.match(/<sub_data\b/gi)?.length ?? 0;
  if (subDataOpenCount !== document.data.length) {
    errors.push({
      sourceId: "data",
      message: "存在位于 data 外部、未闭合或格式无效的 sub_data。",
    });
  }

  for (const item of document.data) {
    if (item.name in localData) {
      errors.push({
        sourceId: item.id,
        message: `本地数据名称重复：${item.name}`,
      });
      continue;
    }
    try {
      const hasOverride = Object.prototype.hasOwnProperty.call(
        options.dataOverrides ?? {},
        item.name,
      );
      const value = structuredClone(
        hasOverride
          ? options.dataOverrides?.[item.name] ?? null
          : parseSubDataContent(item),
      );
      localData[item.name] = value;
      localFacades[item.name] = createInteractiveVariableFacade(
        item,
        value,
        { readonly: true },
      );
      if (item.enableUpdater) {
        variableDefinitions.push({
          id: item.id,
          name: item.name,
          description: item.description,
          initialValue: structuredClone(parseSubDataContent(item)),
          wrapperSource: item.wrapper,
        });
      }
    } catch (error) {
      errors.push({
        sourceId: item.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const messages: ModelMessage[] = [];
  for (const template of document.templates) {
    const tokens = findPluginReferenceTokens(template.content);
    const allowedTargets = new Set(
      tokens.map((token) => normalizePluginReferenceTarget(token.target)),
    );
    allowedTargets.forEach((target) => dependencies.add(target));

    const ref = (rawTarget: string) => {
      const target = normalizePluginReferenceTarget(rawTarget);
      if (!allowedTargets.has(target)) {
        throw new Error(`ref() 只能访问模板中显式声明的引用：${target}`);
      }
      if (target.startsWith("local:")) {
        const name = target.slice("local:".length);
        if (!(name in localData)) {
          throw new Error(`本地数据不存在：${name}`);
        }
        return localFacades[name];
      }
      if (!options.resolveReference) {
        throw new Error(`当前解析器无法访问外部引用：${target}`);
      }
      return options.resolveReference(target);
    };

    try {
      const prepared = prepareInteractiveTemplate(template.content, ref);
      messages.push(
        ...resolveSandboxMessages(
          [{ role: template.role, content: prepared } as ModelMessage],
          [{ ...(options.environment ?? {}), ref }],
        ),
      );
    } catch (error) {
      errors.push({
        sourceId: template.id,
        message: error instanceof Error ? error.message : String(error),
      });
      if (template.content.trim()) {
        messages.push({
          role: template.role,
          content: template.content,
        } as ModelMessage);
      }
    }
  }

  return {
    messages,
    markdown: messagesToMarkdown(messages),
    data: localData,
    variableDefinitions,
    variableDescriptionContainer:
      createVariableDescriptionContainer(variableDefinitions),
    memory: document.memory,
    errors,
    dependencies: [...dependencies],
  };
}

export function normalizeInteractiveDocumentSource(input: unknown): string {
  if (typeof input === "string") return input;
  if (!isLegacyInteractiveDocument(input)) {
    return createEmptyInteractiveDocumentSource();
  }

  const templates: InteractivePromptTemplate[] = [];
  const data: InteractiveSubData[] = [];
  for (const block of input.blocks) {
    if (!block || typeof block !== "object" || block.hidden === true) continue;
    if (block.type === "variable") {
      data.push({
        id: `data:${String(block.id ?? data.length)}`,
        name: String(block.name || block.id || `data-${data.length + 1}`),
        enableUpdater: false,
        description: String(block.description ?? ""),
        contentType: "json",
        content: JSON.stringify(block.value ?? null, null, 2),
        wrapper: "",
      });
      continue;
    }
    if (block.type === "text") {
      const content = Array.isArray(block.content)
        ? String(block.content[Number(block.activeContentIndex) || 0] ?? "")
        : "";
      templates.push({
        id: `prompt:${String(block.id ?? templates.length)}`,
        name: String(block.name || `template-${templates.length + 1}`),
        role: normalizeRole(block.role),
        content,
      });
      continue;
    }
    if (block.type === "component") {
      templates.push({
        id: `prompt:${String(block.id ?? templates.length)}`,
        name: String(block.name || `template-${templates.length + 1}`),
        role: normalizeRole(block.role),
        content: String(block.fallbackMarkdown ?? ""),
      });
    }
  }

  const legacyLocalNames = data
    .map((item) => item.name)
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
  for (const template of templates) {
    template.content = template.content.replace(
      /(\{\{|\[\[)([\s\S]*?)(\}\}|\]\])/g,
      (_whole, open: string, expression: string, close: string) => {
        let migrated = expression;
        for (const name of legacyLocalNames) {
          const pattern = new RegExp(
            `(^|[^.\\w$])${escapeRegExp(name)}\\b`,
            "g",
          );
          migrated = migrated.replace(
            pattern,
            (_match, prefix: string) => `${prefix}<@local:${name}>`,
          );
        }
        return `${open}${migrated}${close}`;
      },
    );
  }

  return serializeInteractiveDocumentSource({
    prologue: "",
    templates,
    data,
    memory: { compressionThreshold: 0 },
  });
}

export function createEmptyInteractiveDocumentSource() {
  return serializeInteractiveDocumentSource({
    prologue: "",
    templates: [{
      id: "prompt:0",
      name: "main",
      role: "system",
      content: "",
    }],
    data: [],
    memory: { compressionThreshold: 0 },
  });
}

export function collectInteractiveVariableDefinitions(
  input: string | unknown,
): InteractiveVariableDefinition[] {
  const names = new Set<string>();
  return parseInteractiveDocumentSource(input).data.flatMap((item) => {
    if (names.has(item.name)) {
      throw new Error(`本地数据名称重复：${item.name}`);
    }
    names.add(item.name);
    if (!item.enableUpdater) return [];
    return [{
      id: item.id,
      name: item.name,
      description: item.description,
      initialValue: structuredClone(parseSubDataContent(item)),
      wrapperSource: item.wrapper,
    }];
  });
}

export function createInteractiveVariableFacade(
  definition: Pick<InteractiveSubData, "name" | "wrapper">,
  value: InteractiveValue,
  options: {
    readonly?: boolean;
    onReplace?: (value: InteractiveValue) => void;
  } = {},
) {
  let current = options.readonly
    ? deepFreezeInteractiveValue(structuredClone(value))
    : value;
  if (!definition.wrapper.trim()) return current;
  const binding: InteractiveVariableBinding = {
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
  const wrapper = createSandboxFunction(definition.wrapper, []);
  const facade = wrapper(current, binding);
  if (facade === undefined) {
    throw new Error(`${definition.name} 的 wrapper 必须返回包装后的变量。`);
  }
  return options.readonly && facade
      && (typeof facade === "object" || typeof facade === "function")
    ? Object.freeze(facade)
    : facade;
}

function deepFreezeInteractiveValue<T extends InteractiveValue>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) {
    deepFreezeInteractiveValue(child as InteractiveValue);
  }
  return Object.freeze(value);
}

export function createVariableDescriptionContainer(
  definitions: InteractiveVariableDefinition[],
) {
  if (!definitions.length) return "";
  return [
    "# 变量说明",
    "",
    "以下变量可通过 codeAct 的 variable-update 意图更新。更新函数只能操作 variables 中的包装变量，不能执行网络、文件、插件或其它外部副作用。",
    "",
    ...definitions.flatMap((definition) => [
      `## ${formatVariableAccess(definition.name)}`,
      "",
      definition.description.trim() || "未提供说明。",
      "",
    ]),
  ].join("\n").trim();
}

function formatVariableAccess(name: string) {
  return /^[A-Za-z_$][\w$]*$/.test(name)
    ? `variables.${name}`
    : `variables[${JSON.stringify(name)}]`;
}

function prepareInteractiveTemplate(
  source: string,
  resolveReference: (target: string) => unknown,
) {
  const macroRanges = findMacroRanges(source);
  return replacePluginReferenceTokens(source, (token) => {
    const target = normalizePluginReferenceTarget(token.target);
    const inMacro = macroRanges.some(
      ([start, end]) => token.start >= start && token.end <= end,
    );
    return inMacro
      ? `ref(${JSON.stringify(target)})`
      : stringifySandboxValue(resolveReference(target));
  });
}

function findMacroRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const pattern = /(\{\{[\s\S]*?\}\}|\[\[[\s\S]*?\]\])/g;
  for (const match of source.matchAll(pattern)) {
    if (match.index == null) continue;
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function parseSubDataContent(item: InteractiveSubData): InteractiveValue {
  if (item.contentType === "value") return item.content;
  try {
    return JSON.parse(item.content || "null") as InteractiveValue;
  } catch (error) {
    throw new Error(
      `${item.name} 的 JSON 无效：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function normalizeCompressionThreshold(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(4, parsed) : 0;
}

function messagesToMarkdown(messages: ModelMessage[]) {
  return messages
    .flatMap((message) => {
      if (message.role === "tool" || typeof message.content !== "string") {
        return [];
      }
      return [`# ${message.role}_prompt`, "", message.content.trim(), ""];
    })
    .join("\n")
    .trim();
}

function parseRawElement(source: string, tagName: string) {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`,
    "i",
  );
  return source.match(pattern)?.[1] ?? "";
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(attributePattern)) {
    const key = (match[1] ?? "").toLocaleLowerCase();
    if (!key) continue;
    attributes[key] = match[2] ?? match[3] ?? "";
  }
  return attributes;
}

function normalizeRole(value: unknown): InteractivePromptRole {
  return value === "user" || value === "assistant" ? value : "system";
}

function trimRawBlock(value: string) {
  return value.replace(/^\s*\r?\n/, "").replace(/\r?\n\s*$/, "");
}

function indentRawBlock(value: string, size: number) {
  const indent = " ".repeat(size);
  const content = value.trim();
  return content
    ? content.split(/\r?\n/).map((line) => `${indent}${line}`).join("\n")
    : indent;
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLegacyInteractiveDocument(
  value: unknown,
): value is {
  blocks: Array<Record<string, unknown>>;
} {
  return Boolean(
    value
    && typeof value === "object"
    && Array.isArray((value as { blocks?: unknown }).blocks),
  );
}
