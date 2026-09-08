import { type Ref, ref } from "vue";
import type { Conversation } from "./chats/chat-types";
import type { ChatMessageContainer } from "./messages/message-types";

export interface ConversationSharedState {
	chat: Ref<Conversation | null>;
	containers: Ref<ChatMessageContainer[]>;
	loading: Ref<boolean>;
	loaded: Ref<boolean>;
}

const conversationStateRegistry = new Map<string, ConversationSharedState>();

export function getConversationSharedState(id: string): ConversationSharedState {
	let state = conversationStateRegistry.get(id);
	if (!state) {
		state = {
			chat: ref<Conversation | null>(null),
			containers: ref<ChatMessageContainer[]>([]),
			loading: ref<boolean>(false),
			loaded: ref<boolean>(false),
		};
		if (id) {
			conversationStateRegistry.set(id, state);
		}
	}
	return state;
}

export function notifyContainerUpdated(container: ChatMessageContainer) {
	const state = conversationStateRegistry.get(container.conversationid);
	if (!state) return;
	const list = state.containers.value;
	const index = list.findIndex((c) => c.id === container.id);
	if (index >= 0) {
		list[index] = { ...container };
	} else {
		list.push({ ...container });
	}
	state.containers.value = [...list];
}

export function notifyChatUpdated(chat: Conversation) {
	const state = conversationStateRegistry.get(chat.id);
	if (!state) return;
	state.chat.value = { ...chat };
}
