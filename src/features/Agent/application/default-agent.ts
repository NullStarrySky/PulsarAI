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
import { executeSandboxCodeAsync, stringifySandboxValue, type SandboxEnvironment } from "@/features/Sandbox/domain/sandbox";
import type { ChatMessage, ChatMessageContainer, LocalStep, ToolCallResult } from "@/features/Resources/Conversation/domain/conversation-types";
import { createAskUserTool, type AskUserRequester } from "./ask-user-tool";
import { getAgentExtensionTools } from "./agent-extension-registry";

export interface CreateDefaultAgentResourcesInput {
  environment?: SandboxEnvironment;
  onStep?: (step: LocalStep | ToolCallResult) => void | Promise<void>;
  askUser?: AskUserRequester;
}

export interface DefaultAgentResources {
  model: LanguageModel;
  modelName: string;
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
  code: z.string().describe("JavaScript expression, function, or statement body to execute in the sandbox."),
});

function createDefaultTools(
  environment: SandboxEnvironment,
  onStep?: CreateDefaultAgentResourcesInput["onStep"],
  askUser?: AskUserRequester,
) {
  return {
    getCurrentTime: tool({
      description: "Get the current local time and ISO timestamp.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        const output = {
          iso: now.toISOString(),
          local: now.toLocaleString(),
          timezoneOffsetMinutes: now.getTimezoneOffset(),
        };
        await onStep?.({
          type: "tool-result",
          toolCallId: crypto.randomUUID(),
          toolName: "getCurrentTime",
          input: {},
          output,
        });
        return output;
      },
    }),
    executeJavaScript: tool({
      description: "Execute JavaScript in the current Pulsar sandbox. Use the Feature APIs documented in the system context; unavailable methods are not granted.",
      inputSchema: jsInputSchema,
      execute: async (input) => {
        try {
          const value = await executeSandboxCodeAsync(input.code, [environment]);
          const output = stringifySandboxValue(value);
          await onStep?.({
            type: "tool-result",
            toolCallId: crypto.randomUUID(),
            toolName: "executeJavaScript",
            input,
            output,
          });
          return { ok: true, output };
        } catch (error) {
          const output = { ok: false, error: error instanceof Error ? error.message : String(error) };
          await onStep?.({
            type: "tool-result",
            toolCallId: crypto.randomUUID(),
            toolName: "executeJavaScript",
            input,
            output,
          });
          return output;
        }
      },
    }),
    ...(askUser ? { askUser: createAskUserTool(askUser, onStep) } : {}),
  };
}

export async function createDefaultAgentResources(
  input: CreateDefaultAgentResourcesInput,
): Promise<DefaultAgentResources> {
  const modelName = await getDefaultChatModel();
  await input.onStep?.({
    name: "agent:start",
    message: `使用 ${modelName} 启动内置 agent。`,
  });

  return {
    model: hydrateModel(modelName, "chat") as LanguageModel,
    modelName,
    tools: {
      ...createDefaultTools(input.environment ?? {}, input.onStep, input.askUser),
      ...getAgentExtensionTools(),
    },
    stopWhen: isStepCount(8),
    onStepStart: async ({ stepNumber }) => {
      await input.onStep?.({
        name: "agent:step",
        message: `开始第 ${stepNumber + 1} 轮推理。`,
      });
    },
    finish: async () => {
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
  return {
    ToolLoopAgent,
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
