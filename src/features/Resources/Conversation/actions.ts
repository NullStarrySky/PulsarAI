import { push } from "notivue";
import { resetCharacterData } from "@/features/Database/database-service";
import { clearResourceSyncMetadata } from "@/features/Database/sync-metadata";
import { useConversationStore } from "@/features/Resources/Conversation/store/conversation-store";

export async function createConversationAction() {
  const conversation = useConversationStore();
  await conversation.createConversation();
}

export function editLastMessageAction() {
  useConversationStore().requestLastMessageEdit();
}

export function regenerateLastMessageAction() {
  return useConversationStore().requestContainer({ mode: "regenerate" });
}

export async function copyLastMessageAction() {
  const store = useConversationStore();
  const message = store.activeContainer ? store.currentMessage(store.activeContainer) : null;
  if (!message) {
    return;
  }
  await navigator.clipboard.writeText(message.content);
  push.success("已复制最后一条消息");
}

export async function resetCharacterDataAction() {
  const confirmed = window.confirm(
    "清空全部角色包、对话、插件和本地资源，并恢复初始角色包？设置、模型连接和密钥不会改动。",
  );
  if (!confirmed) return;

  try {
    await resetCharacterData();
    clearResourceSyncMetadata();
    window.location.reload();
  } catch (error) {
    push.error(error instanceof Error ? error.message : "无法清理角色包数据。");
  }
}
