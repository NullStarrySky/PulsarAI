import { host } from "@/host";
import { defineStore } from "pinia";
import type {
  CharacterPackage,
  ChatMessage,
  ChatMessageContainer,
  Conversation,
} from "@/features/Conversation/messages/conversation-types";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import { remove } from "@/features/Database/database-service";
import {
  compareVersionVectors,
  type EntitySyncMeta,
  getLocalDeviceId,
  markLocalDatabaseChange,
  mergeEntitySyncMeta,
  readSyncMetadata,
  syncEntityKey,
  withRemoteDatabaseWrites,
  writeSyncMetadata,
} from "@/features/Database/sync-metadata";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import {
  type Plugin,
  type PluginFile,
  pluginParentPath,
} from "@/features/Plugin/tree/plugin-types";

export type BackupInterval = "off" | "10m" | "30m" | "1h" | "6h" | "1d" | "1w";
export type BackupLimit = "3" | "5" | "10" | "20" | "50" | "unlimited";
export type RestorableResourceType = "package" | "conversation" | "plugin";
export type ResourceImportMode = "copy" | "update";

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

export interface ResourceArchivePayload {
  rootType: RestorableResourceType;
  rootId: string;
  snapshot: BackupResourceSnapshot;
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

function pluginItems(store: ReturnType<typeof usePluginStore>) {
  return (store as unknown as { plugins: Plugin[] }).plugins;
}

function setBackupResources(
  target: unknown,
  snapshot: BackupResourceSnapshot | null,
) {
  (
    target as { backupResources: BackupResourceSnapshot | null }
  ).backupResources = snapshot;
}

function valuesEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function valuesEqualWithoutKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  keys: string[],
) {
  const left = clonePlain(a);
  const right = clonePlain(b);
  for (const key of keys) {
    delete left[key];
    delete right[key];
  }
  return valuesEqual(left, right);
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

function remapWorldPluginPath(path: string, pluginIds: Map<string, string>) {
  const match = path.match(/^(?<prefix>@?\/?global\/)(?<pluginId>[^/]+)(?<rest>\/.*)?$/);
  if (!match?.groups) return path;
  return `${match.groups.prefix}${pluginIds.get(match.groups.pluginId) ?? match.groups.pluginId}${match.groups.rest ?? ""}`;
}

function mergeById<T extends { id: string }>(
  local: T[] = [],
  remote: T[] = [],
) {
  const merged = local.map(clonePlain);
  for (const remoteItem of remote) {
    const index = merged.findIndex((item) => item.id === remoteItem.id);
    if (index < 0) {
      merged.push(clonePlain(remoteItem));
    } else {
      merged[index] = { ...merged[index], ...clonePlain(remoteItem) };
    }
  }
  return merged;
}

function countDiffPaths(
  local: unknown,
  remote: unknown,
  path = "$",
  output = new Set<string>(),
) {
  if (JSON.stringify(local) === JSON.stringify(remote)) {
    return output;
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const localById = local.every(hasStableId);
    const remoteById = remote.every(hasStableId);
    if (localById && remoteById) {
      const localMap = new Map(local.map((item) => [item.id, item]));
      const remoteMap = new Map(remote.map((item) => [item.id, item]));
      for (const id of new Set([...localMap.keys(), ...remoteMap.keys()])) {
        countDiffPaths(
          localMap.get(id),
          remoteMap.get(id),
          `${path}[id=${id}]`,
          output,
        );
      }
      return output;
    }
    output.add(path);
    return output;
  }
  if (isPlainRecord(local) && isPlainRecord(remote)) {
    for (const key of new Set([
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      countDiffPaths(local[key], remote[key], `${path}.${key}`, output);
    }
    return output;
  }
  output.add(path);
  return output;
}

function hasStableId(value: unknown): value is { id: string } {
  return isPlainRecord(value) && typeof value.id === "string";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergePackageForUpdate(
  local: CharacterPackage,
  remote: CharacterPackage,
): CharacterPackage {
  return {
    ...clonePlain(local),
    ...clonePlain(remote),
    id: local.id,
    conversations: mergeById(local.conversations, remote.conversations),
    pluginId: remote.pluginId || local.pluginId,
    worldConfig: {
      slots: [...new Map([
        ...clonePlain(local.worldConfig.slots),
        ...clonePlain(remote.worldConfig.slots),
      ].map((slot) => [slot.id, slot])).values()],
      disabled: [...new Set([
        ...clonePlain(local.worldConfig.disabled),
        ...clonePlain(remote.worldConfig.disabled),
      ])],
    },
    syncEnabled: local.syncEnabled ?? remote.syncEnabled ?? true,
  };
}

function entityRelation(
  local: unknown,
  remote: unknown,
  localMeta?: EntitySyncMeta,
  remoteMeta?: EntitySyncMeta,
) {
  const relation = compareVersionVectors(localMeta?.vector, remoteMeta?.vector);
  return relation === "equal" && !valuesEqual(local, remote)
    ? "concurrent"
    : relation;
}

function mergeMessageVersions(local: ChatMessage[], remote: ChatMessage[]) {
  const result = local.map(clonePlain);
  for (const remoteMessage of remote) {
    const match = result.find((message) => message.id === remoteMessage.id);
    if (!match) {
      result.push(clonePlain(remoteMessage));
    } else if (!valuesEqual(match, remoteMessage)) {
      const alreadyPreserved = result.some((message) =>
        valuesEqualWithoutKeys(
          message as unknown as Record<string, unknown>,
          remoteMessage as unknown as Record<string, unknown>,
          ["id"],
        ),
      );
      if (alreadyPreserved) {
        continue;
      }
      result.push({
        ...clonePlain(remoteMessage),
        id: crypto.randomUUID(),
      });
    }
  }
  return result;
}

function mergeContainer(
  local: ChatMessageContainer,
  remote: ChatMessageContainer,
) {
  return {
    ...clonePlain(local),
    content: mergeMessageVersions(local.content, remote.content),
  };
}

function mergePluginNodes(
  local: PluginFile[],
  remote: PluginFile[],
): PluginFile[] {
  const result = local.map(clonePlain);
  const siblingNamesAt = (parentPath: string) =>
    result
      .filter((node) => pluginParentPath(node.path) === parentPath)
      .map((node) => node.name);
  for (const remoteNode of remote) {
    const existing = result.find((node) => node.path === remoteNode.path);
    if (!existing) {
      result.push(clonePlain(remoteNode));
      continue;
    }
    const alreadyPreserved = result.some(
      (node) =>
        node.path !== remoteNode.path &&
        valuesEqualWithoutKeys(
          node as unknown as Record<string, unknown>,
          remoteNode as unknown as Record<string, unknown>,
          ["id", "name", "treeOrder", "path"],
        ),
    );
    if (alreadyPreserved) {
      continue;
    }
    const parentPath = pluginParentPath(remoteNode.path);
    const name = uniqueRestoredName(
      remoteNode.name,
      siblingNamesAt(parentPath),
    );
    const path = parentPath ? `${parentPath}/${name}` : name;
    result.push({
      ...clonePlain(remoteNode),
      id: crypto.randomUUID(),
      path,
      name,
      treeOrder:
        Math.max(existing.treeOrder ?? 0, remoteNode.treeOrder ?? 0) + 1,
    });
  }
  return result;
}

function mergePlugin(local: Plugin, remote: Plugin) {
  return {
    ...clonePlain(local),
    ...clonePlain(remote),
    id: local.id,
    packageId: local.packageId,
    builtIn: local.builtIn,
    files: mergePluginNodes(local.files, remote.files),
    emptyFolders: [...new Set([...local.emptyFolders, ...remote.emptyFolders])],
  };
}

function safeArchiveFileName(value: string) {
  const sanitized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-");
  return sanitized || "pulsar-resource";
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
  const conversations = conversation.conversations.filter((item) =>
    packageIds.has(item.packageId),
  );
  const conversationIds = new Set(conversations.map((item) => item.id));
  const containers = conversation.containers.filter((item) =>
    conversationIds.has(item.conversationid),
  );
  const plugins = pluginItems(plugin).filter(
    (item) =>
      !item.builtIn &&
      (item.packageId === null || packageIds.has(item.packageId)),
  );
  const currentMetadata = readSyncMetadata().entities;
  const entities = [
    ...conversation.packages
      .filter((item) => packageIds.has(item.id))
      .map((value) => ({ table: packageTable, id: value.id, value })),
    ...conversations.map((value) => ({
      table: conversationTable,
      id: value.id,
      value,
    })),
    ...containers.map((value) => ({
      table: containerTable,
      id: value.id,
      value,
    })),
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
    packages: conversation.packages
      .filter((item) => packageIds.has(item.id))
      .map(clonePlain),
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
          value.scopePackageId === null ||
          Boolean(
            value.scopePackageId && packageIds.has(value.scopePackageId),
          ) ||
          Boolean(
            value.parentConversationId &&
            includedConversationIds.has(value.parentConversationId),
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
      const relation = compareVersionVectors(
        localMeta?.vector,
        remoteMeta.vector,
      );
      if (relation !== "remote-newer") {
        metadata.entities[key] = mergeEntitySyncMeta(localMeta, remoteMeta);
        continue;
      }
      const separator = key.indexOf(":");
      const table = key.slice(0, separator);
      const id = key.slice(separator + 1);
      if (
        table === packageTable &&
        conversation.packages.some((item) => item.id === id)
      ) {
        await conversation.deletePackage(id);
      } else if (
        table === conversationTable &&
        conversation.conversations.some((item) => item.id === id)
      ) {
        await conversation.deleteConversation(id);
      } else if (
        table === containerTable &&
        conversation.containers.some((item) => item.id === id)
      ) {
        conversation.containers = conversation.containers.filter(
          (item) => item.id !== id,
        );
        await remove(containerTable, id);
      } else if (
        table === pluginTable &&
        pluginItems(pluginStore).some((item) => item.id === id && !item.builtIn)
      ) {
        await pluginStore.deletePlugin(id);
      }
      metadata.entities[key] = clonePlain(remoteMeta);
      copied += 1;
    }

    for (const remotePackage of remote.packages) {
      const local = conversation.packages.find(
        (item) => item.id === remotePackage.id,
      );
      const key = syncEntityKey(packageTable, remotePackage.id);
      const relation = entityRelation(
        local,
        remotePackage,
        metadata.entities[key],
        remote.metadata[key],
      );
      if (!local) {
        conversation.packages.push({
          ...clonePlain(remotePackage),
          syncEnabled: true,
        });
        await conversation.persistPackage(remotePackage);
        copied += 1;
      } else if (relation === "remote-newer") {
        Object.assign(local, clonePlain(remotePackage), {
          syncEnabled: local.syncEnabled ?? true,
        });
        await conversation.persistPackage(local);
        copied += 1;
      } else if (
        relation === "concurrent" &&
        !valuesEqual(local, remotePackage)
      ) {
        local.conversations = [
          ...local.conversations,
          ...remotePackage.conversations.filter(
            (link) => !local.conversations.some((item) => item.id === link.id),
          ),
        ];
        local.pluginId = remotePackage.pluginId || local.pluginId;
        local.worldConfig = {
          slots: [...new Map([
            ...local.worldConfig.slots,
            ...remotePackage.worldConfig.slots,
          ].map((slot) => [slot.id, slot])).values()],
          disabled: [...new Set([
            ...local.worldConfig.disabled,
            ...remotePackage.worldConfig.disabled,
          ])],
        };
        await conversation.persistPackage(local);
        merged += 1;
      }
      metadata.entities[key] = mergeEntitySyncMeta(
        metadata.entities[key],
        remote.metadata[key],
      );
    }

    for (const remoteConversation of remote.conversations) {
      if (
        !conversation.packages.some(
          (item) => item.id === remoteConversation.packageId,
        )
      ) {
        continue;
      }
      const local = conversation.conversations.find(
        (item) => item.id === remoteConversation.id,
      );
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
        if (
          parent &&
          !parent.conversations.some(
            (link) => link.id === remoteConversation.id,
          )
        ) {
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
      } else if (
        relation === "concurrent" &&
        !valuesEqual(local, remoteConversation)
      ) {
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
      if (
        !conversation.conversations.some(
          (item) => item.id === remoteContainer.conversationid,
        )
      ) {
        continue;
      }
      const local = conversation.containers.find(
        (item) => item.id === remoteContainer.id,
      );
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
      } else if (
        relation === "concurrent" &&
        !valuesEqual(local, remoteContainer)
      ) {
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
        remotePlugin.packageId !== null &&
        !conversation.packages.some(
          (item) => item.id === remotePlugin.packageId,
        )
      ) {
        continue;
      }
      const local = pluginItems(pluginStore).find(
        (item) => item.id === remotePlugin.id,
      );
      const key = syncEntityKey(pluginTable, remotePlugin.id);
      const relation = entityRelation(
        local,
        remotePlugin,
        metadata.entities[key],
        remote.metadata[key],
      );
      if (!local) {
        pluginItems(pluginStore).push(clonePlain(remotePlugin));
        await pluginStore.persistPlugin(remotePlugin);
        copied += 1;
      } else if (relation === "remote-newer") {
        Object.assign(local, clonePlain(remotePlugin));
        await pluginStore.persistPlugin(local);
        copied += 1;
      } else if (
        relation === "concurrent" &&
        !valuesEqual(local, remotePlugin)
      ) {
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
      const snapshot =
        state.backupResources as unknown as BackupResourceSnapshot;
      const resources: RestorableResource[] = [];
      for (const item of snapshot.packages) {
        resources.push({
          key: `package:${item.id}`,
          id: item.id,
          type: "package",
          name: item.name,
          packageId: item.id,
        });
      }
      for (const item of snapshot.conversations) {
        resources.push({
          key: `conversation:${item.id}`,
          id: item.id,
          type: "conversation",
          name: item.title,
          packageId: item.packageId,
        });
      }
      for (const item of snapshot.plugins.filter((plugin) => !plugin.builtIn)) {
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
        JSON.stringify({
          local: this.local,
          remote: this.remote,
          lan: this.lan,
        }),
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
      const selected = await host.dialog.open({
        directory: true,
        multiple: false,
      });
      if (typeof selected === "string") {
        this.updateLocal({ directory: selected });
        await this.refreshBackups();
      }
    },
    async exportResource(key: string) {
      const [type, id] = key.split(":", 2) as [RestorableResourceType, string];
      if (!id || !["package", "conversation", "plugin"].includes(type)) {
        this.status = "请选择要导出的资源";
        return;
      }
      const conversation = useConversationStore();
      const pluginStore = usePluginStore();
      await Promise.all([conversation.initialize(), pluginStore.initialize()]);

      let name = "pulsar-resource";
      let packages: CharacterPackage[] = [];
      let conversations: Conversation[] = [];
      let containers: ChatMessageContainer[] = [];
      let plugins: Plugin[] = [];

      if (type === "package") {
        const root = conversation.packages.find((item) => item.id === id);
        if (!root) throw new Error("角色包不存在");
        name = root.name;
        packages = [clonePlain(root)];
        conversations = conversation.conversations
          .filter((item) => item.packageId === id)
          .map(clonePlain);
        const conversationIds = new Set(conversations.map((item) => item.id));
        containers = conversation.containers
          .filter((item) => conversationIds.has(item.conversationid))
          .map(clonePlain);
        plugins = pluginItems(pluginStore)
          .filter((item) => !item.builtIn && item.packageId === id)
          .map(clonePlain);
      } else if (type === "conversation") {
        const root = conversation.conversations.find((item) => item.id === id);
        if (!root) throw new Error("会话不存在");
        name = root.title;
        const parent = conversation.packages.find(
          (item) => item.id === root.packageId,
        );
        packages = parent ? [{ ...clonePlain(parent), conversations: [] }] : [];
        conversations = [clonePlain(root)];
        containers = conversation.containers
          .filter((item) => item.conversationid === id)
          .map(clonePlain);
      } else {
        const root = pluginItems(pluginStore).find(
          (item) => item.id === id && !item.builtIn,
        );
        if (!root) throw new Error("插件不存在或不可导出");
        name = root.name;
        const parent = root.packageId
          ? conversation.packages.find((item) => item.id === root.packageId)
          : null;
        packages = parent ? [{ ...clonePlain(parent), conversations: [] }] : [];
        plugins = [clonePlain(root)];
      }

      const path = await host.dialog.save({
        defaultPath: `${safeArchiveFileName(name)}.pulsar-resource.zst`,
        filters: [{ name: "Pulsar 资源归档", extensions: ["zst"] }],
      });
      if (!path) return;

      const payload: ResourceArchivePayload = {
        rootType: type,
        rootId: id,
        snapshot: { packages, conversations, containers, plugins },
      };
      await host.backup.invoke("resource_archive_write", { path, payload });
      this.status = `已导出：${name}`;
    },
    async importResourceArchive(mode: ResourceImportMode) {
      const selected = await host.dialog.open({
        directory: false,
        multiple: false,
        filters: [{ name: "Pulsar 资源归档", extensions: ["zst"] }],
      });
      if (typeof selected !== "string") return false;
      const payload = await host.backup.invoke<ResourceArchivePayload>(
        "resource_archive_read",
        {
          path: selected,
        },
      );
      if (!["package", "conversation", "plugin"].includes(payload.rootType)) {
        throw new Error("资源归档的根类型不受支持");
      }

      const conversation = useConversationStore();
      await conversation.initialize();
      setBackupResources(this, payload.snapshot);
      this.selectedResourceKeys = [`${payload.rootType}:${payload.rootId}`];
      const root = this.restorableResources.find(
        (item) => item.key === `${payload.rootType}:${payload.rootId}`,
      );
      if (
        root?.type !== "package" &&
        root?.packageId &&
        !conversation.packages.some((item) => item.id === root.packageId)
      ) {
        this.selectedResourceKeys.push(`package:${root.packageId}`);
      }
      return this.restoreSelectedResources(mode, selected);
    },
    async refreshBackups() {
      this.backups = await host.backup.invoke<BackupInfo[]>("backup_list", {
        directory: String(this.local.directory || ""),
      });
    },
    async createLocalBackup() {
      const backup = await host.backup.invoke<BackupInfo>("backup_create", {
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
      await host.backup.invoke("backup_restore", {
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
        const snapshot = await host.backup.invoke<BackupResourceSnapshot>(
          "backup_read_resources",
          {
            directory: String(this.local.directory || ""),
            backupId: String(this.local.selectedBackup),
          },
        );
        setBackupResources(this, snapshot);
        this.selectedResourceKeys = [];
        return true;
      } catch (error) {
        setBackupResources(this, null);
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
    async restoreSelectedResources(
      mode: ResourceImportMode = "copy",
      resourceArchivePath = "",
    ) {
      const source = this
        .backupResources as unknown as BackupResourceSnapshot | null;
      if (!source || this.selectedResourceKeys.length === 0) {
        this.status = "请选择要恢复的资源";
        return false;
      }
      if (mode === "update") {
        return this.updateSelectedResources(resourceArchivePath);
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
          item.type !== "package" &&
          selected.has(item.key) &&
          item.packageId &&
          !selectedPackageIds.has(item.packageId) &&
          !conversation.packages.some(
            (current) => current.id === item.packageId,
          )
        ) {
          this.status = `无法单独恢复“${item.name}”：当前不存在它所属的角色包`;
          return false;
        }
      }

      const packageIdMap = new Map<string, string>();
      const conversationIdMap = new Map<string, string>();
      const containerIdMap = new Map<string, string>();
      const pluginsToRestore = source.plugins.filter(
        (item) =>
          !item.builtIn &&
          ((item.packageId !== null &&
            selectedPackageIds.has(item.packageId)) ||
            selected.has(`plugin:${item.id}`)),
      );
      const pluginIdMap = new Map(
        pluginsToRestore.map((item) => [
          item.id,
          pluginItems(pluginStore).some((current) => current.id === item.id)
            ? crypto.randomUUID()
            : item.id,
        ]),
      );
      let restored = 0;

      for (const sourcePackage of source.packages.filter((item) =>
        selectedPackageIds.has(item.id),
      )) {
        const collision = conversation.packages.some(
          (item) => item.id === sourcePackage.id,
        );
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
          pluginId:
            pluginIdMap.get(sourcePackage.pluginId) ?? sourcePackage.pluginId,
          worldConfig: {
            slots: clonePlain(sourcePackage.worldConfig.slots),
            disabled: sourcePackage.worldConfig.disabled.map((path) =>
              remapWorldPluginPath(path, pluginIdMap)),
          },
          syncEnabled: sourcePackage.syncEnabled ?? true,
          order:
            Math.max(
              -1,
              ...conversation.packages.map((value) => value.order ?? -1),
            ) + 1,
        };
        packageIdMap.set(sourcePackage.id, id);
        conversation.packages.push(item);
        await conversation.persistPackage(item);
        restored += 1;
      }

      const conversationsToRestore = source.conversations.filter(
        (item) =>
          selectedPackageIds.has(item.packageId) ||
          selected.has(`conversation:${item.id}`),
      );
      for (const sourceConversation of conversationsToRestore) {
        const packageId =
          packageIdMap.get(sourceConversation.packageId) ??
          sourceConversation.packageId;
        if (!conversation.packages.some((item) => item.id === packageId)) {
          continue;
        }
        const collision = conversation.conversations.some(
          (item) => item.id === sourceConversation.id,
        );
        const id = collision ? crypto.randomUUID() : sourceConversation.id;
        conversationIdMap.set(sourceConversation.id, id);
        const item: Conversation = {
          ...clonePlain(sourceConversation),
          id,
          packageId,
          binding: sourceConversation.binding
            ? {
                ...clonePlain(sourceConversation.binding),
                pluginId: sourceConversation.binding.pluginId
                  ? (pluginIdMap.get(sourceConversation.binding.pluginId) ??
                    sourceConversation.binding.pluginId)
                  : undefined,
                resourceId:
                  pluginIdMap.get(sourceConversation.binding.resourceId) ??
                  packageIdMap.get(sourceConversation.binding.resourceId) ??
                  sourceConversation.binding.resourceId,
              }
            : undefined,
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

      const sourceConversationIds = new Set(
        conversationsToRestore.map((item) => item.id),
      );
      for (const container of source.containers.filter((item) =>
        sourceConversationIds.has(item.conversationid),
      )) {
        containerIdMap.set(
          container.id,
          conversation.containers.some((item) => item.id === container.id)
            ? crypto.randomUUID()
            : container.id,
        );
      }
      for (const sourceContainer of source.containers.filter((item) =>
        sourceConversationIds.has(item.conversationid),
      )) {
        const item: ChatMessageContainer = {
          ...clonePlain(sourceContainer),
          id: containerIdMap.get(sourceContainer.id) ?? sourceContainer.id,
          conversationid:
            conversationIdMap.get(sourceContainer.conversationid) ??
            sourceContainer.conversationid,
          previousContainer: sourceContainer.previousContainer
            ? (containerIdMap.get(sourceContainer.previousContainer) ?? null)
            : null,
          activeNextContainer: sourceContainer.activeNextContainer
            ? (containerIdMap.get(sourceContainer.activeNextContainer) ?? null)
            : null,
          content: sourceContainer.content.map((message) => ({
            ...clonePlain(message),
            parts: message.parts?.map((part) =>
              part.type === "action"
                ? {
                    ...clonePlain(part),
                    pluginId: pluginIdMap.get(part.pluginId) ?? part.pluginId,
                  }
                : clonePlain(part),
            ),
          })),
        };
        conversation.containers.push(item);
        await conversation.persistContainer(item);
      }

      for (const sourceConversation of conversationsToRestore) {
        const id =
          conversationIdMap.get(sourceConversation.id) ?? sourceConversation.id;
        const item = conversation.conversations.find(
          (value) => value.id === id,
        );
        if (!item) {
          continue;
        }
        item.rootContainerId = sourceConversation.rootContainerId
          ? (containerIdMap.get(sourceConversation.rootContainerId) ?? null)
          : null;
        item.lastContainerId = sourceConversation.lastContainerId
          ? (containerIdMap.get(sourceConversation.lastContainerId) ?? null)
          : null;
        await conversation.persistConversation(item);
        const parent = conversation.packages.find(
          (value) => value.id === item.packageId,
        );
        if (
          parent &&
          !parent.conversations.some((link) => link.id === item.id)
        ) {
          parent.conversations.push({
            id: item.id,
            lastContainerid: item.lastContainerId ?? "",
            title: item.title,
          });
          await conversation.persistPackage(parent);
        }
      }

      for (const sourcePlugin of pluginsToRestore) {
        const packageId = sourcePlugin.packageId
          ? (packageIdMap.get(sourcePlugin.packageId) ?? sourcePlugin.packageId)
          : null;
        if (
          packageId &&
          !conversation.packages.some((item) => item.id === packageId)
        ) {
          continue;
        }
        const id = pluginIdMap.get(sourcePlugin.id) ?? sourcePlugin.id;
        const collision = id !== sourcePlugin.id;
        const item: Plugin = {
          ...clonePlain(sourcePlugin),
          id,
          packageId,
          name: collision
            ? uniqueRestoredName(
                sourcePlugin.name,
                pluginItems(pluginStore).map((value) => value.name),
              )
            : sourcePlugin.name,
          builtIn: false,
        };
        pluginItems(pluginStore).push(item);
        await pluginStore.persistPlugin(item);
        const parent = packageId
          ? conversation.packages.find((value) => value.id === packageId)
          : null;
        if (parent) {
          parent.pluginId = item.id;
          await conversation.persistPackage(parent);
        }
        restored += 1;
      }

      if (resourceArchivePath) {
        await host.backup.invoke("resource_archive_restore_files", {
          path: resourceArchivePath,
          overwrite: false,
        });
      } else {
        await host.backup.invoke("backup_restore_resource_files", {
          directory: String(this.local.directory || ""),
          backupId: String(this.local.selectedBackup),
        });
      }
      this.status = `已导入 ${restored} 个资源，原有数据未被覆盖`;
      if (this.serverRunning) {
        await this.publishSnapshot();
      }
      return true;
    },
    async updateSelectedResources(resourceArchivePath = "") {
      const source = this
        .backupResources as unknown as BackupResourceSnapshot | null;
      if (!source || this.selectedResourceKeys.length === 0) {
        this.status = "请选择要更新的资源";
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
      let added = 0;
      let updated = 0;
      let resolvedDiffs = 0;

      for (const incoming of source.packages.filter((item) =>
        selectedPackageIds.has(item.id),
      )) {
        const local = conversation.packages.find(
          (item) => item.id === incoming.id,
        );
        if (!local) {
          const item = {
            ...clonePlain(incoming),
            categoryId: conversation.categories.some(
              (category) => category.id === incoming.categoryId,
            )
              ? incoming.categoryId
              : null,
            syncEnabled: incoming.syncEnabled ?? true,
          };
          conversation.packages.push(item);
          await conversation.persistPackage(item);
          added += 1;
          continue;
        }
        resolvedDiffs += countDiffPaths(local, incoming).size;
        const item = mergePackageForUpdate(local, incoming);
        item.categoryId = conversation.categories.some(
          (category) => category.id === item.categoryId,
        )
          ? item.categoryId
          : local.categoryId;
        Object.assign(local, item);
        await conversation.persistPackage(local);
        updated += 1;
      }

      const conversationsToUpdate = source.conversations.filter(
        (item) =>
          selectedPackageIds.has(item.packageId) ||
          selected.has(`conversation:${item.id}`),
      );
      for (const incoming of conversationsToUpdate) {
        if (
          !conversation.packages.some((item) => item.id === incoming.packageId)
        ) {
          this.status = `无法更新“${incoming.title}”：当前不存在它所属的角色包`;
          return false;
        }
        const local = conversation.conversations.find(
          (item) => item.id === incoming.id,
        );
        if (!local) {
          const item = {
            ...clonePlain(incoming),
          };
          conversation.conversations.push(item);
          await conversation.persistConversation(item);
          added += 1;
        } else {
          resolvedDiffs += countDiffPaths(local, incoming).size;
          Object.assign(local, clonePlain(incoming), {
            id: local.id,
            packageId: local.packageId,
          });
          await conversation.persistConversation(local);
          updated += 1;
        }
      }

      const updatedConversationIds = new Set(
        conversationsToUpdate.map((item) => item.id),
      );
      for (const incoming of source.containers.filter((item) =>
        updatedConversationIds.has(item.conversationid),
      )) {
        const local = conversation.containers.find(
          (item) => item.id === incoming.id,
        );
        if (!local) {
          const item = clonePlain(incoming);
          conversation.containers.push(item);
          await conversation.persistContainer(item);
          added += 1;
          continue;
        }
        resolvedDiffs += countDiffPaths(local, incoming).size;
        Object.assign(local, mergeContainer(local, incoming));
        await conversation.persistContainer(local);
      }

      for (const incoming of conversationsToUpdate) {
        const current = conversation.conversations.find(
          (item) => item.id === incoming.id,
        );
        const parent = conversation.packages.find(
          (item) => item.id === current?.packageId,
        );
        if (!parent || !current) continue;
        const link = parent.conversations.find(
          (item) => item.id === current.id,
        );
        const nextLink = {
          id: current.id,
          lastContainerid: current.lastContainerId ?? "",
          title: current.title,
        };
        if (link) {
          Object.assign(link, nextLink);
        } else {
          parent.conversations.push(nextLink);
        }
        await conversation.persistPackage(parent);
      }

      const pluginsToUpdate = source.plugins.filter(
        (item) =>
          !item.builtIn &&
          ((item.packageId !== null &&
            selectedPackageIds.has(item.packageId)) ||
            selected.has(`plugin:${item.id}`)),
      );
      for (const incoming of pluginsToUpdate) {
        if (
          incoming.packageId &&
          !conversation.packages.some((item) => item.id === incoming.packageId)
        ) {
          this.status = `无法更新“${incoming.name}”：当前不存在它所属的角色包`;
          return false;
        }
        const local = pluginItems(pluginStore).find(
          (item) => item.id === incoming.id,
        );
        let current: Plugin;
        if (!local) {
          const item = { ...clonePlain(incoming), builtIn: false };
          pluginItems(pluginStore).push(item);
          await pluginStore.persistPlugin(item);
          current = item;
          added += 1;
        } else {
          resolvedDiffs += countDiffPaths(local, incoming).size;
          Object.assign(local, mergePlugin(local, incoming));
          await pluginStore.persistPlugin(local);
          current = local;
          updated += 1;
        }
        const parent = current.packageId
          ? conversation.packages.find((item) => item.id === current.packageId)
          : null;
        if (parent) {
          parent.pluginId = current.id;
          await conversation.persistPackage(parent);
        }
      }

      if (resourceArchivePath) {
        await host.backup.invoke("resource_archive_restore_files", {
          path: resourceArchivePath,
          overwrite: true,
        });
      } else {
        await host.backup.invoke("backup_restore_resource_files", {
          directory: String(this.local.directory || ""),
          backupId: String(this.local.selectedBackup),
        });
      }
      this.status = `更新完成：新增 ${added} 项，合并 ${updated} 项，自动解决 ${resolvedDiffs} 处差异`;
      if (this.serverRunning) {
        await this.publishSnapshot();
      }
      return true;
    },
    async deleteLocalBackup() {
      if (!this.local.selectedBackup) {
        return;
      }
      await host.backup.invoke("backup_delete", {
        directory: String(this.local.directory || ""),
        backupId: String(this.local.selectedBackup),
      });
      this.local.selectedBackup = "";
      setBackupResources(this, null);
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
        const result = await host.backup.invoke<LanSyncStatus>(
          "lan_sync_start",
          {
            port: Number(this.lan.port),
            pairingKey: this.lan.pairingKey,
            snapshot,
          },
        );
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
      await host.backup.invoke("lan_sync_stop");
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
      await host.backup.invoke("lan_sync_publish", {
        snapshot: await this.buildSyncSnapshot(),
      });
    },
    async syncWithPeer() {
      if (!this.lan.peerAddress.trim()) {
        this.status = "请输入对端设备地址";
        return;
      }
      this.syncing = true;
      try {
        const remote = await host.backup.invoke<LanSyncSnapshot>(
          "lan_sync_fetch",
          {
            address: this.lan.peerAddress.trim(),
            pairingKey: this.lan.pairingKey,
          },
        );
        if (remote.protocolVersion !== 1) {
          throw new Error("对端同步协议版本不兼容");
        }
        const conversation = useConversationStore();
        const plugin = usePluginStore();
        await Promise.all([conversation.initialize(), plugin.initialize()]);
        const result = await persistMergedSnapshot(
          remote,
          conversation,
          plugin,
        );
        const mergedSnapshot = await this.buildSyncSnapshot();
        await host.backup.invoke("lan_sync_push", {
          address: this.lan.peerAddress.trim(),
          pairingKey: this.lan.pairingKey,
          snapshot: mergedSnapshot,
        });
        this.lastSyncByDevice[remote.deviceId] = new Date().toISOString();
        localStorage.setItem(
          syncHistoryKey,
          JSON.stringify(this.lastSyncByDevice),
        );
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
      const snapshots = await host.backup.invoke<LanSyncSnapshot[]>(
        "lan_sync_take_pending",
      );
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
      localStorage.setItem(
        syncHistoryKey,
        JSON.stringify(this.lastSyncByDevice),
      );
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
  const raw =
    localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);
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
    return JSON.parse(localStorage.getItem(syncHistoryKey) ?? "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}
