<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { initializeConversation } from "@/features/Conversation/conversation-runtime";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { usePackageStore } from "@/features/Package/package-store";
import ConversationHeader from "@/features/Conversation/header/ConversationHeader.vue";
import ChatThread from "@/features/Conversation/messages/ChatThread.vue";
import ChatComposer from "@/features/Conversation/composer/ChatComposer.vue";
import AskUserComponent from "@/features/Plugin/agent/components/AskUserComponent.vue";
import PluginAssetTreePanel from "@/features/Plugin/tree/PluginAssetTreePanel.vue";
import PluginFileEditorDialog from "@/features/Plugin/tree/PluginFileEditorDialog.vue";
import PluginManagerPanel from "@/features/Plugin/PluginManagerPanel.vue";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import type { Plugin, PluginFile } from "@/features/Plugin/tree/plugin-types";
import { conversationOverlayPlugins } from "@/features/Conversation/messages/conversation-resource-overlay-service";

const props = defineProps<{ chatId?: string }>();
const emit = defineEmits<{ "update:chatId": [chatId: string] }>();
const ready = ref(false);
const packageId = ref("");
const localChatId = ref("");
const packages = usePackageStore();
const chats = useChatStore();
const plugins = usePluginStore();
const assetPluginId = computed(() => plugins.assetPanelPluginId);
const pluginPanelOpen = ref(false);
const activeEditor = computed(() => plugins.activeEditorState);
const overlayPlugins = computed(() => chatId.value ? conversationOverlayPlugins(chatId.value) : []);
const assetPlugin = computed(() => overlayPlugins.value.find((plugin) => plugin.id === assetPluginId.value) ?? null);
const fileEditorOpen = computed({ get: () => Boolean(activeEditor.value), set: (open: boolean) => { if (!open) plugins.closeFileEditor(); } });
const chatId = computed({
  get: () => props.chatId ?? localChatId.value,
  set: (value: string) => {
    if (props.chatId === undefined) localChatId.value = value;
    else emit("update:chatId", value);
  },
});

watch(chatId, (value) => {
  const chat = chats.chats.find((item) => item.id === value);
  if (chat) packageId.value = chat.packageId;
}, { immediate: true });

watch(assetPluginId, (pluginId) => {
  if (pluginId) pluginPanelOpen.value = false;
});

onMounted(async () => {
  await initializeConversation();
  await plugins.initialize();
  const suppliedChat = chatId.value ? await chats.load(chatId.value) : null;
  if (suppliedChat) {
    packageId.value = suppliedChat.packageId;
    ready.value = true;
    return;
  }
  const firstPackage = packages.sortedPackages[0];
  if (firstPackage) {
    packageId.value = firstPackage.id;
    await chats.loadForPackage(firstPackage.id);
    chatId.value = (chats.chatsForPackage(firstPackage.id)[0] ?? await chats.create({ packageId: firstPackage.id, activate: false })).id;
  }
  ready.value = true;
});

async function selectPackage(nextPackageId: string) {
  if (!nextPackageId) return;
  chatId.value = "";
  packageId.value = nextPackageId;
  await chats.loadForPackage(nextPackageId);
  const nextChat = chats.chatsForPackage(nextPackageId)[0]
    ?? await chats.create({ packageId: nextPackageId, activate: false });
  chatId.value = nextChat.id;
}

function toggleAssets() {
  const local = plugins.sortedPlugins.find((item) => item.packageId === packageId.value);
  if (!local) return;
  plugins.toggleAssetPanel(local.id);
  if (plugins.assetPanelPluginId) pluginPanelOpen.value = false;
}
function togglePluginPanel() { pluginPanelOpen.value = !pluginPanelOpen.value; if (pluginPanelOpen.value) plugins.closeAssetPanel(); }
function openPluginAssets(plugin: Plugin) { pluginPanelOpen.value = false; plugins.openAssetPanel(plugin.id); }
function openPluginFile(value: { plugin: Plugin; file: PluginFile; path: string }) {
  plugins.openFileEditor(value.plugin, value.file, value.path, "preview", {
    conversationId: chatId.value,
    overlayPlugins: overlayPlugins.value,
  });
}
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col bg-background">
    <ConversationHeader v-if="ready && packageId && chatId" :package-id="packageId" v-model:chat-id="chatId" :asset-open="Boolean(assetPluginId)" :plugin-open="pluginPanelOpen" @update:package-id="selectPackage" @toggle-assets="toggleAssets" @toggle-plugin="togglePluginPanel" />
    <main v-if="ready && chatId" class="relative min-h-0 flex-1"><ChatThread :key="chatId" :chat-id="chatId"><template #messageAction="slotProps"><slot name="messageAction" v-bind="slotProps" /></template></ChatThread><ChatComposer :key="chatId" :chat-id="chatId" /><Transition name="asset-panel"><PluginAssetTreePanel v-if="assetPluginId" :plugin-id="assetPluginId" :plugin="assetPlugin" @select="openPluginFile" @close="plugins.closeAssetPanel(assetPluginId ?? undefined)" /></Transition><Transition name="asset-panel"><PluginManagerPanel v-if="pluginPanelOpen" :package-id="packageId" @select="openPluginAssets" @close="pluginPanelOpen = false" /></Transition></main>
    <AskUserComponent />
    <PluginFileEditorDialog :open="fileEditorOpen" :plugin="activeEditor?.plugin ?? null" :file="activeEditor?.file ?? null" :path="activeEditor?.path ?? ''" :initial-mode="activeEditor?.editorMode" :panel-open="Boolean(assetPluginId)" :package-id="packageId" :conversation-id="activeEditor?.conversationId" :overlay-plugins="activeEditor?.overlayPlugins" @update:open="fileEditorOpen = $event" />
  </section>
</template>

<style scoped>
.asset-panel-enter-active, .asset-panel-leave-active { transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease; }
.asset-panel-enter-from, .asset-panel-leave-to { transform: translateX(calc(100% + 1rem)); opacity: 0; }
</style>
