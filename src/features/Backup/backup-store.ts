import { defineStore } from "pinia";
import { persistChat, selectAllChats } from "@/features/Conversation/chats/chat-service";
import type { Conversation } from "@/features/Conversation/chats/chat-types";
import { selectAllContainers } from "@/features/Conversation/messages/message-service";
import type { ChatMessageContainer } from "@/features/Conversation/messages/message-types";
import { selectAll, upsert } from "@/features/Database/database-service";
import { localPluginWorldDocumentId, worldTable } from "@/features/Plugin/tree/world-persistence";
import { initializeWorlds } from "@/features/Plugin/tree/world-store";
import type { WorldDocument } from "@/features/Plugin/tree/world-types";
import { host } from "@/host";

export type BackupInterval = "off" | "10m" | "30m" | "1h" | "6h" | "1d" | "1w";
export type BackupLimit = "3" | "5" | "10" | "20" | "50" | "unlimited";
export type ResourceImportMode = "copy" | "update";
type RestorableResourceType = "local-plugin" | "conversation";
export interface BackupInfo { id: string; name: string; path: string; createdAt: string; size: number }
export interface BackupEndpointSettings { directory: string; selectedBackup: string; autoInterval: BackupInterval; maxBackups: BackupLimit }
export interface RemoteBackupSettings { username: string; password: string; address: string; path: string; selectedBackup: string; autoInterval: BackupInterval; maxBackups: BackupLimit }
export interface LanSyncSettings { enabled: boolean; port: number; pairingKey: string; peerAddress: string; deviceName: string }
export interface BackupResourceSnapshot { localPlugins: WorldDocument[]; conversations: Conversation[]; containers: ChatMessageContainer[]; worlds: WorldDocument[] }
export interface ResourceArchivePayload { rootType: RestorableResourceType; rootId: string; snapshot: BackupResourceSnapshot }
export interface RestorableResource { key: string; id: string; type: RestorableResourceType; name: string; localPluginId: string | null }
const storageKey = "pulsarai:version-management-settings:v2";
export const backupIntervalOptions = ["off", "10m", "30m", "1h", "6h", "1d", "1w"].map(value => ({ value, label: value === "off" ? "关闭" : value }));
export const backupLimitOptions = ["3", "5", "10", "20", "50", "unlimited"].map(value => ({ value, label: value === "unlimited" ? "无限制" : `${value} 个` }));
function clone<T>(value: T): T { return structuredClone(value); }
function settings() { try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { return {}; } }
function persistentSnapshot(data: BackupResourceSnapshot): BackupResourceSnapshot {
	const conversations = data.conversations.filter(chat => chat.lifetime !== "app");
	const conversationIds = new Set(conversations.map(chat => chat.id));
	return { ...data, conversations, containers: data.containers.filter(container => conversationIds.has(container.conversationid)) };
}
function setBackupResources(target: unknown, data: BackupResourceSnapshot | null) {
	(target as { backupResources: BackupResourceSnapshot | null }).backupResources = data;
}
async function snapshot(): Promise<BackupResourceSnapshot> {
	const worlds = (await selectAll<WorldDocument>(worldTable)).map(row => row.value);
	return persistentSnapshot({ localPlugins: worlds.filter(world => world.id.startsWith("local:")), worlds, conversations: await selectAllChats(), containers: await selectAllContainers() });
}
export const useBackupStore = defineStore("backup", {
	state: () => {
		const saved = settings();
		return { backups: [] as BackupInfo[], status: "", loadingResources: false, syncing: false, serverRunning: false, lastSyncByDevice: {} as Record<string, string>, selectedResourceKeys: [] as string[], backupResources: null as BackupResourceSnapshot | null, local: { directory: saved.local?.directory ?? "", selectedBackup: "", autoInterval: saved.local?.autoInterval ?? "off", maxBackups: saved.local?.maxBackups ?? "10" } as BackupEndpointSettings, remote: { username: "", password: "", address: "", path: "", selectedBackup: "", autoInterval: "off", maxBackups: "10" } as RemoteBackupSettings, lan: { enabled: false, port: 17321, pairingKey: "", peerAddress: "", deviceName: "PulsarAI" } as LanSyncSettings };
	},
	getters: { restorableResources(state): RestorableResource[] { const data = state.backupResources as unknown as BackupResourceSnapshot | null; if (!data) return []; return [...data.localPlugins.map(document => ({ key: `local-plugin:${document.id.slice(6)}`, id: document.id.slice(6), type: "local-plugin" as const, name: String((document.root.children.definition as any)?.content?.name ?? "本地 Plugin"), localPluginId: document.id.slice(6) })), ...data.conversations.map(chat => ({ key: `conversation:${chat.id}`, id: chat.id, type: "conversation" as const, name: chat.title, localPluginId: chat.localPluginId }))]; } },
	actions: {
		persist() { localStorage.setItem(storageKey, JSON.stringify({ local: this.local })); },
		async initialize() { this.backups = await host.backup.invoke<BackupInfo[]>("backup_list", { directory: this.local.directory }); },
		updateLocal(patch: Partial<BackupEndpointSettings>) { Object.assign(this.local, patch); this.persist(); },
		updateLan(patch: Partial<LanSyncSettings>) { Object.assign(this.lan, patch); },
		async selectDirectory() { const path = await host.dialog.open({ title: "选择备份目录", directory: true, multiple: false, properties: ["openDirectory"] }); if (typeof path === "string") this.updateLocal({ directory: path }); },
		async createLocalBackup() { this.backups = await host.backup.invoke<BackupInfo[]>("backup_create", { directory: this.local.directory, maxBackups: this.local.maxBackups }); },
		async restoreLocalBackup() { if (!this.local.selectedBackup) return; await host.backup.invoke("backup_restore", { directory: this.local.directory, backupId: this.local.selectedBackup }); },
		async deleteLocalBackup() { if (!this.local.selectedBackup) return; await host.backup.invoke("backup_delete", { directory: this.local.directory, backupId: this.local.selectedBackup }); await this.initialize(); },
		async loadBackupResources() { if (!this.local.selectedBackup) return false; this.loadingResources = true; try { const data = await host.backup.invoke<BackupResourceSnapshot>("backup_load_resources", { directory: this.local.directory, backupId: this.local.selectedBackup }); setBackupResources(this, persistentSnapshot(data)); this.selectedResourceKeys = []; return Boolean(this.backupResources); } finally { this.loadingResources = false; } },
		toggleResource(key: string, selected: boolean) { this.selectedResourceKeys = selected ? [...new Set([...this.selectedResourceKeys, key])] : this.selectedResourceKeys.filter(item => item !== key); },
		async exportResource(key: string) { const data = await snapshot(); const [type, id] = key.split(":", 2) as [RestorableResourceType, string]; const root = type === "local-plugin" ? data.localPlugins.find(item => item.id === localPluginWorldDocumentId(id)) : data.conversations.find(item => item.id === id); if (!root) throw new Error("资源不存在。"); const localPluginId = type === "local-plugin" ? id : (root as Conversation).localPluginId; const payload: ResourceArchivePayload = { rootType: type, rootId: id, snapshot: { localPlugins: data.localPlugins.filter(item => item.id === localPluginWorldDocumentId(localPluginId)), worlds: data.worlds.filter(item => item.id === "global" || item.id === localPluginWorldDocumentId(localPluginId)), conversations: data.conversations.filter(item => item.localPluginId === localPluginId), containers: data.containers.filter(item => data.conversations.some(chat => chat.id === item.conversationid && chat.localPluginId === localPluginId)) } }; const path = await host.dialog.save({ title: "导出资源", defaultPath: `${id}.pulsar-resource.json` }); if (typeof path === "string") await host.backup.invoke("resource_archive_write", { path, payload }); },
		async importResourceArchive(mode: ResourceImportMode) { const path = await host.dialog.open({ title: "导入资源", directory: false, multiple: false, properties: ["openFile"] }); if (typeof path !== "string") return; const payload = await host.backup.invoke<ResourceArchivePayload>("resource_archive_read", { path }); setBackupResources(this, persistentSnapshot(payload.snapshot)); this.selectedResourceKeys = [`${payload.rootType}:${payload.rootId}`]; await this.restoreSelectedResources(mode); },
		async restoreSelectedResources(_mode: ResourceImportMode) { const source = this.backupResources as unknown as BackupResourceSnapshot | null; if (!source) return false; const data = persistentSnapshot(source); const ids = new Set(this.selectedResourceKeys.filter(key => key.startsWith("local-plugin:")).map(key => key.slice("local-plugin:".length))); for (const document of data.localPlugins.filter(item => ids.has(item.id.slice(6)))) { await upsert(worldTable, document.id, clone(document)); await initializeWorlds(document.id.slice(6)); } for (const chat of data.conversations.filter(item => ids.has(item.localPluginId))) await persistChat(clone(chat)); for (const container of data.containers.filter(item => data.conversations.some(chat => ids.has(chat.localPluginId) && chat.id === item.conversationid))) await upsert("message_containers", container.id, clone(container)); return true; },
		async toggleLanServer(enabled: boolean) { this.serverRunning = enabled; if (enabled) await host.backup.invoke("lan_sync_start", { port: this.lan.port, pairingKey: this.lan.pairingKey }); else await host.backup.invoke("lan_sync_stop"); },
		async publishSnapshot() {},
		async syncWithPeer() { this.status = "本地 Plugin 同步由资源归档执行。"; },
		async setLocalPluginSyncEnabled(_id: string, _enabled: boolean) {},
	},
});
