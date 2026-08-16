import type { ModelMessage } from "ai";
import { createAgentResourceProvider } from "@/features/Plugin/agent/runtime/default-agent";
import {
  createAgentExtensionApi,
} from "@/features/Plugin/agent/runtime/agent-extension-registry";
import {
  askUserInputSchema,
  normalizeAskUserResult,
  type AskUserInput,
} from "@/features/Plugin/agent/runtime/ask-user-tool";
import {
  askSuggestionInputSchema,
  normalizeAskSuggestionResult,
  type AskSuggestionInput,
} from "@/features/Plugin/agent/runtime/ask-suggestion-tool";
import {
  buildPluginGenerationEnvironment,
  type GenerationResourceValue,
  type PluginGenerationDiagnostic,
} from "@/features/Plugin/runtime/plugin-generation-environment";
import {
  createPluginReferenceResolver,
  type PluginReferenceResolver,
} from "@/features/Plugin/runtime/plugin-reference-resolver";
import {
  createDataDescriptionContainer,
  type ContextDataDefinition,
} from "@/features/Plugin/editors/chat/plugin-chat";
import {
  collectPluginCustomTools,
  createPluginCustomToolFunction,
} from "@/features/Plugin/runtime/plugin-custom-tools";
import {
  type Plugin,
} from "@/features/Plugin/tree/plugin-types";
import { createPluginSelfApi } from "@/features/Plugin/runtime/plugin-self-api";
import { pluginFixedSettingValue } from "@/features/Plugin/runtime/plugin-generate-path";
import { getDefaultChatModel } from "@/features/defaultConfigs/default-config-service";
import { parseModelReference } from "@/features/ModelConnection/model-reference";
import {
  executeSandboxCodeAsync,
  type SandboxEnvironment,
} from "@/features/Sandbox/sandbox";
import type {
  ChatMessage,
  ChatMessageMeta,
  ChatMessageContainer,
  Conversation,
  Role,
} from "@/features/Conversation/messages/conversation-types";
import { formatChatMessageError } from "@/features/Conversation/messages/conversation-types";
import { normalizeMarkdownLineBreaks } from "@/features/Plugin/shared/markdown";
import {
  createConversationDataApi,
  evaluateConversationData,
  prepareConversationMemoryContext,
} from "@/features/Conversation/generation/conversation-memory";
import {
  appendConversationResourceOperations,
  createConversationResourceOverlay,
  safeClone,
} from "@/features/Conversation/store/conversation-resource-overlay";
import type { ConversationResourceOperation } from "@/features/Conversation/messages/conversation-types";

export interface GenerationComponentRequest {
  componentId: string;
  title?: string;
  description?: string;
  props?: Record<string, unknown>;
}

export type GenerationComponentRequester = (
  request: GenerationComponentRequest,
) => Promise<unknown>;

export interface GenerateSubAgentRequest {
  /** Defaults to the built-in blank process. */
  plugin?: string;
  /** Uses an existing conversation as read-only context when provided. */
  environment?: string;
  prompt: string;
}

export interface GenerateSubAgentResult {
  content: string;
  conversationId: string;
  pluginId: string;
  ephemeral: boolean;
}

export interface RunConversationGenerationInput {
  plugins: Plugin[];
  packageId: string;
  mainPluginId: string;
  conversationId: string;
  conversation: Conversation;
  activePath: ChatMessageContainer[];
  chat: ModelMessage[];
  emptyContainer: ChatMessageContainer;
  emptyMessage: ChatMessage;
  clearBeforeGeneration?: boolean;
  action?: {
    pluginId: string;
    resourceId: string;
    name: string;
  };
  prompt: string;
  resourceContext?: string;
  beforeGenerationMessage?: ChatMessage;
  onChatPush?: (
    message: { role: Role; content: string; meta?: Partial<ChatMessageMeta> },
    merge: boolean,
  ) => Promise<unknown>;
  onReplyChange?: () => void | Promise<void>;
  onContainerChange?: () => void | Promise<void>;
  generateSubAgent?: (
    request: GenerateSubAgentRequest,
  ) => Promise<GenerateSubAgentResult>;
}

export interface RunConversationGenerationResult {
  messages: ModelMessage[];
  diagnostics: PluginGenerationDiagnostic[];
  processPluginId?: string;
}

const componentRequesters: GenerationComponentRequester[] = [];

function cloneSerializable<T>(value: T): T {
  return safeClone(value);
}

function summarizePluginConsoleValue(value: unknown): unknown {
  if (
    value === null
    || value === undefined
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || typeof value === "bigint"
  ) {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) {
    return { type: "Array", length: value.length };
  }
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  try {
    return {
      type: Object.prototype.toString.call(value).slice(8, -1),
      keys: Object.keys(value as object).slice(0, 80),
    };
  } catch {
    return "[Uninspectable value]";
  }
}

function createPluginConsole() {
  const write = (
    method: "debug" | "error" | "info" | "log" | "warn",
    values: unknown[],
  ) => console[method](...values.map(summarizePluginConsoleValue));
  return Object.freeze({
    debug: (...values: unknown[]) => write("debug", values),
    error: (...values: unknown[]) => write("error", values),
    info: (...values: unknown[]) => write("info", values),
    log: (...values: unknown[]) => write("log", values),
    warn: (...values: unknown[]) => write("warn", values),
  });
}

export function registerGenerationComponentRequester(
  requester: GenerationComponentRequester,
) {
  componentRequesters.push(requester);
  return () => {
    const index = componentRequesters.lastIndexOf(requester);
    if (index >= 0) {
      componentRequesters.splice(index, 1);
    }
  };
}

function createContextContainerApi(getResolver: () => PluginReferenceResolver) {
  return {
    list: () => getResolver().listContainers(),
    get: (containerId: string) => getResolver().getContainer(containerId),
    listContents: (
      containerId: string,
      input: { cursor?: number; limit?: number } = {},
    ) => getResolver().listContainerContents(containerId, input),
    read: (containerId: string, resourceIds?: string[]) =>
      getResolver().readContainer(containerId, resourceIds),
  };
}

function currentComponentRequester() {
  return componentRequesters[componentRequesters.length - 1] ?? null;
}

export async function runConversationGeneration(
  input: RunConversationGenerationInput,
): Promise<RunConversationGenerationResult> {
  if (input.clearBeforeGeneration) {
    input.emptyMessage.content = "";
    input.emptyMessage.type = "message";
    input.emptyMessage.parts = undefined;
    input.emptyMessage.meta.steps = [];
    delete input.emptyMessage.meta.translation;
    delete input.emptyMessage.meta.resourceUpdate;
    await input.onReplyChange?.();
  }
  const resourceOverlay = createConversationResourceOverlay(input.plugins, input.activePath);
  const mainPlugin = resourceOverlay.plugins.find((plugin) => plugin.id === input.mainPluginId);
  if (!mainPlugin) throw new Error(`主要插件不存在：${input.mainPluginId}`);
  const defaultModel = await getDefaultChatModel();
  const configuredModel = pluginFixedSettingValue(mainPlugin, "model");
  const modelName = typeof configuredModel === "string" && configuredModel.trim()
    ? configuredModel.trim()
    : defaultModel;
  const reasoningEffort = parseModelReference(modelName).reasoning;
  const initialGenerateInfo = input.emptyMessage.meta.generateInfo ??= {
    modelName,
    startTime: new Date().toISOString(),
  };
  initialGenerateInfo.modelName = modelName;
  const pluginEnvironment = await buildPluginGenerationEnvironment(
    resourceOverlay.plugins,
    {
      activePath: input.activePath,
      chat: input.chat,
      packageId: input.packageId,
      mainPluginId: input.mainPluginId,
      conversationId: input.conversationId,
      conversation: input.conversation,
      containerId: input.emptyContainer.id,
      action: input.action,
      prompt: input.prompt,
      baseEnvironment: {
        reasoningEffort: reasoningEffort ?? "auto",
      },
    },
  );

  const finalEnvironment: SandboxEnvironment = pluginEnvironment.environment;
  const time = Object.freeze({
    now: () => {
      const current = new Date();
      return {
        iso: current.toISOString(),
        epochMs: current.getTime(),
        timezoneOffsetMinutes: current.getTimezoneOffset(),
      };
    },
  });
  const chat = input.chat as ModelMessage[] & Record<string, unknown>;
  Object.defineProperties(chat, {
    push: {
      configurable: true,
      value: (
        message: { role: Role; content: string; meta?: Partial<ChatMessageMeta> },
        merge = false,
      ) => {
        if (!input.onChatPush) {
          throw new Error("当前会话不支持推入消息。");
        }
        if (!message || !["assistant", "user", "system"].includes(message.role)) {
          throw new Error("chat.push 需要 assistant、user 或 system 角色。");
        }
        if (typeof message.content !== "string") {
          throw new Error("chat.push 的 content 必须是字符串。");
        }
        return input.onChatPush(message, Boolean(merge));
      },
    },
    now: { configurable: true, value: time.now },
  });
  finalEnvironment.chat = chat;
  finalEnvironment.CHAT = chat;
  finalEnvironment.time = time;
  finalEnvironment.console = createPluginConsole();
  if (input.emptyContainer.command) {
    const inheritedRead = finalEnvironment.read;
    const inheritedEdit = finalEnvironment.edit;
    if (typeof inheritedRead === "function") {
      finalEnvironment.read = (path: string, ...args: unknown[]) =>
        path.trim() === "draft.md"
          ? input.emptyContainer.draft ?? ""
          : (inheritedRead as (...values: unknown[]) => unknown)(path, ...args);
    }
    if (typeof inheritedEdit === "function") {
      finalEnvironment.edit = async (path: string, find: string, replace: string, ...args: unknown[]) => {
        if (path.trim() !== "draft.md") {
          return (inheritedEdit as (...values: unknown[]) => unknown)(path, find, replace, ...args);
        }
        const current = input.emptyContainer.draft ?? "";
        if (!find) throw new Error("draft.md 的 find 不能为空。");
        const index = current.indexOf(find);
        if (index < 0) throw new Error("draft.md 未找到要替换的文本。");
        input.emptyContainer.draft = normalizeMarkdownLineBreaks(
          `${current.slice(0, index)}${replace}${current.slice(index + find.length)}`,
        );
        await input.onContainerChange?.();
        return input.emptyContainer.draft;
      };
    }
  }
  const skillApi = createAgentExtensionApi("skill");
  const mcpApi = createAgentExtensionApi("mcp");
  let replyActive = true;
  let replyQueue = Promise.resolve();
  let replyAppendCount = 0;
  const updateReply = (update: () => void) => {
    if (!replyActive) throw new Error("本次生成已经结束，不能继续修改助手消息。");
    replyQueue = replyQueue.then(async () => {
      update();
      await input.onReplyChange?.();
    });
    return replyQueue;
  };
  const reply = Object.freeze({
    read: () => ({
      container: cloneSerializable(input.emptyContainer),
      message: cloneSerializable(input.emptyMessage),
    }),
    setContent: (content: string) => {
      const nextContent = String(content);
      console.debug("[PulsarAI generation] reply.setContent", {
        previousLength: input.emptyMessage.content.length,
        nextLength: nextContent.length,
      });
      return updateReply(() => {
        input.emptyMessage.content = normalizeMarkdownLineBreaks(nextContent);
      });
    },
    clear: () => updateReply(() => {
      input.emptyMessage.content = "";
      input.emptyMessage.type = "message";
      input.emptyMessage.parts = undefined;
      input.emptyMessage.meta.steps = [];
      delete input.emptyMessage.meta.translation;
    }),
    appendContent: (delta: string) => {
      replyAppendCount += 1;
      return updateReply(() => {
        input.emptyMessage.content = normalizeMarkdownLineBreaks(input.emptyMessage.content + String(delta));
      });
    },
    addPart: (part: NonNullable<ChatMessage["parts"]>[number]) => updateReply(() => {
      input.emptyMessage.parts ??= [];
      input.emptyMessage.parts.push(cloneSerializable(part));
    }),
    addStep: (step: ChatMessage["meta"]["steps"][number]) => updateReply(() => {
      input.emptyMessage.meta.steps.push(cloneSerializable(step));
    }),
    updateThinking: (id: string, message: string) => updateReply(() => {
      const step = input.emptyMessage.meta.steps.find(
        (candidate) => candidate.type === "thinking" && candidate.id === id,
      );
      if (step?.type === "thinking") step.message = message;
    }),
    completeToolCall: (step: Extract<ChatMessage["meta"]["steps"][number], { type: "tool-result" }>) => updateReply(() => {
      const steps = input.emptyMessage.meta.steps;
      const index = steps.findIndex(
        (candidate) => candidate.type === "tool-call" && candidate.toolCallId === step.toolCallId,
      );
      if (index >= 0) {
        steps.splice(index, 1, cloneSerializable(step));
      } else {
        steps.push(cloneSerializable(step));
      }
    }),
    setModelName: (nextModelName: string) => updateReply(() => {
      const value = String(nextModelName).trim();
      if (!value) throw new Error("生成模型名称不能为空。");
      const generateInfo = input.emptyMessage.meta.generateInfo ??= {
        modelName: value,
        startTime: new Date().toISOString(),
      };
      generateInfo.modelName = value;
    }),
    fail: (content: string) => updateReply(() => {
      input.emptyMessage.type = "error";
      input.emptyMessage.content = formatChatMessageError(normalizeMarkdownLineBreaks(content));
    }),
  });
  Object.assign(finalEnvironment, {
    emptyContainer: Object.freeze(cloneSerializable(input.emptyContainer)),
    emptyMessage: Object.freeze(cloneSerializable(input.emptyMessage)),
    reply,
    ...(input.beforeGenerationMessage
      ? { beforeGenerationMessage: input.beforeGenerationMessage }
      : {}),
    skills: {
      ...skillApi,
      tools: skillApi.list().map((item) => item.name),
    },
    mcp: {
      ...mcpApi,
      tools: mcpApi.list().map((item) => item.name),
    },
  });
  const customToolContainer = collectPluginCustomTools(
    pluginEnvironment.enabledPlugins,
    pluginEnvironment.resolver,
  );
  pluginEnvironment.diagnostics.push(...customToolContainer.diagnostics);
  const customToolConflict = customToolContainer.diagnostics.find((item) =>
    item.message.includes("名称冲突")
  );
  if (customToolConflict) {
    throw new Error(`插件组合冲突：${customToolConflict.message}`);
  }

  let dataDefinitions: ContextDataDefinition[] =
    pluginEnvironment.resolver.listDataBindings();
  let transactionSnapshot: {
    plugins: Plugin[];
    dataValues: typeof resourceOverlay.dataValues;
    resourceUpdate: ChatMessageMeta["resourceUpdate"];
  } | null = null;
  let pendingOperations: ConversationResourceOperation[] = [];
  let resourceUpdateQueue = Promise.resolve();
  const recordResourceOperation = (operation: ConversationResourceOperation) => {
    if (transactionSnapshot) {
      pendingOperations.push(cloneSerializable(operation));
    } else {
      input.emptyMessage.meta.resourceUpdate = appendConversationResourceOperations(
        input.emptyMessage.meta.resourceUpdate,
        [operation],
      );
      resourceUpdateQueue = resourceUpdateQueue.then(async () => {
        await input.onReplyChange?.();
      });
    }
    refreshResolverAndData();
    return resourceUpdateQueue;
  };
  const onDataReplace = (
    definition: ContextDataDefinition,
    value: typeof resourceOverlay.dataValues[string],
  ) => {
    resourceOverlay.dataValues[definition.id] = structuredClone(value);
    pluginEnvironment.resolver.setDataOverrides(resourceOverlay.dataValues);
    recordResourceOperation({
      type: "edit",
      target: {
        kind: "data",
        pluginId: definition.pluginId,
        resourceId: definition.id,
        dataId: definition.dataId,
        path: definition.path,
      },
      value: structuredClone(value),
    });
  };
  let dataEvaluation = evaluateConversationData(
    dataDefinitions,
    resourceOverlay.dataValues,
    onDataReplace,
  );
  const refreshDataEnvironment = () => {
    dataEvaluation = evaluateConversationData(
      dataDefinitions,
      resourceOverlay.dataValues,
      onDataReplace,
    );
    pluginEnvironment.resolver.setDataOverrides(dataEvaluation.state);
    finalEnvironment.variables = dataEvaluation.facades;
    finalEnvironment.VARIABLES = dataEvaluation.facades;
    finalEnvironment.dataFacades = Object.assign(
      {},
      dataEvaluation.facades,
      ...dataDefinitions.map((definition) => ({
        [definition.dataId]: dataEvaluation.facades[definition.id],
      })),
    );
    finalEnvironment.dataDefinitions = dataDefinitions;
    finalEnvironment.dataPreparsed = true;
    finalEnvironment.data = createConversationDataApi(
      dataDefinitions,
      dataEvaluation.state,
      onDataReplace,
    );
    finalEnvironment.DATA = finalEnvironment.data;
  };
  const refreshResolverAndData = () => {
    pluginEnvironment.resolver = createPluginReferenceResolver(
      pluginEnvironment.enabledPlugins,
      {
        environment: finalEnvironment,
        dataOverrides: resourceOverlay.dataValues,
      },
    );
    dataDefinitions = pluginEnvironment.resolver.listDataBindings();
    refreshDataEnvironment();
  };
  refreshDataEnvironment();

  const bootstrapMessages: ModelMessage[] = [];
  if (customToolContainer.prompt) bootstrapMessages.push({ role: "system", content: customToolContainer.prompt });
  const dataDescriptionContainer = createDataDescriptionContainer(dataDefinitions);
  if (dataDescriptionContainer) bootstrapMessages.push({ role: "system", content: dataDescriptionContainer });
  const skills = pluginEnvironment.resolver.listSkills();
  if (skills.length) {
    bootstrapMessages.push({
      role: "system",
      content: [
        "# Skills",
        "以下 Skill 可通过 read_skill(name) 按名称按需读取完整内容；未读取的 Skill 不构成当前指令。",
        ...skills.map((skill) => `- ${skill.name}: ${skill.description} (${skill.pluginId}/${skill.path})`),
      ].join("\n"),
    });
  }
  if (input.resourceContext) bootstrapMessages.push({ role: "system", content: input.resourceContext });
  if (input.action && input.prompt.trim()) {
    bootstrapMessages.push({ role: "user", content: normalizeMarkdownLineBreaks(input.prompt) });
  }

  const requestUser = async (input: AskUserInput) => {
    const parsed = askUserInputSchema.parse(input);
    const requester = currentComponentRequester();
    if (!requester) {
      throw new Error("当前界面没有注册用户提问处理器。");
    }
    return normalizeAskUserResult(await requester({
      componentId: "agent.ask-user",
      title: "需要你的回答",
      props: parsed,
    }));
  };

  const requestSuggestion = async (input: AskSuggestionInput) => {
    const parsed = askSuggestionInputSchema.parse(input);
    const requester = currentComponentRequester();
    if (!requester) {
      throw new Error("当前界面没有注册组件交互处理器。");
    }
    return normalizeAskSuggestionResult(await requester({
      componentId: "agent.ask-suggestion",
      title: parsed.title,
      props: parsed,
    }));
  };
  const agentResources = createAgentResourceProvider({
    environment: finalEnvironment,
    modelName,
    resourceTransaction: {
      begin: () => {
        if (transactionSnapshot) throw new Error("资源 Overlay 事务不能嵌套。");
        transactionSnapshot = {
          plugins: safeClone(resourceOverlay.plugins),
          dataValues: safeClone(resourceOverlay.dataValues),
          resourceUpdate: cloneSerializable(input.emptyMessage.meta.resourceUpdate),
        };
        pendingOperations = [];
      },
      commit: async () => {
        input.emptyMessage.meta.resourceUpdate = appendConversationResourceOperations(
          input.emptyMessage.meta.resourceUpdate,
          pendingOperations,
        );
        transactionSnapshot = null;
        pendingOperations = [];
        refreshResolverAndData();
        resourceUpdateQueue = resourceUpdateQueue.then(async () => {
          await input.onReplyChange?.();
        });
        await resourceUpdateQueue;
      },
      rollback: () => {
        if (!transactionSnapshot) return;
        for (const plugin of resourceOverlay.plugins) {
          const snapshot = transactionSnapshot.plugins.find((item) => item.id === plugin.id);
          if (snapshot) Object.assign(plugin, safeClone(snapshot));
        }
        for (const key of Object.keys(resourceOverlay.dataValues)) {
          delete resourceOverlay.dataValues[key];
        }
        Object.assign(resourceOverlay.dataValues, safeClone(transactionSnapshot.dataValues));
        input.emptyMessage.meta.resourceUpdate = cloneSerializable(transactionSnapshot.resourceUpdate);
        transactionSnapshot = null;
        pendingOperations = [];
        refreshResolverAndData();
      },
    },
  });

  const createScopedPluginApi = (pluginId: string) => {
    const inheritedPluginApi =
      finalEnvironment.plugin
      && typeof finalEnvironment.plugin === "object"
        ? finalEnvironment.plugin as Record<string, unknown>
        : {};
    const currentContainerResolver = () =>
      createPluginReferenceResolver(pluginEnvironment.enabledPlugins);
    const scopedSelfApi = createPluginSelfApi(pluginId, {
      plugins: pluginEnvironment.enabledPlugins,
      onResourceOperation: recordResourceOperation,
    });
    return {
      ...inheritedPluginApi,
      listContainers: () => currentContainerResolver().listContainers(),
      getContainer: (containerId: string) =>
        currentContainerResolver().getContainer(containerId),
      listContainerContents: (
        containerId: string,
        input?: { cursor?: number; limit?: number },
      ) => currentContainerResolver().listContainerContents(containerId, input),
      readContainer: (
        containerId: string,
        resourceIds?: string[],
      ) => currentContainerResolver().readContainer(containerId, resourceIds),
      ...scopedSelfApi,
    };
  };

  const processStack: string[] = [];
  const runProcess = async (
    resource: GenerationResourceValue,
    environmentOverrides: SandboxEnvironment = {},
  ): Promise<unknown> => {
    if (!pluginEnvironment.resolver.isResourceValue(resource)) {
      throw new Error(
        "api.runProcess() 只接受通过当前脚本 imports(...) 导入的资源",
      );
    }
    if (resource.type !== "javascript") {
      throw new Error(`流程资源必须是 JavaScript：${resource.path}`);
    }
    if (processStack.includes(resource.id)) {
      const cycle = [...processStack, resource.id]
        .map(
          (resourceId) =>
            pluginEnvironment.resolver.resourceById(resourceId)?.path
            ?? resourceId,
        );
      throw new Error(`检测到流程脚本循环：${cycle.join(" -> ")}`);
    }
    const prepared = pluginEnvironment.resolver.prepareJavaScript(resource.id);
    const scopedPluginApi = createScopedPluginApi(resource.pluginId);
    const inheritedConfig =
      scopedPluginApi.config && typeof scopedPluginApi.config === "object"
        ? scopedPluginApi.config as Record<string, unknown>
        : {};
    const scopedConfigApi = Object.freeze({
      ...inheritedConfig,
      get: (
        groupOrPluginId: string,
        contentOrGroupId?: string,
        globalContentId?: string,
      ) => {
        if (!contentOrGroupId) {
          throw new Error("config.get 需要 groupId、contentId，或 pluginId、groupId、contentId。");
        }
        return globalContentId
          ? pluginEnvironment.resolver.configGlobal(
              groupOrPluginId,
              contentOrGroupId,
              globalContentId,
            )
          : pluginEnvironment.resolver.configGlobal(
              resource.pluginId,
              groupOrPluginId,
              contentOrGroupId,
            );
      },
    });
    const source = prepared.source.trim();
    if (!source) return undefined;
    const capabilityObjects =
      finalEnvironment.capabilities
      && typeof finalEnvironment.capabilities === "object"
        ? finalEnvironment.capabilities as Record<string, unknown>
        : null;
    const previousPluginApi = finalEnvironment.plugin;
    const previousConfigApi = finalEnvironment.config;
    const hadUppercasePluginApi = Object.prototype.hasOwnProperty.call(
      finalEnvironment,
      "PLUGIN",
    );
    const previousUppercasePluginApi = finalEnvironment.PLUGIN;
    const previousCapabilityPluginApi = capabilityObjects?.plugin;
    finalEnvironment.plugin = scopedPluginApi;
    finalEnvironment.config = scopedConfigApi;
    finalEnvironment.PLUGIN = scopedPluginApi;
    if (capabilityObjects) capabilityObjects.plugin = scopedPluginApi;
    processStack.push(resource.id);
    try {
      return await executeSandboxCodeAsync(
        source,
        [
          finalEnvironment,
          environmentOverrides,
          prepared.environment,
          {
            plugin: scopedPluginApi,
            PLUGIN: scopedPluginApi,
            ...scopedPluginApi,
            config: scopedConfigApi,
          },
        ],
      );
    } finally {
      processStack.pop();
      finalEnvironment.plugin = previousPluginApi;
      finalEnvironment.config = previousConfigApi;
      if (hadUppercasePluginApi) {
        finalEnvironment.PLUGIN = previousUppercasePluginApi;
      } else {
        delete finalEnvironment.PLUGIN;
      }
      if (capabilityObjects) {
        capabilityObjects.plugin = previousCapabilityPluginApi;
      }
    }
  };

  const generate = async (request: GenerateSubAgentRequest) => {
    if (!request || typeof request !== "object") {
      throw new Error("generate() 需要 { prompt, plugin?, environment? } 对象。");
    }
    const prompt = String(request.prompt ?? "").trim();
    if (!prompt) throw new Error("generate() 的 prompt 不能为空。");
    if (request.plugin != null && typeof request.plugin !== "string") {
      throw new Error("generate() 的 plugin 必须是插件 ID 字符串。");
    }
    if (request.environment != null && typeof request.environment !== "string") {
      throw new Error("generate() 的 environment 必须是会话 ID 字符串。");
    }
    if (!input.generateSubAgent) {
      throw new Error("当前生成环境不支持子代理。");
    }
    const result = await input.generateSubAgent({
      prompt,
      ...(request.plugin?.trim() ? { plugin: request.plugin.trim() } : {}),
      ...(request.environment?.trim()
        ? { environment: request.environment.trim() }
        : {}),
    });
    return result.content;
  };

  const api = {
    runProcess,
    generate,
    askUser: requestUser,
    askSuggestion: requestSuggestion,
    askUserWithComponent: async (request: GenerationComponentRequest) => {
      const requester = currentComponentRequester();
      if (!requester) {
        throw new Error("当前界面没有注册组件交互处理器。");
      }
      return requester(request);
    },
    renderComponent: (
      componentId: string,
      props?: Record<string, unknown>,
    ) => {
      const part = {
        type: "component" as const,
        componentId,
        props,
      };
      input.emptyMessage.parts ??= [];
      input.emptyMessage.parts.push(part);
      return part;
    },
    ...(finalEnvironment.modelConnection
      ? { modelConnection: finalEnvironment.modelConnection }
      : {}),
  };

  const capabilityAgentApi =
    finalEnvironment.agent
    && typeof finalEnvironment.agent === "object"
      ? finalEnvironment.agent as Record<string, unknown>
      : {};
  const codeActAgentApi = {
    ...capabilityAgentApi,
    ...agentResources,
    askUser: requestUser,
    askSuggestion: requestSuggestion,
  };
  const customToolFunctions: Record<string, (...args: unknown[]) => unknown> = {};
  const contextContainerApi = createContextContainerApi(
    () => pluginEnvironment.resolver,
  );
  Object.assign(finalEnvironment, {
    bootstrapMessages,
    compileChat: (
      resource: GenerationResourceValue,
      environment: SandboxEnvironment = {},
    ) => {
      if (!pluginEnvironment.resolver.isResourceValue(resource)) {
        throw new Error("compileChat 只接受 imports(...) 返回的资源。");
      }
      console.debug("[PulsarAI] compileChat environment", {
        resourceId: resource.id,
        environment,
        finalEnvironment,
      });
      const compiled = pluginEnvironment.resolver.compileChatContext(resource.id, {
        dataOverrides: dataEvaluation.state,
        environment: { ...finalEnvironment, ...environment },
      }).messages;
      console.debug("[PulsarAI] compileChat result", {
        resourceId: resource.id,
        messageCount: compiled.length,
        messages: compiled,
      });
      return compiled;
    },
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
    runProcess: api.runProcess,
    generate,
    askUserWithComponent: api.askUserWithComponent,
    askUser: api.askUser,
    renderComponent: api.renderComponent,
    tools: customToolFunctions,
    containers: contextContainerApi,
    read_skill: (name: string) => pluginEnvironment.resolver.readSkill(name),
    readSkill: (name: string) => pluginEnvironment.resolver.readSkill(name),
  });
  finalEnvironment.ctx = finalEnvironment;
  for (const definition of customToolContainer.definitions) {
    const scopedPluginApi = createScopedPluginApi(definition.pluginId);
    try {
      const toolContext = {
        ...finalEnvironment,
        plugin: scopedPluginApi,
        PLUGIN: scopedPluginApi,
        tools: customToolFunctions,
      };
      customToolFunctions[definition.name] = createPluginCustomToolFunction(
        definition,
        pluginEnvironment.resolver,
        [
          finalEnvironment,
          {
            ctx: toolContext,
            plugin: scopedPluginApi,
            PLUGIN: scopedPluginApi,
            tools: customToolFunctions,
          },
        ],
      );
    } catch (error) {
      pluginEnvironment.diagnostics.push({
        pluginId: definition.pluginId,
        resourceId: definition.functionId,
        message: `无法加载自定义工具 ${definition.name}：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  const processResource =
    pluginEnvironment.actionProcessResource ?? pluginEnvironment.processResource;
  const processPluginId = pluginEnvironment.actionProcessResource?.pluginId
    ?? pluginEnvironment.processPlugin?.id;
  try {
    if (!processResource) throw new Error("主要插件没有可执行的 generatePath。");
    console.log("[PulsarAI generation] process start", {
      pluginId: processPluginId,
      resourceId: processResource.id,
      path: processResource.path,
    });
    await runProcess(processResource);
    await Promise.all([replyQueue, resourceUpdateQueue]);
    console.log("[PulsarAI generation] process complete", {
      type: input.emptyMessage.type,
      contentLength: input.emptyMessage.content.length,
      appendCount: replyAppendCount,
      partCount: input.emptyMessage.parts?.length ?? 0,
      stepCount: input.emptyMessage.meta.steps.length,
    });
  } finally {
    replyActive = false;
  }
  fillEnvironmentMetadata(input.emptyMessage, pluginEnvironment);
  return {
    messages: input.chat,
    diagnostics: pluginEnvironment.diagnostics,
    processPluginId,
  };
}

function fillEnvironmentMetadata(
  message: ChatMessage,
  environment: Awaited<ReturnType<typeof buildPluginGenerationEnvironment>>,
) {
  const resolvedResources = environment.resolver.resolvedResourceIds.flatMap(
    (resourceId) => {
      const resource = environment.resolver.resourceById(resourceId);
      return resource ? [resource] : [];
    },
  );
  const character = resolvedResources.find(
    (resource) => resource.path.toLocaleLowerCase().startsWith("character/"),
  );
  const processPlugin =
    environment.processPlugin ?? environment.enabledPlugins[0] ?? null;
  const actionProcess = environment.actionProcessResource;

  message.meta.environmentInfo = {
    pluginId: actionProcess?.pluginId ?? processPlugin?.id ?? "",
    pluginName: actionProcess?.pluginName ?? processPlugin?.name ?? "",
    characterId: character?.id ?? "",
    characterName: character?.name ?? "",
    resolvedResourceIds: environment.resolver.resolvedResourceIds,
    diagnostics: environment.diagnostics.map(
      (diagnostic) => diagnostic.message,
    ),
  };
}
