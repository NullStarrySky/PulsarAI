import type { ModelMessage } from "ai";
import { createAgentResourceProvider } from "@/features/Plugin/agent/runtime/default-agent";
import {
  askUserInputSchema,
  normalizeAskUserResult,
  type AskUserInput,
} from "@/features/Plugin/agent/runtime/ask-user-tool";
import {
  buildPluginGenerationEnvironment,
  pluginFixedSettingValue,
  type PluginGenerationDiagnostic,
} from "@/features/Plugin/runtime/environment";
import { extractYAMLFormatter } from "@/features/Plugin/runtime/yaml-formatter";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";
import { getDefaultChatModel } from "@/features/defaultConfigs/default-config-service";
import { parseModelReference } from "@/features/ModelConnection/model-reference";
import type {
  ChatMessage,
  ChatMessageContainer,
  Conversation,
} from "@/features/Conversation/messages/conversation-types";
import { normalizeMarkdownLineBreaks } from "@/features/Plugin/shared/markdown";
import { prepareConversationMemoryContext } from "@/features/Conversation/generation/conversation-memory";
import { createConversationResourceOverlay } from "@/features/Conversation/store/conversation-resource-overlay";
import { currentAskUserRequester } from "@/features/Conversation/generation/ask-user-requester";
import { createReplyContainer } from "@/features/Conversation/generation/reply-container";
import { createResourceTransactionCore } from "@/features/Conversation/generation/resource-transaction";

export interface ConversationGenerationInput {
  conversationId: string;
  kind?: Conversation["kind"];
  packageId: string;
  mainPluginId: string;
  plugins: Plugin[];
  activePath: ChatMessageContainer[];
  chat: ModelMessage[];
  bootstrapMessages: ModelMessage[];
  emptyContainer: ChatMessageContainer;
  emptyMessage: ChatMessage;
  beforeGenerationMessage?: ChatMessage;
  containerId: string;
  action?: {
    pluginId: string;
    resourceId: string;
    name: string;
  };
  prompt: string;
  onContainerChange?: () => void | Promise<void>;
  onReplyChange?: () => void | Promise<void>;
}

export interface ConversationGenerationResult {
  messages: ModelMessage[];
  diagnostics: PluginGenerationDiagnostic[];
  processPluginId?: string;
}

export async function executeConversationGeneration(
  input: ConversationGenerationInput,
): Promise<ConversationGenerationResult> {
  const resourceOverlay = createConversationResourceOverlay(
    input.plugins as any,
    input.activePath,
  );
  const pluginEnvironment = await buildPluginGenerationEnvironment(
    resourceOverlay.plugins,
    {
      activePath: input.activePath,
      chat: input.chat,
      conversationId: input.conversationId,
      conversation: {
        id: input.conversationId,
        kind: input.kind ?? "chat",
      },
      packageId: input.packageId,
      mainPluginId: input.mainPluginId,
      containerId: input.containerId,
      action: input.action,
      prompt: input.prompt,
    },
  );
  const finalEnvironment = pluginEnvironment.environment;

  const replyContainer = createReplyContainer({
    emptyContainer: input.emptyContainer,
    emptyMessage: input.emptyMessage,
    onReplyChange: input.onReplyChange,
  });

  const transactionCore = createResourceTransactionCore({
    resourceOverlay,
    pluginEnvironment,
    finalEnvironment,
    emptyMessage: input.emptyMessage,
    onReplyChange: input.onReplyChange,
  });

  const mainPlugin =
    pluginEnvironment.enabledPlugins.find((p) => p.id === input.mainPluginId)
    ?? pluginEnvironment.enabledPlugins[0];
  const configuredModel = mainPlugin
    ? pluginFixedSettingValue(mainPlugin, "model")
    : null;
  const defaultModel = await getDefaultChatModel();
  const rawModelReference =
    typeof configuredModel === "string" && configuredModel.trim()
      ? configuredModel.trim()
      : defaultModel;
  const { providerId, modelId, thinkingLevel } = parseModelReference(rawModelReference);
  const modelName = `${providerId}/${modelId}${thinkingLevel ? `/${thinkingLevel}` : ""}`;

  const requestUser = async (questionInput: AskUserInput) => {
    const parsed = askUserInputSchema.parse(questionInput);
    const requester = currentAskUserRequester();
    if (!requester) {
      throw new Error("当前界面没有注册用户提问处理器。");
    }
    return normalizeAskUserResult(await requester(parsed));
  };
  const agentResources = createAgentResourceProvider({
    environment: finalEnvironment,
    modelName,
    resourceTransaction: transactionCore.transaction,
  });

  const capabilityAgentApi =
    finalEnvironment.agent
    && typeof finalEnvironment.agent === "object"
    ? finalEnvironment.agent as Record<string, unknown>
    : {};
  const codeActAgentApi = {
    ...capabilityAgentApi,
    ...agentResources,
    askUser: requestUser,
  };

  const api = pluginEnvironment.selfApi;

  const generate = async (
    targetContainerOrResource: string | ChatMessageContainer,
    requestMode: "generate" | "regenerate" | "continue" | "rewrite" = "generate",
    options: {
      messageId?: string;
      versionId?: string;
      prompt?: string;
    } = {},
  ) => {
    const conversationStore = (await import("@/features/Conversation/store/conversation-store")).useConversationStore();
    const previousContainerId = typeof targetContainerOrResource === "string"
      ? targetContainerOrResource
      : targetContainerOrResource.id;
    return conversationStore.requestContainer({
      mode: requestMode,
      previousContainerId,
      prompt: options.prompt,
    });
  };

  const bootstrapMessages = cloneSerializable(input.bootstrapMessages);

  Object.assign(finalEnvironment, {
    bootstrapMessages,
    imports: api.import,
    compileChat: api.import,
    container: api.container,
    config: api.config,
    memory: Object.freeze({
      prepare: (options: { compressionThreshold: number }) => {
        const activePath = input.activePath.filter((container) => !container.hidden);
        const percentage = Math.min(100, Math.max(0, Number(options.compressionThreshold) || 0));
        return prepareConversationMemoryContext({
          conversationId: input.conversationId,
          activePath,
          compressionThreshold: percentage <= 0
            ? 0
            : Math.max(4, Math.ceil(activePath.length * percentage / 100)),
        });
      },
    }),
    draft: input.emptyContainer.command
      ? Object.freeze({
          read: () => input.emptyContainer.draft ?? "",
          edit: async (find: string, replace: string) => {
            const current = input.emptyContainer.draft ?? "";
            if (!find) throw new Error("draft.edit 的 find 不能为空。");
            const index = current.indexOf(find);
            if (index < 0) throw new Error("draft.edit 未找到要替换的文本。");
            input.emptyContainer.draft = normalizeMarkdownLineBreaks(
              `${current.slice(0, index)}${replace}${current.slice(index + find.length)}`,
            );
            await input.onContainerChange?.();
            return input.emptyContainer.draft;
          },
        })
      : undefined,
    api,
    agent: codeActAgentApi,
    AGENT: codeActAgentApi,
    generate,
    askUser: requestUser,
    extractYAMLFormatter,
    containers: api.container,
  });

  finalEnvironment.ctx = finalEnvironment;
  Object.assign(finalEnvironment, {
    emptyContainer: Object.freeze(cloneSerializable(input.emptyContainer)),
    emptyMessage: Object.freeze(cloneSerializable(input.emptyMessage)),
    reply: replyContainer.reply,
    ...(input.beforeGenerationMessage
      ? { beforeGenerationMessage: input.beforeGenerationMessage }
      : {}),
  });

  try {
    if (!pluginEnvironment.generatePath) throw new Error("主要插件没有可执行的 generatePath。");
    await api.import(pluginEnvironment.generatePath, finalEnvironment);
    await Promise.all([replyContainer.queue(), transactionCore.queue()]);
  } finally {
    replyContainer.finish();
  }

  fillEnvironmentMetadata(input.emptyMessage, pluginEnvironment);
  return {
    messages: input.chat,
    diagnostics: [],
    processPluginId: pluginEnvironment.processPlugin?.id,
  };
}

function fillEnvironmentMetadata(
  message: ChatMessage,
  environment: Awaited<ReturnType<typeof buildPluginGenerationEnvironment>>,
) {
  const processPlugin = environment.processPlugin ?? environment.enabledPlugins[0] ?? null;
  message.meta.environmentInfo = {
    pluginId: processPlugin?.id ?? "",
    pluginName: processPlugin?.name ?? "",
    characterId: "",
    characterName: "",
    resolvedResourceIds: [],
    diagnostics: [],
  };
}

function cloneSerializable<T>(value: T): T {
  if (value == null || typeof value !== "object") return value;
  if (typeof (globalThis as any).structuredClone === "function") {
    return (globalThis as any).structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
