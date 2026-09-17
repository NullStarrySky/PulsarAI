import { computed, type MaybeRef, unref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { createContainer } from "../activePathComposable/message-service";
import { addContainer, markContainerDirty } from "../containers";
import type { ConversationContainer } from "../types";

/** Chooses or creates the sibling branch for one concrete container. */
export function useContainerBranch(
	source: MaybeRef<ConversationContainer | null | undefined>,
) {
	const store = useSyncStore();
	const container = computed(() => unref(source));
	const siblings = computed(() => {
		const value = container.value;
		if (!value?.previousContainer) return value ? [value.id] : [];
		const all = store.containers.get(value.conversationId);
		return (
			all?.get(value.previousContainer)?.availableNextContainer ?? [value.id]
		);
	});
	const index = computed(() =>
		container.value ? siblings.value.indexOf(container.value.id) : -1,
	);
	const count = computed(() => siblings.value.length);
	const canPrev = computed(() => index.value > 0);
	const canNext = computed(
		() => index.value >= 0 && index.value < count.value - 1,
	);
	const canCreate = computed(() => Boolean(container.value?.previousContainer));
	function goto(branchId: string) {
		const value = container.value;
		if (!value?.previousContainer || !siblings.value.includes(branchId)) return;
		const all = store.containers.get(value.conversationId);
		const parent = all?.get(value.previousContainer);
		const branch = all?.get(branchId);
		if (!parent || !branch) return;
		let tail: ConversationContainer = branch;
		parent.activeNextContainer = branchId;
		const seen = new Set<string>();
		while (tail.activeNextContainer && !seen.has(tail.id)) {
			seen.add(tail.id);
			const next = all?.get(tail.activeNextContainer);
			if (!next) break;
			tail = next;
		}
		const conversation = [...store.conversationMeta.values()]
			.map((items) => items.get(value.conversationId))
			.find(Boolean);
		if (conversation) {
			conversation.lastContainerId = tail.id;
			conversation.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: conversation.id });
		}
		markContainerDirty(value.conversationId, parent.id, true);
	}
	function prev() {
		const id = siblings.value[index.value - 1];
		if (id) goto(id);
	}
	function next() {
		const id = siblings.value[index.value + 1];
		if (id) goto(id);
	}
	function create() {
		const value = container.value;
		if (!value?.previousContainer) return null;
		const parent = store.containers
			.get(value.conversationId)
			?.get(value.previousContainer);
		if (!parent) return null;
		const branch = createContainer({
			conversationId: value.conversationId,
			role: value.role,
			previousContainer: value.previousContainer,
		});
		addContainer(branch);
		parent.availableNextContainer.push(branch.id);
		parent.activeNextContainer = branch.id;
		markContainerDirty(value.conversationId, parent.id, true);
		const conversation = [...store.conversationMeta.values()]
			.map((items) => items.get(value.conversationId))
			.find(Boolean);
		if (conversation) {
			conversation.lastContainerId = branch.id;
			conversation.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: conversation.id });
		}
		markContainerDirty(value.conversationId, branch.id, true);
		return branch;
	}
	return {
		index,
		count,
		canPrev,
		canNext,
		canCreate,
		goto,
		prev,
		next,
		create,
	};
}
