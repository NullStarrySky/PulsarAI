<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import { PanelLeft, PanelRight, PanelTop } from "lucide-vue-next";
import { Button } from "@/components/fluid";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
	cleanupAppLifetimeChats,
	createChat,
	loadChat,
	loadChatsForLocalPlugin,
} from "@/features/Conversation/chats/chat-service";
import ChatComposer from "@/features/Conversation/composer/ChatComposer.vue";
import ConversationHeader from "@/features/Conversation/header/ConversationHeader.vue";
import ChatThread from "@/features/Conversation/messages/ChatThread.vue";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import AskUserComponent from "@/features/Plugin/agent/components/AskUserComponent.vue";
import PluginAssetTreePanel from "@/features/Plugin/tree/PluginAssetTreePanel.vue";
import PluginFileEditorDialog from "@/features/Plugin/tree/PluginFileEditorDialog.vue";
import {
	bringToFront as bringEditorToFront,
	closeFile as closeEditorFile,
	locateRequest,
	openFile as openEditorFile,
	openFiles,
} from "@/features/Plugin/tree/file-editor-manager";
import { initializeWorlds } from "@/features/Plugin/tree/world-store";
import { providePluginWorldScope } from "@/features/Plugin/runtime/file-composables";
import type { WorldFileNode } from "@/features/Plugin/tree/world-types";
import PluginSlotComponents from "../panels/PluginSlotComponents.vue";
import { usePanelEnvironment } from "../panels/panel-environment";

const props = defineProps<{ chatId?: string }>();
const emit = defineEmits<{ "update:chatId": [chatId: string] }>();
const ready = ref(false);
const localPluginId = ref("");
const localChatId = ref("");
const localPlugins = useLocalPluginStore();
const assetPanelOpen = ref(false);

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
const leftPanelOpen = ref(false);
const rightPanelOpen = ref(false);
const topPanelOpen = ref(true);
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
    <main v-else-if="ready && chatId" class="relative flex min-h-0 flex-1 overflow-hidden">
      <aside class="hidden min-h-0 w-72 shrink-0 overflow-auto border-r bg-muted/15 p-2 md:block">
        <PluginSlotComponents slot-id="panel-left" :direction="leftPanelDirection" />
      </aside>
      <section class="relative flex min-w-0 flex-1 flex-col">
        <div v-if="topPanelOpen" class="shrink-0 border-b bg-muted/10 p-2"><PluginSlotComponents slot-id="panel-top" direction="horizontal" /></div>
        <Button class="absolute left-2 top-2 z-10 hidden md:flex" variant="ghost" size="icon-sm" title="折叠顶部面板" @click="topPanelOpen = !topPanelOpen"><PanelTop class="size-4" /></Button>
        <div class="min-h-0 flex-1"><ChatThread :key="chatId" :chat-id="chatId"><template #messageAction="slotProps"><slot name="messageAction" v-bind="slotProps" /></template></ChatThread></div>
        <ChatComposer :key="chatId" :chat-id="chatId" />
        <Transition name="asset-panel"><PluginAssetTreePanel v-if="assetPanelOpen" :local-plugin-id="localPluginId" :conversation-id="chatId" @select="openPluginFile" @close="assetPanelOpen = false" /></Transition>
      </section>
      <aside class="hidden min-h-0 w-72 shrink-0 overflow-auto border-l bg-muted/15 p-2 md:block">
        <PluginSlotComponents slot-id="panel-right" :direction="rightPanelDirection" />
      </aside>
      <div class="absolute bottom-3 left-3 z-20 flex gap-1 md:hidden">
        <Button size="icon-sm" variant="secondary" title="左侧面板" @click="leftPanelOpen = true"><PanelLeft class="size-4" /></Button>
        <Button size="icon-sm" variant="secondary" title="顶部面板" @click="topPanelOpen = !topPanelOpen"><PanelTop class="size-4" /></Button>
        <Button size="icon-sm" variant="secondary" title="右侧面板" @click="rightPanelOpen = true"><PanelRight class="size-4" /></Button>
      </div>
      <Sheet v-model:open="leftPanelOpen"><SheetContent side="left" class="w-[min(22rem,88vw)] p-4"><PluginSlotComponents slot-id="panel-left" :direction="leftPanelDirection" /></SheetContent></Sheet>
      <Sheet v-model:open="rightPanelOpen"><SheetContent side="right" class="w-[min(22rem,88vw)] p-4"><PluginSlotComponents slot-id="panel-right" :direction="rightPanelDirection" /></SheetContent></Sheet>
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
