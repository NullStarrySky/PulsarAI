import type { Role } from "@/features/Conversation/messages/conversation-types";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { pluginGenerateFile } from "@/features/Plugin/runtime/environment";
import { ctxbuilder, type CtxBuilderConfig } from "@/features/Plugin/runtime/ctx-builder";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";

export interface RunPluginInput {
  /** Plugin stable ID or its current display name. */
  plugin: string;
  conversationId: string;
  /** Character package ID. When supplied it must own the conversation. */
  roleId?: string;
  role?: Role;
  containerId?: string;
  prompt?: string;
  /** Extra opt-in features for a nonstandard Plugin entry point. */
  features?: Omit<CtxBuilderConfig, "chat" | "message" | "plugin" | "toolFunction">;
}

export interface RunPluginResult {
  context: SandboxEnvironment;
  containerId: string;
  messageId: string;
  flush: () => Promise<void>;
}

/**
 * Runs a Plugin's selected generatePath inside a message-version-bound
 * workspace. Conversation supplies lifecycle/error presentation only.
 */
export async function runPlugin(input: RunPluginInput): Promise<RunPluginResult> {
  const chat = useChatStore().chats.find((item) => item.id === input.conversationId);
  if (!chat) throw new Error("会话不存在。");
  if (input.roleId && input.roleId !== chat.packageId)
    throw new Error("角色不属于该会话。");

  const candidates = usePluginStore(input.conversationId).finalPlugins.value;
  const plugin = candidates.find((item) => item.id === input.plugin) ??
    candidates.find((item) => item.name === input.plugin);
  if (!plugin)
    throw new Error(`插件不在该会话的已选工作区中：${input.plugin}`);
  const generateFile = pluginGenerateFile(plugin);
  if (!generateFile)
    throw new Error(`插件 ${plugin.name} 缺少 generatePath 入口。`);

  const context: SandboxEnvironment = {
    conversationId: chat.id,
    pluginId: plugin.id,
    roleId: input.roleId ?? chat.packageId,
    prompt: input.prompt ?? "",
    now: () => new Date().toISOString(),
  };
  const built = await ctxbuilder(context, {
    chat: true,
    conversation: true,
    role: true,
    input: true,
    message: { containerId: input.containerId, role: input.role ?? "assistant", create: !input.containerId },
    plugin: true,
    toolFunction: true,
    ...input.features,
  });
  if (!built.container || !built.message || !built.selfApi)
    throw new Error("runPlugin 未获得消息绑定的 Plugin 环境。");
  try {
    await built.selfApi.import(`@${plugin.id}/${generateFile.path}`, context);
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

/** Concise Plugin-facing form: `run(pluginName, conversationId, roleId)`. */
export function run(
  plugin: string,
  conversationId: string,
  roleId?: string,
  options: Omit<RunPluginInput, "plugin" | "conversationId" | "roleId"> = {},
) {
  return runPlugin({ plugin, conversationId, roleId, ...options });
}
