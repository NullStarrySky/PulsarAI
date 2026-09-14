<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ChatManager from "@/features/Conversation/components/ChatManager.vue";
import {
	toggleEditModeAction,
	toggleEditModeEvent,
} from "@/features/Conversation/dataflow/activePathComposable";
import {
	cleanupAppLifetimeChats,
	useChatList,
} from "@/features/Conversation/dataflow/chats";
import ConversationSurface from "@/features/Conversation/stage/ConversationSurface.vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import "@/features/Plugin/dataflow";
import CharacterEntryPage from "@/features/Tabs/CharacterEntryPage.vue";
import { useTabsStore } from "@/features/Tabs/store";
import { popOutTarget } from "@/features/Tabs/subWindow/sub-window-service";
import AppHeader from "./AppHeader.vue";

const sync = useSyncStore();
const tabs = useTabsStore();
const activeChatId = computed(() =>
	tabs.activeTab?.type === "chat" ? tabs.activeTab.id : "",
);
const activeTab = computed(() =>
	tabs.views.find((tab) => tab.id === tabs.activeId),
);
const managerOpen = ref(false);
const managerPluginId = ref("");

async function openChat(chatId: string) {
	await tabs.open({ type: "chat", contentid: chatId });
}
function toggleEditMode() {
	if (activeChatId.value) toggleEditModeAction();
}

async function openCharacter(localPluginId: string) {
	const homeId = tabs.activeTab?.type === "home" ? tabs.activeTab.id : null;
	await sync.load({ type: "chatList", id: localPluginId });
	const chats = useChatList(localPluginId);
	const chat =
		[...chats.chats.value].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		)[0] ?? chats.create();
	await openChat(chat.id);
	if (homeId) tabs.close(homeId);
}

function createPage() {
	void tabs.open({ type: "home" });
}
function tabAction(
	id: string,
	action: "close" | "others" | "left" | "right" | "reload" | "popout",
) {
	if (action === "close") return tabs.close(id);
	if (action === "others") return tabs.closeOthers(id);
	if (action === "left") return tabs.closeLeft(id);
	if (action === "right") return tabs.closeRight(id);
	if (action === "reload") return void tabs.reload(id);
	const tab = tabs.views.find((item) => item.id === id);
	if (tab?.type === "chat")
		void popOutTarget(
			{
				type: "resource",
				resourceType: "chat",
				resourceId: id,
				localPluginId: tab.localPluginId,
			},
			tab.name,
		);
}

watch(
	activeTab,
	(tab) => {
		if (tab?.localPluginId) managerPluginId.value = tab.localPluginId;
		else managerOpen.value = false;
	},
	{ immediate: true },
);
watch(managerOpen, async (open) => {
	if (open && managerPluginId.value)
		await sync.load({ type: "chatList", id: managerPluginId.value });
});
onMounted(async () => {
	await sync.init();
	await cleanupAppLifetimeChats();
});
onMounted(() => window.addEventListener(toggleEditModeEvent, toggleEditMode));
onBeforeUnmount(() => {
	window.removeEventListener(toggleEditModeEvent, toggleEditMode);
	for (const tab of [...tabs.tabs]) tabs.close(tab.id);
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-background">
    <AppHeader :tabs="tabs.views" :active-id="tabs.activeId" v-model:manager-open="managerOpen" @activate="tabs.active" @close="tabs.close" @action="tabAction" @reorder="tabs.reorder" @create="createPage" />
    <ConversationSurface v-if="activeChatId" :key="activeChatId" :chat-id="activeChatId" />
    <CharacterEntryPage v-else @open="openCharacter" />
    <ChatManager v-if="managerPluginId" :key="managerPluginId" :local-plugin-id="managerPluginId" :chat-id="activeChatId" v-model:open="managerOpen" @select="openChat" @close="tabs.close" />
  </section>
</template>
