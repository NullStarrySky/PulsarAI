import type { ChatMessageContainer } from "../messages/message-types";

export type ComposerDraft = ChatMessageContainer;

export function createDefaultComposerDraft(
	conversationId = "",
): ComposerDraft {
	return {
		id: "draft-container",
		role: "user",
		conversationid: conversationId,
		content: [
			{
				id: "draft-message",
				type: "message",
				content: "",
				parts: [],
				createdAt: new Date().toISOString(),
				meta: {
					steps: [],
				},
			},
		],
		activeMessage: 0,
		availableNextContainer: [],
		activeNextContainer: null,
		previousContainer: null,
	};
}

export interface Conversation {
	id: string;
	localPluginId: string;
	title: string;
	rootContainerId: string | null;
	lastContainerId: string | null;
	lastMessagePreview?: string;
	composerDraft: ComposerDraft;
	createdAt: string;
	updatedAt: string;
	lifetime: "persistent" | "app";
	pinned?: boolean;
	isTemplate?: boolean;
}
