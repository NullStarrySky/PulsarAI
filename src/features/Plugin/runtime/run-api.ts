import type { ModelMessage } from "ai";
import type { MaybeRefOrGetter } from "vue";
import type {
	ChatContainer,
	ChatMessage,
} from "@/features/Conversation/dataflow/types";
import type { SandboxEnvironment } from "@/features/Plugin/runtime/sandbox";
import { createAgentResourceProvider } from "../agent/runtime/default-agent";
import type { PluginData, Pulse, ResourcePath } from "../dataflow/types";
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

/** Runs the selected source against the exact message-version replay projection. */
export async function runWorld(input: RunWorldInput): Promise<RunWorldResult> {
	const reply = input.message;
	const built = createPluginEnvironment({
		filetree: input.filetree,
		applyPulse: input.applyPulse,
		sourcePath: input.entryPath ?? "/",
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
	const agent = createAgentResourceProvider({ environment: built.environment });
	built.environment.agent = agent;
	built.environment.AGENT = agent;
	const entry = await built.importAt(entryPath, entryPath);
	if (typeof entry !== "function")
		throw new Error("生成流程的默认导出必须是函数。");
	await entry();
	return { context: built.environment, entryPath, logger: built.logger };
}
