<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import ChatComposer from "@/features/Conversation/composer/ChatComposer.vue";
import { initializeConversation } from "@/features/Conversation/conversation-runtime";
import ConversationHeader from "@/features/Conversation/header/ConversationHeader.vue";
import ChatThread from "@/features/Conversation/messages/ChatThread.vue";
import { usePackageStore } from "@/features/Package/package-store";
import AskUserComponent from "@/features/Plugin/agent/components/AskUserComponent.vue";
import PluginAssetTreePanel from "@/features/Plugin/tree/PluginAssetTreePanel.vue";
import PluginFileEditorDialog from "@/features/Plugin/tree/PluginFileEditorDialog.vue";
import { initializeWorlds } from "@/features/Plugin/tree/world-store";
import type { WorldFileNode } from "@/features/Plugin/tree/world-types";

const props = defineProps<{ chatId?: string }>();
const emit = defineEmits<{ "update:chatId": [chatId: string] }>();
const ready = ref(false);
const packageId = ref("");
const localChatId = ref("");
const packages = usePackageStore();
const chats = useChatStore();
const assetPanelOpen = ref(false);
const activeEditor = ref<{ file: WorldFileNode; path: string } | null>(null);
const fileEditorOpen = computed({
	get: () => Boolean(activeEditor.value),
	set: (open: boolean) => {
		if (!open) activeEditor.value = null;
	},
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
	(value) => {
		const chat = chats.chats.find((item) => item.id === value);
		if (chat) packageId.value = chat.packageId;
	},
	{ immediate: true },
);

onMounted(async () => {
	await initializeConversation();
	const suppliedChat = chatId.value ? await chats.load(chatId.value) : null;
	if (suppliedChat) {
		packageId.value = suppliedChat.packageId;
		await initializeWorlds(packageId.value);
		ready.value = true;
		return;
	}
	const firstPackage = packages.sortedPackages[0];
	if (firstPackage) {
		packageId.value = firstPackage.id;
		await chats.loadForPackage(firstPackage.id);
		chatId.value = (
			chats.chatsForPackage(firstPackage.id)[0] ??
			(await chats.create({ packageId: firstPackage.id, activate: false }))
		).id;
		await initializeWorlds(firstPackage.id);
	}
	ready.value = true;
});

async function selectPackage(nextPackageId: string) {
	if (!nextPackageId) return;
	chatId.value = "";
	packageId.value = nextPackageId;
	await initializeWorlds(nextPackageId);
	await chats.loadForPackage(nextPackageId);
	const nextChat =
		chats.chatsForPackage(nextPackageId)[0] ??
		(await chats.create({ packageId: nextPackageId, activate: false }));
	chatId.value = nextChat.id;
}

function toggleAssets() {
	assetPanelOpen.value = !assetPanelOpen.value;
}
function openPluginFile(value: { file: WorldFileNode; path: string }) {
	activeEditor.value = value;
}
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col bg-background">
    <ConversationHeader v-if="ready && packageId && chatId" :package-id="packageId" v-model:chat-id="chatId" :asset-open="assetPanelOpen" @update:package-id="selectPackage" @toggle-assets="toggleAssets" />
    <main v-if="ready && chatId" class="relative min-h-0 flex-1"><ChatThread :key="chatId" :chat-id="chatId"><template #messageAction="slotProps"><slot name="messageAction" v-bind="slotProps" /></template></ChatThread><ChatComposer :key="chatId" :chat-id="chatId" /><Transition name="asset-panel"><PluginAssetTreePanel v-if="assetPanelOpen" :package-id="packageId" :conversation-id="chatId" @select="openPluginFile" @close="assetPanelOpen = false" /></Transition></main>
    <AskUserComponent />
    <PluginFileEditorDialog :open="fileEditorOpen" :file="activeEditor?.file ?? null" :path="activeEditor?.path ?? ''" :package-id="packageId" :conversation-id="chatId" @update:open="fileEditorOpen = $event" />
  </section>
</template>

<style scoped>
.asset-panel-enter-active, .asset-panel-leave-active { transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease; }
.asset-panel-enter-from, .asset-panel-leave-to { transform: translateX(calc(100% + 1rem)); opacity: 0; }
</style>
