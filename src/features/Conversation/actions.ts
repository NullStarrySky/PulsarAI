import { push } from "notivue";
import { resetCharacterData } from "@/features/Database/database-service";
import { clearResourceSyncMetadata } from "@/features/Database/sync-metadata";

/** Clear only character-owned resources; settings, secrets, and backups remain intact. */
export async function resetCharacterDataAction() {
  const confirmed = window.confirm(
    "清空全部角色包、对话、插件和本地资源，并恢复初始状态？设置、模型连接、密钥和备份不会改动。",
  );
  if (!confirmed) return;

  try {
    await resetCharacterData();
    clearResourceSyncMetadata();
    window.location.reload();
  } catch (error) {
    push.error(error instanceof Error ? error.message : "无法清理角色数据。");
  }
}
