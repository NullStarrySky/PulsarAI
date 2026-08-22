<script setup lang="ts">
import { useVirtualizer } from "@tanstack/vue-virtual";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { computed, ref, toRef, watch, type ComponentPublicInstance } from "vue";
import { useConversation } from "@/features/Conversation/use-conversation";
import { usePackageStore } from "@/features/Package/package-store";
import ChatBubble from "./ChatBubble.vue";

const props = defineProps<{ chatId: string }>();
const conversation = useConversation(toRef(props, "chatId"));
const { activePath, messageOf } = conversation;
const packages = usePackageStore();
const viewport = ref<{ element: HTMLElement | null } | null>(null);
const loadedChatId = ref("");
const visibleContainers = computed(() => activePath.value.filter((item) => !item.hidden && (item.role !== "system" || Boolean(messageOf(item)?.content))));
const virtualizer = useVirtualizer(computed(() => ({
  count: visibleContainers.value.length,
  getScrollElement: () => viewport.value?.element ?? null,
  getItemKey: (index: number) => visibleContainers.value[index]?.id ?? index,
  estimateSize: () => 240,
  overscan: 6,
  anchorTo: "end" as const,
  followOnAppend: true,
  scrollEndThreshold: 80,
})));
const virtualItems = computed(() => virtualizer.value.getVirtualItems());

function measureRow(element: Element | ComponentPublicInstance | null) {
  if (element instanceof Element) virtualizer.value.measureElement(element);
}

async function loadChat(chatId: string) {
  loadedChatId.value = "";
  if (!chatId) return;
  await conversation.ensureLoaded();
  if (props.chatId === chatId) loadedChatId.value = chatId;
}

watch(() => props.chatId, loadChat, { immediate: true });
</script>

<template>
  <MessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
    <MessageScroller class="absolute inset-0 min-h-0 min-w-0">
      <MessageScrollerViewport ref="viewport">
        <MessageScrollerContent :virtual-count="visibleContainers.length" class="gap-0">
          <div class="grid min-h-full w-full grid-cols-[minmax(1rem,1fr)_minmax(0,724px)_minmax(1rem,1fr)] mobile:block">
            <div aria-hidden="true" class="mobile:hidden" />
            <div class="flex min-h-full min-w-0 flex-col justify-end px-4 pb-48 pt-5 mobile:px-3 mobile:pb-44">
              <div v-if="loadedChatId === props.chatId && visibleContainers.length" class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }">
                <div v-for="row in virtualItems" :key="String(row.key)" :ref="measureRow" :data-index="row.index" class="absolute left-0 top-0 w-full pb-4" :style="{ transform: `translateY(${row.start}px)` }">
                  <MessageScrollerItem :message-id="visibleContainers[row.index]!.id" :scroll-anchor="visibleContainers[row.index]!.role === 'user'">
                    <ChatBubble :container="visibleContainers[row.index]!" :message="messageOf(visibleContainers[row.index]!)" />
                  </MessageScrollerItem>
                </div>
              </div>
              <div v-else-if="loadedChatId === props.chatId" class="flex min-h-72 flex-1 flex-col items-center justify-center text-center">
                <div class="flex size-14 items-center justify-center rounded-2xl bg-muted text-xl font-semibold text-muted-foreground">{{ packages.packages.find((item) => item.conversations.some((chat) => chat.id === props.chatId))?.name.slice(0, 1) ?? 'P' }}</div>
                <h1 class="mt-4 text-lg font-medium">开始新的会话</h1>
                <p class="mt-1 max-w-sm text-sm text-muted-foreground">输入一条消息开始。</p>
              </div>
            </div>
            <div aria-hidden="true" class="mobile:hidden" />
          </div>
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton direction="end" />
    </MessageScroller>
  </MessageScrollerProvider>
</template>
