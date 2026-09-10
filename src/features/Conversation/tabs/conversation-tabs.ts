import { ref } from "vue";
import {
	createChat,
	loadChat,
	loadChatsForLocalPlugin,
	updateChat,
} from "../chats/chat-service";
import type { Conversation } from "../chats/chat-types";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";

export interface ConversationTab {
	chatId: string;
	localPluginId: string;
	title: string;
}

const storageKey = "pulsarai:conversation-tabs:v1";
const tabs = ref<ConversationTab[]>([]);
const activeChatId = ref("");
const ready = ref(false);

function save() {
	try {
		localStorage.setItem(storageKey, JSON.stringify({
			chatIds: tabs.value.map((tab) => tab.chatId),
			activeChatId: activeChatId.value,
		}));
	} catch {
		// A private renderer may deny storage; tabs still work for this session.
	}
}

function savedChatIds(): { found: boolean; chatIds: string[]; activeChatId: string } {
	try {
		const stored = localStorage.getItem(storageKey);
		if (stored === null) return { found: false, chatIds: [], activeChatId: "" };
		const value = JSON.parse(stored) as {
			chatIds?: unknown;
			activeChatId?: unknown;
		};
		return {
			found: true,
			chatIds: Array.isArray(value.chatIds)
				? value.chatIds.filter((id): id is string => typeof id === "string")
				: [],
			activeChatId: typeof value.activeChatId === "string" ? value.activeChatId : "",
		};
	} catch {
		return { found: false, chatIds: [], activeChatId: "" };
	}
}

function tabFor(chat: Conversation): ConversationTab {
	return {
		chatId: chat.id,
		localPluginId: chat.localPluginId,
		title: chat.title,
	};
}

async function latestChat(localPluginId: string) {
	const chats = await loadChatsForLocalPlugin(localPluginId);
	return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export function useConversationTabs() {
	async function openChat(chatId: string) {
		const chat = await loadChat(chatId);
		if (!chat) return null;
		const existing = tabs.value.find((tab) => tab.chatId === chat.id);
		if (existing) {
			existing.title = chat.title;
			existing.localPluginId = chat.localPluginId;
			tabs.value = [...tabs.value];
		} else {
			tabs.value = [...tabs.value, tabFor(chat)];
		}
		activeChatId.value = chat.id;
		save();
		return chat;
	}

	async function openLocalPlugin(localPluginId: string) {
		if (!localPluginId) return null;
		const chat = (await latestChat(localPluginId)) ??
			(await createChat({ localPluginId }));
		return openChat(chat.id);
	}

	function closeChat(chatId: string) {
		const index = tabs.value.findIndex((tab) => tab.chatId === chatId);
		if (index < 0) return;
		const wasActive = activeChatId.value === chatId;
		tabs.value = tabs.value.filter((tab) => tab.chatId !== chatId);
		if (wasActive) {
			activeChatId.value = tabs.value[index]?.chatId ?? tabs.value[index - 1]?.chatId ?? "";
		}
		save();
	}

	async function renameChat(chatId: string, title: string) {
		const name = title.trim();
		if (!name) return;
		const chat = await updateChat(chatId, { title: name });
		if (!chat) return;
		const tab = tabs.value.find((item) => item.chatId === chatId);
		if (tab) {
			tab.title = chat.title;
			tabs.value = [...tabs.value];
			save();
		}
	}

	async function initialize() {
		if (ready.value) return;
		const localPlugins = useLocalPluginStore();
		await localPlugins.refresh();
		const saved = savedChatIds();
		const restored = (await Promise.all(saved.chatIds.map(loadChat))).filter(
			(chat): chat is Conversation => Boolean(chat),
		);
		tabs.value = restored.map(tabFor);
		activeChatId.value = tabs.value.some((tab) => tab.chatId === saved.activeChatId)
			? saved.activeChatId
			: tabs.value[0]?.chatId ?? "";

		if (!activeChatId.value && !saved.found) {
			const plugin = localPlugins.localPlugins[0] ?? (await localPlugins.create());
			await openLocalPlugin(plugin.id);
		} else {
			save();
		}
		ready.value = true;
	}

	return {
		tabs,
		activeChatId,
		ready,
		initialize,
		openChat,
		openLocalPlugin,
		closeChat,
		renameChat,
	};
}
