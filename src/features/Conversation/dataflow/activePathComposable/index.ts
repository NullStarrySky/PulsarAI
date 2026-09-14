import { computed, effectScope } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	mediaLinks,
	removeMediaLink,
} from "@/features/Plugin/media/media-link";
import {
	compactPulses,
	type Pulse,
	usePluginData,
} from "@/features/Plugin/dataflow";
import { isChatGenerating, setChatGeneration, useChat } from "../chats";
import { useContainerVersion } from "../containerComposable";
import {
	markContainerDirty,
	useContainer,
	usePureContainers,
} from "../containers";
import {
	type ChatContainer,
	type ChatMessage,
	createDraft,
	type Role,
} from "../types";
import { evaluateIntervals } from "./interval-services";
import { usePathProjection } from "./path-projection";
export type { ReplayGroup } from "./path-projection";
import {
	createContainer,
	currentMessage,
	modelMessagesFromPath,
	pathForTail,
} from "./message-service";

/** A message version is the sole durable owner of its resource Pulses. */
function applyVersionPulse(
	container: ChatContainer,
	version: ChatMessage,
	pulse: Pulse,
) {
	if (!container.content.some((candidate) => candidate.id === version.id))
		throw new Error("Pulse 必须绑定到消息容器中的具体版本。");
	version.meta.pulses ??= [];
	version.meta.pulses = compactPulses([...version.meta.pulses, pulse]);
	markContainerDirty(container.conversationid, container.id);
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
	const { activePath, replayGroups, replayPulses } = usePathProjection(
		collection.containers,
		() => chat.value?.lastContainerId,
	);
	const intervals = computed(() => evaluateIntervals(activePath.value));
	function forVersion(container: ChatContainer, version: ChatMessage) {
		if (container.conversationid !== chatId)
			throw new Error("消息版本不属于当前会话。");
		const groups = computed(() =>
			pathForTail(collection.containers.value, container.id).map((item) => {
				const message =
					item.id === container.id ? version : currentMessage(item);
				return message?.meta.pulses ?? [];
			}),
		);
		const filetree = usePluginData(
			() => chat.value?.localPluginId ?? "",
			groups,
			() => chat.value?.pluginVersionId ?? "",
		);
		return {
			filetree,
			applyPulse: (pulse: Pulse) =>
				applyVersionPulse(container, version, pulse),
		};
	}
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
		const container = store.addContainer(
			createContainer({
				conversationId: current.id,
				...input,
				previousContainer: input.previousContainer ?? current.lastContainerId,
			}),
		);
		if (container.previousContainer) {
			const parent = collection.containers.value.get(
				container.previousContainer,
			);
			if (parent) {
				parent.availableNextContainer.push(container.id);
				parent.activeNextContainer = container.id;
				markContainerDirty(chatId, parent.id, true);
			}
		}
		markContainerDirty(chatId, container.id, true);
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
		markContainerDirty(chatId, marker.id);
		return marker;
	}
	function versionAt(containerId: string, messageId?: string) {
		const container = collection.containers.value.get(containerId);
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
		// Generation may outlive the mounted message bubble that normally watches it.
		const generationScope = effectScope(true);
		generationScope.run(() => useContainer(chatId, target.container.id));
		setChatGeneration(current.id, { messageId: target.message.id });
		try {
			const path = pathForTail(
				collection.containers.value,
				target.container.previousContainer,
			);
			const prompt = currentMessage(path[path.length - 1])?.content ?? "";
			const workspace = forVersion(target.container, target.message);
			const { runWorld } = await import("@/features/Plugin/runtime/run-api");
			await runWorld({
				conversationId: current.id,
				container: target.container,
				message: target.message,
				prompt,
				chat: await modelMessagesFromPath(path),
				filetree: workspace.filetree,
				applyPulse: workspace.applyPulse,
				context: {
					conversation: current,
					input: {
						read: () => currentMessage(current.composerDraft)?.content ?? "",
						write: (content: string) => {
							const draft = currentMessage(current.composerDraft);
							if (!draft) return;
							draft.content = content;
							store.markDirty({ type: "meta", id: current.id });
						},
						edit: (find: string, replace: string) => {
							const draft = currentMessage(current.composerDraft);
							if (!draft || !find || !draft.content.includes(find))
								return false;
							draft.content = draft.content.replace(find, replace);
							store.markDirty({ type: "meta", id: current.id });
							return true;
						},
					},
				},
			});
		} catch (error) {
			target.message.type = "error";
			const detail = error instanceof Error ? error.message : String(error);
			target.message.content = `> [!CAUTION]\n> **生成失败**：${detail}`;
			markContainerDirty(chatId, target.container.id);
		} finally {
			generationScope.stop();
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
		const list = store.containers.get(chatId);
		const container = list?.get(containerId);
		if (!container) return;
		const byId = list!;
		const removed = new Set<string>();
		const collect = (id: string) => {
			if (removed.has(id)) return;
			removed.add(id);
			if (deleteDescendants)
				for (const child of byId.get(id)?.availableNextContainer ?? [])
					collect(child);
		};
		collect(containerId);
		const parent = container.previousContainer
			? byId.get(container.previousContainer)
			: undefined;
		const children = container.availableNextContainer.filter(
			(id) => byId.has(id) && !removed.has(id),
		);
		const replacementId = children.includes(container.activeNextContainer ?? "")
			? container.activeNextContainer!
			: (children[0] ?? null);
		if (parent) {
			parent.availableNextContainer = parent.availableNextContainer.flatMap(
				(id) => (id === containerId ? children : id),
			);
			if (parent.activeNextContainer === containerId)
				parent.activeNextContainer = replacementId;
			markContainerDirty(chatId, parent.id, true);
		}
		for (const childId of children) {
			const child = byId.get(childId)!;
			child.previousContainer = container.previousContainer ?? null;
			markContainerDirty(chatId, child.id, true);
		}
		const current = chat.value;
		if (current) {
			if (current.rootContainerId === containerId)
				current.rootContainerId = deleteDescendants ? null : replacementId;
			if (current.lastContainerId && removed.has(current.lastContainerId)) {
				let tail =
					parent ??
					(deleteDescendants ? undefined : byId.get(replacementId ?? ""));
				const seen = new Set<string>();
				while (tail?.activeNextContainer && !seen.has(tail.id)) {
					seen.add(tail.id);
					tail = byId.get(tail.activeNextContainer);
				}
				current.lastContainerId = tail?.id ?? null;
			}
			current.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: current.id });
		}
		const media = new Set(
			[...removed].flatMap(
				(id) =>
					byId
						.get(id)
						?.content.flatMap((message) => [
							...(message.parts
								?.filter((part) => part.type === "file")
								.map((part) => part.url) ?? []),
							...mediaLinks(message.content),
						]) ?? [],
			),
		);
		for (const url of media) await removeMediaLink(url);
		for (const id of removed) {
			list?.delete(id);
			markContainerDirty(chatId, id, true);
		}
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
		replayPulses,
		forVersion,
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
