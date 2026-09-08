import { computed, type MaybeRefOrGetter, ref, toValue, watch } from "vue";
import {
	isChatGenerating,
	isMessageGenerating,
	loadChat,
	persistChat,
	setChatGenerating,
} from "./chats/chat-service";
import {
	type ComposerDraft,
	type Conversation,
	createDefaultComposerDraft,
} from "./chats/chat-types";
import {
	createContainer,
	createMessage,
	currentMessage,
	deleteContainer,
	loadContainersForChat,
	pathForTail,
	persistContainer,
} from "./messages/message-service";
import {
	closeInterval as persistIntervalClose,
	evaluateIntervals,
	getIntervalProjection,
	getIntervalSpans,
	getOpenIntervals,
	openInterval as persistIntervalOpen,
	type IntervalProjection,
	type OpenIntervalInput,
} from "./messages/interval-service";
import type {
	AdditionalParts,
	ChatMessage,
	ChatMessageContainer,
	FilePart,
	ReferencePart,
	Role,
} from "./messages/message-types";
import { useMessageContainer } from "./messages/use-message-container";
import { mediaLinks, removeMediaLink } from "@/features/Media/media-link";

export interface MessageBubbleViewModel {
	containerId: string;
	container: ChatMessageContainer;
	message: ChatMessage | null;
	role: Role;
	versionCount: number;
	activeVersionIndex: number;
	branchIds: string[];
	activeBranchIndex: number;
	branchCount: number;
	thinking: unknown[];
	attachments: FilePart[];
	references: ReferencePart[];
	pulses: import("@/features/Plugin/tree/world-update").Pulse[];
	hasPluginChanges: boolean;
	resourceSummary: string;
	messageTime: string;
	actions: ReturnType<typeof useMessageContainer>;
	isLastAssistant?: boolean;
	isGenerating?: boolean;
	intervalSummary?: {
		id: string;
		count: number;
		collapsed: boolean;
		open: boolean;
	};
}

import { getConversationSharedState } from "./conversation-shared-state";

export function useConversation(chatIdSource: MaybeRefOrGetter<string>) {
	const chatId = computed(() => toValue(chatIdSource));
	const sharedState = computed(() => getConversationSharedState(chatId.value));

	const chat = computed({
		get: () => sharedState.value.chat.value,
		set: (val) => {
			sharedState.value.chat.value = val;
		},
	});
	const containers = computed({
		get: () => sharedState.value.containers.value,
		set: (val) => {
			sharedState.value.containers.value = val;
		},
	});
	const loading = computed({
		get: () => sharedState.value.loading.value,
		set: (val) => {
			sharedState.value.loading.value = val;
		},
	});

	const generating = computed(() =>
		chatId.value ? isChatGenerating(chatId.value) : false,
	);
	const currentContainers = () =>
		sharedState.value.containers.value as unknown as ChatMessageContainer[];

	async function ensureLoaded() {
		const id = chatId.value;
		if (!id) return;
		const s = getConversationSharedState(id);
		if (s.loaded.value && s.chat.value) return;
		s.loading.value = true;
		try {
			const loadedChat = await loadChat(id);
			const loadedContainers = await loadContainersForChat(id);
			s.chat.value = loadedChat;
			s.containers.value = loadedContainers;
			s.loaded.value = true;
		} finally {
			s.loading.value = false;
		}
	}

	watch(
		chatId,
		() => {
			void ensureLoaded();
		},
		{ immediate: true },
	);

	const activePath = computed<ChatMessageContainer[]>(() => {
		const tailId = chat.value?.lastContainerId;
		return pathForTail(currentContainers(), tailId);
	});
	const intervalProjection = computed<IntervalProjection>(() =>
		evaluateIntervals(activePath.value),
	);
	const editModeInterval = computed(() =>
		intervalProjection.value.openIntervals.find(
			(item) => item.interval.type === "edit",
		),
	);
	const isEditMode = computed(() => Boolean(editModeInterval.value));

	const activePathView = computed<MessageBubbleViewModel[]>(() => {
		const localPluginId = chat.value?.localPluginId;
		const cMap = new Map(currentContainers().map((item) => [item.id, item]));
		const path = activePath.value;
		let lastAssistantId = "";
		for (let i = path.length - 1; i >= 0; i--) {
			if (path[i]?.role === "assistant") {
				lastAssistantId = path[i].id;
				break;
			}
		}
		return path.map((container) => {
			const parent = container.previousContainer
				? (cMap.get(container.previousContainer) ?? null)
				: null;
			const isLastAssistant = container.id === lastAssistantId;
			const actions = useMessageContainer(container, {
				localPluginId,
				parentContainer: parent,
				isLastAssistant,
				onSwitchVersion: async (cId, idx) => switchVersion(cId, idx),
				onUpdateContent: async (content) =>
					updateMessage(container.id, content),
				onRegenerate: async (cId) => {
					await regenerate(cId);
				},
				onSwitchBranch: async (cId, bId) => switchBranch(cId, bId),
			});
			return {
				containerId: container.id,
				container,
				message: actions.currentMessage.value,
				role: container.role,
				versionCount: actions.versionCount.value,
				activeVersionIndex: actions.activeVersionIndex.value,
				branchIds: actions.availableBranchIds.value,
				activeBranchIndex: actions.activeBranchIndex.value,
				branchCount: actions.branchCount.value,
				thinking: actions.thinking.value,
				attachments: actions.attachments.value,
				references: actions.references.value,
				pulses: actions.pulses.value,
				hasPluginChanges: actions.hasPluginChanges.value,
				resourceSummary: actions.resourceSummary.value,
				messageTime: actions.messageTime.value,
				actions,
				isLastAssistant,
				isGenerating: isMessageGenerating(
					chatId.value,
					actions.currentMessage.value?.id ?? "",
				),
			};
		});
	});

	const composerDraft = computed<ComposerDraft>({
		get: () => {
			const current = chat.value as unknown as Conversation | null;
			return current?.composerDraft ?? createDefaultComposerDraft(chatId.value);
		},
		set: (value: ComposerDraft) => {
			const current = chat.value as unknown as Conversation | null;
			if (!current) return;
			current.composerDraft = value;
			void persistChat(current);
		},
	});

	const composerDraftContent = computed<string>({
		get: () => {
			const draft = composerDraft.value;
			const activeIdx = draft.activeMessage ?? 0;
			return draft.content[activeIdx]?.content ?? "";
		},
		set: (content: string) => {
			const current = composerDraft.value;
			const activeIdx = current.activeMessage ?? 0;
			const currentMsg = current.content[activeIdx] ?? {
				id: "draft-message",
				type: "message",
				content: "",
				parts: [],
				createdAt: new Date().toISOString(),
				meta: { steps: [] },
			};
			const newContent = [...current.content];
			newContent[activeIdx] = {
				...currentMsg,
				content,
			};
			composerDraft.value = {
				...current,
				content: newContent,
			};
		},
	});

	async function append(input: {
		conversationId: string;
		role: Role;
		content?: string;
		parts?: AdditionalParts[];
		previousContainer?: string | null;
	}) {
		const container = createContainer(input);
		sharedState.value.containers.value = [...sharedState.value.containers.value, container];
		if (input.previousContainer) {
			const parent = currentContainers().find(
				(item) => item.id === input.previousContainer,
			);
			if (parent) {
				parent.availableNextContainer.push(container.id);
				parent.activeNextContainer = container.id;
				await persistContainer(parent);
			}
		}
		await persistContainer(container);
		return container;
	}

	async function requestAssistantContainer(input: {
		conversationId: string;
		previousContainer?: string | null;
	}) {
		return append({
			conversationId: input.conversationId,
			role: "assistant",
			content: "",
			previousContainer: input.previousContainer,
		});
	}

	async function appendAssistantVersion(containerId: string) {
		const target = currentContainers().find((item) => item.id === containerId);
		if (!target || target.role !== "assistant") return null;
		const version = createMessage();
		target.content.push(version);
		target.activeMessage = target.content.length - 1;
		await persistContainer(target);
		return version;
	}

	async function switchVersion(containerId: string, index: number) {
		const target = currentContainers().find((item) => item.id === containerId);
		if (!target || index < 0 || index >= target.content.length) return;
		target.activeMessage = index;
		await persistContainer(target);
	}

	async function updateMessage(containerId: string, content: string) {
		const target = currentContainers().find((item) => item.id === containerId);
		if (!target) return;
		const msg = target.content[target.activeMessage ?? 0];
		if (msg) {
			msg.content = content;
			msg.type = "message";
			if (msg.meta) delete msg.meta.translation;
			await persistContainer(target);
		}
	}

	async function openInterval(
		messageVersion: ChatMessage,
		input: OpenIntervalInput,
	) {
		return persistIntervalOpen(currentContainers(), messageVersion, input);
	}

	async function closeInterval(
		messageVersion: ChatMessage,
		intervalId: string,
	) {
		return persistIntervalClose(
			currentContainers(),
			messageVersion,
			intervalId,
		);
	}

	async function setMode(mode?: {
		id: string;
		name: string;
		content?: import("./messages/interval-service").JsonValue;
	}) {
		const current = chat.value as unknown as Conversation | null;
		if (!current) return;
		const closing = editModeInterval.value;
		if (closing && mode?.id === closing.interval.id) mode = undefined;
		if (!closing && !mode) return;
		const marker = await append({
			conversationId: current.id,
			role: "system",
			content: closing
				? `${closing.interval.name ?? "模式"}子对话已折叠`
				: `${mode?.name ?? "编辑"}子对话`,
			previousContainer: current.lastContainerId,
		});
		const message = currentMessage(marker);
		if (!message) return;
		if (closing) await closeInterval(message, closing.interval.id);
		if (mode)
			await openInterval(message, {
				id: mode.id,
				type: "edit",
				name: mode.name,
				content: mode.content ?? { mode: mode.id },
			});
		if (!current.rootContainerId) {
			current.rootContainerId = marker.id;
		}
		current.lastContainerId = marker.id;
		current.updatedAt = new Date().toISOString();
		await persistChat(current);
	}

	async function toggleEditMode() {
		await setMode({
			id: "builtin-edit",
			name: "编辑模式",
			content: { mode: "edit" },
		});
	}

	async function send(extraParts: AdditionalParts[] = [], overrideRole?: Role) {
		const current = chat.value as unknown as Conversation | null;
		const currentDraft = composerDraft.value;
		const activeIdx = currentDraft.activeMessage ?? 0;
		const activeMsg = currentDraft.content[activeIdx];
		const content = (activeMsg?.content ?? "").trim();
		const allParts = [...(activeMsg?.parts ?? []), ...extraParts];
		const role = overrideRole ?? currentDraft.role ?? "user";

		if (!current || (!content && allParts.length === 0)) return null;

		const container = await append({
			conversationId: current.id,
			role,
			content,
			parts: allParts,
			previousContainer: current.lastContainerId,
		});

		if (!current.rootContainerId) {
			current.rootContainerId = container.id;
		}
		current.composerDraft = createDefaultComposerDraft(current.id);
		current.lastMessagePreview = content.slice(0, 80);
		current.updatedAt = new Date().toISOString();

		if (role === "user") {
			const requestedReply = await requestAssistantContainer({
				conversationId: current.id,
				previousContainer: container.id,
			});
			current.lastContainerId = requestedReply.id;
			await persistChat(current);

			const replyMessage = currentMessage(requestedReply) ?? requestedReply.content[0];
			await generateRequestedAssistantReply({
				chatId: current.id,
				containerId: requestedReply.id,
				messageId: replyMessage?.id,
				activePath: pathForTail(currentContainers(), container.id),
				prompt: content,
			});
		} else {
			current.lastContainerId = container.id;
			await persistChat(current);
		}

		return container;
	}

	async function pushContainer(
		container: ChatMessageContainer,
		triggerGenerate = false,
	) {
		const current = chat.value as unknown as Conversation | null;
		if (!current) return;
		current.lastContainerId = container.id;
		current.updatedAt = new Date().toISOString();
		await persistChat(current);

		if (triggerGenerate && container.role === "assistant") {
			const path = pathForTail(
				currentContainers(),
				container.previousContainer,
			);
			const promptContainer = path[path.length - 1];
			const activeMsg = container.content[container.activeMessage ?? 0];
			await generateRequestedAssistantReply({
				chatId: current.id,
				containerId: container.id,
				messageId: activeMsg?.id,
				activePath: path,
				prompt: currentMessage(promptContainer ?? container)?.content ?? "",
			});
		}
	}

	async function regenerate(containerId: string) {
		const current = chat.value as unknown as Conversation | null;
		const target = currentContainers().find((item) => item.id === containerId);
		if (
			!current ||
			isChatGenerating(current.id) ||
			!target ||
			target.conversationid !== current.id ||
			target.role !== "assistant"
		)
			return null;

		const version = await appendAssistantVersion(containerId);
		if (!version) return null;

		const path = pathForTail(currentContainers(), target.previousContainer);
		const promptContainer = path[path.length - 1];
		await generateRequestedAssistantReply({
			chatId: current.id,
			containerId: target.id,
			messageId: version.id,
			activePath: path,
			prompt: currentMessage(promptContainer)?.content ?? "",
		});
		return version;
	}

	async function switchBranch(containerId: string, branchId: string) {
		const current = chat.value as unknown as Conversation | null;
		const target = currentContainers().find((item) => item.id === containerId);
		if (!current || !target || !target.previousContainer) return;

		const parent = currentContainers().find(
			(item) => item.id === target.previousContainer,
		);
		if (!parent || !parent.availableNextContainer.includes(branchId)) return;

		parent.activeNextContainer = branchId;
		await persistContainer(parent);

		// 遍历到目标分支末端
		let tail: ChatMessageContainer | undefined = currentContainers().find(
			(item) => item.id === branchId,
		);
		while (tail?.activeNextContainer) {
			const next = currentContainers().find(
				(item) => item.id === tail?.activeNextContainer,
			);
			if (!next) break;
			tail = next;
		}

		if (tail) {
			current.lastContainerId = tail.id;
			current.updatedAt = new Date().toISOString();
			await persistChat(current);
		}
	}

	async function createBranch(containerId: string) {
		const current = chat.value as unknown as Conversation | null;
		const target = currentContainers().find((item) => item.id === containerId);
		if (!current || !target) return null;

		const branch = await append({
			conversationId: current.id,
			role: target.role,
			previousContainer: target.previousContainer,
		});
		current.lastContainerId = branch.id;
		current.updatedAt = new Date().toISOString();
		await persistChat(current);
		return branch;
	}

	async function deleteMessage(containerId: string) {
		const current = chat.value as unknown as Conversation | null;
		if (!current) return;
		const target = currentContainers().find((item) => item.id === containerId);
		if (!target) return;

		const parentId = target.previousContainer;
		const parent = parentId
			? currentContainers().find((item) => item.id === parentId)
			: null;

		if (parent) {
			parent.availableNextContainer = parent.availableNextContainer.filter(
				(id) => id !== containerId,
			);
			if (parent.activeNextContainer === containerId) {
				parent.activeNextContainer = parent.availableNextContainer[0] ?? null;
			}
			await persistContainer(parent);
		}

		const removedIds = new Set<string>();
		const collect = (id: string) => {
			if (removedIds.has(id)) return;
			removedIds.add(id);
			for (const childId of currentContainers().find((item) => item.id === id)
				?.availableNextContainer ?? []) collect(childId);
		};
		collect(containerId);
		const media = new Set(
			currentContainers()
				.filter((item) => removedIds.has(item.id))
				.flatMap((item) =>
					item.content.flatMap((message) => [
						...(message.parts
							?.filter((part): part is FilePart => part.type === "file")
							.map((part) => part.url) ?? []),
						...mediaLinks(message.content),
					]),
				),
		);
		await Promise.all([...media].map(removeMediaLink));
		for (const id of removedIds) await deleteContainer(id);
		(containers as unknown as { value: ChatMessageContainer[] }).value =
			currentContainers().filter((item) => !removedIds.has(item.id));

		if (current.lastContainerId && removedIds.has(current.lastContainerId)) {
			current.lastContainerId = parentId ?? null;
			if (current.rootContainerId === containerId) {
				current.rootContainerId = null;
			}
			current.updatedAt = new Date().toISOString();
			await persistChat(current);
		}
	}

	async function generateRequestedAssistantReply(input: {
		chatId: string;
		containerId: string;
		messageId?: string;
		activePath: ChatMessageContainer[];
		prompt: string;
	}) {
		setChatGenerating(input.chatId, true, input.messageId);
		try {
			const { runWorld } = await import("@/features/Plugin/runtime/run-api");
			await runWorld({
				conversationId: input.chatId,
				containerId: input.containerId,
				messageId: input.messageId,
				prompt: input.prompt,
			});
		} catch (error) {
			const target = currentContainers().find(
				(item) => item.id === input.containerId,
			);
			if (target) {
				const activeMsg = input.messageId
					? target.content.find((m) => m.id === input.messageId) ??
						target.content[target.activeMessage ?? 0]
					: target.content[target.activeMessage ?? 0];
				if (activeMsg) {
					activeMsg.type = "error";
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					const existing = (activeMsg.content ?? "").trim();
					activeMsg.content = existing
						? `${existing}\n\n> [!CAUTION]\n> **生成失败**：${errorMessage}`
						: `> [!CAUTION]\n> **生成失败**：${errorMessage}`;
					await persistContainer(target);
				}
			}
		} finally {
			setChatGenerating(input.chatId, false);
		}
	}

	return {
		chat,
		containers,
		activePath,
		intervalProjection,
		isEditMode,
		editModeInterval,
		activePathView,
		composerDraft,
		composerDraftContent,
		generating,
		loading,
		ensureLoaded,
		send,
		pushContainer,
		regenerate,
		createBranch,
		deleteMessage,
		switchVersion,
		switchBranch,
		updateMessage,
		openInterval,
		closeInterval,
		toggleEditMode,
		setMode,
		getOpenIntervals,
		getIntervalSpans,
		getIntervalProjection,
	};
}
