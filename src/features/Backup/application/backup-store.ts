import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { defineStore } from "pinia";

export type BackupInterval = "off" | "10m" | "30m" | "1h" | "6h" | "1d" | "1w";
export type BackupLimit = "3" | "5" | "10" | "20" | "50" | "unlimited";

export interface BackupInfo {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  size: number;
}

export interface BackupEndpointSettings {
  directory: string;
  selectedBackup: string;
  autoInterval: BackupInterval;
  maxBackups: BackupLimit;
}

export interface RemoteBackupSettings {
  username: string;
  password: string;
  address: string;
  path: string;
  selectedBackup: string;
  autoInterval: BackupInterval;
  maxBackups: BackupLimit;
}

const storageKey = "pulsarai:backup-settings:v1";

export const backupIntervalOptions = [
  { value: "off", label: "关闭" },
  { value: "10m", label: "10 分钟" },
  { value: "30m", label: "30 分钟" },
  { value: "1h", label: "1 小时" },
  { value: "6h", label: "6 小时" },
  { value: "1d", label: "1 天" },
  { value: "1w", label: "1 周" },
] as const;

export const backupLimitOptions = [
  { value: "3", label: "3 个" },
  { value: "5", label: "5 个" },
  { value: "10", label: "10 个" },
  { value: "20", label: "20 个" },
  { value: "50", label: "50 个" },
  { value: "unlimited", label: "无限制" },
] as const;

export const useBackupStore = defineStore("backup", {
  state: () => ({
    local: {
      directory: "",
      selectedBackup: "",
      autoInterval: "off",
      maxBackups: "10",
    } as BackupEndpointSettings,
    remote: {
      username: "",
      password: "",
      address: "",
      path: "",
      selectedBackup: "",
      autoInterval: "off",
      maxBackups: "10",
    } as RemoteBackupSettings,
    backups: [] as BackupInfo[],
    status: "",
    loaded: false,
  }),
  actions: {
    async initialize() {
      if (this.loaded) {
        return;
      }
      const snapshot = readSettings();
      Object.assign(this.local, snapshot.local);
      Object.assign(this.remote, snapshot.remote);
      this.loaded = true;
      await this.refreshBackups();
    },
    persist() {
      localStorage.setItem(storageKey, JSON.stringify({ local: this.local, remote: this.remote }));
    },
    updateLocal(patch: Partial<BackupEndpointSettings>) {
      Object.assign(this.local, patch);
      this.persist();
    },
    updateRemote(patch: Partial<RemoteBackupSettings>) {
      Object.assign(this.remote, patch);
      this.persist();
    },
    async selectDirectory() {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        this.updateLocal({ directory: selected });
        await this.refreshBackups();
      }
    },
    async refreshBackups() {
      this.backups = await invoke<BackupInfo[]>("backup_list", { directory: String(this.local.directory || "") });
    },
    async createLocalBackup() {
      const backup = await invoke<BackupInfo>("backup_create", {
        directory: String(this.local.directory || ""),
        maxBackups: String(this.local.maxBackups),
      });
      this.local.selectedBackup = backup.id;
      this.status = `已创建备份：${backup.name}`;
      this.persist();
      await this.refreshBackups();
    },
    async restoreLocalBackup() {
      if (!this.local.selectedBackup) {
        this.status = "请先选择备份文件";
        return;
      }
      await invoke("backup_restore", {
        directory: String(this.local.directory || ""),
        backupId: String(this.local.selectedBackup),
      });
      this.status = "已设置恢复备份，重启应用后生效";
    },
    async deleteLocalBackup() {
      if (!this.local.selectedBackup) {
        return;
      }
      await invoke("backup_delete", {
        directory: String(this.local.directory || ""),
        backupId: String(this.local.selectedBackup),
      });
      this.local.selectedBackup = "";
      this.persist();
      await this.refreshBackups();
    },
    async createRemoteBackup() {
      this.status = "远程备份连接信息已保存，WebDAV 传输将在同步阶段接入。";
      this.persist();
    },
    async restoreRemoteBackup() {
      this.status = "远程恢复将在 WebDAV 传输接入后启用。";
    },
    async deleteRemoteBackup() {
      this.remote.selectedBackup = "";
      this.status = "远程备份选择已清除。";
      this.persist();
    },
  },
});

function readSettings() {
  const fallback = {
    local: {
      directory: "",
      selectedBackup: "",
      autoInterval: "off" as BackupInterval,
      maxBackups: "10" as BackupLimit,
    },
    remote: {
      username: "",
      password: "",
      address: "",
      path: "",
      selectedBackup: "",
      autoInterval: "off" as BackupInterval,
      maxBackups: "10" as BackupLimit,
    },
  };
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return fallback;
  }
  try {
    return {
      local: { ...fallback.local, ...(JSON.parse(raw).local ?? {}) },
      remote: { ...fallback.remote, ...(JSON.parse(raw).remote ?? {}) },
    };
  } catch {
    return fallback;
  }
}
