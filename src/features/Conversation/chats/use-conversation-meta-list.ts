import {
	computed,
	type MaybeRefOrGetter,
	ref,
	toValue,
	watch,
} from "vue";
import {
	createChat,
	deleteChatCascade,
	loadChatsForPackage,
	updateChat,
} from "./chat-service";
import type { Conversation } from "./chat-types";

export function useConversationMetaList(
	packageIdSource: MaybeRefOrGetter<string>,
) {
	const conversations = ref<Conversation[]>([]);
	const loading = ref(false);

	const sortedConversations = computed(() => {
		return [...conversations.value].sort((a, b) => {
			if (Boolean(a.pinned) !== Boolean(b.pinned)) {
				return a.pinned ? -1 : 1;
			}
			return b.updatedAt.localeCompare(a.updatedAt);
		});
	});

	async function load() {
		const pkgId = toValue(packageIdSource);
		if (!pkgId) {
			conversations.value = [];
			return;
		}
		loading.value = true;
		try {
			conversations.value = await loadChatsForPackage(pkgId);
		} finally {
			loading.value = false;
		}
	}

	watch(() => toValue(packageIdSource), () => {
		void load();
	}, { immediate: true });

	async function create(title?: string, isTemplate?: boolean) {
		const pkgId = toValue(packageIdSource);
		if (!pkgId) throw new Error("缺少 packageId");
		const chat = await createChat({
			packageId: pkgId,
			title,
			isTemplate,
		});
		conversations.value.unshift(chat);
		return chat;
	}

	async function rename(id: string, title: string) {
		const chat = conversations.value.find((item) => item.id === id);
		if (!chat) return;
		chat.title = title;
		chat.updatedAt = new Date().toISOString();
		await updateChat(id, { title });
	}

	async function setPinned(id: string, pinned: boolean) {
		const chat = conversations.value.find((item) => item.id === id);
		if (!chat) return;
		chat.pinned = pinned;
		chat.updatedAt = new Date().toISOString();
		await updateChat(id, { pinned });
	}

	async function setTemplate(id: string, isTemplate: boolean) {
		const chat = conversations.value.find((item) => item.id === id);
		if (!chat) return;
		chat.isTemplate = isTemplate;
		chat.updatedAt = new Date().toISOString();
		await updateChat(id, { isTemplate });
	}

	async function remove(id: string) {
		const index = conversations.value.findIndex((item) => item.id === id);
		if (index >= 0) {
			conversations.value.splice(index, 1);
		}
		await deleteChatCascade(id);
	}

	async function updatePreview(id: string, preview: string) {
		const chat = conversations.value.find((item) => item.id === id);
		if (!chat) return;
		chat.lastMessagePreview = preview.slice(0, 80);
		chat.updatedAt = new Date().toISOString();
		await updateChat(id, { lastMessagePreview: chat.lastMessagePreview });
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
