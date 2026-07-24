import { push } from "notivue";
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
