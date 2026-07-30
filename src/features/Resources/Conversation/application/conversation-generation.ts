import type { ModelMessage } from "ai";
import { createAgentResourceProvider } from "@/features/Agent/application/default-agent";
import { createProjectAgentRuntime } from "@/features/Agent/application/project-agent-runtime";
import { isProjectAgentConversation } from "@/features/Agent/domain/project-agent";
import {
  getAgentExtensionToolNames,
} from "@/features/Agent/application/agent-extension-registry";
import {
  buildPluginGenerationEnvironment,
  type GenerationResourceValue,
  type PluginGenerationDiagnostic,
} from "@/features/Resources/Plugin/application/plugin-generation-environment";
import type { Plugin } from "@/features/Resources/Plugin/domain/plugin-types";
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
  LocalStep,
  ToolCallResult,
} from "@/features/Resources/Conversation/domain/conversation-types";

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
      },
    },
  );

  const finalEnvironment: SandboxEnvironment = pluginEnvironment.environment;
  Object.assign(finalEnvironment, {
    emptyContainer: input.emptyContainer,
    emptyMessage: input.emptyMessage,
    message: input.emptyMessage,
    messageMeta: input.emptyMessage.meta,
    ...(input.beforeGenerationMessage
      ? { beforeGenerationMessage: input.beforeGenerationMessage }
      : {}),
    skills: {
      tools: getAgentExtensionToolNames("skill"),
    },
    mcp: {
      tools: getAgentExtensionToolNames("mcp"),
    },
  });
  const compiledContext = pluginEnvironment.contextResource
    ? pluginEnvironment.resolver.compileInteractiveDocument(
        pluginEnvironment.contextResource.id,
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

  const agentResources = createAgentResourceProvider({
    environment: finalEnvironment,
    onStep: input.onStep,
    askUser: async ({ question, options }) => {
      const requester = currentComponentRequester();
      if (!requester) {
        throw new Error("当前界面没有注册用户提问处理器。");
      }
      return requester({
        componentId: "agent.ask-user",
        title: "需要你的回答",
        props: { question, options },
      });
    },
  });

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
    const inheritedPluginApi =
      finalEnvironment.plugin
      && typeof finalEnvironment.plugin === "object"
        ? finalEnvironment.plugin as Record<string, unknown>
        : {};
    const scopedPluginApi = {
      ...inheritedPluginApi,
      ...createPluginSelfApi(
        resource.pluginId,
        capabilityRuntime.grants.plugin ?? [],
      ),
    };
    const source = prepared.source.trim();
    if (!source) return undefined;
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
    }
  };

  const api = {
    runProcess,
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

  Object.assign(finalEnvironment, {
    contextTemplate: compiledContext?.markdown ?? "[[chat]]",
    contextMessages,
    api,
    agent: agentResources,
    AGENT: agentResources,
    runProcess: api.runProcess,
    askUserWithComponent: api.askUserWithComponent,
    renderComponent: api.renderComponent,
  });

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
    messages: contextMessages,
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
