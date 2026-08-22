import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { usePackageStore } from "@/features/Package/package-store";
import { builtinCorePluginId, usePluginStore } from "@/features/Plugin/tree/plugin-store";
import type { Plugin, PluginFile } from "@/features/Plugin/tree/plugin-types";
import { ConversationResourceOverlay } from "./conversation-resource-overlay";
import { useMessageStore } from "./message-store";

function conversationOverlay(chatId: string) {
  const chats = useChatStore();
  const packages = usePackageStore();
  const plugins = usePluginStore();
  const messages = useMessageStore();
  const chat = chats.chats.find((item) => item.id === chatId);
  if (!chat) throw new Error("会话不存在。");
  const packageItem = packages.packages.find((item) => item.id === chat.packageId);
  const mainPluginId = packageItem?.mainPluginId || builtinCorePluginId;
  return new ConversationResourceOverlay({
    plugins: plugins.enabledPluginsForPackage(chat.packageId, packageItem?.enabledGlobalPluginIds, mainPluginId),
    activePath: messages.pathFor(chat.lastContainerId),
  });
}

/** Materializes exactly the Overlay that the next generation will receive. */
export function conversationOverlayPlugins(chatId: string): Plugin[] {
  return conversationOverlay(chatId).plugins;
}

export async function persistConversationOverlayFileEdit(input: {
  chatId: string;
  pluginId: string;
  resourceId: string;
  patch: Pick<PluginFile, "content" | "order" | "insertion">;
}) {
  const chats = useChatStore();
  const messages = useMessageStore();
  const chat = chats.chats.find((item) => item.id === input.chatId);
  if (!chat) throw new Error("会话不存在。");
  const overlay = conversationOverlay(input.chatId);
  const file = overlay.updateFile(input.pluginId, input.resourceId, input.patch);
  const operationContainer = await messages.appendHiddenResourceUpdate({
    conversationId: chat.id,
    previousContainer: chat.lastContainerId,
    resourceUpdate: overlay.resourceUpdate(),
  });
  chat.lastContainerId = operationContainer.id;
  chat.updatedAt = new Date().toISOString();
  await chats.persist(chat);
  return {
    plugins: overlay.plugins,
    plugin: overlay.plugins.find((plugin) => plugin.id === input.pluginId)!,
    file,
  };
}
