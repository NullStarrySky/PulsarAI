<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ArrowUpRight,
  Bot,
  CircleAlert,
  Settings2,
  Star,
  UserRound,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import type {
  ChatMessage,
  ChatMessageContainer,
  Conversation,
} from "@/features/Resources/Conversation/domain/conversation-types";

interface FavoriteMessageEntry {
  conversation: Conversation;
  container: ChatMessageContainer;
  message: ChatMessage;
  messageIndex: number;
  containerOrder: number;
}

const conversation = useConversationStore();
const layout = useLayoutStore();
const navigatingId = ref("");

const favorites = computed<FavoriteMessageEntry[]>(() => {
  const conversationsById = new Map(
    conversation.conversations.map((item) => [item.id, item]),
  );
  return conversation.containers
    .flatMap((container, containerOrder) => {
      const owner = conversationsById.get(container.conversationid);
      if (!owner) {
        return [];
      }
      return container.content.map((message, messageIndex) => ({
        conversation: owner,
        container,
        message,
        messageIndex,
        containerOrder,
      }));
    })
    .filter(({ message }) => Boolean(message.favorite))
    .sort((left, right) =>
      left.containerOrder - right.containerOrder
      || left.messageIndex - right.messageIndex,
    );
});

onMounted(() => conversation.initialize());

function roleLabel(container: ChatMessageContainer) {
  if (container.role === "user") return "用户";
  if (container.role === "system") return "系统";
  return "助手";
}

function contentPreview(content: string) {
  const normalized = content
    .replace(/```[\s\S]*?```/g, " [代码] ")
    .replace(/[#>*_`~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "空消息";
}

async function openFavorite(entry: FavoriteMessageEntry) {
  if (navigatingId.value) {
    return;
  }

  navigatingId.value = entry.message.id;
  try {
    const selected = await conversation.activateMessage(
      entry.container.id,
      entry.message.id,
    );
    if (!selected) {
      return;
    }

    layout.closeSettings();
    conversation.requestMessageNavigation(
      entry.conversation.id,
      entry.container.id,
    );
  } finally {
    navigatingId.value = "";
  }
}
</script>

<template>
  <SettingPage
    title="消息收藏"
    description="集中查看收藏的消息。点击一条记录会打开所属会话、恢复对应分支和版本并跳转到消息。"
  >
    <div v-if="favorites.length" class="flex flex-col gap-2">
      <Button
        v-for="entry in favorites"
        :key="`${entry.container.id}:${entry.message.id}`"
        variant="outline"
        class="h-auto w-full items-start justify-start gap-3 px-4 py-3 text-left mobile:px-3"
        :disabled="Boolean(navigatingId)"
        @click="openFavorite(entry)"
      >
        <CircleAlert
          v-if="entry.message.type === 'error'"
          class="mt-0.5 text-destructive"
          data-icon="inline-start"
        />
        <UserRound
          v-else-if="entry.container.role === 'user'"
          class="mt-0.5"
          data-icon="inline-start"
        />
        <Settings2
          v-else-if="entry.container.role === 'system'"
          class="mt-0.5"
          data-icon="inline-start"
        />
        <Bot v-else class="mt-0.5" data-icon="inline-start" />
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium">
            <Star class="shrink-0 fill-current text-primary" />
            <span class="truncate">{{ entry.conversation.title }}</span>
            <span class="text-muted-foreground">
              · {{ roleLabel(entry.container) }}
              · 版本 {{ entry.messageIndex + 1 }}/{{ entry.container.content.length }}
            </span>
          </span>
          <span class="line-clamp-3 whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
            {{ contentPreview(entry.message.content) }}
          </span>
        </span>
        <ArrowUpRight class="mt-0.5 shrink-0 text-muted-foreground" />
      </Button>
    </div>

    <Empty v-else class="min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Star />
        </EmptyMedia>
        <EmptyTitle>还没有收藏消息</EmptyTitle>
        <EmptyDescription>
          在消息的更多菜单中选择“收藏消息”，它会出现在这里。
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  </SettingPage>
</template>
