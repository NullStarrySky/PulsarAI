import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useBackupStore } from "./application/backup-store";

export const capabilities: CapabilityDefinition = {
  id: "backup",
  title: "版本管理",
  description: "查询本地备份，或创建新的本地备份。恢复与删除不向模型 API 开放。",
  documentation: {
    overview: "面向自动化流程开放低风险的版本查询与增量备份创建操作。灾难恢复、资源归档导入导出、差异合并和删除历史版本仍只能由用户界面发起。",
    notes: [
      "list 会先刷新本地备份目录，再返回最新状态。",
      "create 使用当前设置中的备份目录与保留数量，并将变化文件写入共享的 Zstandard 内容寻址对象库。",
      "旧版目录备份保持可读；新备份的快照目录只保存引用压缩对象的清单。",
    ],
    types: [{
      name: "BackupInfo",
      description: "一个可见本地备份的摘要。",
      definition: `interface BackupInfo {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  size: number;
}`,
    }],
  },
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
