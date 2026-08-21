<script setup lang="ts">
import { MessageScroller, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { onMounted, toRef, watch } from "vue";
import { useConversation } from "@/features/Conversation/use-conversation";
import ChatBubble from "./ChatBubble.vue";

const props = defineProps<{ chatId: string }>();
const conversation = useConversation(toRef(props, "chatId"));
const { activePath, messageOf } = conversation;
onMounted(() => { void conversation.ensureLoaded(); });
watch(() => props.chatId, () => { void conversation.ensureLoaded(); });
</script>

<template>
  <MessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
    <MessageScroller class="absolute inset-0 min-h-0 min-w-0">
      <MessageScrollerViewport>
        <MessageScrollerContent class="gap-4">
          <div class="mx-auto flex min-h-full w-full max-w-[724px] flex-col justify-end px-4 pb-48 pt-5 mobile:px-3 mobile:pb-44">
            <MessageScrollerItem v-for="container in activePath" :key="container.id" :message-id="container.id" :scroll-anchor="container.role === 'user'">
              <ChatBubble :container="container" :message="messageOf(container)" />
            </MessageScrollerItem>
          </div>
        </MessageScrollerContent>
      </MessageScrollerViewport>
    </MessageScroller>
  </MessageScrollerProvider>
</template>
