import type { Conversation } from "@/features/Resources/Conversation/domain/conversation-types";

export function isProjectAgentConversation(conversation: Conversation) {
  return conversation.kind === "task" && Boolean(conversation.binding?.packageId);
}
