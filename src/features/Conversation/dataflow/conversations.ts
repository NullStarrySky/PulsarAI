import { computed, reactive, shallowReactive, watch } from "vue";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { latestPluginVersion } from "@/features/Plugin/dataflow/plugin-version";
import { host } from "@/host";
import {
	type ConversationGenerationState,
	type ConversationMeta,
	createConversationMeta,
	type PersistedConversationMeta,
} from "./types";

function conversationsForPlugin(pluginId: string) {
	return useSyncStore().conversationMeta.get(pluginId) as
		| Map<string, ConversationMeta>
		| undefined;
}

// 维护反查存储更麻烦，就这样吧
function findConversation(conversationId: string) {
	return [...useSyncStore().conversationMeta.values()]
		.map((list) => list.get(conversationId))
		.find(Boolean);
}

async function loadConversationEnvironment(conversationId: string) {
	const store = useSyncStore();
	if (
		!findConversation(conversationId) ||
		!store.containers.has(conversationId)
	)
		await store.load({ type: "conversation", id: conversationId });
	const conversation = findConversation(conversationId);
	if (conversation && !store.plugins.has(conversation.localPluginId))
		await store.load({ type: "plugin", id: conversation.localPluginId });
}

const conversationPluginVersions = new Map<
	ConversationMeta["id"],
	{
		pluginId: ConversationMeta["localPluginId"];
		versionId: ConversationMeta["pluginVersionId"];
	}
>();
const pluginVersionUses = new Map<
	ConversationMeta["localPluginId"],
	Map<ConversationMeta["pluginVersionId"], number>
>();
let initialized = false;

export function trackConversationPluginVersion(value: ConversationMeta) {
	const previous = conversationPluginVersions.get(value.id);
	if (
		previous?.pluginId === value.localPluginId &&
		previous.versionId === value.pluginVersionId
	)
		return;
	if (previous) {
		const versions = pluginVersionUses.get(previous.pluginId)!;
		const count = versions.get(previous.versionId)! - 1;
		if (count) versions.set(previous.versionId, count);
		else versions.delete(previous.versionId);
	}
	conversationPluginVersions.set(value.id, {
		pluginId: value.localPluginId,
		versionId: value.pluginVersionId,
	});
	const versions = pluginVersionUses.get(value.localPluginId) ?? new Map();
	pluginVersionUses.set(value.localPluginId, versions);
	versions.set(
		value.pluginVersionId,
		(versions.get(value.pluginVersionId) ?? 0) + 1,
	);
}

function untrackConversationPluginVersion(
	conversationId: ConversationMeta["id"],
) {
	const previous = conversationPluginVersions.get(conversationId);
	if (!previous) return;
	conversationPluginVersions.delete(conversationId);
	const versions = pluginVersionUses.get(previous.pluginId)!;
	const count = versions.get(previous.versionId)! - 1;
	if (count) versions.set(previous.versionId, count);
	else versions.delete(previous.versionId);
}

export function isPluginVersionUsed(
	pluginId: ConversationMeta["localPluginId"],
	versionId: ConversationMeta["pluginVersionId"],
) {
	return (pluginVersionUses.get(pluginId)?.get(versionId) ?? 0) > 0;
}

export async function initConversationVersions() {
	if (initialized) return;
	initialized = true;
	try {
		const rows = await useSyncStore().load({
			type: "conversationVersionIndex",
		});
		for (const { value } of rows)
			if (value.localPluginId && value.pluginVersionId)
				trackConversationPluginVersion(value);
	} catch (error) {
		initialized = false;
		throw error;
	}
}

export function addConversation(value: ConversationMeta) {
	for (const message of value.composerDraft.content) message.final ??= true;
	trackConversationPluginVersion(value);
	const store = useSyncStore();
	let list = store.conversationMeta.get(value.localPluginId);
	if (!list) {
		list = shallowReactive(new Map<ConversationMeta["id"], ConversationMeta>());
		store.conversationMeta.set(value.localPluginId, list);
	}
	const conversation = reactive(value) as ConversationMeta;
	list.set(value.id, conversation);
	return conversation;
}

export function removeConversation(conversationId: ConversationMeta["id"]) {
	const store = useSyncStore();
	const conversation = findConversation(conversationId);
	for (const container of store.containers.get(conversationId)?.values() ?? [])
		store.markDirty({ type: "container", id: container.id });
	if (conversation) store.markDirty({ type: "meta", id: conversation.id });
	store.containers.delete(conversationId);
	if (conversation) {
		untrackConversationPluginVersion(conversation.id);
		store.conversationMeta
			.get(conversation.localPluginId)
			?.delete(conversation.id);
	}
}

export function clearConversationCache() {
	conversationPluginVersions.clear();
	pluginVersionUses.clear();
	initialized = false;
}

registerSyncHandler<ConversationMeta, PersistedConversationMeta>("meta", {
	table: "conversations",
	value: findConversation,
	hydrate: addConversation,
	serialize(conversation) {
		const { generation: _generation, ...record } = conversation;
		return record;
	},
});

/** Read only persistent fields, without subscribing to runtime generation. */
export function conversationRecord(
	value: ConversationMeta,
): PersistedConversationMeta {
	return {
		id: value.id,
		localPluginId: value.localPluginId,
		pluginVersionId: value.pluginVersionId,
		title: value.title,
		rootContainerId: value.rootContainerId,
		lastContainerId: value.lastContainerId,
		lastMessagePreview: value.lastMessagePreview,
		composerDraft: value.composerDraft,
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
		lifetime: value.lifetime,
		pinned: value.pinned,
		isTemplate: value.isTemplate,
	};
}

/** A loaded set of a role's conversations. Its actions are the only mutations. */
export function useConversationList(pluginId: string) {
	const store = useSyncStore();
	const conversations = computed(
		() => new Set(conversationsForPlugin(pluginId)?.values() ?? []),
	);
	function create(
		input: Partial<
			Pick<ConversationMeta, "title" | "lifetime" | "isTemplate">
		> = {},
	) {
		const plugin = store.plugins.get(pluginId);
		const version = plugin && latestPluginVersion(plugin);
		if (!version)
			throw new Error(`本地 Plugin 没有可用于会话的版本：${pluginId}`);
		const conversation = createConversationMeta({
			localPluginId: pluginId,
			pluginVersionId: version.id,
			...input,
		});
		addConversation(conversation);
		store.markDirty({ type: "meta", id: conversation.id });
		return conversation;
	}
	function remove(conversationId: string) {
		if (!conversationsForPlugin(pluginId)?.has(conversationId)) return;
		removeConversation(conversationId);
	}
	return { conversations, create, delete: remove };
}

/** Scoped mutable conversation handle. `loadEnvironment` also loads its containers and bound Plugin. */
export function useConversation(
	conversationId: string,
	loadEnvironment = false,
) {
	const store = useSyncStore();
	if (loadEnvironment) void loadConversationEnvironment(conversationId);
	const conversation = computed(() => findConversation(conversationId) ?? null);
	watch(
		() => (conversation.value ? conversationRecord(conversation.value) : null),
		(record) => {
			if (!record || !conversation.value) return;
			trackConversationPluginVersion(conversation.value);
			store.markDirty({ type: "meta", id: conversationId });
		},
		{ deep: true, flush: "sync" },
	);
	return conversation;
}

/** Generation is runtime state; changing it must not cause a persistence write. */
export function setConversationGeneration(
	conversationId: string,
	value?: ConversationGenerationState,
) {
	const conversation = findConversation(conversationId);
	if (conversation) conversation.generation = value;
}

export function isConversationGenerating(conversationId: string) {
	return computed(() => Boolean(findConversation(conversationId)?.generation));
}

/** Removes app-lifetime conversations left by a previous process, including their containers. */
export async function cleanupAppLifetimeConversations() {
	const store = useSyncStore();
	const conversations = (await store.load({ type: "conversationVersionIndex" }))
		.map((record) => record.value)
		.filter((conversation) => conversation.lifetime === "app");
	for (const conversation of conversations) {
		if (await host.desktop?.window.isConversationOpen(conversation.id)) continue;
		await store.load({
			type: "conversationList",
			id: conversation.localPluginId,
		});
		await store.load({ type: "conversation", id: conversation.id });
		removeConversation(conversation.id);
	}
	await store._sync();
	return conversations.length;
}
