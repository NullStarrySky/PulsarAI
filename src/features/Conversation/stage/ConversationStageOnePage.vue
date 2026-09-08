<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import {
	cleanupAppLifetimeChats,
	createChat,
	loadChat,
	loadChatsForLocalPlugin,
} from "@/features/Conversation/chats/chat-service";
import ChatComposer from "@/features/Conversation/composer/ChatComposer.vue";
import ConversationHeader from "@/features/Conversation/header/ConversationHeader.vue";
import ChatThread from "@/features/Conversation/messages/ChatThread.vue";
import AskUserComponent from "@/features/Plugin/agent/components/AskUserComponent.vue";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import { providePluginWorldScope } from "@/features/Plugin/runtime/file-composables";
import {
	bringToFront as bringEditorToFront,
	closeFile as closeEditorFile,
	locateRequest,
	openFile as openEditorFile,
	openFiles,
} from "@/features/Plugin/tree/file-editor-manager";
import PluginAssetTreePanel from "@/features/Plugin/tree/PluginAssetTreePanel.vue";
import PluginFileEditorDialog from "@/features/Plugin/tree/PluginFileEditorDialog.vue";
import { initializeWorlds } from "@/features/Plugin/tree/world-store";
import type { WorldFileNode } from "@/features/Plugin/tree/world-types";
import { Button } from "@/components/fluid";
import { PanelLeft, X } from "lucide-vue-next";
import PluginSlotComponents from "../panels/PluginSlotComponents.vue";
import { usePanelEnvironment } from "../panels/panel-environment";

const props = defineProps<{ chatId?: string }>();
const emit = defineEmits<{ "update:chatId": [chatId: string] }>();
const ready = ref(false);
const localPluginId = ref("");
const localChatId = ref("");
const localPlugins = useLocalPluginStore();
const assetPanelOpen = ref(false);
const leftPanelOpen = ref(false);

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
const devExperimentOpen = ref(false);
const DevStImportExperiment = import.meta.env.DEV
	? defineAsyncComponent(() => import("@/features/Migrations/SillyTavern/import/DevStImportExperiment.vue"))
	: null;
const { left: leftPanelDirection, right: rightPanelDirection } = usePanelEnvironment();
const conversationWorldScope = computed(() => ({ localPluginId: localPluginId.value, conversationId: chatId.value, applyReplay: true }));
providePluginWorldScope(conversationWorldScope);

watch(locateRequest, (req) => {
	if (req) assetPanelOpen.value = true;
});

const chatId = computed({
	get: () => props.chatId ?? localChatId.value,
	set: (value: string) => {
		if (props.chatId === undefined) localChatId.value = value;
		else emit("update:chatId", value);
	},
});

watch(
	chatId,
	async (value) => {
		if (!value) return;
		const chat = await loadChat(value);
		if (chat) localPluginId.value = chat.localPluginId;
	},
	{ immediate: true },
);

onMounted(async () => {
	// Session storage survives renderer reloads; a child window is never a start.
	if (isMainConversationStartup()) {
		await cleanupAppLifetimeChats();
	}
	await localPlugins.refresh();
	const suppliedChat = chatId.value ? await loadChat(chatId.value) : null;
	if (suppliedChat) {
		localPluginId.value = suppliedChat.localPluginId;
		await initializeWorlds(localPluginId.value);
		ready.value = true;
		return;
	}
	const firstPlugin = localPlugins.localPlugins[0] ?? (await localPlugins.create());
	if (firstPlugin) {
		localPluginId.value = firstPlugin.id;
		const pkgChats = await loadChatsForLocalPlugin(firstPlugin.id);
		const targetChat =
			pkgChats[0] ?? (await createChat({ localPluginId: firstPlugin.id }));
		chatId.value = targetChat.id;
		await initializeWorlds(firstPlugin.id);
	}
	ready.value = true;
});

async function selectLocalPlugin(nextLocalPluginId: string) {
	if (!nextLocalPluginId) return;
	chatId.value = "";
	localPluginId.value = nextLocalPluginId;
	await initializeWorlds(nextLocalPluginId);
	const pkgChats = await loadChatsForLocalPlugin(nextLocalPluginId);
	const nextChat =
		pkgChats[0] ?? (await createChat({ localPluginId: nextLocalPluginId }));
	chatId.value = nextChat.id;
}

function toggleAssets() {
	assetPanelOpen.value = !assetPanelOpen.value;
}
function openPluginFile(value: { file: WorldFileNode; path: string }) {
	openEditorFile(value.file, value.path, localPluginId.value, chatId.value);
}
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col bg-background">
    <ConversationHeader v-if="ready && localPluginId && chatId" :local-plugin-id="localPluginId" v-model:chat-id="chatId" :asset-open="assetPanelOpen" :dev-experiment="devExperimentOpen" @update:local-plugin-id="selectLocalPlugin" @toggle-assets="toggleAssets" @toggle-dev-experiment="devExperimentOpen = !devExperimentOpen" />
    <component v-if="devExperimentOpen && DevStImportExperiment" :is="DevStImportExperiment" class="min-h-0 flex-1" />
    <main v-else-if="ready && chatId" class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <!-- 左侧面板（宽屏常驻，窄屏可切换滑出） -->
      <PluginSlotComponents slot-id="panel-left" :direction="leftPanelDirection" class="absolute inset-y-0 left-4 z-10 hidden w-[calc((100%_-_724px)_/_2_-_1rem)] overflow-y-auto py-3 xl:flex" />

      <Button
        v-if="!leftPanelOpen"
        variant="ghost"
        size="icon-sm"
        class="absolute left-2.5 top-2.5 z-20 xl:hidden rounded-lg bg-card/85 border shadow-xs"
        title="打开左侧面板"
        @click="leftPanelOpen = true"
      >
        <PanelLeft class="size-4" />
      </Button>

      <div v-if="leftPanelOpen" class="fixed inset-0 z-30 bg-black/40 xl:hidden" @click="leftPanelOpen = false" />
      <div
        v-if="leftPanelOpen"
        class="absolute inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] flex-col bg-background/95 p-3 shadow-2xl backdrop-blur border-r xl:hidden"
      >
        <div class="flex items-center justify-between pb-2 border-b mb-2">
          <span class="text-xs font-semibold text-foreground">左侧面板组件</span>
          <Button variant="ghost" size="icon-sm" class="size-6 rounded-md" @click="leftPanelOpen = false">
            <X class="size-3.5" />
          </Button>
        </div>
        <PluginSlotComponents slot-id="panel-left" :direction="leftPanelDirection" class="h-full overflow-y-auto" />
      </div>

      <PluginSlotComponents slot-id="panel-right" :direction="rightPanelDirection" class="absolute inset-y-0 right-4 z-10 hidden w-[calc((100%_-_724px)_/_2_-_1rem)] overflow-y-auto py-3 xl:flex" />
      <PluginSlotComponents slot-id="panel-top" direction="horizontal" class="relative z-10 mx-auto w-full max-w-[724px] shrink-0 px-4 pt-2" />
      <section class="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="min-h-0 flex-1"><ChatThread :key="chatId" :chat-id="chatId"><template #messageAction="slotProps"><slot name="messageAction" v-bind="slotProps" /></template></ChatThread></div>
        <ChatComposer :key="chatId" :chat-id="chatId" />
      </section>
      <Transition name="asset-panel"><PluginAssetTreePanel v-if="assetPanelOpen" :local-plugin-id="localPluginId" :conversation-id="chatId" @select="openPluginFile" @close="assetPanelOpen = false" /></Transition>
    </main>
    <AskUserComponent />
    <PluginFileEditorDialog
      v-for="item in openFiles"
      :key="item.path"
      :open="true"
      :file="item.file"
      :path="item.path"
      :local-plugin-id="item.localPluginId || localPluginId"
      :conversation-id="item.conversationId || chatId"
      :z-index="item.zIndex"
      :bounce-key="item.bounceKey"
      :initial-offset="item.initialOffset"
      @update:open="(open) => { if (!open) closeEditorFile(item.path); }"
      @focus="bringEditorToFront(item.path)"
    />
  </section>
</template>

<style scoped>
.asset-panel-enter-active, .asset-panel-leave-active { transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease; }
.asset-panel-enter-from, .asset-panel-leave-to { transform: translateX(calc(-100% - 1rem)); opacity: 0; }
</style>
