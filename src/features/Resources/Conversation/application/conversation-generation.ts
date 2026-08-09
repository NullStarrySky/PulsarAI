import type { ModelMessage } from "ai";
import { createAgentResourceProvider } from "@/features/Agent/application/default-agent";
import {
  createAgentExtensionApi,
} from "@/features/Agent/application/agent-extension-registry";
import {
  askUserInputSchema,
  normalizeAskUserResult,
  type AskUserInput,
} from "@/features/Agent/application/ask-user-tool";
import {
  buildPluginGenerationEnvironment,
  type GenerationResourceValue,
  type PluginGenerationDiagnostic,
} from "@/features/Resources/Plugin/application/plugin-generation-environment";
import {
  createPluginReferenceResolver,
  type PluginReferenceResolver,
} from "@/features/Resources/Plugin/application/plugin-reference-resolver";
import {
  createDataDescriptionContainer,
  type ContextDataDefinition,
} from "@/features/Resources/Plugin/domain/plugin-chat";
import {
  collectPluginCustomTools,
  createPluginCustomToolFunction,
} from "@/features/Resources/Plugin/application/plugin-custom-tools";
import {
  type Plugin,
} from "@/features/Resources/Plugin/domain/plugin-types";
import { createPluginSelfApi } from "@/features/Resources/Plugin/capabilities";
import { pluginFixedSettingValue } from "@/features/Resources/Plugin/domain/plugin-runtime";
import { getDefaultChatModel } from "@/features/defaultConfigs/application/default-config-service";
import { parseModelReference } from "@/features/ModelConnection/domain/model-reference";
import { buildCapabilityRuntime } from "@/features/Capabilities/application/capability-registry";
import {
  executeSandboxCodeAsync,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import type {
  ChatMessage,
  ChatMessageContainer,
  Conversation,
  LocalStep,
  ToolCallResult,
} from "@/features/Resources/Conversation/domain/conversation-types";
import { formatChatMessageError } from "@/features/Resources/Conversation/domain/conversation-types";
import {
  appendConversationVariableUpdate,
  createConversationDataApi,
  evaluateConversationVariables,
  executeVariableUpdateIntent,
  prepareConversationMemoryContext,
  type ConversationVariableEvaluation,
} from "@/features/Resources/Conversation/application/conversation-memory";

export interface GenerationComponentRequest {
  componentId: string;
  title?: string;
  description?: string;
  props?: Record<string, unknown>;
}

export type GenerationComponentRequester = (
  request: GenerationComponentRequest,
) => Promise<unknown>;

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
  action?: {
    pluginId: string;
    resourceId: string;
    name: string;
  };
  prompt: string;
  resourceContext?: string;
  beforeGenerationMessage?: ChatMessage;
  onReplyChange?: () => void | Promise<void>;
}

export interface RunConversationGenerationResult {
  messages: ModelMessage[];
  diagnostics: PluginGenerationDiagnostic[];
  processPluginId?: string;
}

const componentRequesters: GenerationComponentRequester[] = [];

function cloneSerializable<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
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

function createContextContainerApi(resolver: PluginReferenceResolver) {
  return {
    list: () => resolver.listContainers(),
    get: (containerId: string) => resolver.getContainer(containerId),
    listContents: (
      containerId: string,
      input: { cursor?: number; limit?: number } = {},
    ) => resolver.listContainerContents(containerId, input),
    read: (containerId: string, resourceIds?: string[]) =>
      resolver.readContainer(containerId, resourceIds),
  };
}

function currentComponentRequester() {
  return componentRequesters[componentRequesters.length - 1] ?? null;
}

export async function runConversationGeneration(
  input: RunConversationGenerationInput,
): Promise<RunConversationGenerationResult> {
  const mainPlugin = input.plugins.find((plugin) => plugin.id === input.mainPluginId);
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
  const capabilityRuntime = buildCapabilityRuntime();
  const pluginEnvironment = await buildPluginGenerationEnvironment(
    input.plugins,
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
        ...capabilityRuntime.environment,
        reasoningEffort: reasoningEffort ?? "auto",
      },
    },
  );

  const finalEnvironment: SandboxEnvironment = pluginEnvironment.environment;
  finalEnvironment.console = createPluginConsole();
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
        input.emptyMessage.content = nextContent;
      });
    },
    appendContent: (delta: string) => {
      replyAppendCount += 1;
      return updateReply(() => {
        input.emptyMessage.content += String(delta);
      });
    },
    addPart: (part: NonNullable<ChatMessage["parts"]>[number]) => updateReply(() => {
      input.emptyMessage.parts ??= [];
      input.emptyMessage.parts.push(cloneSerializable(part));
    }),
    addStep: (step: LocalStep | ToolCallResult) => updateReply(() => {
      input.emptyMessage.meta.steps.push(cloneSerializable(step));
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
      input.emptyMessage.content = formatChatMessageError(content);
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

  const dataDefinitions: ContextDataDefinition[] =
    pluginEnvironment.resolver.listDataBindings();

  let variableEvaluation: ConversationVariableEvaluation =
    await evaluateConversationVariables(dataDefinitions, input.activePath);
  Object.assign(finalEnvironment, {
    variables: variableEvaluation.facades,
    VARIABLES: variableEvaluation.facades,
    data: createConversationDataApi(
      dataDefinitions,
      variableEvaluation.state,
      true,
    ),
  });
  finalEnvironment.DATA = finalEnvironment.data;

  const bootstrapMessages: ModelMessage[] = [];
  if (capabilityRuntime.prompt) bootstrapMessages.push({ role: "system", content: capabilityRuntime.prompt });
  if (customToolContainer.prompt) bootstrapMessages.push({ role: "system", content: customToolContainer.prompt });
  const dataDescriptionContainer = createDataDescriptionContainer(dataDefinitions);
  if (dataDescriptionContainer) bootstrapMessages.push({ role: "system", content: dataDescriptionContainer });
  if (input.resourceContext) bootstrapMessages.push({ role: "system", content: input.resourceContext });

  const requestUser = async (input: AskUserInput) => {
    const { question, options } = askUserInputSchema.parse(input);
    const requester = currentComponentRequester();
    if (!requester) {
      throw new Error("当前界面没有注册用户提问处理器。");
    }
    return normalizeAskUserResult(await requester({
      componentId: "agent.ask-user",
      title: "需要你的回答",
      props: { question, options },
    }));
  };
  const agentResources = createAgentResourceProvider({
    environment: finalEnvironment,
    modelName,
    onStep: reply.addStep,
    variableUpdate: dataDefinitions.some((item) => item.enableUpdater)
      ? {
          execute: async (source) => {
            const result = await executeVariableUpdateIntent(
              source,
              dataDefinitions,
              variableEvaluation,
            );
            if (!result.ok) return result;
            input.emptyMessage.meta.variableUpdate = appendConversationVariableUpdate(
              input.emptyMessage.meta.variableUpdate,
              result.update,
            );
            variableEvaluation = {
              ...variableEvaluation,
              state: result.state,
              facades: result.facades,
            };
            finalEnvironment.variables = result.facades;
            finalEnvironment.VARIABLES = result.facades;
            finalEnvironment.data = createConversationDataApi(
              dataDefinitions,
              result.state,
              true,
            );
            finalEnvironment.DATA = finalEnvironment.data;
            return {
              ok: true,
              value: result.value,
              updatedVariables: dataDefinitions
                .filter((item) => item.enableUpdater)
                .map((item) => ({
                  id: item.dataId,
                  path: item.path,
                  resourceId: item.resourceId,
                })),
            };
          },
        }
      : undefined,
  });

  const createScopedPluginApi = (pluginId: string) => {
    const inheritedPluginApi =
      finalEnvironment.plugin
      && typeof finalEnvironment.plugin === "object"
        ? finalEnvironment.plugin as Record<string, unknown>
        : {};
    const currentContainerResolver = () =>
      createPluginReferenceResolver(pluginEnvironment.enabledPlugins);
    const scopedSelfApi = createPluginSelfApi(pluginId, ["read"]);
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
        "api.runProcess() 只接受通过当前脚本 imports.resource(...) 导入的资源",
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
    const source = prepared.source.trim();
    if (!source) return undefined;
    const capabilityObjects =
      finalEnvironment.capabilities
      && typeof finalEnvironment.capabilities === "object"
        ? finalEnvironment.capabilities as Record<string, unknown>
        : null;
    const previousPluginApi = finalEnvironment.plugin;
    const hadUppercasePluginApi = Object.prototype.hasOwnProperty.call(
      finalEnvironment,
      "PLUGIN",
    );
    const previousUppercasePluginApi = finalEnvironment.PLUGIN;
    const previousCapabilityPluginApi = capabilityObjects?.plugin;
    finalEnvironment.plugin = scopedPluginApi;
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
          },
        ],
      );
    } finally {
      processStack.pop();
      finalEnvironment.plugin = previousPluginApi;
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

  const api = {
    runProcess,
    askUser: requestUser,
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
  };
  const customToolFunctions: Record<string, (...args: unknown[]) => unknown> = {};
  const contextContainerApi = createContextContainerApi(
    pluginEnvironment.resolver,
  );
  Object.assign(finalEnvironment, {
    bootstrapMessages,
    compileChat: (
      resource: GenerationResourceValue,
      environment: SandboxEnvironment = {},
    ) => {
      if (!pluginEnvironment.resolver.isResourceValue(resource)) {
        throw new Error("compileChat 只接受 imports.resource(...) 返回的资源。");
      }
      return pluginEnvironment.resolver.compileChatContext(resource.id, {
        dataOverrides: variableEvaluation.state,
        environment: { ...finalEnvironment, ...environment },
      }).messages;
    },
    memory: Object.freeze({
      prepare: (options: { compressionThreshold: number }) =>
        prepareConversationMemoryContext({
          conversationId: input.conversationId,
          activePath: input.activePath,
          compressionThreshold: options.compressionThreshold,
        }),
    }),
    api,
    agent: codeActAgentApi,
    AGENT: codeActAgentApi,
    runProcess: api.runProcess,
    askUserWithComponent: api.askUserWithComponent,
    askUser: api.askUser,
    renderComponent: api.renderComponent,
    tools: customToolFunctions,
    containers: contextContainerApi,
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
    await replyQueue;
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
