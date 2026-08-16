import type {
  MigrationSourceEntry,
  SillyTavernDiscrimination,
  SillyTavernPresetKind,
  SillyTavernResourceKind,
} from "./source-types";

const presetDirectories: Record<string, SillyTavernPresetKind> = {
  "openai settings": "openai",
  "textgen settings": "textgen",
  "koboldai settings": "kobold",
  "novelai settings": "novel",
  context: "context",
  instruct: "instruct",
  sysprompt: "sysprompt",
  reasoning: "reasoning",
};

export function discriminateSillyTavernResource(
  entry: MigrationSourceEntry,
  value?: unknown,
): SillyTavernDiscrimination {
  const path = normalizedPath(entry.relativePath);
  const segments = path.split("/");
  const evidence: string[] = [];
  const candidates = new Map<SillyTavernResourceKind, number>();
  const add = (kind: SillyTavernResourceKind, score: number, reason: string) => {
    candidates.set(kind, Math.max(candidates.get(kind) ?? 0, score));
    evidence.push(reason);
  };

  if (entry.extension === "jsonl") add("chat", 1, "文件扩展名为 .jsonl");
  if (segments.includes("chats")) add("chat", 0.99, "位于 chats 目录");
  const charactersIndex = segments.lastIndexOf("characters");
  if (charactersIndex >= 0 && charactersIndex === segments.length - 2 && ["png", "json"].includes(entry.extension)) {
    add("character", 0.97, "位于 characters 目录");
  }
  if (segments.includes("worlds") && entry.extension === "json") {
    add("worldbook", 0.98, "位于 worlds 目录");
  }
  if (segments.includes("backgrounds") && isMediaExtension(entry.extension)) {
    add("background", 1, "位于 backgrounds 目录");
  }
  if (segments.includes("themes") && entry.extension === "json") {
    add("theme", 1, "位于 themes 目录");
  }
  if (segments.includes("user avatars") && isImageExtension(entry.extension)) {
    add("user-persona", 0.95, "位于 User Avatars 目录");
  }
  if (segments.some((segment) => ["quickreplies", "quick replies", "quick-replies"].includes(segment)) && entry.extension === "json") {
    add("quick-reply", 0.98, "位于 Quick Replies 目录");
  }
  if (entry.name.toLocaleLowerCase() === "settings.json") {
    add("settings", 1, "文件名为 settings.json");
  }
  const presetKind = segments
    .map((segment) => presetDirectories[segment])
    .find((value): value is SillyTavernPresetKind => Boolean(value));
  if (presetKind && entry.extension === "json") {
    add("preset", 0.97, `位于 ${presetKind} 预设目录`);
  }

  if (isRecord(value)) {
    const spec = stringValue(value.spec);
    const data = isRecord(value.data) ? value.data : value;
    if (/^chara_card_v[23]$/i.test(spec) || characterShape(data)) {
      add("character", spec ? 1 : 0.86, spec ? `角色卡 spec=${spec}` : "包含角色卡核心字段");
    }
    if (worldbookShape(value)) add("worldbook", 0.91, "包含世界书 entries");
    if (settingsShape(value)) add("settings", 0.94, "包含酒馆 settings 核心字段");
    if (regexShape(value)) add("regex", 0.9, "包含正则脚本字段");
    if (quickReplyShape(value)) add("quick-reply", 0.96, "包含 Quick Reply 列表");
    if (presetShape(value)) add("preset", 0.78, "包含预设字段");
    if (macroShape(value)) add("macro", 0.72, "包含脚本或宏字段；仅记录，不转换");
  } else if (Array.isArray(value) && value.some(regexShape)) {
    add("regex", 0.92, "JSON 数组包含正则脚本");
  }

  const sorted = [...candidates.entries()].sort((left, right) => right[1] - left[1]);
  const [bestKind = "unknown", confidence = 0] = sorted[0] ?? [];
  return {
    kind: bestKind,
    confidence,
    evidence,
    alternatives: sorted.slice(1).filter(([, score]) => score >= confidence - 0.12).map(([kind]) => kind),
    ...(bestKind === "preset" ? { presetKind: presetKind ?? inferPresetKind(value) } : {}),
  };
}

export function inferPresetKind(value: unknown): SillyTavernPresetKind {
  if (!isRecord(value)) return "unknown";
  if ("story_string" in value || "chat_start" in value) return "context";
  if ("input_sequence" in value || "output_sequence" in value) return "instruct";
  if ("chat_completion_source" in value || "prompts" in value) return "openai";
  if ("rep_pen" in value || "repetition_penalty" in value) return "textgen";
  if ("min_length" in value && "max_length" in value) return "novel";
  if ("content" in value && Object.keys(value).length < 8) return "sysprompt";
  return "unknown";
}

function normalizedPath(path: string) {
  return path.replace(/\\/g, "/").toLocaleLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function characterShape(value: Record<string, unknown>) {
  return typeof value.name === "string"
    && ["description", "first_mes", "personality", "scenario"].filter((key) => key in value).length >= 2;
}

function worldbookShape(value: Record<string, unknown>) {
  if (!("entries" in value)) return false;
  const entries = value.entries;
  return Array.isArray(entries) || isRecord(entries);
}

function regexShape(value: unknown) {
  if (!isRecord(value)) return false;
  return ["findRegex", "find_regex", "regex", "replaceString", "replace_with", "replace_regex"]
    .filter((key) => key in value).length >= 2;
}

function settingsShape(value: Record<string, unknown>) {
  return "main_api" in value && ("power_user" in value || "oai_settings" in value);
}

function presetShape(value: Record<string, unknown>) {
  return ["temperature", "prompts", "story_string", "input_sequence", "max_context_unlocked"]
    .filter((key) => key in value).length >= 2;
}

function macroShape(value: Record<string, unknown>) {
  return typeof value.content === "string"
    && ("button" in value || "export_with" in value || "script" in value);
}

function quickReplyShape(value: Record<string, unknown>) {
  return Array.isArray(value.qrList)
    || Array.isArray(value.quickReplySets)
    || Array.isArray(value.quickReplies);
}

function isImageExtension(extension: string) {
  return ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(extension);
}

function isMediaExtension(extension: string) {
  return isImageExtension(extension) || ["mp4", "webm", "ogg", "mov", "m4v"].includes(extension);
}
