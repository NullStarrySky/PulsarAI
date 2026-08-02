import type { ModelMessage } from "ai";
import {
  findPluginNodeByPath,
  pluginConventions,
  pluginNodePath,
  type Plugin,
  type PluginFile,
} from "@/features/Resources/Plugin/domain/plugin-types";

export type PluginRegexRange = "user_input" | "ai_output" | "all";
export type PluginRegexDepth = number | "INF";

export interface PluginRegexRule {
  find_regex: string;
  replace_regex: string;
  range: PluginRegexRange;
  depth_min: PluginRegexDepth;
  depth_max: PluginRegexDepth;
  applyOnRending: boolean;
}

export interface ResolvedPluginRegexRule {
  id: string;
  pluginId: string;
  pluginName: string;
  resourceId: string;
  path: string;
  priority: number;
  ruleIndex: number;
  rule: PluginRegexRule;
}

export interface PluginRegexDiagnostic {
  pluginId: string;
  resourceId: string;
  message: string;
}

export interface PluginRegexResult<T> {
  value: T;
  diagnostics: PluginRegexDiagnostic[];
}

const regexRanges = new Set<PluginRegexRange>([
  "user_input",
  "ai_output",
  "all",
]);

function normalizeDepth(value: unknown, fallback: PluginRegexDepth): PluginRegexDepth {
  if (typeof value === "string" && value.trim().toUpperCase() === "INF") {
    return "INF";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }
  return fallback;
}

function normalizeRule(value: unknown): PluginRegexRule | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<PluginRegexRule> & {
    applyOnRendering?: unknown;
  };
  if (typeof source.find_regex !== "string") return null;
  return {
    find_regex: source.find_regex,
    replace_regex:
      typeof source.replace_regex === "string" ? source.replace_regex : "",
    range: regexRanges.has(source.range as PluginRegexRange)
      ? source.range as PluginRegexRange
      : "all",
    depth_min: normalizeDepth(source.depth_min, 1),
    depth_max: normalizeDepth(source.depth_max, "INF"),
    applyOnRending:
      source.applyOnRending === true || source.applyOnRendering === true,
  };
}

export function parsePluginRegexRules(content: unknown): PluginRegexRule[] {
  let source = content;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source.flatMap((item) => {
    const rule = normalizeRule(item);
    return rule ? [rule] : [];
  });
}

export function serializePluginRegexRules(rules: PluginRegexRule[]) {
  return JSON.stringify(rules.map((rule) => normalizeRule(rule)).filter(Boolean), null, 2);
}

export function createEmptyPluginRegexRule(): PluginRegexRule {
  return {
    find_regex: "",
    replace_regex: "",
    range: "all",
    depth_min: 1,
    depth_max: "INF",
    applyOnRending: false,
  };
}

export function collectPluginRegexRules(plugins: Plugin[]): PluginRegexResult<ResolvedPluginRegexRule[]> {
  const diagnostics: PluginRegexDiagnostic[] = [];
  const resources: Array<{
    plugin: Plugin;
    file: PluginFile;
  }> = [];

  plugins.forEach((plugin) => {
    const file = findPluginNodeByPath(plugin.root, pluginConventions.regex);
    if (file?.kind !== "file") return;
    resources.push({ plugin, file });
  });

  resources.sort(
    (a, b) =>
      (b.file.priority ?? 100) - (a.file.priority ?? 100)
      || a.plugin.id.localeCompare(b.plugin.id)
      || a.file.id.localeCompare(b.file.id),
  );

  const rules = resources.flatMap(({ plugin, file }) => {
    let raw = file.content;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch (error) {
        diagnostics.push({
          pluginId: plugin.id,
          resourceId: file.id,
          message: `${pluginConventions.regex} JSON 无效：${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        return [];
      }
    }
    if (!Array.isArray(raw)) {
      diagnostics.push({
        pluginId: plugin.id,
        resourceId: file.id,
        message: `${pluginConventions.regex} 必须是规则数组。`,
      });
      return [];
    }
    const path = `/${pluginNodePath(plugin.root, file.id).join("/")}`;
    return raw.flatMap((item, ruleIndex) => {
      const rule = normalizeRule(item);
      if (!rule) {
        diagnostics.push({
          pluginId: plugin.id,
          resourceId: file.id,
          message: `${pluginConventions.regex} 第 ${ruleIndex + 1} 条规则无效。`,
        });
        return [];
      }
      return [{
        id: `${plugin.id}:${file.id}:${ruleIndex}`,
        pluginId: plugin.id,
        pluginName: plugin.name,
        resourceId: file.id,
        path,
        priority: file.priority ?? 100,
        ruleIndex,
        rule,
      }];
    });
  });

  return { value: rules, diagnostics };
}

function parseRegex(value: string) {
  if (!value.startsWith("/")) {
    return new RegExp(value, "g");
  }
  let escaped = false;
  for (let index = value.length - 1; index > 0; index -= 1) {
    const character = value[index];
    if (character === "/" && !escaped) {
      return new RegExp(value.slice(1, index), value.slice(index + 1));
    }
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  return new RegExp(value, "g");
}

function matchesRange(role: ModelMessage["role"], range: PluginRegexRange) {
  return range === "all"
    || (range === "user_input" && role === "user")
    || (range === "ai_output" && role === "assistant");
}

function matchesDepth(depthFromEnd: number, rule: PluginRegexRule) {
  const minimum = rule.depth_min === "INF" ? 1 : rule.depth_min;
  const maximum = rule.depth_max === "INF" ? Number.POSITIVE_INFINITY : rule.depth_max;
  return depthFromEnd >= Math.min(minimum, maximum)
    && depthFromEnd <= Math.max(minimum, maximum);
}

function replaceText(
  text: string,
  resolvedRule: ResolvedPluginRegexRule,
  diagnostics: PluginRegexDiagnostic[],
) {
  if (!resolvedRule.rule.find_regex) return text;
  try {
    return text.replace(
      parseRegex(resolvedRule.rule.find_regex),
      resolvedRule.rule.replace_regex,
    );
  } catch (error) {
    diagnostics.push({
      pluginId: resolvedRule.pluginId,
      resourceId: resolvedRule.resourceId,
      message: `${pluginConventions.regex} 第 ${resolvedRule.ruleIndex + 1} 条正则无效：${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return text;
  }
}

function replaceMessageContent(
  message: ModelMessage,
  resolvedRule: ResolvedPluginRegexRule,
  diagnostics: PluginRegexDiagnostic[],
): ModelMessage {
  if (typeof message.content === "string") {
    return {
      ...message,
      content: replaceText(message.content, resolvedRule, diagnostics),
    } as ModelMessage;
  }
  if (!Array.isArray(message.content)) return message;
  return {
    ...message,
    content: message.content.map((part) => {
      if (
        part
        && typeof part === "object"
        && "type" in part
        && part.type === "text"
        && "text" in part
        && typeof part.text === "string"
      ) {
        return {
          ...part,
          text: replaceText(part.text, resolvedRule, diagnostics),
        };
      }
      return part;
    }),
  } as ModelMessage;
}

export function applyPluginRegexToMessages(
  messages: ModelMessage[],
  rules: ResolvedPluginRegexRule[],
  options: { rendering?: boolean } = {},
): PluginRegexResult<ModelMessage[]> {
  const diagnostics: PluginRegexDiagnostic[] = [];
  let value = messages.map((message) => ({ ...message })) as ModelMessage[];
  for (const resolvedRule of rules) {
    if (options.rendering && !resolvedRule.rule.applyOnRending) continue;
    value = value.map((message, index) => {
      const depthFromEnd = value.length - index;
      if (
        !matchesRange(message.role, resolvedRule.rule.range)
        || !matchesDepth(depthFromEnd, resolvedRule.rule)
      ) {
        return message;
      }
      return replaceMessageContent(message, resolvedRule, diagnostics);
    });
  }
  return { value, diagnostics };
}

export function applyPluginRegexToText(
  text: string,
  input: {
    role: ModelMessage["role"];
    depthFromEnd: number;
    rules: ResolvedPluginRegexRule[];
    rendering?: boolean;
  },
): PluginRegexResult<string> {
  const diagnostics: PluginRegexDiagnostic[] = [];
  let value = text;
  for (const resolvedRule of input.rules) {
    if (input.rendering && !resolvedRule.rule.applyOnRending) continue;
    if (
      !matchesRange(input.role, resolvedRule.rule.range)
      || !matchesDepth(input.depthFromEnd, resolvedRule.rule)
    ) {
      continue;
    }
    value = replaceText(value, resolvedRule, diagnostics);
  }
  return { value, diagnostics };
}
