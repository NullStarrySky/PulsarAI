import { computed, shallowRef, type ShallowRef, watch } from "vue";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { compactPulses } from "@/features/Plugin/dataflow/pulse";
import type { ChatContainer } from "./types";

export interface ContainerChange {
	id: string;
	isBranchChange: boolean;
}
// Runtime notification channels follow the lifetime of their loaded container Map.
// This holds no watcher or scope handles.
const changes = new WeakMap<
	ReadonlyMap<string, ChatContainer>,
	ShallowRef<ContainerChange | null>
>();
export function containerChanges(
	containers: ReadonlyMap<string, ChatContainer>,
) {
	let change = changes.get(containers);
	if (!change) {
		change = shallowRef<ContainerChange | null>(null);
		changes.set(containers, change);
	}
	return change;
}

export function markContainerDirty(
	chatId: string,
	id: string,
	isBranchChange = false,
) {
	const store = useSyncStore();
	store.markDirty({ type: "container", id });
	const containers = store.containers.get(chatId);
	if (containers) containerChanges(containers).value = { id, isBranchChange };
}

function containersForChat(chatId: string) {
	return useSyncStore().containers.get(chatId);
}

function findContainerById(containerId: string) {
	for (const items of useSyncStore().containers.values()) {
		const container = items.get(containerId);
		if (container) return container;
	}
}

registerSyncHandler<ChatContainer>("container", {
	table: "message_containers",
	value: findContainerById,
	serialize(container) {
		return {
			...container,
			content: container.content.map((message) => ({
				...message,
				meta: {
					...message.meta,
					...(message.meta.pulses
						? { pulses: compactPulses(message.meta.pulses) }
						: {}),
				},
			})),
		};
	},
});

export function usePureContainers(chatId: string) {
	const empty = new Map<string, ChatContainer>();
	const containers = computed(() => containersForChat(chatId) ?? empty);
	return { containers };
}

/** A scoped mutable container handle; only this container is marked dirty. */
export function useContainer(chatId: string, containerId: string) {
	const store = useSyncStore();
	const container = computed(
		() => store.containers.get(chatId)?.get(containerId) ?? null,
	);
	let previous = container.value;
	let parent = previous?.previousContainer;
	let next = previous?.activeNextContainer;
	watch(
		container,
		(value) => {
			if (value)
				markContainerDirty(
					chatId,
					containerId,
					value !== previous ||
						value.previousContainer !== parent ||
						value.activeNextContainer !== next,
				);
			previous = value;
			parent = value?.previousContainer;
			next = value?.activeNextContainer;
		},
		{
			deep: true,
			// Mark before its owning component/scope can dispose the watcher.
			flush: "sync",
		},
	);
	return container;
}
