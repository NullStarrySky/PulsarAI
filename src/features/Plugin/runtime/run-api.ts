import { useChatStore } from "@/features/Conversation/chats/chat-store";
import type { Role } from "@/features/Conversation/messages/conversation-types";
import {
	type CtxBuilderConfig,
	ctxbuilder,
} from "@/features/Plugin/runtime/ctx-builder";
import { useWorld } from "@/features/Plugin/tree/world-store";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";

export interface RunWorldInput {
	/** Selected generation container resource in the complete world. */
	entryPath?: string;
	conversationId: string;
	/** Character package ID. When supplied it must own the conversation. */
	roleId?: string;
	role?: Role;
	containerId?: string;
	prompt?: string;
	/** Extra opt-in features for a nonstandard Plugin entry point. */
	features?: Omit<
		CtxBuilderConfig,
		"chat" | "message" | "plugin" | "toolFunction"
	>;
}

export interface RunWorldResult {
	context: SandboxEnvironment;
	containerId: string;
	messageId: string;
	flush: () => Promise<void>;
}

/**
 * Runs a Plugin's selected generatePath inside a message-version-bound
 * workspace. Conversation supplies lifecycle/error presentation only.
 */
export async function runWorld(input: RunWorldInput): Promise<RunWorldResult> {
	const chat = useChatStore().chats.find(
		(item) => item.id === input.conversationId,
	);
	if (!chat) throw new Error("会话不存在。");
	if (input.roleId && input.roleId !== chat.packageId)
		throw new Error("角色不属于该会话。");

	const world = useWorld({ conversationId: input.conversationId });
	const entryPath =
		input.entryPath ??
		world.slots.value.find((slot) => slot.path === "/self/slot/generatePath")
			?.resources[0]?.path;
	if (!entryPath) throw new Error("World 没有选中的生成入口。");
	const target = world.resolve(entryPath);
	if (target.node.type !== "file")
		throw new Error(`生成入口不存在：${entryPath}`);

	const context: SandboxEnvironment = {
		conversationId: chat.id,
		sourcePath: entryPath,
		roleId: input.roleId ?? chat.packageId,
		prompt: input.prompt ?? "",
		now: () => new Date().toISOString(),
	};
	const built = await ctxbuilder(context, {
		chat: true,
		conversation: true,
		role: true,
		input: true,
		message: {
			containerId: input.containerId,
			role: input.role ?? "assistant",
			create: !input.containerId,
		},
		plugin: true,
		toolFunction: true,
		...input.features,
	});
	if (!built.container || !built.message || !built.selfApi)
		throw new Error("runWorld 未获得消息绑定的 World 环境。");
	try {
		await built.selfApi.import(entryPath, context);
	} finally {
		await built.flush();
	}
	return {
		context,
		containerId: built.container.id,
		messageId: built.message.id,
		flush: built.flush,
	};
}
