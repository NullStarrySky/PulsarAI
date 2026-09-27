import { push } from "notivue";
import { defineStore } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { isConversationGenerating } from "@/features/Conversation/dataflow/conversations";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	builtInSettingPages,
	type UISettingPage,
} from "@/features/Environment/setting/pages";
import { host } from "@/host";
import { popOutTarget } from "./subWindow/sub-window-service";

export type Page = { type: "home" } | { type: "conversation"; id: string };

const SIDEBAR_WIDTH_KEY = "pulsar:sidebar-width";
const RIGHT_SIDEBAR_WIDTH_KEY = "pulsar:right-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;
const CHARACTER_CACHE_SIZE = 10;

function getInitialSidebarWidth(): number {
	try {
		const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
		if (stored) {
			const parsed = Number.parseInt(stored, 10);
			if (!Number.isNaN(parsed)) {
				return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed));
			}
		}
	} catch {}
	return DEFAULT_SIDEBAR_WIDTH;
}

function getInitialRightSidebarWidth(): number {
	try {
		const stored = localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY);
		if (stored) {
			const parsed = Number.parseInt(stored, 10);
			if (!Number.isNaN(parsed)) {
				return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed));
			}
		}
	} catch {}
	return DEFAULT_SIDEBAR_WIDTH;
}

/** Window-local UI state. Electron owns the cross-window conversation list. */
export const useUIStore = defineStore("ui", () => {
	const page = ref<Page>({ type: "home" });
	const leftSidebarOpen = ref(true);
	const sidebarWidth = ref<number>(getInitialSidebarWidth());
	const rightSidebarOpen = ref(false);
	const rightSidebarWidth = ref<number>(getInitialRightSidebarWidth());
	const topBarPinned = ref(true);
	const history = ref<Page[]>([{ type: "home" }]);
	const historyIndex = ref(0);
	const canGoBack = computed(() => historyIndex.value > 0);
	const canGoForward = computed(
		() => historyIndex.value < history.value.length - 1,
	);
	const settingsOpen = ref(false);
	const settingsSidebarOpen = ref(true);
	const settingsSearch = ref("");
	const settingsPageId = ref("");
	const settingsTabId = ref("");
	const immersiveConversation = ref(false);
	const settingPages = ref<UISettingPage[]>(builtInSettingPages);
	const sync = useSyncStore();
	const deferredUnloads = new Map<string, () => void>();
	// Insertion order is the role visit order; chats share their role's entry.
	const cachedCharacters = new Set<string>();
	let pendingSwitch = Promise.resolve(false);

	async function unloadConversation(id: string) {
		await sync.unload({ type: "conversation", id });
		await host.desktop?.window.releaseConversation(id);
	}

	async function visitCharacter(pluginId: string) {
		cachedCharacters.delete(pluginId);
		cachedCharacters.add(pluginId);
		for (const id of sync.conversationMeta.get(pluginId)?.keys() ?? []) {
			deferredUnloads.get(id)?.();
			deferredUnloads.delete(id);
		}
		while (cachedCharacters.size > CHARACTER_CACHE_SIZE) {
			const oldest = cachedCharacters.values().next().value;
			if (oldest === undefined) break;
			for (const id of sync.conversationMeta.get(oldest)?.keys() ?? []) {
				if (isConversationGenerating(id).value) {
					if (deferredUnloads.has(id)) continue;
					const stop = watch(isConversationGenerating(id), (active) => {
						if (active) return;
						stop();
						deferredUnloads.delete(id);
						// Serialize with navigation and recheck after any queued revisit.
						const operation = pendingSwitch.then(async () => {
							if (!cachedCharacters.has(oldest)) await unloadConversation(id);
							return true;
						});
						pendingSwitch = operation.catch((error) => {
							push.error(String(error));
							return false;
						});
					});
					deferredUnloads.set(id, stop);
				} else {
					await unloadConversation(id);
				}
			}
			cachedCharacters.delete(oldest);
		}
	}

	function switchPage(
		next: Page,
		isHistoryNavigation = false,
	): Promise<boolean> {
		const operation = pendingSwitch.then(async () => {
			const previous = page.value;
			if (
				next.type === "conversation" &&
				previous.type === "conversation" &&
				previous.id === next.id
			)
				return true;
			await sync._sync();
			if (
				host.desktop &&
				next.type === "conversation" &&
				!(await host.desktop.window.switchConversation(next.id))
			)
				return false;
			try {
				let nextPluginId: string | undefined;
				if (next.type === "conversation") {
					await sync.load({ type: "conversation", id: next.id });
					const conversation = [...sync.conversationMeta.values()]
						.map((list) => list.get(next.id))
						.find(Boolean);
					if (!conversation) throw new Error(`会话不存在：${next.id}`);
					await sync.load({ type: "plugin", id: conversation.localPluginId });
					nextPluginId = conversation.localPluginId;
				}
				page.value = next;
				if (!isHistoryNavigation) {
					history.value = history.value.slice(0, historyIndex.value + 1);
					history.value.push(next);
					historyIndex.value = history.value.length - 1;
				}
				await nextTick();
				if (nextPluginId) {
					// Failed persistence keeps the old cache alive for a later retry.
					// Do not roll navigation back into an already partially evicted role.
					await visitCharacter(nextPluginId).catch((error) => {
						push.error(String(error));
					});
				}
				return true;
			} catch (error) {
				page.value = previous;
				if (
					next.type === "conversation" &&
					next.id !== (previous.type === "conversation" ? previous.id : null)
				)
					await host.desktop?.window.releaseConversation(next.id);
				throw error;
			}
		});
		pendingSwitch = operation.catch(() => false);
		return operation;
	}

	async function openAtNewWindow(id: string) {
		if (!host.desktop) return false;
		const previous = page.value;
		const title = [...sync.conversationMeta.values()]
			.map((list) => list.get(id))
			.find(Boolean)?.title;
		if (isConversationGenerating(id).value) {
			push.info("会话生成完成后才能移至新窗口。");
			return false;
		}
		try {
			if (previous.type === "conversation" && previous.id === id)
				await switchPage({ type: "home" });
			await sync._sync();
			deferredUnloads.get(id)?.();
			deferredUnloads.delete(id);
			await unloadConversation(id);
			return await popOutTarget(
				{ type: "resource", resourceType: "conversation", resourceId: id },
				title,
			);
		} catch (error) {
			if (
				previous.type === "conversation" &&
				previous.id === id &&
				page.value.type === "home"
			)
				await switchPage(previous);
			throw error;
		}
	}

	async function goBack() {
		if (canGoBack.value) {
			historyIndex.value--;
			const target = history.value[historyIndex.value];
			if (target) return await switchPage(target, true);
		}
		return false;
	}

	async function goForward() {
		if (canGoForward.value) {
			historyIndex.value++;
			const target = history.value[historyIndex.value];
			if (target) return await switchPage(target, true);
		}
		return false;
	}

	function setSidebarWidth(width: number) {
		const clamped = Math.min(
			MAX_SIDEBAR_WIDTH,
			Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)),
		);
		sidebarWidth.value = clamped;
		try {
			localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
		} catch {}
	}

	function setRightSidebarWidth(width: number) {
		const clamped = Math.min(
			MAX_SIDEBAR_WIDTH,
			Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)),
		);
		rightSidebarWidth.value = clamped;
		try {
			localStorage.setItem(RIGHT_SIDEBAR_WIDTH_KEY, String(clamped));
		} catch {}
	}

	function registerSettingPage(settingPage: UISettingPage) {
		const index = settingPages.value.findIndex(
			(item) => item.meta.id === settingPage.meta.id,
		);
		if (index < 0) settingPages.value.push(settingPage);
		else settingPages.value[index] = settingPage;
	}

	return {
		page,
		leftSidebarOpen,
		sidebarWidth,
		setSidebarWidth,
		rightSidebarOpen,
		rightSidebarWidth,
		setRightSidebarWidth,
		topBarPinned,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		settingsOpen,
		settingsSidebarOpen,
		settingsSearch,
		settingsPageId,
		settingsTabId,
		immersiveConversation,
		settingPages,
		switch: switchPage,
		openAtNewWindow,
		registerSettingPage,
	};
});
