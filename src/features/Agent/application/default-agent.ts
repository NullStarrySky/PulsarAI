import { ToolLoopAgent, isStepCount, tool, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import { getDefaultChatModel } from "@/features/defaultConfigs/application/default-config-service";
import { hydrateModel } from "@/features/ModelConnection/application/model-ai";
import { executeSandboxCodeAsync, stringifySandboxValue, type SandboxEnvironment } from "@/features/Sandbox/domain/sandbox";
import type { ChatMessage, ChatMessageContainer, LocalStep, ToolCallResult } from "@/features/Resources/Conversation/domain/conversation-types";

export interface RunDefaultAgentInput {
  messages: ModelMessage[];
  environment?: SandboxEnvironment;
  onStep?: (step: LocalStep | ToolCallResult) => void | Promise<void>;
}

export interface RunDefaultAgentResult {
  text: string;
  modelName: string;
}

const jsInputSchema = z.object({
  code: z.string().describe("JavaScript expression, function, or statement body to execute in the sandbox."),
});

function createDefaultTools(environment: SandboxEnvironment, onStep?: RunDefaultAgentInput["onStep"]) {
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
      description: "Execute a JavaScript expression or function in the local sandbox environment.",
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
  };
}

export async function runDefaultAgent(input: RunDefaultAgentInput): Promise<RunDefaultAgentResult> {
  const modelName = await getDefaultChatModel();
  await input.onStep?.({
    name: "agent:start",
    message: `使用 ${modelName} 启动内置 agent。`,
  });

  const agent = new ToolLoopAgent({
    model: hydrateModel(modelName, "chat") as LanguageModel,
    instructions: [
      "You are Pulsar's built-in conversation agent.",
      "Use tools when they are useful. Keep final answers concise and grounded in the conversation.",
      "When executing JavaScript, treat the sandbox as local helper logic and explain important errors to the user.",
    ].join("\n"),
    tools: createDefaultTools(input.environment ?? {}, input.onStep),
    stopWhen: isStepCount(8),
    onStepStart: async ({ stepNumber }) => {
      await input.onStep?.({
        name: "agent:step",
        message: `开始第 ${stepNumber + 1} 轮推理。`,
      });
    },
  });

  const result = await agent.generate({
    messages: input.messages,
  });

  await input.onStep?.({
    name: "agent:finish",
    message: "Agent 已完成回复生成。",
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
