import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { useMessageStore } from "@/features/Conversation/messages/message-store";

/** Sandbox-safe input control for the currently selected chat. */
export function createComposerApi(conversationId: string) {
	const chatStore = useChatStore();
	const messageStore = useMessageStore();
	const chat = () =>
		chatStore.chats.find((item) => item.id === conversationId) ?? null;
	const send = async () => {
		const target = chat();
		const content = target?.composerDraft?.trim() ?? "";
		if (!target || !content) return null;
		const container = await messageStore.append({
			conversationId,
			role: "user",
			content,
			previousContainer: target.lastContainerId,
		});
		target.lastContainerId = container.id;
		target.composerDraft = "";
		target.updatedAt = new Date().toISOString();
		await chatStore.persist(target);
		return { id: container.id, content };
	};
	return Object.freeze({
		read: () => chat()?.composerDraft ?? "",
		write: (content: string) =>
			chatStore.setComposerDraft(String(content), conversationId),
		edit: async (find: string, replace: string) => {
			if (!find) throw new Error("input.edit 的 find 不能为空。");
			const current = chat()?.composerDraft ?? "";
			const index = current.indexOf(find);
			if (index < 0) throw new Error("input.edit 未找到要替换的文本。");
			const next = `${current.slice(0, index)}${replace}${current.slice(index + find.length)}`;
			await chatStore.setComposerDraft(next, conversationId);
			return next;
		},
		send,
	});
}
