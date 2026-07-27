import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useBackupStore } from "./application/backup-store";

export const capabilities: CapabilityDefinition = {
  id: "backup",
  title: "版本管理",
  description: "查询本地备份，或创建新的本地备份。恢复与删除不向模型 API 开放。",
  subCaps: {
    all: "全部已开放的版本管理权限",
    read: "读取备份列表",
    create: "创建本地备份",
  },
  api: {
    read: [{
      name: "list",
      signature: "list(): Promise<BackupInfo[]>",
      description: "刷新并返回当前备份目录中的历史版本。",
      example: "await backup.list()",
    }],
    create: [{
      name: "create",
      signature: "create(): Promise<void>",
      description: "使用当前版本管理设置创建本地备份。",
      example: "await backup.create()",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    list: async () => {
      const store = useBackupStore();
      await store.initialize();
      await store.refreshBackups();
      return store.backups;
    },
  } : {}),
  ...(granted.has("create") ? {
    create: () => useBackupStore().createLocalBackup(),
  } : {}),
}));
