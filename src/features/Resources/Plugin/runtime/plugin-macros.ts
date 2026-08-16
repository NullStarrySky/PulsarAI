import { executeSandboxCode, executeSandboxCodeAsync } from "@/features/Sandbox/sandbox";
import { normalizeMarkdownLineBreaks } from "@/lib/markdown";
import { createPluginConditionEnvironment } from "./plugin-condition-environment";
import { createPluginReferenceResolver } from "./plugin-reference-resolver";
import { findPluginImportCalls } from "./plugin-import";
import { parseUriPath, globMatcher } from "./plugin-uri";
import { usePluginStore } from "../tree/plugin-store";
import { parsePluginChatContext, type PluginChatContext } from "../editors/chat/plugin-chat";
import {
  truncateText,
  type ConditionResults,
  type FileSource,
  type MacrosParts,
  type MessageParts,
  type Parts,
  type Sources,
  type TestOptions,
} from "./plugin-test";
import { findPluginNodeByPath } from "../tree/plugin-types";
import { getActivePinia } from "pinia";

export function evaluateConditionResult(
  conditionCode: string,
  environment: Record<string, unknown> = {},
): ConditionResults {
  if (!conditionCode || !conditionCode.trim()) return null;
  const code = conditionCode.trim();
  const conditionType = code.includes("||") ? "or" : "and";
  const condEnv = createPluginConditionEnvironment((environment.chat as any) || []);
  let finalResult = false;
  try {
    finalResult = Boolean(executeSandboxCode(code, [condEnv, environment]));
  } catch {
    finalResult = false;
  }
  return {
    content: {
      conditionCode: code,
      result: finalResult,
    },
    conditionType,
    finalResult,
  };
}

export async function parseTextPartsWithMacros(
  text: string,
  environment: Record<string, unknown>,
  options: TestOptions,
  currentPluginId: string,
): Promise<Parts[]> {
  const normalizedText = normalizeMarkdownLineBreaks(text);
  const limit = options.textTruncateLength ?? 20;
  const regex = /\{\{\s*([\s\S]*?)\s*\}\}|\[\[\s*([\s\S]*?)\s*\]\]/g;
  const parts: Parts[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) {
      const raw = normalizedText.slice(lastIndex, match.index);
      if (raw) parts.push(truncateText(raw, limit));
    }
    const macroCode = match[0];
    const expr = match[1] ?? match[2] ?? "";
    const macroType = match[1] !== undefined ? "inner" : "split";

    const calls = findPluginImportCalls(expr);
    const sources: Sources[] = [];

    for (const call of calls) {
      if (call.kind === "resource" || call.kind === "resourceById") {
        const path = call.value;
        const targetId = path.startsWith("@") ? parseUriPath(path, currentPluginId).targetPluginId : currentPluginId;
        const storePlugins = getActivePinia() ? usePluginStore().plugins : [];
        const p = storePlugins.find((item) => item.id === targetId);
        let condResult: ConditionResults = null;
        if (p) {
          const node = findPluginNodeByPath(p.root, normalizePluginPath(parseUriPath(path, currentPluginId).relPath));
          if (node && node.kind === "file" && node.insertion?.condition) {
            condResult = evaluateConditionResult(node.insertion.condition, environment);
          }
        }
        sources.push({
          type: "file",
          path,
          conditionResult: condResult,
        });
      } else if (call.kind === "container" || call.kind === "containers") {
        const cPath = `${call.scope}/${"name" in call ? call.name : call.pattern}`;
        const containerResult: FileSource[] = [];
        if (!environment.container) {
          const activePlugins = getActivePinia() ? usePluginStore().plugins : [];
          const resolver = createPluginReferenceResolver(activePlugins);
          const cList = resolver.listContainers().filter((c) =>
            c.scope === call.scope && ("name" in call ? c.name === call.name : globMatcher(call.pattern).test(c.name))
          );
          for (const cMeta of cList) {
            const detail = resolver.getContainer(cMeta.id);
            if (detail) {
              for (const contentItem of detail.contents) {
                const condRes = evaluateConditionResult(contentItem.condition || "", environment);
                containerResult.push({
                  type: "file",
                  path: `@${contentItem.pluginId}/${contentItem.path}`,
                  conditionResult: condRes,
                });
              }
            }
          }
        }
        sources.push({
          type: "container",
          path: cPath,
          containerResult,
        });
      } else if (call.kind === "configLocal" || call.kind === "configGlobal") {
        const cfgPath = call.kind === "configLocal"
          ? `${call.groupId}/${call.contentId}`
          : `@${call.pluginId}/${call.groupId}/${call.contentId}`;
        sources.push({
          type: "config",
          path: cfgPath,
          configResult: "[Config Loaded]",
        });
      }
    }

    let macroResult: Parts | Parts[] = truncateText(`[Macro: ${expr.trim()}]`, limit);
    try {
      const condEnv = createPluginConditionEnvironment((environment.chat as any) || []);
      const evalVal = await executeMacroExpression(expr, [condEnv, environment]);
      if (typeof evalVal === "string") {
        macroResult = await parseTextPartsWithMacros(evalVal, environment, options, currentPluginId);
      } else if (isRoleMessageArray(evalVal)) {
        macroResult = {
          kind: "messageList",
          messages: await Promise.all(evalVal.map(async (item) => ({
            kind: "messageRole" as const,
            role: item.role,
            content: await parseTextPartsWithMacros(
              stringifyMessageContent(item.content),
              environment,
              options,
              currentPluginId,
            ),
          }))),
        };
      } else if (Array.isArray(evalVal)) {
        macroResult = (await Promise.all(evalVal.map(async (item) =>
          typeof item === "string"
            ? await parseTextPartsWithMacros(item, environment, options, currentPluginId)
            : [truncateText(JSON.stringify(item), limit)]
        ))).flat();
      } else {
        macroResult = truncateText(evalVal == null ? "" : String(evalVal), limit);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      macroResult = truncateText(
        `[Macro Error: ${message}; source: ${JSON.stringify(expr)}]`,
        limit,
      );
    }

    const macroNode: MacrosParts = {
      kind: "macro",
      code: macroCode,
      macroType,
      result: macroResult,
      sources,
    };
    parts.push(macroNode);

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < normalizedText.length) {
    const raw = normalizedText.slice(lastIndex);
    if (raw) parts.push(truncateText(raw, limit));
  }

  return parts;
}

async function executeMacroExpression(
  expression: string,
  environments: Record<string, unknown>[],
) {
  const source = rewriteStaticPluginImports(expression);
  try {
    return await executeSandboxCodeAsync(source, environments);
  } catch (initialError) {
    // Milkdown serializes Markdown punctuation such as `*` as `\\*`. Retry the
    // expression with only Markdown punctuation escapes removed. A valid JavaScript
    // escape (for example a regex's `\\*`) never reaches this fallback.
    const restored = source.replace(
      /\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g,
      "$1",
    );
    if (restored === source) throw initialError;
    return await executeSandboxCodeAsync(restored, environments);
  }
}

function rewriteStaticPluginImports(source: string) {
  return source.replace(
    /(?<!\.)\bimport\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1\s*\)/g,
    (_match, quote: string, path: string) => `pluginImport(${quote}${path}${quote})`,
  );
}

export function renderPartsToString(parts: Parts[]): string {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.content;
      if (part.kind === "macro") {
        if (Array.isArray(part.result)) {
          return renderPartsToString(part.result);
        }
        if (part.result && typeof part.result === "object" && "kind" in part.result) {
          return renderPartsToString([part.result as Parts]);
        }
        return String(part.result ?? "");
      }
      return "";
    })
    .join("");
}

export async function resolvePluginChatMacros(
  input: unknown,
  environment: Record<string, unknown>,
  currentPluginId: string,
): Promise<PluginChatContext> {
  const chat = parsePluginChatContext(input);
  const message = (await Promise.all(chat.message.map(async (item) => {
    const parts = await parseTextPartsWithMacros(
      item.content,
      environment,
      { textTruncateLength: Infinity },
      currentPluginId,
    );
    return expandChatMessageParts(item.role, parts);
  }))).flat();
  return { message };
}

function isRoleMessageArray(value: unknown): value is Array<{ role: string; content: unknown }> {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as { role?: unknown; content?: unknown };
    return (candidate.role === "system" || candidate.role === "user" || candidate.role === "assistant")
      && "content" in candidate;
  });
}

function stringifyMessageContent(content: unknown) {
  return typeof content === "string" ? content : JSON.stringify(content) ?? "";
}

function expandChatMessageParts(
  role: PluginChatContext["message"][number]["role"],
  parts: Parts[],
): PluginChatContext["message"] {
  const result: PluginChatContext["message"] = [];
  let textParts: Parts[] = [];
  const appendText = () => {
    const content = renderPartsToString(textParts);
    if (content) result.push({ role, content });
    textParts = [];
  };

  for (const part of parts) {
    const messageLists = messageListsFromPart(part);
    if (messageLists.length === 0) {
      textParts.push(part);
      continue;
    }
    appendText();
    for (const messageList of messageLists) {
      for (const message of messageList.messages) {
        if (message.kind === "messageRole") {
          result.push(...expandChatMessageParts(
            message.role as PluginChatContext["message"][number]["role"],
            message.content,
          ));
        } else if (message.content) {
          result.push({ role, content: message.content });
        }
      }
    }
  }
  appendText();
  return result;
}

function messageListsFromPart(part: Parts): MessageParts[] {
  if (part.kind === "messageList") return [part];
  if (part.kind !== "macro") return [];
  const results = Array.isArray(part.result) ? part.result : [part.result];
  return results.filter((result): result is MessageParts => result.kind === "messageList");
}

function normalizePluginPath(path: string) {
  return path.trim().replace(/\\/g, "/").split("/").filter(Boolean);
}
