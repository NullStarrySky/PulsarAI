import {
	isStepCount,
	type ModelMessage,
	ToolLoopAgent,
	type ToolSet,
	tool,
} from "ai";
import { z } from "zod";
import type { ConversationMessage } from "@/features/Conversation/dataflow/types";
import type { SandboxEnvironment } from "@/features/Plugin/runtime/sandbox";
import { createToolLoopAgent, streamText } from "@/features/Request/ai-sdk";
import { useRequestDefaults } from "@/features/Request/defaults";
import { useRequestStore } from "@/features/Request/request-store";
import type { ModelSelection } from "@/features/Request/types";
import {
	parseModelReference,
	type ReasoningEffort,
} from "@/features/Request/types";
import { executeCodeAct } from "./code-act";

export interface CreateDefaultAgentResourcesInput {
	environment?: SandboxEnvironment;
	modelName?: string | ModelSelection;
	onCodeAct?: () => void;
}

interface DefaultAgentResources {
	model: ModelSelection;
	modelName: string;
	reasoning?: ReasoningEffort;
	tools: ToolSet;
	stopWhen: ReturnType<typeof isStepCount>;
	finish: () => Promise<void>;
}

/**
 * The persisted reply target supplied by Conversation generation. Plugins pass
 * this as `container` when constructing the sandbox ToolLoopAgent wrapper.
 */
type AgentOutputContainer = ConversationMessage;

interface ContainerToolLoopAgent {
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

function createCodeActTool(
	environment: SandboxEnvironment,
	onCodeAct?: () => void,
) {
	return {
		codeAct: tool({
			description: "Execute one JavaScript function with an explicit return.",
			inputSchema: jsInputSchema,
			execute: async (input) => {
				onCodeAct?.();
				return executeCodeAct(input.code, environment);
			},
		}),
	};
}

async function createDefaultAgentResources(
	input: CreateDefaultAgentResourcesInput,
): Promise<DefaultAgentResources> {
	const configuredModel =
		input.modelName || useRequestDefaults().defaults.defaultChatModel;
	const parsedModel =
		typeof configuredModel === "string"
			? parseModelReference(configuredModel)
			: {
					providerId: configuredModel.providerId,
					modelId: configuredModel.modelId,
					reasoning: undefined,
				};
	const modelName = `${parsedModel.providerId}/${parsedModel.modelId}`;
	const reasoning = parsedModel.reasoning;
	const tools = createCodeActTool(input.environment ?? {}, input.onCodeAct);
	await useRequestStore().init();

	return {
		model: {
			providerId: parsedModel.providerId,
			modelId: parsedModel.modelId,
			kind: "text",
		},
		modelName,
		reasoning,
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
			const output = this.input.container;
			const runner = createToolLoopAgent(
				{
					providerId: runtime.model.providerId,
					modelId: runtime.model.modelId,
					kind: "text",
				},
				{
					model: runtime.model,
					reasoning: runtime.reasoning,
					allowSystemInMessages: true,
					tools: runtime.tools,
					activeTools: ["codeAct"],
					stopWhen: runtime.stopWhen,
				},
				(options) =>
					new ToolLoopAgent(
						options as ConstructorParameters<typeof ToolLoopAgent>[0],
					),
			) as ToolLoopAgent<never, ToolSet, any>;
			const thinkingById = new Map<string, string>();
			const generateInfo = (output.meta.generateInfo ??= {
				startTime: new Date().toISOString(),
			});
			try {
				generateInfo.modelName = runtime.modelName;
				const result = await runner.stream({ messages });
				for await (const part of result.fullStream) {
					if (part.type === "text-delta") {
						output.content += part.text;
					} else if (part.type === "reasoning-start") {
						thinkingById.set(part.id, "");
						output.meta.steps.push({
							type: "thinking",
							id: part.id,
							message: "",
						});
					} else if (part.type === "reasoning-delta") {
						const thinking = (thinkingById.get(part.id) ?? "") + part.text;
						thinkingById.set(part.id, thinking);
						const step = output.meta.steps.find(
							(candidate) =>
								candidate.type === "thinking" && candidate.id === part.id,
						);
						if (step?.type === "thinking") step.message = thinking;
					} else if (part.type === "tool-call") {
						output.meta.steps.push({
							type: "tool-call",
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							input: part.input,
						});
					} else if (part.type === "tool-result") {
						const step = {
							type: "tool-result",
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							input: part.input,
							output: part.output,
						} as const;
						const index = output.meta.steps.findIndex(
							(candidate) =>
								candidate.type === "tool-call" &&
								candidate.toolCallId === part.toolCallId,
						);
						if (index < 0) output.meta.steps.push(step);
						else output.meta.steps.splice(index, 1, step);
					} else if (part.type === "tool-error") {
						const step = {
							type: "tool-result",
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							input: part.input,
							output: {
								ok: false,
								error:
									part.error instanceof Error
										? part.error.message
										: String(part.error),
							},
						} as const;
						const index = output.meta.steps.findIndex(
							(candidate) =>
								candidate.type === "tool-call" &&
								candidate.toolCallId === part.toolCallId,
						);
						if (index < 0) output.meta.steps.push(step);
						else output.meta.steps.splice(index, 1, step);
					} else if (part.type === "error") {
						throw part.error instanceof Error
							? part.error
							: new Error(String(part.error));
					} else if (part.type === "abort") {
						throw new Error(part.reason || "生成已中止。");
					}
				}
				generateInfo.usage = await result.usage;
				generateInfo.finishTime = new Date().toISOString();
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
		const generateInfo = (container.meta.generateInfo ??= {
			startTime: new Date().toISOString(),
		});
		try {
			generateInfo.modelName = runtime.modelName;
			const result = streamText({
				model: {
					providerId: runtime.model.providerId,
					modelId: runtime.model.modelId,
					kind: "text",
				},
				messages,
				allowSystemInMessages: true,
				...(runtime.reasoning
					? { reasoning: runtime.reasoning }
					: { reasoningEffort: "auto" }),
			});
			for await (const part of result.fullStream) {
				if (part.type === "text-delta") {
					container.content += part.text;
				} else if (part.type === "reasoning-start") {
					thinkingById.set(part.id, "");
					container.meta.steps.push({
						type: "thinking",
						id: part.id,
						message: "",
					});
				} else if (part.type === "reasoning-delta") {
					const thinking = (thinkingById.get(part.id) ?? "") + part.text;
					thinkingById.set(part.id, thinking);
					const step = container.meta.steps.find(
						(candidate) =>
							candidate.type === "thinking" && candidate.id === part.id,
					);
					if (step?.type === "thinking") step.message = thinking;
				} else if (part.type === "error") {
					throw part.error instanceof Error
						? part.error
						: new Error(String(part.error));
				} else if (part.type === "abort") {
					throw new Error(part.reason || "生成已中止。");
				}
			}
			generateInfo.usage = await result.usage;
			generateInfo.finishTime = new Date().toISOString();
		} finally {
			await runtime.finish();
		}
	};

	return {
		ToolLoopAgent: ContainerBoundToolLoopAgent,
		streamText: streamTextFn,
	};
}
