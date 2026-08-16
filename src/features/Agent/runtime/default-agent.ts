import {
  ToolLoopAgent,
  isStepCount,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { getDefaultChatModel } from "@/features/defaultConfigs/default-config-service";
import type { ReasoningEffort } from "@/features/ModelConnection/model-reference";
import {
  generateText,
  hydrateModel,
  streamText,
} from "@/features/ModelConnection/services/model-ai";
import { parseModelReference } from "@/features/ModelConnection/model-reference";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";
import type {
  ThinkingStep,
  ToolCallResult,
  ToolCallStep,
} from "@/features/Resources/Conversation/messages/conversation-types";
import { executeCodeAct } from "./code-act";

export interface CreateDefaultAgentResourcesInput {
  environment?: SandboxEnvironment;
  modelName?: string;
  resourceTransaction?: {
    begin: () => void | Promise<void>;
    commit: () => void | Promise<void>;
    rollback: () => void | Promise<void>;
  };
}

export interface DefaultAgentResources {
  model: LanguageModel;
  modelName: string;
  reasoning?: ReasoningEffort;
  instructions: string;
  tools: ToolSet;
  stopWhen: ReturnType<typeof isStepCount>;
  finish: () => Promise<void>;
}

/**
 * The persisted reply target supplied by Conversation generation. Plugins pass
 * this as `container` when constructing the sandbox ToolLoopAgent wrapper.
 */
export interface AgentOutputContainer {
  setModelName: (modelName: string) => Promise<void>;
  appendContent: (delta: string) => Promise<void>;
  addStep: (
    step: ThinkingStep | ToolCallStep | ToolCallResult,
  ) => Promise<void>;
  updateThinking: (id: string, message: string) => Promise<void>;
  completeToolCall: (step: ToolCallResult) => Promise<void>;
}

export interface ContainerToolLoopAgent {
  stream: (input: { messages: ModelMessage[] }) => Promise<void>;
}

export interface AgentResourceProvider {
  ToolLoopAgent: new (input: {
    container: AgentOutputContainer;
  }) => ContainerToolLoopAgent;
  streamText: (input: {
    container: AgentOutputContainer;
    messages: ModelMessage[];
  }) => Promise<void>;
}

const jsInputSchema = z.object({
  code: z
    .string()
    .describe(
      "One JavaScript function with an explicit return, for example `async function () { return await plugin.listContainers(); }`.",
    ),
});

const codeActInstructions = [
  "Use the single codeAct tool for every API operation.",
  "Never narrate private planning, tool selection, or tool execution in the final text. Those are recorded separately by the runtime.",
  "Use normal text only for the final user-facing answer after the necessary tool calls are complete.",
  "Submit one JavaScript function in the form `async function () { ... return value; }`.",
  "The function must contain an explicit return. Use only APIs documented in the current context.",
  "Return plain serializable data. Preserve resource `id` and `path` when later calls may need to follow the result.",
  "For a blocking user decision, call `await agent.askUser({ question, options })` or `await api.askUser(...)` inside the function.",
  "To delegate a bounded task, call `await generate({ plugin?, environment?, prompt })` inside the function. It returns the child agent's final text; the default plugin is the blank no-template process and an omitted environment uses an in-memory temporary conversation.",
  "Registered Skill and MCP extensions are context APIs: inspect with `agent.listExtensions(...)` and call with `agent.callExtension(source, name, input)`.",
  "Plugin custom functions documented under `# 自定义工具` are context functions: call them with `await ctx.tools[name](...args)`.",
  "Inspect pure Plugin containers with `ctx.containers.list()` / `get()` and read selected members with `ctx.containers.read(containerId, resourceIds)`.",
  "Plugin write/edit/mkdir/move/remove/config.set and writable .data wrapper operations update the current Conversation resource overlay. They are committed atomically only when the codeAct call succeeds.",
  "Read and update .data through its documented wrapper facade when possible, or use data.readForResource(resourceId, dataId) and data.writeForResource(resourceId, dataId, value). Persisted data values must remain pure JSON.",
  "The tool result contains either `{ ok: true, value }` or `{ ok: false, error }`; inspect errors and correct the next function.",
].join("\n");

function createCodeActTool(
  environment: SandboxEnvironment,
  transaction?: CreateDefaultAgentResourcesInput["resourceTransaction"],
) {
  return {
    codeAct: tool({
      description: codeActInstructions,
      inputSchema: jsInputSchema,
      execute: async (input) => {
        await transaction?.begin();
        try {
          const output = await executeCodeAct(input.code, environment);
          if (
            output
            && typeof output === "object"
            && "ok" in output
            && output.ok === true
          ) {
            await transaction?.commit();
          } else {
            await transaction?.rollback();
          }
          return output;
        } catch (error) {
          await transaction?.rollback();
          throw error;
        }
      },
    }),
  };
}

export async function createDefaultAgentResources(
  input: CreateDefaultAgentResourcesInput,
): Promise<DefaultAgentResources> {
  const modelName = input.modelName || (await getDefaultChatModel());
  const reasoning = parseModelReference(modelName).reasoning;
  const tools = createCodeActTool(
    input.environment ?? {},
    input.resourceTransaction,
  );

  return {
    model: hydrateModel(modelName, "chat") as LanguageModel,
    modelName,
    reasoning,
    instructions: codeActInstructions,
    tools,
    stopWhen: isStepCount(8),
    finish: async () => {},
  };
}

export function createAgentResourceProvider(
  input: CreateDefaultAgentResourcesInput,
): AgentResourceProvider {
  let prepared: Promise<DefaultAgentResources> | null = null;
  const prepare = () => {
    prepared ??= createDefaultAgentResources(input);
    return prepared;
  };
  const ContainerBoundToolLoopAgent = class implements ContainerToolLoopAgent {
    constructor(private readonly input: { container: AgentOutputContainer }) {
      if (!input?.container)
        throw new Error("ToolLoopAgent 需要输出 container。");
    }

    async stream({ messages }: { messages: ModelMessage[] }) {
      const runtime = await prepare();
      const runner = new ToolLoopAgent({
        model: runtime.model,
        reasoning: runtime.reasoning,
        allowSystemInMessages: true,
        instructions: runtime.instructions,
        tools: runtime.tools,
        activeTools: ["codeAct"],
        stopWhen: runtime.stopWhen,
      });
      const thinkingById = new Map<string, string>();
      try {
        await this.input.container.setModelName(runtime.modelName);
        const result = await runner.stream({ messages });
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            await this.input.container.appendContent(part.text);
          } else if (part.type === "reasoning-start") {
            thinkingById.set(part.id, "");
            await this.input.container.addStep({
              type: "thinking",
              id: part.id,
              message: "",
            });
          } else if (part.type === "reasoning-delta") {
            const thinking = (thinkingById.get(part.id) ?? "") + part.text;
            thinkingById.set(part.id, thinking);
            await this.input.container.updateThinking(part.id, thinking);
          } else if (part.type === "tool-call") {
            await this.input.container.addStep({
              type: "tool-call",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            });
          } else if (part.type === "tool-result") {
            await this.input.container.completeToolCall({
              type: "tool-result",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              output: part.output,
            });
          } else if (part.type === "tool-error") {
            await this.input.container.completeToolCall({
              type: "tool-result",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              output: {
                ok: false,
                error: part.error instanceof Error ? part.error.message : String(part.error),
              },
            });
          } else if (part.type === "error") {
            throw part.error instanceof Error
              ? part.error
              : new Error(String(part.error));
          } else if (part.type === "abort") {
            throw new Error(part.reason || "生成已中止。");
          }
        }
      } finally {
        await runtime.finish();
      }
    }
  };

  const streamTextFn = async ({
    container,
    messages,
  }: {
    container: AgentOutputContainer;
    messages: ModelMessage[];
  }) => {
    if (!container) throw new Error("streamText 需要输出 container。");
    const runtime = await prepare();
    const thinkingById = new Map<string, string>();
    try {
      await container.setModelName(runtime.modelName);
      const result = streamText({
        model: runtime.model,
        messages,
        system: runtime.instructions,
        allowSystemInMessages: true,
        ...(runtime.reasoning
          ? { reasoning: runtime.reasoning }
          : { reasoningEffort: "auto" }),
      });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          await container.appendContent(part.text);
        } else if (part.type === "reasoning-start") {
          thinkingById.set(part.id, "");
          await container.addStep({
            type: "thinking",
            id: part.id,
            message: "",
          });
        } else if (part.type === "reasoning-delta") {
          const thinking = (thinkingById.get(part.id) ?? "") + part.text;
          thinkingById.set(part.id, thinking);
          await container.updateThinking(part.id, thinking);
        } else if (part.type === "error") {
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error));
        } else if (part.type === "abort") {
          throw new Error(part.reason || "生成已中止。");
        }
      }
    } finally {
      await runtime.finish();
    }
  };

  return {
    ToolLoopAgent: ContainerBoundToolLoopAgent,
    streamText: streamTextFn,
  };
}
export async function generateAuxiliaryText(messages: ModelMessage[]) {
  const modelName = await getDefaultChatModel();
  const result = await generateText({
    model: hydrateModel(modelName, "chat") as LanguageModel,
    messages,
  });
  return {
    text: result.text,
    modelName,
  };
}
