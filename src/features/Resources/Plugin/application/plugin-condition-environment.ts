import type { ModelMessage } from "ai";
import type { SandboxEnvironment } from "@/features/Sandbox/domain/sandbox";

export const defaultPluginInsertDepth = 4;
export const maxPluginInsertDepth = 20;

export interface PluginConditionDefinition {
  id: string;
  label: string;
  argumentPlaceholders: string[];
}

export const pluginConditionDefinitions: PluginConditionDefinition[] = [
  {
    id: "containKeyWord",
    label: "包含关键词",
    argumentPlaceholders: ["关键词或 /正则/flags"],
  },
  {
    id: "excludeKeyWord",
    label: "排除关键词",
    argumentPlaceholders: ["关键词或 /正则/flags"],
  },
  {
    id: "probability",
    label: "概率",
    argumentPlaceholders: ["0-100"],
  },
  {
    id: "custom",
    label: "自定义",
    argumentPlaceholders: ["例如 math.random() > 0.3"],
  },
];

export function normalizePluginInsertDepth(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return defaultPluginInsertDepth;
  }
  return Math.min(Math.max(Math.round(numeric), 1), maxPluginInsertDepth);
}

export function createPluginConditionEnvironment(input: {
  chat: ModelMessage[];
  depth: number;
  random?: () => number;
}): SandboxEnvironment {
  const depth = normalizePluginInsertDepth(input.depth);
  const messages = input.chat.slice(-depth);
  const searchableText = messages.map(messageText).filter(Boolean).join("\n");
  const random = input.random ?? Math.random;

  const containKeyWord = (keywordOrRegex: unknown) =>
    testKeyword(searchableText, String(keywordOrRegex ?? ""));
  const excludeKeyWord = (keywordOrRegex: unknown) =>
    !containKeyWord(keywordOrRegex);
  const probability = (percentage: unknown) => {
    const numeric = Number(percentage);
    if (!Number.isFinite(numeric)) {
      return false;
    }
    return random() * 100 < Math.min(Math.max(numeric, 0), 100);
  };

  return {
    depth,
    containKeyWord,
    excludeKeyWord,
    probability,
    math: Math,
    Math,
  };
}

function messageText(message: ModelMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      if ("text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function testKeyword(text: string, value: string) {
  const pattern = parseRegex(value.trim());
  if (pattern) {
    return pattern.test(text);
  }
  return Boolean(value.trim()) && text.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase());
}

function parseRegex(value: string) {
  if (!value.startsWith("/")) {
    return null;
  }
  const closingSlash = value.lastIndexOf("/");
  if (closingSlash <= 0) {
    return null;
  }
  try {
    return new RegExp(value.slice(1, closingSlash), value.slice(closingSlash + 1));
  } catch {
    return null;
  }
}
