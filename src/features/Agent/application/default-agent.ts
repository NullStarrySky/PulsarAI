import {
  ToolLoopAgent,
  generateText,
  isStepCount,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { getDefaultChatModel } from "@/features/defaultConfigs/application/default-config-service";
import { hydrateModel } from "@/features/ModelConnection/application/model-ai";
import type { SandboxEnvironment } from "@/features/Sandbox/domain/sandbox";
import type {
  ChatMessage,
  ChatMessageContainer,
  ConversationReasoningEffort,
  LocalStep,
  ToolCallResult,
} from "@/features/Resources/Conversation/domain/conversation-types";
import { executeCodeAct } from "./code-act";

export interface CreateDefaultAgentResourcesInput {
  environment?: SandboxEnvironment;
  reasoningEffort?: ConversationReasoningEffort;
  onStep?: (step: LocalStep | ToolCallResult) => void | Promise<void>;
  variableUpdate?: {
    execute: (source: string) => Promise<unknown>;
  };
}

export interface DefaultAgentResources {
  model: LanguageModel;
  modelName: string;
  reasoning: ConversationReasoningEffort;
  instructions: string;
  tools: ToolSet;
  stopWhen: ReturnType<typeof isStepCount>;
  onStepStart: (input: { stepNumber: number }) => Promise<void>;
  finish: () => Promise<void>;
}

export interface AgentResourceProvider {
  ToolLoopAgent: typeof ToolLoopAgent;
  prepare: () => Promise<DefaultAgentResources>;
}

const jsInputSchema = z.object({
  intent: z.enum(["action", "variable-update"]).optional().describe(
    "Use `variable-update` only to update IMD variables without side effects. Omit it or use `action` for normal API operations.",
  ),
  code: z.string().describe(
    "One JavaScript function with an explicit return, for example `async function () { return await plugin.listContainers(); }`.",
  ),
});

const codeActInstructions = [
  "Use the single codeAct tool for every API operation.",
  "Submit one JavaScript function in the form `async function () { ... return value; }`.",
  "The function must contain an explicit return. Use only APIs documented in the current context.",
  "Return plain serializable data. Preserve resource `id` and `path` when later calls may need to follow the result.",
  "For a blocking user decision, call `await agent.askUser({ question, options })` or `await api.askUser(...)` inside the function.",
  "Registered Skill and MCP extensions are context APIs: inspect with `agent.listExtensions(...)` and call with `agent.callExtension(source, name, input)`.",
  "Plugin custom functions documented under `# 自定义工具` are context functions: call them with `await ctx.tools[name](...args)`.",
  "To update IMD variables, set `intent` to `variable-update` and submit a synchronous function. This intent is optional, receives only `variables`, and must not read time or randomness, start async work, call APIs, access files or the network, or cause any other side effect.",
  "A variable-update error is returned to you so you can correct the function. After three failed variable-update attempts, generation stops with an error.",
  "The tool result contains either `{ ok: true, value }` or `{ ok: false, error }`; inspect errors and correct the next function.",
].join("\n");

function createCodeActTool(
  environment: SandboxEnvironment,
  onStep?: CreateDefaultAgentResourcesInput["onStep"],
  variableUpdate?: CreateDefaultAgentResourcesInput["variableUpdate"],
  onVariableUpdateError?: (error: string | null) => void,
) {
  let variableUpdateFailures = 0;
  return {
    codeAct: tool({
      description: codeActInstructions,
      inputSchema: jsInputSchema,
      execute: async (input, { toolCallId }) => {
        let output: unknown;
        let terminalError: Error | null = null;
        if (input.intent === "variable-update") {
          output = variableUpdate
            ? await variableUpdate.execute(input.code)
            : { ok: false, error: "当前上下文没有可更新的 IMD 变量。" };
          const succeeded = Boolean(
            output && typeof output === "object" && "ok" in output
            && (output as { ok?: unknown }).ok === true,
          );
          if (succeeded) {
            variableUpdateFailures = 0;
            onVariableUpdateError?.(null);
          } else {
            variableUpdateFailures += 1;
            const error = output && typeof output === "object" && "error" in output
              ? String((output as { error?: unknown }).error)
              : "未知错误";
            onVariableUpdateError?.(error);
            if (variableUpdateFailures >= 3) {
              terminalError = new Error(`变量更新连续失败 3 次：${error}`);
            } else if (output && typeof output === "object") {
              output = {
                ...output,
                remainingAttempts: 3 - variableUpdateFailures,
              };
            }
          }
        } else {
          output = await executeCodeAct(input.code, environment);
        }
        await onStep?.({
          type: "tool-result",
          toolCallId,
          toolName: "codeAct",
          input,
          output,
        });
        if (terminalError) throw terminalError;
        return output;
      },
    }),
  };
}

export async function createDefaultAgentResources(
  input: CreateDefaultAgentResourcesInput,
): Promise<DefaultAgentResources> {
  const modelName = await getDefaultChatModel();
  const reasoning = input.reasoningEffort ?? "none";
  await input.onStep?.({
    name: "agent:start",
    message: `使用 ${modelName} 启动内置 agent。`,
  });
  let pendingVariableUpdateError: string | null = null;
  const tools = createCodeActTool(
    input.environment ?? {},
    input.onStep,
    input.variableUpdate,
    (error) => {
      pendingVariableUpdateError = error;
    },
  );

  return {
    model: hydrateModel(modelName, "chat") as LanguageModel,
    modelName,
    reasoning,
    instructions: codeActInstructions,
    tools,
    stopWhen: isStepCount(8),
    onStepStart: async ({ stepNumber }) => {
      await input.onStep?.({
        name: "agent:step",
        message: `开始第 ${stepNumber + 1} 轮推理。`,
      });
    },
    finish: async () => {
      if (pendingVariableUpdateError) {
        throw new Error(
          `模型结束生成时仍有未修复的变量更新错误：${pendingVariableUpdateError}`,
        );
      }
      await input.onStep?.({
        name: "agent:finish",
        message: "Agent 已完成回复生成。",
      });
    },
  };
}

export function createAgentResourceProvider(
  input: CreateDefaultAgentResourcesInput,
): AgentResourceProvider {
  let prepared: Promise<DefaultAgentResources> | null = null;
  const reasoning = input.reasoningEffort ?? "none";
  const ReasoningToolLoopAgent = new Proxy(ToolLoopAgent, {
    construct(target, args, newTarget) {
      const settings = (args[0] ?? {}) as Record<string, unknown>;
      return Reflect.construct(
        target,
        [{ reasoning, ...settings }],
        newTarget,
      );
    },
  }) as typeof ToolLoopAgent;
  return {
    ToolLoopAgent: ReasoningToolLoopAgent,
    prepare: () => {
      prepared ??= createDefaultAgentResources(input);
      return prepared;
    },
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

export async function appendStep(
  message: ChatMessage,
  container: ChatMessageContainer,
  step: LocalStep | ToolCallResult,
  persist: (container: ChatMessageContainer) => Promise<void>,
) {
  message.meta.steps.push(step);
  await persist(container);
}
