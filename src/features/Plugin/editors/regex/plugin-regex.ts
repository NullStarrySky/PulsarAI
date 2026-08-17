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
  order: number;
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




