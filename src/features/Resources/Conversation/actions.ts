import { push } from "notivue";
import { resetCharacterData } from "@/features/Database/application/database-service";
import { clearResourceSyncMetadata } from "@/features/Database/application/sync-metadata";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useConversationStore } from "./application/conversation-store";

export async function createConversationAction() {
  const conversation = useConversationStore();
  const layout = useLayoutStore();
  await conversation.createConversation();
  const active = conversation.activeConversation;
  if (active) {
    layout.openResourceTab({
      resourceType: "conversation",
      resourceId: active.id,
      packageId: active.packageId,
      title: active.title,
    });
  }
}

export function editLastMessageAction() {
  useConversationStore().requestLastMessageEdit();
}

export function regenerateLastMessageAction() {
  return useConversationStore().regenerate();
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
