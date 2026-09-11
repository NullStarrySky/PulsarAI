import { computed, type MaybeRef, unref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	createMessage,
	currentMessage,
} from "../activePathComposable/message-service";
import type { ChatContainer } from "../types";

export function useContainerVersion(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const container = computed(() => unref(source));
	const index = computed(() => container.value?.activeMessage ?? 0);
	const count = computed(() => container.value?.content.length ?? 0);
	const current = computed(() => currentMessage(container.value));
	const canPrev = computed(() => index.value > 0);
	const canNext = computed(() => index.value < count.value - 1);
	const canDelete = computed(() => count.value > 1);
	function goto(next: number) {
		const value = container.value;
		if (!value || next < 0 || next >= value.content.length) return;
		value.activeMessage = next;
		useSyncStore().markDirty({ type: "container", id: value.id });
	}
	function prev() {
		goto(index.value - 1);
	}
	function next() {
		goto(index.value + 1);
	}
	function create(input: Parameters<typeof createMessage>[0] = {}) {
		const value = container.value;
		if (!value) return null;
		value.content.push(createMessage(input));
		value.activeMessage = value.content.length - 1;
		useSyncStore().markDirty({ type: "container", id: value.id });
		return current.value;
	}
	function remove(target = index.value) {
		const value = container.value;
		if (
			!value ||
			value.content.length <= 1 ||
			target < 0 ||
			target >= value.content.length
		)
			return null;
		const [message] = value.content.splice(target, 1);
		value.activeMessage = Math.min(target, value.content.length - 1);
		useSyncStore().markDirty({ type: "container", id: value.id });
		return message ?? null;
	}
	return {
		current,
		index,
		count,
		canPrev,
		canNext,
		canDelete,
		goto,
		prev,
		next,
		create,
		delete: remove,
	};
}
