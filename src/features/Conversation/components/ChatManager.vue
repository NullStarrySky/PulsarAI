<script setup lang="ts">
import { MessageCircle, Pin, Plus, Search, Trash2, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Button, Badge } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { useChatList } from "../dataflow/chats";

const props = defineProps<{ localPluginId: string; chatId: string; open: boolean }>();
const emit = defineEmits<{ "update:open": [open: boolean]; select: [chatId: string] }>();
const search = ref("");
const chatList = useChatList(props.localPluginId);
const visible = computed(() => {
	const query = search.value.trim().toLocaleLowerCase();
	return [...chatList.chats.value].filter(chat => !query || chat.title.toLocaleLowerCase().includes(query)).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
});
function select(chatId: string) { emit("select", chatId); emit("update:open", false); }
function create() { const chat = chatList.create(); select(chat.id); }
function remove(chatId: string) {
	const chat = [...chatList.chats.value].find(value => value.id === chatId);
	if (!chat || !window.confirm(`删除会话“${chat.title}”？`)) return;
	chatList.delete(chatId);
	if (chatId === props.chatId) {
		const next = [...chatList.chats.value][0] ?? chatList.create();
		emit("select", next.id);
	}
}
function togglePinned(chatId: string, event: MouseEvent) {
	event.stopPropagation();
	const chat = [...chatList.chats.value].find(value => value.id === chatId);
	if (!chat) return;
	chat.pinned = !chat.pinned;
	chat.updatedAt = new Date().toISOString();
	useSyncStore().markDirty({ type: "meta", id: chat.id });
}
</script>

<template>
  <aside v-if="props.open" class="flex h-full w-80 max-w-[85vw] shrink-0 flex-col border-l bg-background mobile:absolute mobile:inset-y-0 mobile:right-0 mobile:z-40 mobile:shadow-2xl">
    <header class="flex items-center gap-2 border-b p-3"><div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-8 pl-8 text-xs" placeholder="搜索会话…" /></div><Button variant="ghost" size="icon-sm" title="关闭会话列表" @click="emit('update:open', false)"><X class="size-4" /></Button></header>
    <div class="flex gap-2 border-b p-3"><Button size="sm" class="flex-1" @click="create"><Plus class="size-4" />新建会话</Button></div>
    <ScrollArea class="min-h-0 flex-1"><div class="space-y-1 p-2">
      <button v-for="chat in visible" :key="chat.id" type="button" class="group flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted" :class="chat.id === props.chatId && 'bg-primary/10'" @click="select(chat.id)">
        <span class="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><MessageCircle class="size-3.5" /></span>
        <span class="min-w-0 flex-1"><span class="flex items-center gap-1"><span class="truncate text-sm font-medium">{{ chat.title }}</span><Badge v-if="chat.lifetime === 'app'" variant="secondary" class="px-1 text-[10px]">临时</Badge></span><span class="block truncate text-[10px] text-muted-foreground">{{ chat.lastMessagePreview || '暂无消息' }}</span></span>
        <Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100" :class="chat.pinned && 'text-primary opacity-100'" title="置顶" @click="togglePinned(chat.id, $event)"><Pin class="size-3.5" /></Button>
        <Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100 hover:text-destructive" title="删除" @click.stop="remove(chat.id)"><Trash2 class="size-3.5" /></Button>
      </button>
      <p v-if="!visible.length" class="py-12 text-center text-sm text-muted-foreground">暂无会话</p>
    </div></ScrollArea>
  </aside>
</template>
