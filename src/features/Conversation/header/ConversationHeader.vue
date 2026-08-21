<script setup lang="ts">
import PackageManager from "@/features/Package/PackageManager.vue";
import ChatManager from "@/features/Conversation/chats/ChatManager.vue";

const props = defineProps<{ packageId: string; chatId: string }>();
const emit = defineEmits<{ "update:packageId": [value: string]; "update:chatId": [value: string] }>();
</script>

<template>
  <header class="flex h-11 shrink-0 items-center gap-1 border-b bg-background px-2" data-window-drag>
    <PackageManager :package-id="props.packageId" @select="emit('update:packageId', $event)" />
    <ChatManager :package-id="props.packageId" :chat-id="props.chatId" @select="emit('update:chatId', $event)" />
    <div class="flex-1" />
  </header>
</template>
