import type { ModelMessage } from "ai";
import type { MaybeRefOrGetter } from "vue";
import type {
	ChatContainer,
	ChatMessage,
	TokenUsage,
} from "@/features/Conversation/dataflow/types";
import { useSyncStore } from "@/features/Database/dbsync-store";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";
import type { AgentOutputContainer } from "../agent/runtime/default-agent";
import { createAgentResourceProvider } from "../agent/runtime/default-agent";
import type { PluginData, Pulse, ResourcePath } from "../dataflow/types";
import { parsePluginDataDefinition } from "../resources/types/data/plugin-data";
import { createPluginEnvironment } from "./environment";
import type { PluginLogger } from "./logger";

export interface RunWorldInput {
	conversationId: string;
	container: ChatContainer;
	message: ChatMessage;
	prompt: string;
	chat: ModelMessage[];
	filetree: MaybeRefOrGetter<PluginData | null>;
	applyPulse: (pulse: Pulse) => void;
	context?: SandboxEnvironment;
	entryPath?: ResourcePath;
}

export interface RunWorldResult {
	context: SandboxEnvironment;
	entryPath: ResourcePath;
	logger: PluginLogger;
}

function createReply(container: ChatContainer, message: ChatMessage) {
	const store = useSyncStore();
	const persist = () =>
		store.markDirty({ type: "container", id: container.id });
	const reply: AgentOutputContainer & Record<string, unknown> = {
		read: () => ({
			container: structuredClone(container),
			message: structuredClone(message),
		}),
		setContent: async (content: string) => {
			message.content = content;
			persist();
		},
		clear: async () => {
			message.type = "message";
			message.content = "";
			message.parts = [];
			message.meta.steps = [];
			persist();
		},
		setModelName: async (modelName: string) => {
			message.meta.generateInfo ??= { startTime: new Date().toISOString() };
			message.meta.generateInfo.modelName = modelName;
			persist();
		},
		setTokenUsage: async (usage: TokenUsage) => {
			message.meta.generateInfo ??= {};
			message.meta.generateInfo.usage = usage;
			message.meta.generateInfo.finishTime = new Date().toISOString();
			persist();
		},
		appendContent: async (delta: string) => {
			message.content += delta;
			persist();
		},
		addStep: async (step) => {
			message.meta.steps.push(structuredClone(step));
			persist();
		},
		updateThinking: async (id: string, content: string) => {
			const step = message.meta.steps.find(
				(candidate) => candidate.type === "thinking" && candidate.id === id,
			);
			if (step?.type === "thinking") step.message = content;
			persist();
		},
		completeToolCall: async (result) => {
			const index = message.meta.steps.findIndex(
				(step) =>
					step.type === "tool-call" && step.toolCallId === result.toolCallId,
			);
			if (index < 0) message.meta.steps.push(structuredClone(result));
			else message.meta.steps.splice(index, 1, structuredClone(result));
			persist();
		},
	};
	return reply;
}

/** Runs the selected source against the exact message-version replay projection. */
export async function runWorld(input: RunWorldInput): Promise<RunWorldResult> {
	const reply = createReply(input.container, input.message);
	const built = createPluginEnvironment({
		filetree: input.filetree,
		applyPulse: input.applyPulse,
		sourcePath: input.entryPath ?? "/global/builtin-core-plugin/generate.js",
		context: {
			...input.context,
			conversationId: input.conversationId,
			prompt: input.prompt,
			chat: input.chat,
			CHAT: input.chat,
			container: input.container,
			message: input.message,
			reply,
		},
	});
	const entryPath = input.entryPath ?? built.slots.paths("generatePath")[0];
	if (!entryPath) throw new Error("没有已选中的生成流程。");
	built.environment.sourcePath = entryPath;
	built.registerCustomTools();
	for (const path of built.slots.paths("DATA_INJECT")) {
		const definition = parsePluginDataDefinition(built.files.read(path));
		const name = definition.varName?.trim();
		if (!name) continue;
		if (name in built.environment) throw new Error(`数据变量名冲突：${name}`);
		built.environment[name] = await built.importAt(path, entryPath);
	}
	const agent = createAgentResourceProvider({ environment: built.environment });
	built.environment.agent = agent;
	built.environment.AGENT = agent;
	await built.importAt(entryPath, entryPath);
	return { context: built.environment, entryPath, logger: built.logger };
}
