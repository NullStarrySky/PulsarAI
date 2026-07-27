import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { defineStore } from "pinia";
import { remove } from "@/features/Database/application/database-service";
import {
  compareVersionVectors,
  getLocalDeviceId,
  markLocalDatabaseChange,
  mergeEntitySyncMeta,
  readSyncMetadata,
  syncEntityKey,
  withRemoteDatabaseWrites,
  writeSyncMetadata,
  type EntitySyncMeta,
} from "@/features/Database/application/sync-metadata";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import type {
  CharacterPackage,
  ChatMessage,
  ChatMessageContainer,
  Conversation,
} from "@/features/Resources/Conversation/domain/conversation-types";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import type {
  Plugin,
  PluginResource,
  PluginResourceContainer,
} from "@/features/Resources/Plugin/domain/plugin-types";

export type BackupInterval = "off" | "10m" | "30m" | "1h" | "6h" | "1d" | "1w";
export type BackupLimit = "3" | "5" | "10" | "20" | "50" | "unlimited";
export type RestorableResourceType = "package" | "conversation" | "plugin";

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

export interface LanSyncSettings {
  enabled: boolean;
  port: number;
  pairingKey: string;
  peerAddress: string;
  deviceName: string;
}

export interface BackupResourceSnapshot {
  packages: CharacterPackage[];
  conversations: Conversation[];
  containers: ChatMessageContainer[];
  plugins: Plugin[];
}

export interface RestorableResource {
  key: string;
  id: string;
  type: RestorableResourceType;
  name: string;
  packageId: string | null;
}

export interface LanSyncSnapshot extends BackupResourceSnapshot {
  protocolVersion: 1;
  deviceId: string;
  deviceName: string;
  createdAt: string;
  metadata: Record<string, EntitySyncMeta>;
}

interface LanSyncStatus {
  running: boolean;
  port?: number;
}

const storageKey = "pulsarai:version-management-settings:v1";
const legacyStorageKey = "pulsarai:backup-settings:v1";
const syncHistoryKey = "pulsar:sync:peer-history:v1";
const packageTable = "resource_packages";
const conversationTable = "resource_conversations";
const containerTable = "resource_message_containers";
const pluginTable = "resource_plugins";
let pendingTimer: number | undefined;

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

function clonePlain<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function valuesEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function uniqueRestoredName(name: string, existing: Iterable<string>) {
  const names = new Set(existing);
  const base = `${name}（从备份恢复）`;
  if (!names.has(base)) {
    return base;
  }
  let suffix = 2;
  while (names.has(`${base} ${suffix}`)) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
}

function unionIds(local: string[] = [], remote: string[] = []) {
  return [...new Set([...local, ...remote])];
}

function entityRelation(
  local: unknown,
  remote: unknown,
  localMeta?: EntitySyncMeta,
  remoteMeta?: EntitySyncMeta,
) {
  const relation = compareVersionVectors(localMeta?.vector, remoteMeta?.vector);
  return relation === "equal" && !valuesEqual(local, remote) ? "concurrent" : relation;
}

function mergeMessageVersions(local: ChatMessage[], remote: ChatMessage[]) {
  const result = local.map(clonePlain);
  for (const remoteMessage of remote) {
    const match = result.find((message) => message.id === remoteMessage.id);
    if (!match) {
      result.push(clonePlain(remoteMessage));
    } else if (!valuesEqual(match, remoteMessage)) {
      result.push({
        ...clonePlain(remoteMessage),
        id: crypto.randomUUID(),
      });
    }
  }
  return result;
}

function mergeContainer(local: ChatMessageContainer, remote: ChatMessageContainer) {
  return {
    ...clonePlain(local),
    content: mergeMessageVersions(local.content, remote.content),
    availableNextContainer: unionIds(
      local.availableNextContainer,
      remote.availableNextContainer,
    ),
  };
}

function mergePluginResource(
  local: PluginResource,
  remote: PluginResource,
  names: Iterable<string>,
) {
  if (valuesEqual(local, remote)) {
    return [clonePlain(local)];
  }
  return [
    clonePlain(local),
    {
      ...clonePlain(remote),
      id: crypto.randomUUID(),
      name: uniqueRestoredName(remote.name, names),
      order: Math.max(local.order ?? 0, remote.order ?? 0) + 1,
    },
  ];
}

function mergePluginContainer(
  local: PluginResourceContainer,
  remote: PluginResourceContainer,
) {
  const resources = local.resources.map(clonePlain);
  for (const remoteResource of remote.resources) {
    const index = resources.findIndex((resource) => resource.id === remoteResource.id);
    if (index < 0) {
      resources.push(clonePlain(remoteResource));
      continue;
    }
    const merged = mergePluginResource(
      resources[index],
      remoteResource,
      resources.map((resource) => resource.name),
    );
    resources.splice(index, 1, ...merged);
  }
  return {
    ...clonePlain(local),
    resources,
  };
}

function mergePlugin(local: Plugin, remote: Plugin) {
  const resources = local.resources.map(clonePlain);
  for (const remoteContainer of remote.resources) {
    const index = resources.findIndex((container) => container.id === remoteContainer.id);
    if (index < 0) {
      resources.push(clonePlain(remoteContainer));
    } else {
      resources[index] = mergePluginContainer(resources[index], remoteContainer);
    }
  }
  return {
    ...clonePlain(local),
    resources,
  };
}

function syncableSnapshot(
  conversation: ReturnType<typeof useConversationStore>,
  plugin: ReturnType<typeof usePluginStore>,
  deviceName: string,
): LanSyncSnapshot {
  const packageIds = new Set(
    conversation.packages
      .filter((item) => item.syncEnabled !== false)
      .map((item) => item.id),
  );
  const conversations = conversation.conversations.filter((item) => packageIds.has(item.packageId));
  const conversationIds = new Set(conversations.map((item) => item.id));
  const containers = conversation.containers.filter((item) =>
    conversationIds.has(item.conversationid),
  );
  const plugins = plugin.plugins.filter(
    (item) => !item.builtIn && (item.packageId === null || packageIds.has(item.packageId)),
  );
  const currentMetadata = readSyncMetadata().entities;
  const entities = [
    ...conversation.packages
      .filter((item) => packageIds.has(item.id))
      .map((value) => ({ table: packageTable, id: value.id, value })),
    ...conversations.map((value) => ({ table: conversationTable, id: value.id, value })),
    ...containers.map((value) => ({ table: containerTable, id: value.id, value })),
    ...plugins.map((value) => ({ table: pluginTable, id: value.id, value })),
  ];
  for (const entity of entities) {
    if (!currentMetadata[syncEntityKey(entity.table, entity.id)]) {
      markLocalDatabaseChange(entity.table, entity.id, false, entity.value);
    }
  }
  const metadata = readSyncMetadata().entities;
  const includedKeys = new Set([
    ...[...packageIds].map((id) => syncEntityKey(packageTable, id)),
    ...conversations.map((item) => syncEntityKey(conversationTable, item.id)),
    ...containers.map((item) => syncEntityKey(containerTable, item.id)),
    ...plugins.map((item) => syncEntityKey(pluginTable, item.id)),
  ]);
  const includedConversationIds = new Set(conversations.map((item) => item.id));
  return {
    protocolVersion: 1,
    deviceId: getLocalDeviceId(),
    deviceName,
    createdAt: new Date().toISOString(),
    packages: conversation.packages.filter((item) => packageIds.has(item.id)).map(clonePlain),
    conversations: conversations.map(clonePlain),
    containers: containers.map(clonePlain),
    plugins: plugins.map(clonePlain),
    metadata: Object.fromEntries(
      Object.entries(metadata).filter(([key, value]) => {
        if (includedKeys.has(key)) {
          return true;
        }
        if (!value.deleted || value.syncable === false) {
          return false;
        }
        if (key.startsWith(`${packageTable}:`)) {
          return true;
        }
        return (
          value.scopePackageId === null
          || Boolean(value.scopePackageId && packageIds.has(value.scopePackageId))
          || Boolean(
            value.parentConversationId
            && includedConversationIds.has(value.parentConversationId),
          )
        );
      }),
    ),
  };
}

async function persistMergedSnapshot(
  remote: LanSyncSnapshot,
  conversation: ReturnType<typeof useConversationStore>,
  pluginStore: ReturnType<typeof usePluginStore>,
) {
  const metadata = readSyncMetadata();
  let copied = 0;
  let merged = 0;

  await withRemoteDatabaseWrites(async () => {
    for (const [key, remoteMeta] of Object.entries(remote.metadata)) {
      if (!remoteMeta.deleted) {
        continue;
      }
      const localMeta = metadata.entities[key];
      const relation = compareVersionVectors(localMeta?.vector, remoteMeta.vector);
      if (relation !== "remote-newer") {
        metadata.entities[key] = mergeEntitySyncMeta(localMeta, remoteMeta);
        continue;
      }
      const separator = key.indexOf(":");
      const table = key.slice(0, separator);
      const id = key.slice(separator + 1);
      if (table === packageTable && conversation.packages.some((item) => item.id === id)) {
        await conversation.deletePackage(id);
      } else if (
        table === conversationTable
        && conversation.conversations.some((item) => item.id === id)
      ) {
        await conversation.deleteConversation(id);
      } else if (
        table === containerTable
        && conversation.containers.some((item) => item.id === id)
      ) {
        conversation.containers = conversation.containers.filter((item) => item.id !== id);
        await remove(containerTable, id);
      } else if (
        table === pluginTable
        && pluginStore.plugins.some((item) => item.id === id && !item.builtIn)
      ) {
        await pluginStore.deletePlugin(id);
      }
      metadata.entities[key] = clonePlain(remoteMeta);
      copied += 1;
    }

    for (const remotePackage of remote.packages) {
      const local = conversation.packages.find((item) => item.id === remotePackage.id);
      const key = syncEntityKey(packageTable, remotePackage.id);
      const relation = entityRelation(
        local,
        remotePackage,
        metadata.entities[key],
        remote.metadata[key],
      );
      if (!local) {
        conversation.packages.push({ ...clonePlain(remotePackage), syncEnabled: true });
        await conversation.persistPackage(remotePackage);
        copied += 1;
      } else if (relation === "remote-newer") {
        Object.assign(local, clonePlain(remotePackage), { syncEnabled: local.syncEnabled ?? true });
        await conversation.persistPackage(local);
        copied += 1;
      } else if (relation === "concurrent" && !valuesEqual(local, remotePackage)) {
        local.conversations = [
          ...local.conversations,
          ...remotePackage.conversations.filter(
            (link) => !local.conversations.some((item) => item.id === link.id),
          ),
        ];
        local.globalPluginOrder = unionIds(
          local.globalPluginOrder,
          remotePackage.globalPluginOrder,
        );
        await conversation.persistPackage(local);
        merged += 1;
      }
      metadata.entities[key] = mergeEntitySyncMeta(
        metadata.entities[key],
        remote.metadata[key],
      );
    }

    for (const remoteConversation of remote.conversations) {
      if (!conversation.packages.some((item) => item.id === remoteConversation.packageId)) {
        continue;
      }
      const local = conversation.conversations.find((item) => item.id === remoteConversation.id);
      const key = syncEntityKey(conversationTable, remoteConversation.id);
      const relation = entityRelation(
        local,
        remoteConversation,
        metadata.entities[key],
        remote.metadata[key],
      );
      if (!local) {
        conversation.conversations.push(clonePlain(remoteConversation));
        await conversation.persistConversation(remoteConversation);
        const parent = conversation.packages.find(
          (item) => item.id === remoteConversation.packageId,
        );
        if (parent && !parent.conversations.some((link) => link.id === remoteConversation.id)) {
          parent.conversations.push({
            id: remoteConversation.id,
            lastContainerid: remoteConversation.lastContainerId ?? "",
            title: remoteConversation.title,
          });
          await conversation.persistPackage(parent);
        }
        copied += 1;
      } else if (relation === "remote-newer") {
        Object.assign(local, clonePlain(remoteConversation));
        await conversation.persistConversation(local);
        copied += 1;
      } else if (relation === "concurrent" && !valuesEqual(local, remoteConversation)) {
        if (remoteConversation.updatedAt > local.updatedAt) {
          Object.assign(local, clonePlain(remoteConversation));
        }
        await conversation.persistConversation(local);
        merged += 1;
      }
      metadata.entities[key] = mergeEntitySyncMeta(
        metadata.entities[key],
        remote.metadata[key],
      );
    }

    for (const remoteContainer of remote.containers) {
      if (!conversation.conversations.some((item) => item.id === remoteContainer.conversationid)) {
        continue;
      }
      const local = conversation.containers.find((item) => item.id === remoteContainer.id);
      const key = syncEntityKey(containerTable, remoteContainer.id);
      const relation = entityRelation(
        local,
        remoteContainer,
        metadata.entities[key],
        remote.metadata[key],
      );
      if (!local) {
        conversation.containers.push(clonePlain(remoteContainer));
        await conversation.persistContainer(remoteContainer);
        copied += 1;
      } else if (relation === "remote-newer") {
        Object.assign(local, clonePlain(remoteContainer));
        await conversation.persistContainer(local);
        copied += 1;
      } else if (relation === "concurrent" && !valuesEqual(local, remoteContainer)) {
        Object.assign(local, mergeContainer(local, remoteContainer));
        await conversation.persistContainer(local);
        merged += 1;
      }
      metadata.entities[key] = mergeEntitySyncMeta(
        metadata.entities[key],
        remote.metadata[key],
      );
    }

    for (const remotePlugin of remote.plugins) {
      if (
        remotePlugin.packageId !== null
        && !conversation.packages.some((item) => item.id === remotePlugin.packageId)
      ) {
        continue;
      }
      const local = pluginStore.plugins.find((item) => item.id === remotePlugin.id);
      const key = syncEntityKey(pluginTable, remotePlugin.id);
      const relation = entityRelation(
        local,
        remotePlugin,
        metadata.entities[key],
        remote.metadata[key],
      );
      if (!local) {
        pluginStore.plugins.push(clonePlain(remotePlugin));
        await pluginStore.persistPlugin(remotePlugin);
        copied += 1;
      } else if (relation === "remote-newer") {
        Object.assign(local, clonePlain(remotePlugin));
        await pluginStore.persistPlugin(local);
        copied += 1;
      } else if (relation === "concurrent" && !valuesEqual(local, remotePlugin)) {
        Object.assign(local, mergePlugin(local, remotePlugin));
        await pluginStore.persistPlugin(local);
        merged += 1;
      }
      metadata.entities[key] = mergeEntitySyncMeta(
        metadata.entities[key],
        remote.metadata[key],
      );
    }
  });

  writeSyncMetadata(metadata);
  return { copied, merged };
}

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
    lan: {
      enabled: false,
      port: 17321,
      pairingKey: "",
      peerAddress: "",
      deviceName: "Pulsar 设备",
    } as LanSyncSettings,
    backups: [] as BackupInfo[],
    backupResources: null as BackupResourceSnapshot | null,
    selectedResourceKeys: [] as string[],
    lastSyncByDevice: {} as Record<string, string>,
    status: "",
    loadingResources: false,
    syncing: false,
    serverRunning: false,
    loaded: false,
  }),
  getters: {
    restorableResources(state): RestorableResource[] {
      if (!state.backupResources) {
        return [];
      }
      const resources: RestorableResource[] = [];
      for (const item of state.backupResources.packages) {
        resources.push({
          key: `package:${item.id}`,
          id: item.id,
          type: "package",
          name: item.name,
          packageId: item.id,
        });
      }
      for (const item of state.backupResources.conversations) {
        resources.push({
          key: `conversation:${item.id}`,
          id: item.id,
          type: "conversation",
          name: item.title,
          packageId: item.packageId,
        });
      }
      for (const item of state.backupResources.plugins.filter((plugin) => !plugin.builtIn)) {
        resources.push({
          key: `plugin:${item.id}`,
          id: item.id,
          type: "plugin",
          name: item.name,
          packageId: item.packageId,
        });
      }
      return resources;
    },
  },
  actions: {
    async initialize() {
      if (this.loaded) {
        return;
      }
      const snapshot = readSettings();
      Object.assign(this.local, snapshot.local);
      Object.assign(this.remote, snapshot.remote);
      Object.assign(this.lan, snapshot.lan);
      this.lastSyncByDevice = readSyncHistory();
      this.loaded = true;
      await this.refreshBackups();
      if (this.lan.enabled) {
        await this.startLanServer();
      }
      this.startPendingPoll();
    },
    persist() {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ local: this.local, remote: this.remote, lan: this.lan }),
      );
    },
    updateLocal(patch: Partial<BackupEndpointSettings>) {
      Object.assign(this.local, patch);
      this.persist();
    },
    updateRemote(patch: Partial<RemoteBackupSettings>) {
      Object.assign(this.remote, patch);
      this.persist();
    },
    updateLan(patch: Partial<LanSyncSettings>) {
      Object.assign(this.lan, patch);
      this.persist();
    },
    async setPackageSyncEnabled(packageId: string, enabled: boolean) {
      const conversation = useConversationStore();
      await conversation.initialize();
      await conversation.updatePackage(packageId, { syncEnabled: enabled });
      if (this.serverRunning) {
        await this.publishSnapshot();
      }
    },
    async selectDirectory() {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        this.updateLocal({ directory: selected });
        await this.refreshBackups();
      }
    },
    async refreshBackups() {
      this.backups = await invoke<BackupInfo[]>("backup_list", {
        directory: String(this.local.directory || ""),
      });
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
      this.status = "已设置全量恢复，重启应用后生效";
    },
    async loadBackupResources() {
      if (!this.local.selectedBackup) {
        this.status = "请先选择历史备份";
        return false;
      }
      this.loadingResources = true;
      try {
        this.status = "";
        this.backupResources = await invoke<BackupResourceSnapshot>("backup_read_resources", {
          directory: String(this.local.directory || ""),
          backupId: String(this.local.selectedBackup),
        });
        this.selectedResourceKeys = [];
        return true;
      } catch (error) {
        this.backupResources = null;
        this.status = `无法读取历史备份：${String(error)}`;
        return false;
      } finally {
        this.loadingResources = false;
      }
    },
    toggleResource(key: string, selected: boolean) {
      const keys = new Set(this.selectedResourceKeys);
      if (selected) {
        keys.add(key);
      } else {
        keys.delete(key);
      }
      this.selectedResourceKeys = [...keys];
    },
    async restoreSelectedResources() {
      const source = this.backupResources;
      if (!source || this.selectedResourceKeys.length === 0) {
        this.status = "请选择要恢复的资源";
        return false;
      }

      const conversation = useConversationStore();
      const pluginStore = usePluginStore();
      await Promise.all([conversation.initialize(), pluginStore.initialize()]);
      const selected = new Set(this.selectedResourceKeys);
      const selectedPackageIds = new Set(
        source.packages
          .filter((item) => selected.has(`package:${item.id}`))
          .map((item) => item.id),
      );
      for (const item of this.restorableResources) {
        if (
          item.type !== "package"
          && selected.has(item.key)
          && item.packageId
          && !selectedPackageIds.has(item.packageId)
          && !conversation.packages.some((current) => current.id === item.packageId)
        ) {
          this.status = `无法单独恢复“${item.name}”：当前不存在它所属的角色包`;
          return false;
        }
      }

      const packageIdMap = new Map<string, string>();
      const conversationIdMap = new Map<string, string>();
      const containerIdMap = new Map<string, string>();
      let restored = 0;

      for (const sourcePackage of source.packages.filter((item) => selectedPackageIds.has(item.id))) {
        const collision = conversation.packages.some((item) => item.id === sourcePackage.id);
        const id = collision ? crypto.randomUUID() : sourcePackage.id;
        const item: CharacterPackage = {
          ...clonePlain(sourcePackage),
          id,
          name: collision
            ? uniqueRestoredName(
                sourcePackage.name,
                conversation.packages.map((value) => value.name),
              )
            : sourcePackage.name,
          categoryId: conversation.categories.some(
            (category) => category.id === sourcePackage.categoryId,
          )
            ? sourcePackage.categoryId
            : null,
          conversations: [],
          plugins: [],
          syncEnabled: sourcePackage.syncEnabled ?? true,
          order: Math.max(-1, ...conversation.packages.map((value) => value.order ?? -1)) + 1,
        };
        packageIdMap.set(sourcePackage.id, id);
        conversation.packages.push(item);
        await conversation.persistPackage(item);
        restored += 1;
      }

      const conversationsToRestore = source.conversations.filter(
        (item) =>
          selectedPackageIds.has(item.packageId)
          || selected.has(`conversation:${item.id}`),
      );
      for (const sourceConversation of conversationsToRestore) {
        const packageId = packageIdMap.get(sourceConversation.packageId) ?? sourceConversation.packageId;
        if (!conversation.packages.some((item) => item.id === packageId)) {
          continue;
        }
        const collision = conversation.conversations.some((item) => item.id === sourceConversation.id);
        const id = collision ? crypto.randomUUID() : sourceConversation.id;
        conversationIdMap.set(sourceConversation.id, id);
        const item: Conversation = {
          ...clonePlain(sourceConversation),
          id,
          packageId,
          title: collision
            ? uniqueRestoredName(
                sourceConversation.title,
                conversation.conversations.map((value) => value.title),
              )
            : sourceConversation.title,
          rootContainerId: null,
          lastContainerId: null,
          updatedAt: new Date().toISOString(),
        };
        conversation.conversations.push(item);
        await conversation.persistConversation(item);
        restored += 1;
      }

      const sourceConversationIds = new Set(conversationsToRestore.map((item) => item.id));
      for (const container of source.containers.filter((item) => sourceConversationIds.has(item.conversationid))) {
        containerIdMap.set(
          container.id,
          conversation.containers.some((item) => item.id === container.id)
            ? crypto.randomUUID()
            : container.id,
        );
      }
      for (const sourceContainer of source.containers.filter((item) => sourceConversationIds.has(item.conversationid))) {
        const item: ChatMessageContainer = {
          ...clonePlain(sourceContainer),
          id: containerIdMap.get(sourceContainer.id) ?? sourceContainer.id,
          conversationid:
            conversationIdMap.get(sourceContainer.conversationid) ?? sourceContainer.conversationid,
          previousContainer: sourceContainer.previousContainer
            ? containerIdMap.get(sourceContainer.previousContainer) ?? null
            : null,
          availableNextContainer: sourceContainer.availableNextContainer
            .map((id) => containerIdMap.get(id))
            .filter((id): id is string => Boolean(id)),
          activeNextContainer: sourceContainer.activeNextContainer
            ? containerIdMap.get(sourceContainer.activeNextContainer) ?? null
            : null,
        };
        conversation.containers.push(item);
        await conversation.persistContainer(item);
      }

      for (const sourceConversation of conversationsToRestore) {
        const id = conversationIdMap.get(sourceConversation.id) ?? sourceConversation.id;
        const item = conversation.conversations.find((value) => value.id === id);
        if (!item) {
          continue;
        }
        item.rootContainerId = sourceConversation.rootContainerId
          ? containerIdMap.get(sourceConversation.rootContainerId) ?? null
          : null;
        item.lastContainerId = sourceConversation.lastContainerId
          ? containerIdMap.get(sourceConversation.lastContainerId) ?? null
          : null;
        await conversation.persistConversation(item);
        const parent = conversation.packages.find((value) => value.id === item.packageId);
        if (parent && !parent.conversations.some((link) => link.id === item.id)) {
          parent.conversations.push({
            id: item.id,
            lastContainerid: item.lastContainerId ?? "",
            title: item.title,
          });
          await conversation.persistPackage(parent);
        }
      }

      const pluginsToRestore = source.plugins.filter(
        (item) =>
          !item.builtIn
          && (
            (item.packageId !== null && selectedPackageIds.has(item.packageId))
            || selected.has(`plugin:${item.id}`)
          ),
      );
      for (const sourcePlugin of pluginsToRestore) {
        const packageId = sourcePlugin.packageId
          ? packageIdMap.get(sourcePlugin.packageId) ?? sourcePlugin.packageId
          : null;
        if (packageId && !conversation.packages.some((item) => item.id === packageId)) {
          continue;
        }
        const collision = pluginStore.plugins.some((item) => item.id === sourcePlugin.id);
        const item: Plugin = {
          ...clonePlain(sourcePlugin),
          id: collision ? crypto.randomUUID() : sourcePlugin.id,
          packageId,
          name: collision
            ? uniqueRestoredName(
                sourcePlugin.name,
                pluginStore.plugins.map((value) => value.name),
              )
            : sourcePlugin.name,
          builtIn: false,
          order: Math.max(
            -1,
            ...pluginStore.plugins
              .filter((value) => value.packageId === packageId)
              .map((value) => value.order ?? -1),
          ) + 1,
        };
        pluginStore.plugins.push(item);
        await pluginStore.persistPlugin(item);
        restored += 1;
      }

      await invoke("backup_restore_resource_files", {
        directory: String(this.local.directory || ""),
        backupId: String(this.local.selectedBackup),
      });
      this.status = `已恢复 ${restored} 个资源，原有数据未被覆盖`;
      if (this.serverRunning) {
        await this.publishSnapshot();
      }
      return true;
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
      this.backupResources = null;
      this.persist();
      await this.refreshBackups();
    },
    async createRemoteBackup() {
      this.status = "远程备份连接信息已保存，WebDAV 传输将在后续接入。";
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
    async buildSyncSnapshot() {
      const conversation = useConversationStore();
      const plugin = usePluginStore();
      await Promise.all([conversation.initialize(), plugin.initialize()]);
      return syncableSnapshot(conversation, plugin, this.lan.deviceName);
    },
    async startLanServer() {
      try {
        const snapshot = await this.buildSyncSnapshot();
        const result = await invoke<LanSyncStatus>("lan_sync_start", {
          port: Number(this.lan.port),
          pairingKey: this.lan.pairingKey,
          snapshot,
        });
        this.serverRunning = result.running;
        this.lan.enabled = result.running;
        this.persist();
        this.status = `局域网同步服务已启动，端口 ${result.port ?? this.lan.port}`;
      } catch (error) {
        this.serverRunning = false;
        this.lan.enabled = false;
        this.persist();
        this.status = `无法启动局域网同步：${String(error)}`;
      }
    },
    async stopLanServer() {
      await invoke("lan_sync_stop");
      this.serverRunning = false;
      this.lan.enabled = false;
      this.persist();
      this.status = "局域网同步服务已停止";
    },
    async toggleLanServer(enabled: boolean) {
      if (enabled) {
        await this.startLanServer();
      } else {
        await this.stopLanServer();
      }
    },
    async publishSnapshot() {
      await invoke("lan_sync_publish", { snapshot: await this.buildSyncSnapshot() });
    },
    async syncWithPeer() {
      if (!this.lan.peerAddress.trim()) {
        this.status = "请输入对端设备地址";
        return;
      }
      this.syncing = true;
      try {
        const remote = await invoke<LanSyncSnapshot>("lan_sync_fetch", {
          address: this.lan.peerAddress.trim(),
          pairingKey: this.lan.pairingKey,
        });
        if (remote.protocolVersion !== 1) {
          throw new Error("对端同步协议版本不兼容");
        }
        const conversation = useConversationStore();
        const plugin = usePluginStore();
        await Promise.all([conversation.initialize(), plugin.initialize()]);
        const result = await persistMergedSnapshot(remote, conversation, plugin);
        const mergedSnapshot = await this.buildSyncSnapshot();
        await invoke("lan_sync_push", {
          address: this.lan.peerAddress.trim(),
          pairingKey: this.lan.pairingKey,
          snapshot: mergedSnapshot,
        });
        this.lastSyncByDevice[remote.deviceId] = new Date().toISOString();
        localStorage.setItem(syncHistoryKey, JSON.stringify(this.lastSyncByDevice));
        this.status = `已与 ${remote.deviceName || "对端设备"} 同步：复制 ${result.copied} 项，合并 ${result.merged} 项`;
      } catch (error) {
        this.status = `同步失败：${String(error)}`;
      } finally {
        this.syncing = false;
      }
    },
    startPendingPoll() {
      if (pendingTimer !== undefined) {
        return;
      }
      pendingTimer = window.setInterval(() => {
        void this.applyPendingSnapshots();
      }, 1500);
    },
    async applyPendingSnapshots() {
      if (!this.serverRunning || this.syncing) {
        return;
      }
      const snapshots = await invoke<LanSyncSnapshot[]>("lan_sync_take_pending");
      if (snapshots.length === 0) {
        await this.publishSnapshot();
        return;
      }
      const conversation = useConversationStore();
      const plugin = usePluginStore();
      await Promise.all([conversation.initialize(), plugin.initialize()]);
      for (const snapshot of snapshots) {
        await persistMergedSnapshot(snapshot, conversation, plugin);
        this.lastSyncByDevice[snapshot.deviceId] = new Date().toISOString();
      }
      localStorage.setItem(syncHistoryKey, JSON.stringify(this.lastSyncByDevice));
      await this.publishSnapshot();
      this.status = `已接收 ${snapshots.length} 个局域网同步快照`;
    },
  },
});

function defaultSettings() {
  return {
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
    lan: {
      enabled: false,
      port: 17321,
      pairingKey: crypto.randomUUID().split("-").join("").slice(0, 12),
      peerAddress: "",
      deviceName: "Pulsar 设备",
    } as LanSyncSettings,
  };
}

function readSettings() {
  const fallback = defaultSettings();
  const raw = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      local: { ...fallback.local, ...(parsed.local ?? {}) },
      remote: { ...fallback.remote, ...(parsed.remote ?? {}) },
      lan: { ...fallback.lan, ...(parsed.lan ?? {}) },
    };
  } catch {
    return fallback;
  }
}

function readSyncHistory() {
  try {
    return JSON.parse(localStorage.getItem(syncHistoryKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
