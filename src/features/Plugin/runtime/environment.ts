import packageDocs from "@/features/Plugin/builtIn/core/docs/package.md?raw";
import pluginDocs from "@/features/Plugin/builtIn/core/docs/plugin.md?raw";
import conversationDocs from "@/features/Plugin/builtIn/core/docs/conversation.md?raw";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { createComposerApi } from "@/features/Conversation/composer/composer-api";
import {
  modelMessagesFromPath,
  useMessageStore,
} from "@/features/Conversation/messages/message-store";
import { usePackageStore } from "@/features/Package/package-store";
import type { PluginConfig } from "@/features/Plugin/editors/config/plugin-config";
import { environmentTools, PluginLogger } from "@/features/Plugin/runtime";
import type { PluginSelfApiMutation } from "@/features/Plugin/runtime/self-api";
import { createPluginSelfApi } from "@/features/Plugin/runtime/self-api";
import { useSlotStore } from "@/features/Plugin/tree/slot-store";
import {
  findPluginNodeByPath,
  type Plugin,
  type PluginFile,
  pluginConventions,
} from "@/features/Plugin/tree/plugin-types";
import {
  type SandboxEnvironment,
} from "@/features/Sandbox/sandbox";

const builtinAgentDocs = Object.freeze({
  package: packageDocs,
  plugin: pluginDocs,
  conversation: conversationDocs,
});

/** Return built-in Agent documentation as unwrapped Markdown source. */
export function readBuiltinAgentDocs(id?: string) {
  if (!id) return Object.keys(builtinAgentDocs);
  return builtinAgentDocs[id as keyof typeof builtinAgentDocs] ?? null;
}

/* ============================================================================
 * 1. Condition Environment (条件判断环境)
 * ============================================================================ */

export const pluginConditionDefinitions = [
  { id: "include", label: "包含", placeholder: "关键词或 /正则/flags" },
  { id: "exclude", label: "排除", placeholder: "关键词或 /正则/flags" },
  { id: "probability", label: "概率", placeholder: "0-100" },
  { id: "custom", label: "自定义", placeholder: "JavaScript 布尔表达式" },
] as const;

export type PluginConditionFunction =
  (typeof pluginConditionDefinitions)[number]["id"];

export function createPluginConditionEnvironment(
  chatValue: unknown,
  random: () => number = Math.random,
): SandboxEnvironment {
  const chat = Array.isArray(chatValue) ? chatValue : [];
  const searchableText = (depth?: unknown) => {
    const numericDepth = Number(depth);
    const messages =
      Number.isFinite(numericDepth) && numericDepth > 0
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
    return (
      Number.isFinite(numeric) &&
      random() * 100 < Math.min(Math.max(numeric, 0), 100)
    );
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
  return content
    .flatMap((part) =>
      part &&
      typeof part === "object" &&
      typeof (part as { text?: unknown }).text === "string"
        ? [(part as { text: string }).text]
        : [],
    )
    .join("\n");
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
    return new RegExp(
      value.slice(1, closingSlash),
      value.slice(closingSlash + 1),
    );
  } catch {
    return null;
  }
}

/* ============================================================================
 * 2. Generate Path & Fixed Setting Utilities (生成入口与配置获取)
 * ============================================================================ */

export function pluginGenerateFile(plugin: Plugin) {
  return useSlotStore()
    .api([plugin])
    .get("generatePath", "global")
    ?.resources[0]?.file ?? null;
}

export function pluginConfigValue(plugin: Plugin, key: string) {
  const config = findPluginNodeByPath(plugin, pluginConventions.config);
  if (
    config?.kind !== "file" ||
    !config.content ||
    typeof config.content !== "object"
  )
    return null;
  return (config.content as PluginConfig)[key]?.value ?? null;
}

/* ============================================================================
 * 3. Preview input resolver
 * ============================================================================ */

export function resolveEnvironment(
  envInput?: string | Record<string, unknown>,
): Record<string, unknown> {
  if (!envInput) return {};
  if (typeof envInput === "string") {
    const chatStore = useChatStore();
    const packageStore = usePackageStore();
    const messageStore = useMessageStore();
    const conv = chatStore.chats.find((chat) => chat.id === envInput);
    if (!conv) return { conversationId: envInput, chat: [] };
    const activePath = messageStore.pathFor(
      conv.lastContainerId ?? conv.rootContainerId,
    );
    const chat = modelMessagesFromPath(activePath);

    return {
      conversationId: conv.id,
      conversation: conv,
      chat,
      CHAT: chat,
      packageId: conv.packageId ?? conv.binding?.packageId ?? "",
      package:
        packageStore.packages.find((item) => item.id === conv.packageId) ??
        null,
      activePath,
      input: createComposerApi(conv.id),
    };
  }
  return envInput;
}

/* ============================================================================
 * 4. Disposable resource preview
 * ============================================================================ */

export interface PluginResourcePreviewInput {
  plugin: Plugin;
  file: PluginFile;
  plugins: Plugin[];
  conversationId?: string;
  content: unknown;
}

export interface PluginResourcePreview {
  value: unknown;
  error?: string;
  logger: PluginLogger;
}

const previewMutation: PluginSelfApiMutation = {
  writeFile: () => { throw new Error("预览环境不允许写入资源。"); },
  editFile: () => { throw new Error("预览环境不允许编辑资源。"); },
  mkdir: () => { throw new Error("预览环境不允许创建文件夹。"); },
  move: () => { throw new Error("预览环境不允许移动资源。"); },
  remove: () => { throw new Error("预览环境不允许删除资源。"); },
};

/** Evaluate one resource against a disposable source snapshot and resolve its macros recursively. */
export async function previewPluginResource(
  input: PluginResourcePreviewInput,
): Promise<PluginResourcePreview> {
  const previewPlugin: Plugin = {
    ...input.plugin,
    files: input.plugin.files.map((file) =>
      file.id === input.file.id
        ? { ...file, content: input.content }
        : file,
    ),
  };
  const plugins = input.plugins.some((plugin) => plugin.id === input.plugin.id)
    ? input.plugins.map((plugin) => plugin.id === input.plugin.id ? previewPlugin : plugin)
    : [previewPlugin, ...input.plugins];
  const logger = new PluginLogger();
  const selfApi = createPluginSelfApi(input.plugin.id, {
    plugins,
    logger,
    mutation: previewMutation,
    conversationId: input.conversationId,
  });
  const baseEnvironment = resolveEnvironment(input.conversationId);
  const composer = baseEnvironment.input as { read?: () => string } | undefined;
  const rejectInputMutation = () => {
    throw new Error("预览环境不允许修改输入框。");
  };
  const environment: SandboxEnvironment = {
    ...baseEnvironment,
    utils: environmentTools,
    imports: selfApi.import,
    parse: (path: string | string[], extra: Record<string, unknown> = {}) =>
      selfApi.parse(path, { ...environment, ...extra }),
    fs: selfApi,
    read: selfApi.read,
    write: selfApi.write,
    edit: selfApi.edit,
    ls: selfApi.ls,
    exists: selfApi.exists,
    mkdir: selfApi.mkdir,
    move: selfApi.move,
    remove: selfApi.remove,
    slot: selfApi.slot,
    logger,
    input: composer
      ? Object.freeze({
          read: composer.read,
          write: rejectInputMutation,
          edit: rejectInputMutation,
          send: rejectInputMutation,
        })
      : undefined,
    read_docs: readBuiltinAgentDocs,
  };
  const resourcePath = `@${input.plugin.id}/${input.file.path}`;
  logger.append("预览资源", 0, "import", resourcePath);
  try {
    const value = await selfApi.parse(resourcePath, environment);
    return { value, logger };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.append(message, 0, "error", resourcePath);
    return { value: null, error: message, logger };
  }
}
