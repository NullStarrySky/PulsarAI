<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Manager from "@/features/Conversation/components/Manager.vue";
import Surface from "@/features/Conversation/components/Surface.vue";
import {
	toggleEditModeAction,
	toggleEditModeEvent,
} from "@/features/Conversation/dataflow/activePathComposable";
import {
	cleanupAppLifetimeConversations,
	initConversationVersions,
	useConversationList,
} from "@/features/Conversation/dataflow/conversations";
import { useSyncStore } from "@/features/Database/dbsync-store";
import AppHeader from "./AppHeader.vue";
import CharacterEntryPage from "./components/CharacterEntryPage.vue";
import { useUIStore } from "./store";

const ui = useUIStore();
const sync = useSyncStore();
const activeConversationId = computed(() =>
	ui.page.type === "conversation" ? ui.page.id : "",
);
const pageTitle = computed(() => {
	if (!activeConversationId.value) return "角色";
	return (
		[...sync.conversationMeta.values()]
			.map((list) => list.get(activeConversationId.value))
			.find(Boolean)?.title ?? "会话"
	);
});
const managerOpen = ref(false);
const managerPluginId = ref("");

async function openCharacter(localPluginId: string) {
	await sync.load({ type: "plugin", id: localPluginId });
	await sync.load({ type: "conversationList", id: localPluginId });
	const conversations = useConversationList(localPluginId);
	const conversation =
		[...conversations.conversations.value].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		)[0] ?? conversations.create();
	await ui.switch({ type: "conversation", id: conversation.id });
}

watch(
	activeConversationId,
	(id) => {
		if (!id) {
			managerOpen.value = false;
			return;
		}
		const conversation = [...sync.conversationMeta.values()]
			.map((list) => list.get(id))
			.find(Boolean);
		if (conversation) managerPluginId.value = conversation.localPluginId;
	},
	{ immediate: true },
);
watch(managerOpen, async (open) => {
	if (open && managerPluginId.value)
		await sync.load({ type: "conversationList", id: managerPluginId.value });
});
onMounted(async () => {
	await Promise.all([sync.init(), initConversationVersions()]);
	await cleanupAppLifetimeConversations();
});
function toggleEditMode() {
	if (activeConversationId.value) toggleEditModeAction();
}
onMounted(() => window.addEventListener(toggleEditModeEvent, toggleEditMode));
onBeforeUnmount(() =>
	window.removeEventListener(toggleEditModeEvent, toggleEditMode),
);

async function afterDelete(id: string) {
	if (activeConversationId.value === id) await ui.switch({ type: "home" });
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-background app-content-surface">
    <AppHeader v-model:manager-open="managerOpen" :title="pageTitle" :has-conversation="Boolean(activeConversationId)" @home="ui.switch({ type: 'home' })" @new-window="ui.openAtNewWindow(activeConversationId)" />
    <div class="relative flex min-h-0 flex-1">
      <Surface v-if="activeConversationId" :key="activeConversationId" class="min-w-0 flex-1" :conversation-id="activeConversationId" />
      <CharacterEntryPage v-else @open="openCharacter" />
      <Manager v-if="managerPluginId" :key="managerPluginId" :local-plugin-id="managerPluginId" :conversation-id="activeConversationId" v-model:open="managerOpen" @select="id => ui.switch({ type: 'conversation', id })" @new-window="ui.openAtNewWindow" @close="afterDelete" />
    </div>
  </section>
</template>
