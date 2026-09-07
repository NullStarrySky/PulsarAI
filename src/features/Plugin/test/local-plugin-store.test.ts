import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createChat, loadChatsForLocalPlugin } from "@/features/Conversation/chats/chat-service";
import { loadContainersForChat } from "@/features/Conversation/messages/message-service";
import { resetMockHostDatabase } from "@/features/Database/mock-database";
import { useLocalPluginStore } from "../local-plugin-store";

describe("local Plugin deletion", () => {
	beforeEach(() => { resetMockHostDatabase(); setActivePinia(createPinia()); });
	it("cascades to conversations and message containers", async () => {
		const store = useLocalPluginStore(); const plugin = await store.create({ name: "角色" });
		const chat = await createChat({ localPluginId: plugin.id });
		expect((await loadContainersForChat(chat.id)).length).toBe(0);
		await store.removeLocalPlugin(plugin.id);
		expect(await loadChatsForLocalPlugin(plugin.id)).toEqual([]);
		expect(await loadContainersForChat(chat.id)).toEqual([]);
	});
});
