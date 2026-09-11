import { computed } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { mediaLinks, removeMediaLink } from "@/features/Media/media-link";
import { type Pulse, usePluginData } from "@/features/Plugin/dataflow";
import { isChatGenerating, setChatGeneration, useChat } from "../chats";
import { useContainerVersion } from "../containerComposable";
import { usePureContainers } from "../containers";
import {
	type ChatContainer,
	type ChatMessage,
	createDraft,
	type Role,
} from "../types";
import { evaluateIntervals } from "./interval-services";
import {
	createContainer,
	currentMessage,
	modelMessagesFromPath,
	pathForTail,
} from "./message-service";

export interface ReplayGroup {
	container: ChatContainer;
	version: ChatMessage;
	pulses: Pulse[];
}

/** A message version is the sole durable owner of its resource Pulses. */
export function applyVersionPulse(
	container: ChatContainer,
	version: ChatMessage,
	pulse: Pulse,
) {
	if (!container.content.some((candidate) => candidate.id === version.id))
		throw new Error("Pulse 必须绑定到消息容器中的具体版本。");
	version.meta.pulses ??= [];
	version.meta.pulses.push(pulse);
	useSyncStore().markDirty({ type: "container", id: container.id });
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
	const replayPulses = computed(() =>
		replayGroups.value.map((group) => group.pulses),
	);
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
			const parent = [...collection.containers.value].find(
				(item) => item.id === container.previousContainer,
			);
			if (parent) {
				parent.availableNextContainer.push(container.id);
				parent.activeNextContainer = container.id;
				store.markDirty({ type: "container", id: parent.id });
			}
		}
		store.markDirty({ type: "container", id: container.id });
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
		const list = store.containers.get(chatId) as Set<ChatContainer> | undefined;
		const container = [...(list ?? [])].find((item) => item.id === containerId);
		if (!container) return;
		const byId = new Map([...(list ?? [])].map((item) => [item.id, item]));
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
			store.markDirty({ type: "container", id: parent.id });
		}
		for (const childId of children) {
			const child = byId.get(childId)!;
			child.previousContainer = container.previousContainer ?? null;
			store.markDirty({ type: "container", id: child.id });
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
			list?.delete(byId.get(id)!);
			store.markDirty({ type: "container", id });
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
