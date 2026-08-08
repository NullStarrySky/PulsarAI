import type { SandboxEnvironment } from "@/features/Sandbox/domain/sandbox";

export const pluginConditionDefinitions = [
  { id: "include", label: "包含", placeholder: "关键词或 /正则/flags" },
  { id: "exclude", label: "排除", placeholder: "关键词或 /正则/flags" },
  { id: "probability", label: "概率", placeholder: "0-100" },
  { id: "custom", label: "自定义", placeholder: "JavaScript 布尔表达式" },
] as const;

export type PluginConditionFunction = typeof pluginConditionDefinitions[number]["id"];

export function createPluginConditionEnvironment(
  chatValue: unknown,
  random: () => number = Math.random,
): SandboxEnvironment {
  const chat = Array.isArray(chatValue) ? chatValue : [];
  const searchableText = (depth?: unknown) => {
    const numericDepth = Number(depth);
    const messages = Number.isFinite(numericDepth) && numericDepth > 0
      ? chat.slice(-Math.floor(numericDepth))
      : chat;
    return messages.map(messageText).filter(Boolean).join("\n");
  };
  const include = (keywordOrRegex: unknown, depth?: unknown) =>
    testKeyword(searchableText(depth), String(keywordOrRegex ?? ""));
  const exclude = (keywordOrRegex: unknown, depth?: unknown) =>
    !include(keywordOrRegex, depth);
  const probability = (percentage: unknown) => {
    const numeric = Number(percentage);
    return Number.isFinite(numeric)
      && random() * 100 < Math.min(Math.max(numeric, 0), 100);
  };

  return Object.freeze({
    include,
    exclude,
    probability,
    containKeyWord: include,
    excludeKeyWord: exclude,
  });
}

function messageText(message: unknown) {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) =>
    part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
      ? [(part as { text: string }).text]
      : []
  ).join("\n");
}

function testKeyword(text: string, value: string) {
  const keyword = value.trim();
  if (!keyword) return false;
  const pattern = parseRegex(keyword);
  return pattern
    ? pattern.test(text)
    : text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
}

function parseRegex(value: string) {
  if (!value.startsWith("/")) return null;
  const closingSlash = value.lastIndexOf("/");
  if (closingSlash <= 0) return null;
  try {
    return new RegExp(value.slice(1, closingSlash), value.slice(closingSlash + 1));
  } catch {
    return null;
  }
}
