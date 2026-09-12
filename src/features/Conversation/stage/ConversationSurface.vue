<script setup lang="ts">
import ChatComposer from "../components/ChatComposer.vue";
import ChatThread from "../components/ChatThread.vue";

const props = defineProps<{ chatId: string }>();
</script>

<template>
  <main class="relative h-full min-h-0 overflow-hidden bg-background"><ChatThread :key="props.chatId" :chat-id="props.chatId" /><ChatComposer :key="props.chatId" :chat-id="props.chatId" /></main>
</template>
