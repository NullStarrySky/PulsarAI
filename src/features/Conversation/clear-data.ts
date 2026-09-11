import { push } from "notivue";
import { resetCharacterData } from "@/features/Database/database-service";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { clearResourceSyncMetadata } from "@/features/Database/sync-metadata";

/** Clear character-owned database records and discard their in-memory mirrors. */
export async function resetCharacterDataAction() {
	if (!window.confirm("清空全部角色包、对话、插件和本地资源，并恢复初始状态？设置、模型连接、密钥和备份不会改动。")) return;
	try {
		useSyncStore().clearAll();
		await resetCharacterData();
		clearResourceSyncMetadata();
		window.location.reload();
	} catch (error) {
		push.error(error instanceof Error ? error.message : "无法清理角色数据。");
	}
}
