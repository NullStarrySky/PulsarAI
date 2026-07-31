import type { ModelMessage } from "ai";
import { createAgentResourceProvider } from "@/features/Agent/application/default-agent";
import { createProjectAgentRuntime } from "@/features/Agent/application/project-agent-runtime";
import { isProjectAgentConversation } from "@/features/Agent/domain/project-agent";
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
} from "@/features/Resources/Plugin/application/plugin-reference-resolver";
import {
  collectInteractiveVariableDefinitions,
  parseInteractiveDocumentSource,
  type InteractiveVariableDefinition,
} from "@/features/Resources/InteractiveDoc/domain/interactive-document";
import {
  collectPluginCustomTools,
  createPluginCustomToolFunction,
} from "@/features/Resources/Plugin/application/plugin-custom-tools";
import type { Plugin } from "@/features/Resources/Plugin/domain/plugin-types";
import {
  applyPluginRegexToMessages,
  collectPluginRegexRules,
} from "@/features/Resources/Plugin/domain/plugin-regex";
import { createPluginSelfApi } from "@/features/Resources/Plugin/capabilities";
import {
  buildCapabilityRuntime,
  mergeCapabilityGrants,
} from "@/features/Capabilities/application/capability-registry";
import type { CapabilityGrants } from "@/features/Capabilities/domain/capability";
import { getDefaultCapabilities } from "@/features/defaultConfigs/application/default-config-service";
import {
  executeSandboxCodeAsync,
  resolveSandboxMessages,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import type {
  ChatMessage,
  ChatMessageContainer,
  Conversation,
  ConversationReasoningEffort,
  LocalStep,
  ToolCallResult,
} from "@/features/Resources/Conversation/domain/conversation-types";
import {
  appendConversationVariableUpdate,
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
  conversationId: string;
  conversation: Conversation;
  reasoningEffort: ConversationReasoningEffort;
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
  capabilityGrants?: CapabilityGrants;
  onStep?: (step: LocalStep | ToolCallResult) => void | Promise<void>;
}

export interface RunConversationGenerationResult {
  text: string;
  modelName: string;
  messages: ModelMessage[];
  diagnostics: PluginGenerationDiagnostic[];
  processPluginId?: string;
}

const componentRequesters: GenerationComponentRequester[] = [];

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

function currentComponentRequester() {
  return componentRequesters[componentRequesters.length - 1] ?? null;
}

export async function runConversationGeneration(
  input: RunConversationGenerationInput,
): Promise<RunConversationGenerationResult> {
  const capabilityRuntime = buildCapabilityRuntime(
    mergeCapabilityGrants(
      await getDefaultCapabilities(),
      input.capabilityGrants,
    ),
  );
  const projectAgentRuntime = isProjectAgentConversation(input.conversation)
    ? await createProjectAgentRuntime(input.conversationId, {
        pluginSubCapIds: capabilityRuntime.grants.plugin ?? [],
      })
    : null;
  const pluginEnvironment = await buildPluginGenerationEnvironment(
    input.plugins,
    {
      activePath: input.activePath,
      chat: input.chat,
      packageId: input.packageId,
      conversationId: input.conversationId,
      conversation: input.conversation,
      containerId: input.emptyContainer.id,
      action: input.action,
      prompt: input.prompt,
      baseEnvironment: {
        ...capabilityRuntime.environment,
        ...(projectAgentRuntime?.environment ?? {}),
        reasoningEffort: input.reasoningEffort,
      },
    },
  );

  const finalEnvironment: SandboxEnvironment = pluginEnvironment.environment;
  const skillApi = createAgentExtensionApi("skill");
  const mcpApi = createAgentExtensionApi("mcp");
  Object.assign(finalEnvironment, {
    emptyContainer: input.emptyContainer,
    emptyMessage: input.emptyMessage,
    message: input.emptyMessage,
    messageMeta: input.emptyMessage.meta,
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

  let variableDefinitions: InteractiveVariableDefinition[] = [];
  let compressionThreshold = 0;
  if (pluginEnvironment.contextResource) {
    const contextSource = pluginEnvironment.contextResource.content;
    compressionThreshold = parseInteractiveDocumentSource(contextSource)
      .memory.compressionThreshold;
    try {
      variableDefinitions = collectInteractiveVariableDefinitions(contextSource);
    } catch (error) {
      pluginEnvironment.diagnostics.push({
        pluginId: pluginEnvironment.contextResource.pluginId,
        resourceId: pluginEnvironment.contextResource.id,
        message: `无法读取 IMD 变量定义：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  let variableEvaluation: ConversationVariableEvaluation =
    await evaluateConversationVariables(variableDefinitions, input.activePath);
  Object.assign(finalEnvironment, {
    variables: variableEvaluation.facades,
    VARIABLES: variableEvaluation.facades,
  });

  const memoryContext = await prepareConversationMemoryContext({
    conversationId: input.conversationId,
    activePath: input.activePath,
    compressionThreshold,
  });
  finalEnvironment.chat = memoryContext.messages;
  finalEnvironment.CHAT = memoryContext.messages;
  if (pluginEnvironment.contextResource) {
    pluginEnvironment.diagnostics.push(...memoryContext.diagnostics.map(
      (message) => ({
        pluginId: pluginEnvironment.contextResource!.pluginId,
        resourceId: pluginEnvironment.contextResource!.id,
        message,
      }),
    ));
  }

  const compiledContext = pluginEnvironment.contextResource
    ? pluginEnvironment.resolver.compileInteractiveDocument(
        pluginEnvironment.contextResource.id,
        { dataOverrides: variableEvaluation.state },
      )
    : null;
  const resolvedContextMessages = compiledContext?.messages.length
    ? compiledContext.messages
    : resolveSandboxMessages(
        [{ role: "system", content: "[[chat]]" }],
        [finalEnvironment],
      );
  const contextMessages: ModelMessage[] = capabilityRuntime.prompt
    ? [
        { role: "system", content: capabilityRuntime.prompt },
        ...resolvedContextMessages,
      ]
    : resolvedContextMessages;
  if (customToolContainer.prompt) {
    contextMessages.splice(capabilityRuntime.prompt ? 1 : 0, 0, {
      role: "system",
      content: customToolContainer.prompt,
    });
  }
  if (compiledContext?.variableDescriptionContainer) {
    contextMessages.splice(capabilityRuntime.prompt ? 1 : 0, 0, {
      role: "system",
      content: compiledContext.variableDescriptionContainer,
    });
  }
  if (input.resourceContext) {
    contextMessages.unshift({ role: "system", content: input.resourceContext });
  }
  if (input.beforeGenerationMessage?.content.trim()) {
    contextMessages.splice(capabilityRuntime.prompt ? 1 : 0, 0, {
      role: "system",
      content: [
        "以下是同一回复页上一次已完成的生成结果。",
        "本次重新生成应利用它降低不必要的措辞、结构和内容重复：",
        input.beforeGenerationMessage.content,
      ].join("\n\n"),
    });
  }
  const regexContainer = collectPluginRegexRules(pluginEnvironment.enabledPlugins);
  const regexResult = applyPluginRegexToMessages(
    contextMessages,
    regexContainer.value,
  );
  pluginEnvironment.diagnostics.push(
    ...regexContainer.diagnostics,
    ...regexResult.diagnostics,
  );
  const processedContextMessages = regexResult.value;

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
    reasoningEffort: input.reasoningEffort,
    onStep: input.onStep,
    variableUpdate: variableDefinitions.length
      ? {
          execute: async (source) => {
            const result = await executeVariableUpdateIntent(
              source,
              variableDefinitions,
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
            return {
              ok: true,
              value: result.value,
              updatedVariables: variableDefinitions.map((item) => item.name),
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
    return {
      ...inheritedPluginApi,
      listContainers: () => currentContainerResolver().listContainers(),
      getContainer: (containerId: string) =>
        currentContainerResolver().getContainer(containerId),
      ...createPluginSelfApi(
        pluginId,
        capabilityRuntime.grants.plugin ?? [],
      ),
    };
  };

  const processStack: string[] = [];
  const runProcess = async (
    resource: GenerationResourceValue,
    environmentOverrides: SandboxEnvironment = {},
  ): Promise<unknown> => {
    if (!pluginEnvironment.resolver.isResourceValue(resource)) {
      throw new Error(
        "api.runProcess() 只接受通过当前脚本显式 <@...> 引用的资源",
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
  Object.assign(finalEnvironment, {
    contextTemplate: compiledContext?.markdown ?? "[[chat]]",
    contextMessages: processedContextMessages,
    api,
    agent: codeActAgentApi,
    AGENT: codeActAgentApi,
    runProcess: api.runProcess,
    askUserWithComponent: api.askUserWithComponent,
    askUser: api.askUser,
    renderComponent: api.renderComponent,
    tools: customToolFunctions,
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
  const processResult = processResource
    ? await runProcess(processResource)
    : (() => {
        throw new Error("没有可执行的 agentprocess/index.js；请启用内置流程或提供自定义流程。");
      })();
  const normalized = normalizeGenerationResult(processResult, input.emptyMessage);

  if (!normalized) {
    throw new Error("流程没有返回文本结果。");
  }

  fillEnvironmentMetadata(input.emptyMessage, pluginEnvironment);
  return {
    ...normalized,
    messages: processedContextMessages,
    diagnostics: pluginEnvironment.diagnostics,
    processPluginId,
  };
}

function normalizeGenerationResult(
  value: unknown,
  message: ChatMessage,
): { text: string; modelName: string } | null {
  if (typeof value === "string") {
    return {
      text: value,
      modelName: "plugin-workflow",
    };
  }

  if (value && typeof value === "object" && "text" in value) {
    const result = value as { text?: unknown; modelName?: unknown };
    if (typeof result.text === "string") {
      return {
        text: result.text,
        modelName:
          typeof result.modelName === "string"
            ? result.modelName
            : "plugin-workflow",
      };
    }
  }

  if (message.content) {
    return {
      text: message.content,
      modelName: "plugin-workflow",
    };
  }
  return null;
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
