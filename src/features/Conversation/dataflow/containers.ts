import { computed } from "vue";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { mediaLinks, removeMediaLink } from "@/features/Media/media-link";
import { createContainer } from "./message-service";
import type { ChatContainer } from "./types";

function containersForChat(chatId: string) {
	return useSyncStore().containers.get(chatId) as
		| Set<ChatContainer>
		| undefined;
}

function findContainer(containerId: string) {
	return [...useSyncStore().containers.values()]
		.flatMap((items) => [...items])
		.find((item) => item.id === containerId);
}

registerSyncHandler<ChatContainer>("container", {
	table: "message_containers",
	value: findContainer,
});

export function usePureContainers(chatId: string) {
	const store = useSyncStore();
	const containers = computed(() => new Set(containersForChat(chatId) ?? []));
	function create(
		input: Omit<Parameters<typeof createContainer>[0], "conversationId">,
	) {
		const container = createContainer({ conversationId: chatId, ...input });
		const added = store.addContainer(container);
		if (container.previousContainer) {
			const parent = [...(containersForChat(chatId) ?? [])].find(
				(item) => item.id === container.previousContainer,
			);
			if (parent) {
				parent.availableNextContainer.push(container.id);
				parent.activeNextContainer = container.id;
				store.markDirty({ type: "container", id: parent.id });
			}
		}
		store.markDirty({ type: "container", id: added.id });
		return added;
	}
	async function remove(containerId: string, deleteDescendants = false) {
		const list = containersForChat(chatId);
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
		const chat = [...store.chatMeta.values()]
			.map((items) => items.get(chatId))
			.find(Boolean);
		if (chat) {
			if (chat.rootContainerId === containerId)
				chat.rootContainerId = deleteDescendants ? null : replacementId;
			if (chat.lastContainerId && removed.has(chat.lastContainerId)) {
				let tail =
					parent ??
					(deleteDescendants ? undefined : byId.get(replacementId ?? ""));
				const seen = new Set<string>();
				while (tail?.activeNextContainer && !seen.has(tail.id)) {
					seen.add(tail.id);
					tail = byId.get(tail.activeNextContainer);
				}
				chat.lastContainerId = tail?.id ?? null;
			}
			chat.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: chat.id });
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
	return { containers, create, delete: remove };
}

/** Thin reactive address lookup; it adds no persistence behavior. */
export function usePureContainer(containerId: string) {
	return computed(() => findContainer(containerId) ?? null);
}
