import type { Pinia } from "pinia";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { initializeConversation } from "@/features/Conversation/conversation-runtime";
import type {
	CharacterPackage,
	ChatMessageContainer,
	Conversation,
	PackageCategory,
} from "@/features/Conversation/messages/conversation-types";
import { useMessageStore } from "@/features/Conversation/messages/message-store";
import { usePackageStore } from "@/features/Package/package-store";

type ConversationIntegration = {
	packages: CharacterPackage[];
	categories: PackageCategory[];
	conversations: Conversation[];
	containers: ChatMessageContainer[];
	loaded: boolean;
	[key: string]: any;
};

/**
 * Integration view for features that need all three Conversation collections.
 * New Conversation UI must bind `useConversation(chatId)`; this view exposes
 * persistence collections only and intentionally owns no selected chat/path.
 */
export function useConversationStore(pinia?: Pinia): ConversationIntegration {
	const packages = usePackageStore(pinia);
	const chats = useChatStore(pinia);
	const messages = useMessageStore(pinia);
	const api = {
		initialize: initializeConversation,
		persistPackage: packages.persist,
		persistConversation: chats.persist,
		persistContainer: messages.persist,
		createPackage: packages.create,
		updatePackage: packages.update,
		deletePackage: packages.remove,
		createConversation: chats.create,
		updateConversation: chats.update,
		deleteConversation: chats.remove,
		openPackage: (packageId: string) =>
			packages.packages.find((item) => item.id === packageId) ?? null,
		openConversation: (conversationId: string) =>
			chats.chats.find((item) => item.id === conversationId) ?? null,
		currentMessage: messages.currentMessage,
		containerPathTo: messages.pathFor,
		containerPathForConversation: (chat: {
			lastContainerId: string | null;
			rootContainerId: string | null;
		}) => messages.pathFor(chat.lastContainerId ?? chat.rootContainerId),
		switchMessage: messages.switchVersion,
		setMessageFavorite: messages.setMessageFavorite,
		requestLastMessageEdit: () => {},
		requestMessageNavigation: () => {},
	};
	return Object.defineProperties(api, {
		packages: {
			get: () => packages.packages,
			set: (value) => {
				packages.packages = value;
			},
		},
		categories: {
			get: () => packages.categories,
			set: (value) => {
				packages.categories = value;
			},
		},
		conversations: {
			get: () => chats.chats,
			set: (value) => {
				chats.chats = value;
			},
		},
		containers: {
			get: () => messages.containers,
			set: (value) => {
				messages.containers = value;
			},
		},
		loaded: { get: () => true },
	}) as unknown as ConversationIntegration;
}
