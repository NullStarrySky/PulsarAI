<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import { cleanupAppLifetimeChats, loadChat } from "../chats/chat-service";
import ConversationHeader from "../header/ConversationHeader.vue";
import ConversationStageOnePage from "../stage/ConversationStageOnePage.vue";
import { providePluginWorldScope } from "@/features/Plugin/runtime/file-composables";
import ConversationTabPicker from "./ConversationTabPicker.vue";
import { useConversationTabs } from "./conversation-tabs";

const tabs = useConversationTabs();
const pickerOpen = ref(false);
const assetToggleToken = ref(0);
const devExperimentOpen = ref(false);
const DevStImportExperiment = import.meta.env.DEV
	? defineAsyncComponent(() => import("@/features/Migrations/SillyTavern/import/DevStImportExperiment.vue"))
	: null;

const activeTab = computed(() =>
	tabs.tabs.value.find((tab) => tab.chatId === tabs.activeChatId.value) ?? null,
);
providePluginWorldScope(computed(() => ({
	localPluginId: activeTab.value?.localPluginId ?? "",
	conversationId: tabs.activeChatId.value,
	applyReplay: true,
})));

function isMainConversationStartup() {
	if (new URLSearchParams(window.location.search).has("subwindow")) return false;
	try {
		const key = "pulsarai:conversation-app-lifetime-cleaned";
		if (sessionStorage.getItem(key)) return false;
		sessionStorage.setItem(key, "1");
		return true;
	} catch {
		return true;
	}
}

onMounted(async () => {
	if (isMainConversationStartup()) await cleanupAppLifetimeChats();
	await tabs.initialize();
	if (!tabs.activeChatId.value) pickerOpen.value = true;
});

watch(
	() => tabs.activeChatId.value,
	(chatId) => {
		if (!chatId) pickerOpen.value = true;
	},
);

async function openChat(chatId: string) {
	await tabs.openChat(chatId);
}

async function renameTab(chatId: string) {
	const chat = await loadChat(chatId);
	if (!chat) return;
	const title = window.prompt("重命名会话", chat.title);
	if (title !== null) await tabs.renameChat(chatId, title);
}

function toggleAssets() {
	assetToggleToken.value += 1;
}

</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-background">
    <ConversationHeader
      :tabs="tabs.tabs.value"
      :active-chat-id="tabs.activeChatId.value"
      :dev-experiment="devExperimentOpen"
      @select-tab="openChat"
      @close-tab="tabs.closeChat"
      @rename-tab="renameTab"
      @open-picker="pickerOpen = true"
      @toggle-assets="toggleAssets"
      @toggle-dev-experiment="devExperimentOpen = !devExperimentOpen"
    />
    <component v-if="devExperimentOpen && DevStImportExperiment" :is="DevStImportExperiment" class="min-h-0 flex-1" />
    <KeepAlive v-else>
      <ConversationStageOnePage
        v-if="tabs.ready.value && tabs.activeChatId.value"
        :key="tabs.activeChatId.value"
        :chat-id="tabs.activeChatId.value"
        :asset-toggle-token="assetToggleToken"
      />
    </KeepAlive>
    <div v-if="tabs.ready.value && !tabs.activeChatId.value" class="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground">选择或新建一个会话</div>
    <ConversationTabPicker :open="pickerOpen" :active-local-plugin-id="activeTab?.localPluginId" @update:open="pickerOpen = $event" @open-chat="openChat" />
  </section>
</template>
