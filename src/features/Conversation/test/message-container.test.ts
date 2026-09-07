import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	Object.assign(globalThis, {
		window: {
			pulsarHost: { invoke: async () => null, listen: async () => () => {} },
		},
	});
});

vi.mock("notivue", () => ({
	push: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/Translate/translate-store", () => ({
	useTranslateStore: () => ({
		translateMessage: vi.fn(),
	}),
}));

vi.mock("@/features/Plugin/agent/runtime/default-agent", () => ({
	createDefaultToolLoopAgent: vi.fn(),
}));

vi.mock("@/features/ModelConnection/services/model-ai", () => ({
	createAiModel: vi.fn(),
}));

vi.mock("../chats/chat-service", () => ({
	loadChat: vi.fn(),
	persistChat: vi.fn(),
	isChatGenerating: vi.fn(() => false),
	setChatGenerating: vi.fn(),
}));

vi.mock("../messages/message-service", () => ({
	loadContainersForChat: vi.fn(),
	persistContainer: vi.fn().mockResolvedValue(undefined),
	createContainer: vi.fn(),
	createMessage: vi.fn(),
	currentMessage: vi.fn(),
	pathForTail: vi.fn(() => []),
	modelMessagesFromPath: vi.fn(() => []),
}));

import { useConversation } from "../use-conversation";
import * as chatService from "../chats/chat-service";
import * as messageService from "../messages/message-service";
import type { ChatMessageContainer } from "../messages/message-types";
import type { Conversation } from "../chats/chat-types";

describe("Conversation composable", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	it("clears translation metadata when a message is manually edited", async () => {
		const mockChat: Conversation = {
			id: "chat-1",
			localPluginId: "plugin-1",
			title: "测试会话",
			createdAt: "2026-08-22T00:00:00.000Z",
			updatedAt: "2026-08-22T00:00:00.000Z",
			lifetime: "persistent",
			isTemplate: false,
			pinned: false,
			rootContainerId: "c-1",
			lastContainerId: "c-1",
			composerDraft: {
				id: "draft",
				role: "user",
				conversationid: "chat-1",
				content: [],
				availableNextContainer: [],
			},
		};

		const mockContainer: ChatMessageContainer = {
			id: "c-1",
			role: "assistant",
			conversationid: "chat-1",
			activeMessage: 0,
			availableNextContainer: [],
			activeNextContainer: null,
			previousContainer: null,
			content: [
				{
					id: "msg-1",
					type: "message",
					content: "译文",
					createdAt: "2026-08-22T00:00:00.000Z",
					meta: {
						steps: [],
						translation: {
							translatedContent: "译文",
							targetLanguage: "zh",
						},
					},
				},
			],
		};

		vi.mocked(chatService.loadChat).mockResolvedValue(mockChat);
		vi.mocked(messageService.loadContainersForChat).mockResolvedValue([mockContainer]);

		const conv = useConversation("chat-1");
		await conv.ensureLoaded();

		await conv.updateMessage("c-1", "手动编辑");

		expect(mockContainer.content[0]?.content).toBe("手动编辑");
		expect(mockContainer.content[0]?.meta?.translation).toBeUndefined();
		expect(messageService.persistContainer).toHaveBeenCalledWith(mockContainer);
	});
});
