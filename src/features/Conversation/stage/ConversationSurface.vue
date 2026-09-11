<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import ConversationHeader from "@/features/UI/components/ConversationHeader.vue";
import ChatManager from "../components/ChatManager.vue";
import {
	toggleEditModeEvent,
	useActivePathComposable,
} from "../dataflow/activePathComposable";
import { cleanupAppLifetimeChats, useChatList } from "../dataflow/chats";
import "../dataflow/plugins";
import ChatComposer from "../components/ChatComposer.vue";
import ChatThread from "../components/ChatThread.vue";

const store = useSyncStore();
const localPluginId = ref("");
const chatId = ref("");
const managerOpen = ref(false);
const roles = computed(() => [...store.characters]);
const activeChat = computed(() =>
	chatId.value
		? ([...store.chatMeta.values()]
				.map((list) => list.get(chatId.value))
				.find(Boolean) ?? null)
		: null,
);
let unloadTimer: ReturnType<typeof setTimeout> | undefined;

async function selectChat(id: string) {
	if (!id || id === chatId.value) return;
	const previous = chatId.value;
	chatId.value = id;
	await store.load({ type: "chat", id });
	if (previous) {
		if (unloadTimer) clearTimeout(unloadTimer);
		unloadTimer = setTimeout(() => {
			if (chatId.value !== previous)
				void store.unload({ type: "chat", id: previous });
		}, 300);
	}
}

async function selectRole(id: string) {
	if (!id || id === localPluginId.value) return;
	const previous = localPluginId.value;
	localPluginId.value = id;
	await store.load({ type: "chatList", id });
	const list = useChatList(id);
	const initial =
		[...list.chats.value].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		)[0] ?? list.create();
	await selectChat(initial.id);
	if (previous) void store.unload({ type: "chatList", id: previous });
}

function toggleEditMode() {
	if (chatId.value) useActivePathComposable(chatId.value).editMode.toggle();
}

onMounted(async () => {
	await store.init();
	await cleanupAppLifetimeChats();
	await selectRole(roles.value[0]?.id ?? "");
	window.addEventListener(toggleEditModeEvent, toggleEditMode);
});
onBeforeUnmount(() => {
	if (unloadTimer) clearTimeout(unloadTimer);
	window.removeEventListener(toggleEditModeEvent, toggleEditMode);
	if (chatId.value) void store.unload({ type: "chat", id: chatId.value });
	if (localPluginId.value)
		void store.unload({ type: "chatList", id: localPluginId.value });
});
watch(roles, (values) => {
	if (!localPluginId.value && values[0]) void selectRole(values[0].id);
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-background">
    <ConversationHeader :title="activeChat?.title" v-model:manager-open="managerOpen" />
    <main class="relative flex min-h-0 flex-1 overflow-hidden">
      <section v-if="chatId" class="relative min-w-0 flex-1"><ChatThread :key="chatId" :chat-id="chatId" /><ChatComposer :key="chatId" :chat-id="chatId" /></section>
      <section v-else class="m-auto text-center"><h1 class="text-lg font-medium">尚未选择角色</h1><p class="mt-1 text-sm text-muted-foreground">创建或导入一个角色后即可开始会话。</p></section>
      <ChatManager v-if="localPluginId" :key="localPluginId" :local-plugin-id="localPluginId" :chat-id="chatId" v-model:open="managerOpen" @select="selectChat" />
    </main>
  </section>
</template>
