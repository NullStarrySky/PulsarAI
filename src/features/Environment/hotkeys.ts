import { push } from "notivue";
import { toggleEditModeAction } from "@/features/Conversation/dataflow/activePathComposable";
import { clearConversationCache } from "@/features/Conversation/dataflow/conversations";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { useUIStore } from "@/features/UI/store";
import { host } from "@/host";

export interface EnvironmentHotkey {
	title: string;
	description?: string;
	action: () => void | Promise<void>;
	keyBinding: string | null;
}

export type EnvironmentHotkeys = Record<string, EnvironmentHotkey>;

async function resetCharacterData() {
	if (
		!window.confirm(
			"清空全部角色包、对话、插件和本地资源，并恢复初始状态？设置、模型连接、密钥和备份不会改动。",
		)
	)
		return;
	try {
		await useSyncStore()._sync();
		await host.database.resetCharacterData();
		useSyncStore().clearAll();
		clearConversationCache();
		window.location.reload();
	} catch (error) {
		push.error(error instanceof Error ? error.message : "无法清理角色数据。");
	}
}

export function createEnvironmentHotkeys(): EnvironmentHotkeys {
	return {
		settings: {
			title: "打开设置",
			description: "打开应用设置。",
			action: () => {
				useUIStore().settingsOpen = true;
			},
			keyBinding: "Ctrl+,",
		},
		toggleEditMode: {
			title: "切换编辑子对话模式",
			description: "插入或关闭内联编辑区间。",
			action: toggleEditModeAction,
			keyBinding: "Ctrl+Shift+E",
		},
		resetCharacterData: {
			title: "清空全部角色数据",
			description: "清空角色包、对话和插件；保留设置、模型和密钥。",
			action: resetCharacterData,
			keyBinding: "Ctrl+Shift+R",
		},
	};
}

export function getHotkeyBindings(hotkeys: EnvironmentHotkeys) {
	return Object.fromEntries(
		Object.entries(hotkeys).map(([id, hotkey]) => [id, hotkey.keyBinding]),
	) as Record<string, string | null>;
}

export function applyHotkeyBindings(
	hotkeys: EnvironmentHotkeys,
	bindings: Record<string, string | null>,
) {
	for (const [id, keyBinding] of Object.entries(bindings)) {
		const hotkey = hotkeys[id];
		if (!hotkey || (typeof keyBinding !== "string" && keyBinding !== null))
			continue;
		hotkey.keyBinding = keyBinding || null;
	}
}
