import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockHostDatabase } from "@/features/Database/mock-database";
import {
	createChat,
	isChatGenerating,
	loadChat,
	persistChat,
	setChatGenerating,
} from "../chats/chat-service";
import {
	createContainer,
	createMessage,
	currentMessage,
	loadContainersForChat,
	modelMessagesFromPath,
	pathForTail,
} from "../messages/message-service";
import type { ChatMessageContainer } from "../messages/message-types";
import { useConversation } from "../use-conversation";

const mocks = vi.hoisted(() => ({
	runWorld: vi.fn(),
}));

vi.mock("@/features/Plugin/runtime/run-api", () => ({
	runWorld: mocks.runWorld,
}));

vi.mock("@/features/Translate/translate-store", () => ({
	useTranslateStore: () => ({
		state: { targetLanguage: "en" },
		translateText: vi.fn(async () => "translated"),
	}),
}));

beforeEach(() => {
	resetMockHostDatabase();
	mocks.runWorld.mockReset();
	mocks.runWorld.mockResolvedValue({
		context: {},
		containerId: "resolved",
		messageId: "resolved",
		flush: async () => {},
	});
});

describe("Message container primitives", () => {
	it("creates containers with one active message and links branches", () => {
		const container = createContainer({
			conversationId: "chat-1",
			role: "user",
			content: "hello",
			previousContainer: "root",
		});
		expect(container.role).toBe("user");
		expect(container.content).toHaveLength(1);
		expect(container.activeMessage).toBe(0);
		expect(container.previousContainer).toBe("root");
		expect(currentMessage(container)?.content).toBe("hello");
	});

	it("builds the active path from the tail and tolerates missing links", () => {
		const root = createContainer({ conversationId: "c", role: "user" });
		const branchA = createContainer({
			conversationId: "c",
			role: "assistant",
			previousContainer: root.id,
		});
		const branchB = createContainer({
			conversationId: "c",
			role: "assistant",
			previousContainer: root.id,
		});
		root.availableNextContainer = [branchA.id, branchB.id];
		root.activeNextContainer = branchB.id;
		const containers = [root, branchA, branchB];

		expect(pathForTail(containers, branchB.id).map((c) => c.id)).toEqual([
			root.id,
			branchB.id,
		]);
		expect(pathForTail(containers, "missing")).toEqual([]);
		expect(pathForTail(containers, undefined)).toEqual([]);
	});

	it("compiles model messages from the active path and skips error versions", async () => {
		const user = createContainer({
			conversationId: "c",
			role: "user",
			content: "look at this",
		});
		currentMessage(user)!.parts = [
			{ type: "file", mediaType: "image/png", url: "blob:img" },
		];
		const assistant = createContainer({
			conversationId: "c",
			role: "assistant",
			previousContainer: user.id,
		});
		const failed = createMessage({ type: "error", content: "boom" });
		assistant.content = [createMessage({ content: "ok" }), failed];
		assistant.activeMessage = 1;

		const messages = await modelMessagesFromPath([user, assistant]);
		expect(messages).toEqual([
			{
				role: "user",
				content: [
					{ type: "text", text: "look at this" },
					{ type: "file", data: "blob:img", mimeType: "image/png" },
				],
			},
		]);
	});
});

describe("Chat service", () => {
	it("creates and reloads a new conversation", async () => {
		const chat = await createChat({ localPluginId: "plugin-pin" });
		expect(chat.localPluginId).toBe("plugin-pin");
		expect(chat.lifetime).toBe("persistent");
		expect(chat.rootContainerId).toBeNull();
		expect(chat.lastContainerId).toBeNull();

		const reloaded = await loadChat(chat.id);
		expect(reloaded?.localPluginId).toBe("plugin-pin");
	});

	it("tracks per-chat generating state", () => {
		expect(isChatGenerating("chat-1")).toBe(false);
		setChatGenerating("chat-1", true);
		expect(isChatGenerating("chat-1")).toBe(true);
		setChatGenerating("chat-1", false);
		expect(isChatGenerating("chat-1")).toBe(false);
	});
});

describe("useConversation generation flow", () => {
	async function prepareChat() {
		const chat = await createChat({ localPluginId: "plugin-flow" });
		await persistChat(chat);
		return chat;
	}

	it("send persists user and assistant containers and delegates to runWorld", async () => {
		const chat = await prepareChat();
		const conversation = useConversation(chat.id);
		await conversation.ensureLoaded();

		conversation.composerDraftContent.value = "你好";
		const userContainer = await conversation.send();

		expect(userContainer?.role).toBe("user");
		expect(userContainer?.content[0]?.content).toBe("你好");

		const containers = await loadContainersForChat(chat.id);
		expect(containers).toHaveLength(2);
		const assistant = containers.find(
			(item) => item.role === "assistant",
		)! as ChatMessageContainer;
		expect(assistant.previousContainer).toBe(userContainer!.id);
		expect(userContainer!.availableNextContainer).toContain(assistant.id);

		const reloaded = await loadChat(chat.id);
		expect(reloaded?.lastContainerId).toBe(assistant.id);
		expect(reloaded?.composerDraft.content[0]?.content).toBe("");

		expect(mocks.runWorld).toHaveBeenCalledTimes(1);
		expect(mocks.runWorld).toHaveBeenCalledWith(
			expect.objectContaining({
				conversationId: chat.id,
				containerId: assistant.id,
				prompt: "你好",
			}),
		);
		expect(isChatGenerating(chat.id)).toBe(false);
	});

	it("persists generation failures as visible error messages", async () => {
		mocks.runWorld.mockRejectedValueOnce(new Error("生成失败"));
		const chat = await prepareChat();
		const conversation = useConversation(chat.id);
		await conversation.ensureLoaded();

		conversation.composerDraftContent.value = "触发错误";
		await conversation.send();

		const reloaded = await loadChat(chat.id);
		expect(reloaded).not.toBeNull();
		const containers = await loadContainersForChat(chat.id);
		const assistant = containers.find(
			(item) => item.id === reloaded!.lastContainerId,
		)!;
		expect(assistant.content[0]?.type).toBe("error");
		expect(assistant.content[0]?.content).toContain("生成失败");
	});

	it("regenerate appends an assistant version and switchVersion updates active version reactively", async () => {
		const chat = await prepareChat();
		const conversation = useConversation(chat.id);
		await conversation.ensureLoaded();

		conversation.composerDraftContent.value = "第一轮";
		await conversation.send();
		const containers = await loadContainersForChat(chat.id);
		const assistant = containers.find((item) => item.role === "assistant")!;

		await conversation.regenerate(assistant.id);
		expect(mocks.runWorld).toHaveBeenCalledTimes(2);

		const refreshed = (await loadContainersForChat(chat.id)).find(
			(item) => item.id === assistant.id,
		)!;
		expect(refreshed.content).toHaveLength(2);
		expect(refreshed.activeMessage).toBe(1);

		// Switch back to version 0
		await conversation.switchVersion(assistant.id, 0);
		const afterSwitch = (await loadContainersForChat(chat.id)).find(
			(item) => item.id === assistant.id,
		)!;
		expect(afterSwitch.activeMessage).toBe(0);
		const view = conversation.activePathView.value.find(
			(item) => item.containerId === assistant.id,
		);
		expect(view?.activeVersionIndex).toBe(0);
	});

	it("editing a message clears stale translation metadata", async () => {
		const chat = await prepareChat();
		const conversation = useConversation(chat.id);
		await conversation.ensureLoaded();

		conversation.composerDraftContent.value = "翻译前";
		await conversation.send();
		const containers = await loadContainersForChat(chat.id);
		const assistant = containers.find((item) => item.role === "assistant")!;
		assistant.content[0].meta.translation = {
			translatedContent: "old",
			targetLanguage: "en",
		};

		await conversation.updateMessage(assistant.id, "编辑后");
		const refreshed = (await loadContainersForChat(chat.id)).find(
			(item) => item.id === assistant.id,
		)!;
		expect(refreshed.content[0].content).toBe("编辑后");
		expect(refreshed.content[0].meta.translation).toBeUndefined();
	});
});
