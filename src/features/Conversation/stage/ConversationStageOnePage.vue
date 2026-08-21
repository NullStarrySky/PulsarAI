<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { initializeConversation } from "@/features/Conversation/conversation-runtime";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { usePackageStore } from "@/features/Package/package-store";
import ConversationHeader from "@/features/Conversation/header/ConversationHeader.vue";
import ChatThread from "@/features/Conversation/messages/ChatThread.vue";
import ChatComposer from "@/features/Conversation/composer/ChatComposer.vue";
import AskUserComponent from "@/features/Plugin/agent/components/AskUserComponent.vue";

const props = defineProps<{ chatId?: string }>();
const emit = defineEmits<{ "update:chatId": [chatId: string] }>();
const ready = ref(false);
const packageId = ref("");
const localChatId = ref("");
const packages = usePackageStore();
const chats = useChatStore();
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

onMounted(async () => {
  await initializeConversation();
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
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col bg-background">
    <ConversationHeader v-model:package-id="packageId" v-model:chat-id="chatId" />
    <main v-if="ready && chatId" class="relative min-h-0 flex-1"><ChatThread :chat-id="chatId" /><ChatComposer :chat-id="chatId" /></main>
    <AskUserComponent />
  </section>
</template>
