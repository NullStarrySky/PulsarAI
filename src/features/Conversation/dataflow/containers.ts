import { computed } from "vue";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
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
	const containers = computed(() => new Set(containersForChat(chatId) ?? []));
	return { containers };
}

/** Thin reactive address lookup; it adds no persistence behavior. */
export function usePureContainer(containerId: string) {
	return computed(() => findContainer(containerId) ?? null);
}
