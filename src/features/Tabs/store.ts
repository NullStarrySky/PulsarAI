import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";

export type Tab = { type: "chat"; id: string };
export type OpenTab = { type: "chat"; contentid: string };
export interface TabView extends Tab {
	name: string;
	icon?: "message-circle";
	localPluginId?: string;
}

function indexOf(tabs: Tab[], target: string | number) {
	return typeof target === "number"
		? target
		: tabs.findIndex((tab) => tab.id === target);
}

/** UI view lifetime only; records remain owned and persisted by dbsync. */
export const useTabsStore = defineStore("tabs", () => {
	const tabs = ref<Tab[]>([]);
	const activeId = ref<string | null>(null);
	const sync = useSyncStore();
	const pendingUnloads = new Map<string, ReturnType<typeof setTimeout>>();
	const activeTab = computed(
		() => tabs.value.find((tab) => tab.id === activeId.value) ?? null,
	);
	const views = computed<TabView[]>(() =>
		tabs.value.map((tab) => {
			const chat = [...sync.chatMeta.values()]
				.map((chats) => chats.get(tab.id))
				.find(Boolean);
			return {
				...tab,
				name: chat?.title ?? "加载中…",
				icon: "message-circle",
				localPluginId: chat?.localPluginId,
			};
		}),
	);

	async function open(input: OpenTab) {
		if (input.type !== "chat") return;
		const id = input.contentid;
		const pending = pendingUnloads.get(id);
		if (pending) {
			clearTimeout(pending);
			pendingUnloads.delete(id);
		}
		await sync.load({ type: "chat", id });
		if (!tabs.value.some((tab) => tab.id === id))
			tabs.value.push({ type: "chat", id });
		activeId.value = id;
	}

	function close(target: string | number) {
		const index = indexOf(tabs.value, target);
		if (index < 0) return;
		const [tab] = tabs.value.splice(index, 1);
		if (!tab) return;
		if (activeId.value === tab.id)
			activeId.value =
				tabs.value[index]?.id ?? tabs.value[index - 1]?.id ?? null;
		pendingUnloads.set(
			tab.id,
			setTimeout(() => {
				pendingUnloads.delete(tab.id);
				if (!tabs.value.some((item) => item.id === tab.id))
					void sync.unload({ type: "chat", id: tab.id });
			}, 300),
		);
	}

	function reorder(fromIndex: number, toIndex: number) {
		if (
			fromIndex < 0 ||
			toIndex < 0 ||
			fromIndex >= tabs.value.length ||
			toIndex >= tabs.value.length ||
			fromIndex === toIndex
		)
			return;
		const [tab] = tabs.value.splice(fromIndex, 1);
		if (tab) tabs.value.splice(toIndex, 0, tab);
	}

	function active(target: string | number) {
		const tab = tabs.value[indexOf(tabs.value, target)];
		if (tab) activeId.value = tab.id;
	}

	return { tabs, activeId, activeTab, views, open, close, reorder, active };
});
