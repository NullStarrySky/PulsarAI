import type { ModelMessage } from "ai";

export type SandboxEnvironment = Record<string | number, unknown>;

export interface SandboxExecutionResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export type ResolveTextOptions = {
  keepArraySet2StrDefault?: boolean;
  maxDepth?: number;
};

const defaultMaxDepth = 30;
const inlinePattern = /(\{\{([\s\S]*?)\}\}|\[\[([\s\S]*?)\]\])/g;

export function mergeEnvironment(environments: SandboxEnvironment[] = []): SandboxEnvironment {
  return Object.assign({}, ...environments);
}

export function mergeSandboxEnvironments(environments: SandboxEnvironment[] = []): SandboxEnvironment {
  const result: SandboxEnvironment = {};
  for (const environment of environments) {
    for (const [key, value] of Object.entries(environment)) {
      const current = result[key];
      if (isAppendPosition(key) && current !== undefined) {
        result[key] = [
          ...(Array.isArray(current) ? current : [current]),
          ...(Array.isArray(value) ? value : [value]),
        ];
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

export function executeSandboxCode(code: string, environments: SandboxEnvironment[] = []): unknown {
  try {
    const environment = mergeEnvironment(environments);
    const body = buildExecutableBody(code.trim(), environment);
    const runner = new Function("environment", "with (environment) {\n" + body + "\n}");
    const result = runner.call(environment, environment);
    return typeof result === "function" ? result.call(environment, environment) : result;
  } catch (error) {
    throw sandboxExecutionError(error, code);
  }
}

export async function executeSandboxCodeAsync(
  code: string,
  environments: SandboxEnvironment[] = [],
): Promise<unknown> {
  try {
    const environment = mergeEnvironment(environments);
    const body = buildExecutableBody(code.trim(), environment);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction("environment", "with (environment) {\n" + body + "\n}");
    const result = await runner.call(environment, environment);
    return typeof result === "function" ? await result.call(environment, environment) : result;
  } catch (error) {
    throw sandboxExecutionError(error, code);
  }
}

export function createSandboxFunction(
  code: string,
  environments: SandboxEnvironment[] = [],
): (...args: unknown[]) => unknown {
  try {
    const environment = mergeEnvironment(environments);
    const body = buildExecutableBody(code.trim(), environment);
    const runner = new Function("environment", "with (environment) {\n" + body + "\n}");
    const value = runner.call(environment, environment);
    if (typeof value !== "function") {
      throw new Error("自定义工具的 tool.js 必须只包含一个函数。");
    }
    return (...args: unknown[]) => {
      try {
        const result = Reflect.apply(value, environment, args);
        return result instanceof Promise
          ? result.catch((error) => {
              throw sandboxExecutionError(error, code);
            })
          : result;
      } catch (error) {
        throw sandboxExecutionError(error, code);
      }
    };
  } catch (error) {
    throw sandboxExecutionError(error, code);
  }
}

export async function runSandbox(
  code: string,
  environment: SandboxEnvironment = {},
): Promise<SandboxExecutionResult> {
  try {
    return { ok: true, value: await executeSandboxCodeAsync(code, [environment]) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function resolveSandboxText(
  text: string,
  environments: SandboxEnvironment[] = [],
  options: ResolveTextOptions = {},
): string {
  let current = text;
  const maxDepth = options.maxDepth ?? defaultMaxDepth;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = replaceInlineExpressions(current, environments, options);
    if (next === current) {
      return next;
    }
    current = next;
  }

  return current;
}

export function resolveSandboxMessages(
  messages: ModelMessage[],
  environments: SandboxEnvironment[] = [],
  options: ResolveTextOptions = {},
): ModelMessage[] {
  let current = messages.map((message) => ({ ...message }));
  const maxDepth = options.maxDepth ?? defaultMaxDepth;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = current.flatMap((message) => resolveMessageOnce(message, environments, options));
    if (JSON.stringify(next) === JSON.stringify(current)) {
      return next;
    }
    current = next;
  }

  return current;
}

function resolveMessageOnce(
  message: ModelMessage,
  environments: SandboxEnvironment[],
  options: ResolveTextOptions,
): ModelMessage[] {
  if (message.role === "tool" || typeof message.content !== "string") {
    return [message];
  }

  const createTextMessage = (content: string): ModelMessage => {
    if (message.role === "system") {
      return { ...message, role: "system", content };
    }
    if (message.role === "user") {
      return { ...message, role: "user", content };
    }
    return { ...message, role: "assistant", content };
  };

  const parts = splitInlineExpressions(message.content);
  if (!parts.some((part) => part.kind === "splice")) {
    return [createTextMessage(replaceInlineExpressions(message.content, environments, options))];
  }

  const output: ModelMessage[] = [createTextMessage("")];

  for (const part of parts) {
    const last = output[output.length - 1];
    if (!last || typeof last.content !== "string") {
      continue;
    }

    if (part.kind === "text") {
      last.content += part.value;
      continue;
    }

    const value = executeSandboxCode(part.value, environments);
    if (part.kind === "inline") {
      last.content += stringifySandboxValue(value, options);
      continue;
    }

    if (isModelMessageArray(value)) {
      output.push(...value);
      output.push(createTextMessage(""));
      continue;
    }

    if (isStringArrayLike(value)) {
      output.push(...Array.from(value, (content) => createTextMessage(String(content))));
      output.push(createTextMessage(""));
      continue;
    }

    last.content += stringifySandboxValue(value, options);
  }

  return output.filter((item) => typeof item.content !== "string" || item.content.length > 0);
}

function replaceInlineExpressions(
  text: string,
  environments: SandboxEnvironment[],
  options: ResolveTextOptions,
): string {
  return text.replace(inlinePattern, (_match, _whole, inlineCode, spliceCode) =>
    stringifySandboxValue(executeSandboxCode(inlineCode ?? spliceCode ?? "", environments), options),
  );
}

function splitInlineExpressions(text: string) {
  const parts: { kind: "text" | "inline" | "splice"; value: string }[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(inlinePattern)) {
    if (match.index == null) {
      continue;
    }
    if (match.index > lastIndex) {
      parts.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({
      kind: match[2] == null ? "splice" : "inline",
      value: match[2] ?? match[3] ?? "",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return parts;
}

function buildExecutableBody(code: string, environment: SandboxEnvironment): string {
  if (!code || /^(\/\/[^\n]*|\/\*[\s\S]*\*\/)\s*$/.test(code)) {
    return "return undefined;";
  }
  if (/^[A-Za-z_$][\w$]*$/.test(code)) {
    return typeof environment[code] === "function" ? `return ${code}();` : `return ${code};`;
  }
  if (/^(async\s+)?function\b/.test(code) || /^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(code)) {
    return `return (${code});`;
  }
  if (/^(if|for|while|switch|try|return|const|let|var)\b/.test(code)) {
    return code;
  }
  return `return (${code});`;
}

function sandboxExecutionError(error: unknown, code: string): Error {
  const marker = "[PulsarAI Sandbox source]";
  if (error instanceof Error && error.message.includes(marker)) return error;
  const message = error instanceof Error ? error.message : String(error);
  const codeFence = String.fromCharCode(96).repeat(3);
  const enriched = new Error(
    message + "\n\n" + marker + "\n\n" + codeFence + "js\n"
      + sandboxSourceExcerpt(code)
      + "\n" + codeFence,
  );
  if (error instanceof Error && error.stack) {
    enriched.stack = enriched.stack + "\nCaused by: " + error.stack;
  }
  return enriched;
}

function sandboxSourceExcerpt(code: string) {
  const lines = code.replace(/\r\n/g, "\n").trim().split("\n");
  const visibleIndexes = lines.length > 80
    ? [...Array.from({ length: 60 }, (_, index) => index), ...Array.from({ length: 20 }, (_, index) => lines.length - 20 + index)]
    : Array.from({ length: lines.length }, (_, index) => index);
  const width = String(lines.length).length;
  const result: string[] = [];
  let previousIndex = -1;
  for (const index of visibleIndexes) {
    if (index > previousIndex + 1) result.push("… omitted …");
    result.push(String(index + 1).padStart(width, " ") + " | " + lines[index]);
    previousIndex = index;
  }
  return result.join("\n").slice(0, 8_000);
}

function isAppendPosition(key: string) {
  return /^\d+$/.test(key) || /^[A-Z][A-Z0-9_]*$/.test(key);
}

export function stringifySandboxValue(value: unknown, options: ResolveTextOptions = {}): string {
  if (value == null) {
    return "";
  }
  if (!options.keepArraySet2StrDefault && (Array.isArray(value) || value instanceof Set)) {
    return Array.from(value, (item) => String(item))
      .map((item) => (item.endsWith("\n") ? item : `${item}\n`))
      .join("");
  }
  if (typeof value === "object" && "toString" in value && Object.prototype.hasOwnProperty.call(value, "toString")) {
    const customToString = (value as { toString: unknown }).toString;
    return typeof customToString === "function" ? String(customToString.call(value)) : String(customToString);
  }
  return String(value);
}

function isStringArrayLike(value: unknown): value is string[] | Set<string> {
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string");
  }
  return value instanceof Set && Array.from(value).every((item) => typeof item === "string");
}

function isModelMessageArray(value: unknown): value is ModelMessage[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && "role" in item && "content" in item);
}
