import {
	computed,
	type MaybeRefOrGetter,
	ref,
	shallowRef,
	toValue,
	watch,
} from "vue";
import {
	createChat,
	deleteChatCascade,
	loadChatsForLocalPlugin,
	updateChat,
} from "./chat-service";
import type { Conversation } from "./chat-types";

export function useConversationMetaList(
	localPluginIdSource: MaybeRefOrGetter<string>,
) {
	const conversations = shallowRef<Conversation[]>([]);
	const loading = ref(false);
	const currentConversations = () => conversations.value as unknown as Conversation[];

	const sortedConversations = computed(() => {
		return [...currentConversations()].sort((a, b) => {
			if (Boolean(a.pinned) !== Boolean(b.pinned)) {
				return a.pinned ? -1 : 1;
			}
			return b.updatedAt.localeCompare(a.updatedAt);
		});
	});

	async function load() {
		const localPluginId = toValue(localPluginIdSource);
		if (!localPluginId) {
			(conversations as unknown as { value: Conversation[] }).value = [];
			return;
		}
		loading.value = true;
		try {
			(conversations as unknown as { value: Conversation[] }).value =
				await loadChatsForLocalPlugin(localPluginId);
		} finally {
			loading.value = false;
		}
	}

	watch(() => toValue(localPluginIdSource), () => {
		void load();
	}, { immediate: true });

	async function create(
		title?: string,
		isTemplate?: boolean,
		lifetime: Conversation["lifetime"] = "persistent",
	) {
		const localPluginId = toValue(localPluginIdSource);
		if (!localPluginId) throw new Error("缺少 localPluginId");
		const chat = await createChat({
			localPluginId,
			title,
			isTemplate,
			lifetime,
		});
		conversations.value = [chat, ...currentConversations()];
		return chat;
	}

	async function rename(id: string, title: string) {
		const chat = currentConversations().find((item) => item.id === id);
		if (!chat) return;
		chat.title = title;
		chat.updatedAt = new Date().toISOString();
		await updateChat(id, { title });
		conversations.value = [...currentConversations()];
	}

	async function setPinned(id: string, pinned: boolean) {
		const chat = currentConversations().find((item) => item.id === id);
		if (!chat) return;
		chat.pinned = pinned;
		chat.updatedAt = new Date().toISOString();
		await updateChat(id, { pinned });
		conversations.value = [...currentConversations()];
	}

	async function setTemplate(id: string, isTemplate: boolean) {
		const chat = currentConversations().find((item) => item.id === id);
		if (!chat) return;
		chat.isTemplate = isTemplate;
		chat.updatedAt = new Date().toISOString();
		await updateChat(id, { isTemplate });
		conversations.value = [...currentConversations()];
	}

	async function remove(id: string) {
		conversations.value = currentConversations().filter((item) => item.id !== id);
		await deleteChatCascade(id);
	}

	async function updatePreview(id: string, preview: string) {
		const chat = currentConversations().find((item) => item.id === id);
		if (!chat) return;
		chat.lastMessagePreview = preview.slice(0, 80);
		chat.updatedAt = new Date().toISOString();
		await updateChat(id, { lastMessagePreview: chat.lastMessagePreview });
		conversations.value = [...currentConversations()];
	}

	return {
		conversations,
		sortedConversations,
		loading,
		load,
		create,
		rename,
		setPinned,
		setTemplate,
		remove,
		updatePreview,
	};
}
