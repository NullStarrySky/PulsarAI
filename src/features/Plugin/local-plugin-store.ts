import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { deleteChatCascade, loadChatsForLocalPlugin } from "@/features/Conversation/chats/chat-service";
import { remove, selectAll } from "@/features/Database/database-service";
import type { WorldDocument, WorldFileNode } from "./tree/world-types";
import { ensureLocalPluginWorldDocument, localPluginWorldDocumentId, worldTable } from "./tree/world-persistence";
import { forgetLocalPluginWorld, initializeWorlds } from "./tree/world-store";

export interface LocalPluginDefinition {
	schemaVersion: number;
	name: string;
	nickname?: string;
	description?: string;
	tags?: string[];
	avatar?: string;
	cover?: string;
}
export interface LocalPluginView extends LocalPluginDefinition { id: string; avatarUrl?: string; coverUrl?: string }
export interface LocalPluginPreference { pinned?: boolean; order?: number; syncEnabled?: boolean; category?: string }
type Preferences = Record<string, LocalPluginPreference>;
const preferenceKey = "pulsarai:local-plugin-preferences:v1";

function preferences(): Preferences {
	try { return typeof localStorage === "undefined" ? {} : JSON.parse(localStorage.getItem(preferenceKey) ?? "{}") as Preferences; } catch { return {}; }
}
function definition(document: WorldDocument): LocalPluginDefinition | null {
	const node = Object.values(document.root.children).find((child): child is WorldFileNode => child.type === "file" && child.name === "definition.package.json");
	if (!node || !node.content || typeof node.content !== "object" || Array.isArray(node.content)) return null;
	const value = node.content as Partial<LocalPluginDefinition>;
	if (value.schemaVersion !== 1 || !value.name?.trim()) return null;
	return { schemaVersion: 1, name: value.name.trim(), ...(value.nickname ? { nickname: value.nickname } : {}), ...(value.description ? { description: value.description } : {}), tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [], ...(value.avatar ? { avatar: value.avatar } : {}), ...(value.cover ? { cover: value.cover } : {}) };
}
function media(document: WorldDocument, name: string) {
	const node = Object.values(document.root.children).find((child): child is WorldFileNode => child.type === "file" && child.name === name);
	return typeof node?.content === "string" && node.content ? node.content : undefined;
}
function compare(a: LocalPluginView, b: LocalPluginView, prefs: Preferences) {
	const ap = prefs[a.id] ?? {}; const bp = prefs[b.id] ?? {};
	return Number(Boolean(bp.pinned)) - Number(Boolean(ap.pinned)) || (ap.order ?? 0) - (bp.order ?? 0) || a.name.localeCompare(b.name, "zh-Hans");
}

/** Character list is a revision-refreshed projection of local Plugin files, never a domain record. */
export const useLocalPluginStore = defineStore("local-plugins", () => {
	const documents = ref<WorldDocument[]>([]);
	const preferenceState = ref<Preferences>(preferences());
	const loaded = ref(false);
	const localPlugins = computed(() => documents.value.flatMap(document => {
		if (!document.id.startsWith("local:")) return [];
		const value = definition(document); if (!value) return [];
		const id = document.id.slice("local:".length);
		return [{ id, ...value, avatarUrl: media(document, "avatar.png"), coverUrl: media(document, "cover.png") }];
	}).sort((a, b) => compare(a, b, preferenceState.value)));
	function savePreferences() { if (typeof localStorage !== "undefined") localStorage.setItem(preferenceKey, JSON.stringify(preferenceState.value)); }
	async function refresh() {
		documents.value = (await selectAll<WorldDocument>(worldTable)).map(record => record.value).filter(document => document.id.startsWith("local:"));
		loaded.value = true;
	}
	async function create(input: Partial<Pick<LocalPluginDefinition, "name" | "nickname" | "description" | "tags">> = {}) {
		const id = crypto.randomUUID();
		const document = await ensureLocalPluginWorldDocument(id);
		const file = document.root.children.definition;
		if (file?.type === "file") file.content = { schemaVersion: 1, name: input.name?.trim() || "新角色", ...(input.nickname ? { nickname: input.nickname } : {}), ...(input.description ? { description: input.description } : {}), tags: input.tags ?? [] };
		await import("@/host").then(({ host }) => host.database.upsert(worldTable, document.id, document));
		await initializeWorlds(id); await refresh(); return localPlugins.value.find(item => item.id === id)!;
	}
	async function updatePreferences(localPluginId: string, patch: LocalPluginPreference) { preferenceState.value = { ...preferenceState.value, [localPluginId]: { ...preferenceState.value[localPluginId], ...patch } }; savePreferences(); }
	async function removeLocalPlugin(localPluginId: string) {
		const chats = await loadChatsForLocalPlugin(localPluginId);
		for (const chat of chats) await deleteChatCascade(chat.id);
		await remove(worldTable, localPluginWorldDocumentId(localPluginId));
		forgetLocalPluginWorld(localPluginId);
		const { [localPluginId]: _, ...rest } = preferenceState.value; preferenceState.value = rest; savePreferences(); await refresh();
	}
	return { loaded, localPlugins, preferences: preferenceState, refresh, create, updatePreferences, removeLocalPlugin };
});
