import { computed } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { isChatGenerating, setChatGeneration, useChat } from "../chats";
import { useContainerVersion } from "../containerComposable";
import { usePureContainers } from "../containers";
import { evaluateIntervals } from "../interval-services";
import { currentMessage, pathForTail } from "../message-service";
import {
	type ChatContainer,
	type ChatMessage,
	createDraft,
	type Role,
} from "../types";

export interface ReplayGroup {
	container: ChatContainer;
	version: ChatMessage;
	pulses: unknown[];
}

export const toggleEditModeEvent = "pulsarai:conversation-toggle-edit-mode";

export function toggleEditModeAction() {
	window.dispatchEvent(new CustomEvent(toggleEditModeEvent));
}

/** Conversation-wide operations derived exclusively from its active path. */
export function useActivePathComposable(chatId: string) {
	const store = useSyncStore();
	const chat = useChat(chatId);
	const collection = usePureContainers(chatId);
	const activePath = computed(() =>
		pathForTail(collection.containers.value, chat.value?.lastContainerId),
	);
	const intervals = computed(() => evaluateIntervals(activePath.value));
	const replayGroups = computed<ReplayGroup[]>(() =>
		activePath.value.flatMap((container) => {
			const version = currentMessage(container);
			return version
				? [{ container, version, pulses: version.meta.pulses ?? [] }]
				: [];
		}),
	);
	const editMode = computed(
		() =>
			intervals.value.openIntervals.find(
				(item) => item.interval.type === "edit",
			) ?? null,
	);
	const generating = isChatGenerating(chatId);
	const draft = computed({
		get: () => currentMessage(chat.value?.composerDraft)?.content ?? "",
		set(content: string) {
			const current = chat.value;
			const message = currentMessage(current?.composerDraft);
			if (!current || !message) return;
			message.content = content;
			store.markDirty({ type: "meta", id: current.id });
		},
	});
	function push(input: {
		role: Role;
		content?: string;
		previousContainer?: string | null;
	}) {
		const current = chat.value;
		if (!current) return null;
		const container = collection.create({
			...input,
			previousContainer: input.previousContainer ?? current.lastContainerId,
		});
		if (!current.rootContainerId) current.rootContainerId = container.id;
		current.lastContainerId = container.id;
		if (input.role === "user")
			current.lastMessagePreview = (input.content ?? "").slice(0, 80);
		current.updatedAt = new Date().toISOString();
		store.markDirty({ type: "meta", id: current.id });
		return container;
	}
	function toggleEditMode() {
		const current = chat.value;
		if (!current) return null;
		const active = editMode.value;
		const marker = push({
			role: "system",
			content: active
				? `${active.interval.name ?? "编辑模式"}已结束`
				: "编辑模式",
		});
		const message = currentMessage(marker);
		if (!marker || !message) return null;
		message.meta.intervalOperations = active
			? [{ kind: "interval.close", intervalId: active.interval.id }]
			: [
					{
						kind: "interval.open",
						interval: {
							id: "builtin-edit",
							type: "edit",
							name: "编辑模式",
							content: { mode: "edit" },
						},
					},
				];
		store.markDirty({ type: "container", id: marker.id });
		return marker;
	}
	function versionAt(containerId: string, messageId?: string) {
		const container = [...collection.containers.value].find(
			(item) => item.id === containerId,
		);
		if (!container) return null;
		const version = useContainerVersion(container);
		if (messageId) {
			const index = container.content.findIndex(
				(message) => message.id === messageId,
			);
			if (index < 0) return null;
			version.goto(index);
		}
		return { container, version, message: version.current.value };
	}
	async function generate(containerId: string, messageId?: string) {
		const target = versionAt(containerId, messageId);
		const current = chat.value;
		if (
			!target?.message ||
			!current ||
			target.container.role !== "assistant" ||
			generating.value
		)
			return null;
		setChatGeneration(current.id, { messageId: target.message.id });
		try {
			const path = pathForTail(
				collection.containers.value,
				target.container.previousContainer,
			);
			const prompt = currentMessage(path[path.length - 1])?.content ?? "";
			const { runWorld } = await import("@/features/Plugin/runtime/run-api");
			await runWorld({
				conversationId: current.id,
				containerId: target.container.id,
				messageId: target.message.id,
				prompt,
			});
		} catch (error) {
			target.message.type = "error";
			const detail = error instanceof Error ? error.message : String(error);
			target.message.content = `> [!CAUTION]\n> **生成失败**：${detail}`;
			store.markDirty({ type: "container", id: target.container.id });
		} finally {
			setChatGeneration(current.id);
		}
		return versionAt(target.container.id, target.message.id)?.message ?? null;
	}
	async function regenerate(containerId: string) {
		const target = versionAt(containerId);
		if (!target) return null;
		if (target.container.role !== "assistant" || generating.value) return null;
		const version = target.version.create();
		return version ? generate(target.container.id, version.id) : null;
	}
	function selectVersion(containerId: string, index: number) {
		const target = versionAt(containerId);
		if (!target) return null;
		target.version.goto(index);
		return target.version.current.value;
	}
	async function deleteContainer(
		containerId: string,
		deleteDescendants = false,
	) {
		await collection.delete(containerId, deleteDescendants);
	}
	async function send() {
		const content = draft.value.trim();
		if (!content || generating.value) return null;
		const user = push({ role: "user", content });
		if (!user || !chat.value) return null;
		chat.value.composerDraft = createDraft(chat.value.id);
		store.markDirty({ type: "meta", id: chat.value.id });
		const assistant = push({ role: "assistant", content: "" });
		const version = currentMessage(assistant);
		return assistant && version ? generate(assistant.id, version.id) : null;
	}
	return {
		chat,
		containers: collection.containers,
		activePath,
		intervals,
		replayGroups,
		editMode: { active: editMode, toggle: toggleEditMode },
		draft,
		generating,
		push,
		send,
		generate,
		regenerate,
		selectVersion,
		deleteContainer,
	};
}
