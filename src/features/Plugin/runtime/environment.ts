import type { ModelMessage } from "ai";
import { buildConversationResourceContext } from "@/features/Conversation/store/conversation-resource-context";
import {
  modelMessagesFromPath,
  useConversationStore,
} from "@/features/Conversation/store/conversation-store";
import {
  type PluginManifestFixedSetting,
  parsePluginManifest,
  pluginManifestFixedValue,
} from "@/features/Plugin/editors/manifest/plugin-manifest";
import { createPluginSelfApi } from "@/features/Plugin/runtime/self-api";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import {
  findPluginNodeByPath,
  type Plugin,
  pluginConventions,
  pluginFileType,
} from "@/features/Plugin/tree/plugin-types";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";

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
  const file = plugin.nodes.find(
    (node) =>
      node.kind === "file" &&
      node.insertion?.target?.toLocaleLowerCase() === "generatepath" &&
      pluginFileType(node.name) === "javascript" &&
      typeof node.content === "string" &&
      node.content.trim(),
  );
  return file?.kind === "file" ? file : null;
}

export function pluginFixedSettingValue(
  plugin: Plugin,
  setting: PluginManifestFixedSetting,
) {
  const manifest = findPluginNodeByPath(plugin, pluginConventions.manifest);
  if (manifest?.kind !== "file") return null;
  const parsed = parsePluginManifest(manifest.content);
  if (parsed.diagnostics.length) return null;
  return pluginManifestFixedValue(parsed.manifest, setting);
}

/* ============================================================================
 * 3. Environment Resolver (IoC 环境变量解析)
 * ============================================================================ */

export function resolveEnvironment(
  envInput?: string | Record<string, unknown>,
): Record<string, unknown> {
  if (!envInput) return {};
  if (typeof envInput === "string") {
    const conversationStore = useConversationStore() as any;
    const pluginStore = usePluginStore() as any;
    const conv = conversationStore.conversations?.find(
      (c: any) => c.id === envInput,
    );
    if (!conv) return { conversationId: envInput, chat: [] };

    const chat = modelMessagesFromPath(
      conversationStore.containerPathForConversation(conv),
    );

    const resourceContext = buildConversationResourceContext(
      conv,
      pluginStore.plugins || [],
      conversationStore.packages || [],
      conversationStore.conversations || [],
      conversationStore.containers || [],
    );

    return {
      conversationId: conv.id,
      conversation: conv,
      chat,
      CHAT: chat,
      packageId: conv.packageId ?? conv.binding?.packageId ?? "",
      resourceContext,
      PROJECT_AGENT_PROMPT: resourceContext,
    };
  }
  return envInput;
}

/* ============================================================================
 * 4. Plugin Generation Environment Builder (沙箱生成环境构建器)
 * ============================================================================ */

export interface PluginGenerationDiagnostic {
  type: string;
  message: string;
  path?: string;
}

export interface GenerationPathEnvironmentInput {
  activePath: unknown[];
  chat: ModelMessage[];
  conversationId: string;
  conversation: unknown;
  packageId: string;
  mainPluginId: string;
  containerId: string;
  action?: {
    pluginId: string;
    resourceId: string;
    name: string;
  };
  prompt: string;
  now?: () => string;
  baseEnvironment?: SandboxEnvironment;
}

export interface PluginGenerationEnvironment {
  environment: SandboxEnvironment;
  enabledPlugins: Plugin[];
  processPlugin: Plugin | null;
  generatePath: string | null;
  selfApi: ReturnType<typeof createPluginSelfApi>;
}

export async function buildPluginGenerationEnvironment(
  plugins: Plugin[],
  input: GenerationPathEnvironmentInput,
): Promise<PluginGenerationEnvironment> {
  const enabledPlugins = plugins.filter(
    (plugin) =>
      plugin.enabled ||
      plugin.id === input.mainPluginId ||
      plugin.packageId === input.packageId,
  );
  const selfApi = createPluginSelfApi(input.mainPluginId, {
    plugins: enabledPlugins,
  });

  const environment: SandboxEnvironment = {
    ...(input.baseEnvironment ?? {}),
    activePath: input.activePath,
    chat: input.chat,
    CHAT: input.chat,
    conversationId: input.conversationId,
    conversation: input.conversation,
    packageId: input.packageId,
    containerId: input.containerId,
    action: input.action?.name ?? "",
    prompt: input.prompt,
    now: input.now ?? (() => new Date().toISOString()),
    imports: selfApi.import,
    container: selfApi.container,
    config: selfApi.config,
    compileChat: selfApi.import,
  };

  const processPlugin =
    enabledPlugins.find((plugin) => plugin.id === input.mainPluginId) ?? null;
  if (!processPlugin) {
    throw new Error(`主要插件不存在或未启用：${input.mainPluginId}`);
  }
  const generateFile = pluginGenerateFile(processPlugin);
  if (!generateFile) {
    throw new Error(
      `主要插件 ${processPlugin.name} 缺少带有 insertion.target: "generatePath" 的 JS 入口脚本。`,
    );
  }

  return {
    environment,
    enabledPlugins,
    processPlugin,
    generatePath: `@${processPlugin.id}/${generateFile.path}`,
    selfApi,
  };
}
