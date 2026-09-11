<script setup lang="ts">
import { computed } from "vue";
import { InputMessage } from "@/components/fluid";
import { useActivePathComposable } from "../dataflow/activePathComposable";

const props = defineProps<{ chatId: string }>();
const conversation = useActivePathComposable(props.chatId);
const disabled = computed(() => !conversation.chat.value);
function send() { conversation.send(); }
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[756px] px-4 pb-4 mobile:px-2 mobile:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    <InputMessage v-model="conversation.draft" :disabled="disabled" class="pointer-events-auto" placeholder="输入消息…" send-label="发送" @send="send" />
  </div>
</template>
