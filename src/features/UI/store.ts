import { push } from "notivue";
import { defineStore } from "pinia";
import { nextTick, ref, watch } from "vue";
import { isConversationGenerating } from "@/features/Conversation/dataflow/conversations";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	builtInSettingPages,
	type UISettingPage,
} from "@/features/Environment/setting/pages";
import { host } from "@/host";
import { popOutTarget } from "./subWindow/sub-window-service";

export type Page = { type: "home" } | { type: "conversation"; id: string };

/** Window-local UI state. Electron owns the cross-window conversation list. */
export const useUIStore = defineStore("ui", () => {
	const page = ref<Page>({ type: "home" });
	const settingsOpen = ref(false);
	const settingsSidebarOpen = ref(true);
	const settingsSearch = ref("");
	const settingsPageId = ref("");
	const settingsTabId = ref("");
	const immersiveConversation = ref(false);
	const settingPages = ref<UISettingPage[]>(builtInSettingPages);
	const sync = useSyncStore();
	const deferredUnloads = new Map<string, () => void>();
	let pendingSwitch = Promise.resolve(false);

	function switchPage(next: Page): Promise<boolean> {
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
				if (next.type === "conversation") {
					deferredUnloads.get(next.id)?.();
					deferredUnloads.delete(next.id);
					await sync.load({ type: "conversation", id: next.id });
					const conversation = [...sync.conversationMeta.values()]
						.map((list) => list.get(next.id))
						.find(Boolean);
					if (!conversation) throw new Error(`会话不存在：${next.id}`);
					await sync.load({ type: "plugin", id: conversation.localPluginId });
				}
				page.value = next;
				await nextTick();
				if (previous.type === "conversation") {
					const generating = isConversationGenerating(previous.id);
					if (generating.value) {
						const stop = watch(generating, async (active) => {
							if (active) return;
							stop();
							deferredUnloads.delete(previous.id);
							if (
								page.value.type === "conversation" &&
								page.value.id === previous.id
							)
								return;
							await sync.unload({ type: "conversation", id: previous.id });
							await host.desktop?.window.releaseConversation(previous.id);
						});
						deferredUnloads.set(previous.id, stop);
					} else {
						await sync.unload({ type: "conversation", id: previous.id });
						await host.desktop?.window.releaseConversation(previous.id);
					}
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
		if (
			previous.type === "conversation" &&
			previous.id === id &&
			isConversationGenerating(id).value
		) {
			push.info("会话生成完成后才能移至新窗口。");
			return false;
		}
		try {
			if (previous.type === "conversation" && previous.id === id)
				await switchPage({ type: "home" });
			await sync._sync();
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

	function registerSettingPage(settingPage: UISettingPage) {
		const index = settingPages.value.findIndex(
			(item) => item.meta.id === settingPage.meta.id,
		);
		if (index < 0) settingPages.value.push(settingPage);
		else settingPages.value[index] = settingPage;
	}

	return {
		page,
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
