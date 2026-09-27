import {
	computed,
	reactive,
	type ShallowRef,
	shallowReactive,
	shallowRef,
	watch,
} from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import type { ConversationContainer } from "./types";

export interface ContainerChange {
	id: string;
	isBranchChange: boolean;
}
// Runtime notification channels follow the lifetime of their loaded container Map.
// This holds no watcher or scope handles.
const changes = new WeakMap<
	ReadonlyMap<string, ConversationContainer>,
	ShallowRef<ContainerChange | null>
>();
export function containerChanges(
	containers: ReadonlyMap<string, ConversationContainer>,
) {
	let change = changes.get(containers);
	if (!change) {
		change = shallowRef<ContainerChange | null>(null);
		changes.set(containers, change);
	}
	return change;
}

export function markContainerDirty(
	conversationId: string,
	id: string,
	isBranchChange = false,
) {
	const store = useSyncStore();
	store.markDirty({ type: "container", id });
	const containers = store.containers.get(conversationId);
	if (containers) containerChanges(containers).value = { id, isBranchChange };
}

function containersForChat(conversationId: string) {
	return useSyncStore().containers.get(conversationId);
}

export function addContainers(
	conversationId: string,
	values: ConversationContainer[],
) {
	for (const container of values)
		for (const message of container.content) message.final ??= true;
	const list = shallowReactive(
		new Map(
			values.map((value) => [
				value.id,
				reactive(value) as ConversationContainer,
			]),
		),
	);
	useSyncStore().containers.set(conversationId, list);
	return list;
}

export function addContainer(value: ConversationContainer) {
	for (const message of value.content) message.final ??= true;
	const store = useSyncStore();
	const list =
		store.containers.get(value.conversationId) ??
		addContainers(value.conversationId, []);
	const container = reactive(value) as ConversationContainer;
	list.set(value.id, container);
	store.markDirty({ type: "container", id: value.id });
	return container;
}

export function usePureContainers(conversationId: string) {
	const empty = new Map<string, ConversationContainer>();
	const containers = computed(() => containersForChat(conversationId) ?? empty);
	return { containers };
}

/** A scoped mutable container handle; only this container is marked dirty. */
export function useContainer(conversationId: string, containerId: string) {
	const store = useSyncStore();
	const container = computed(
		() => store.containers.get(conversationId)?.get(containerId) ?? null,
	);
	let previous = container.value;
	let parent = previous?.previousContainer;
	let next = previous?.activeNextContainer;
	watch(
		container,
		(value) => {
			if (value)
				markContainerDirty(
					conversationId,
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
