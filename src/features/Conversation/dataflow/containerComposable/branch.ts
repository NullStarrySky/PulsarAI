import { computed, unref, type MaybeRef } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { createContainer } from "../message-service";
import type { ChatContainer } from "../types";

/** Chooses or creates the sibling branch for one concrete container. */
export function useContainerBranch(source: MaybeRef<ChatContainer | null | undefined>) {
	const store = useSyncStore();
	const container = computed(() => unref(source));
	const siblings = computed(() => {
		const value = container.value;
		if (!value?.previousContainer) return value ? [value.id] : [];
		const all = [...(store.containers.get(value.conversationid) ?? [])];
		return all.find(item => item.id === value.previousContainer)?.availableNextContainer ?? [value.id];
	});
	const index = computed(() => container.value ? siblings.value.indexOf(container.value.id) : -1);
	const count = computed(() => siblings.value.length);
	const canPrev = computed(() => index.value > 0);
	const canNext = computed(() => index.value >= 0 && index.value < count.value - 1);
	const canCreate = computed(() => Boolean(container.value?.previousContainer));
	function goto(branchId: string) {
		const value = container.value;
		if (!value?.previousContainer || !siblings.value.includes(branchId)) return;
		const all = [...(store.containers.get(value.conversationid) ?? [])];
		const parent = all.find(item => item.id === value.previousContainer);
		let tail = all.find(item => item.id === branchId);
		if (!parent || !tail) return;
		parent.activeNextContainer = branchId;
		const seen = new Set<string>();
		while (tail.activeNextContainer && !seen.has(tail.id)) {
			seen.add(tail.id);
			const next = all.find(item => item.id === tail.activeNextContainer);
			if (!next) break;
			tail = next;
		}
		const chat = [...store.chatMeta.values()].map(items => items.get(value.conversationid)).find(Boolean);
		if (chat) {
			chat.lastContainerId = tail.id;
			chat.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: chat.id });
		}
		store.markDirty({ type: "container", id: parent.id });
	}
	function prev() { const id = siblings.value[index.value - 1]; if (id) goto(id); }
	function next() { const id = siblings.value[index.value + 1]; if (id) goto(id); }
	function create() {
		const value = container.value;
		if (!value?.previousContainer) return null;
		const parent = [...(store.containers.get(value.conversationid) ?? [])].find(item => item.id === value.previousContainer);
		if (!parent) return null;
		const branch = createContainer({ conversationId: value.conversationid, role: value.role, previousContainer: value.previousContainer });
		store.addContainer(branch);
		parent.availableNextContainer.push(branch.id);
		parent.activeNextContainer = branch.id;
		store.markDirty({ type: "container", id: parent.id });
		const chat = [...store.chatMeta.values()].map(items => items.get(value.conversationid)).find(Boolean);
		if (chat) {
			chat.lastContainerId = branch.id;
			chat.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: chat.id });
		}
		store.markDirty({ type: "container", id: branch.id });
		return branch;
	}
	return { index, count, canPrev, canNext, canCreate, goto, prev, next, create };
}
