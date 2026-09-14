<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Button } from "@/components/fluid";
import type {
	ChatContainer,
	ChatMessage,
} from "@/features/Conversation/dataflow/types";
import { useSyncStore } from "@/features/Database/dbsync-store";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import { ArrowUpRight, Star, Trash2 } from "@/lib/phosphor-icons";

interface FavoriteMessageEntry {
	container: ChatContainer;
	message: ChatMessage;
	messageIndex: number;
}

const dbsync = useSyncStore();
const layout = useEnvironmentStore();
const deletingId = ref("");
const navigatingId = ref("");

const favoriteMessages = computed<FavoriteMessageEntry[]>(() => {
	const result: FavoriteMessageEntry[] = [];
	for (const containerMap of dbsync.containers.values()) {
		for (const container of containerMap.values()) {
			container.content.forEach((message, index) => {
				if (message.favorite) {
					result.push({
						container,
						message,
						messageIndex: index,
					});
				}
			});
		}
	}

	return result.sort((a, b) => {
		const aTime = a.message.createdAt
			? new Date(a.message.createdAt).getTime()
			: 0;
		const bTime = b.message.createdAt
			? new Date(b.message.createdAt).getTime()
			: 0;
		return bTime - aTime;
	});
});

onMounted(async () => {
	await dbsync.init();
});

function formatTime(createdAt?: string) {
	if (!createdAt) {
		return "";
	}
	return new Date(createdAt).toLocaleString("zh-CN", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function roleLabel(role: ChatContainer["role"]) {
	switch (role) {
		case "user":
			return "用户";
		case "assistant":
			return "助手";
		case "system":
			return "系统";
	}
}

async function removeFavorite(entry: FavoriteMessageEntry) {
	deletingId.value = entry.message.id;
	try {
		entry.message.favorite = false;
		dbsync.markDirty({ type: "container", id: entry.container.id });
	} finally {
		deletingId.value = "";
	}
}

async function openFavorite(entry: FavoriteMessageEntry) {
	if (navigatingId.value) {
		return;
	}

	navigatingId.value = entry.message.id;
	try {
		entry.container.activeMessage = entry.messageIndex;
		dbsync.markDirty({ type: "container", id: entry.container.id });
		layout.settingsOpen = false;
	} finally {
		navigatingId.value = "";
	}
}
</script>

<template>
  <SettingPage
    title="消息收藏"
    description="查看在对话中收藏的消息并快速定位。"
  >
    <div v-if="favoriteMessages.length === 0" class="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Star class="size-10 stroke-1 opacity-30" />
      <p class="mt-3 text-sm">暂无收藏的消息</p>
      <p class="mt-1 text-xs opacity-60">在对话中点击消息菜单可以添加收藏</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="entry in favoriteMessages"
        :key="entry.message.id"
        class="group relative rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              class="rounded px-1.5 py-0.5 font-medium"
              :class="entry.container.role === 'user' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
            >
              {{ roleLabel(entry.container.role) }}
            </span>
            <span>{{ formatTime(entry.message.createdAt) }}</span>
          </div>

          <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs"
              :disabled="navigatingId === entry.message.id"
              @click="openFavorite(entry)"
            >
              <ArrowUpRight class="mr-1 size-3" />
              前往
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs text-destructive hover:text-destructive"
              :disabled="deletingId === entry.message.id"
              @click="removeFavorite(entry)"
            >
              <Trash2 class="size-3" />
            </Button>
          </div>
        </div>

        <p class="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {{ entry.message.content }}
        </p>
      </div>
    </div>
  </SettingPage>
</template>
