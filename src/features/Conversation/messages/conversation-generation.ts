import { runWorld } from "@/features/Plugin/runtime/run-api";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { usePackageStore } from "@/features/Package/package-store";
import {
  formatChatMessageError,
  type ChatMessageContainer,
} from "./conversation-types";
import { useMessageStore } from "./message-store";
import { useChatStore } from "../chats/chat-store";

/**
 * Conversation owns only lifecycle and visible errors. Plugin.run builds every
 * executable capability from the concrete assistant message version.
 */
export async function generateRequestedAssistantReply(input: {
  chatId: string;
  containerId: string;
  activePath: ChatMessageContainer[];
  prompt: string;
}) {
  const chats = useChatStore();
  const messages = useMessageStore();
  const packages = usePackageStore();
  const plugins = usePluginStore();
  const chat = chats.chats.find((item) => item.id === input.chatId);
  const container = messages.containers.find((item) => item.id === input.containerId);
  const message = container ? messages.currentMessage(container) : null;
  if (!chat || !container || !message || container.role !== "assistant")
    throw new Error("生成必须先请求一个有效的助手消息容器。");

  chats.startGeneration(chat.id);
  const startedAt = Date.now();
  message.meta.generateInfo = {
    modelName: "default-agent",
    startTime: new Date(startedAt).toISOString(),
  };
  try {
    await plugins.initialize();
    const packageItem = packages.packages.find((item) => item.id === chat.packageId);
    if (!packageItem) throw new Error("会话角色包不存在。");
    await runWorld({
      conversationId: chat.id,
      roleId: chat.packageId,
      role: "assistant",
      containerId: container.id,
      prompt: input.prompt,
    });
  } catch (error) {
    message.type = "error";
    message.content = formatChatMessageError(error);
  } finally {
    message.meta.generateInfo!.timeUsed = Date.now() - startedAt;
    await messages.persist(container);
    chats.finishGeneration(chat.id);
  }
}
