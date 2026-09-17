<script setup lang="ts">
import { push } from "notivue";
import { computed, ref } from "vue";
import { Badge, Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { host } from "@/host";
import {
	ExternalLink,
	MessageCircle,
	Pin,
	Plus,
	Search,
	Trash2,
	X,
} from "@/lib/phosphor-icons";
import { useConversationList } from "../dataflow/conversations";

const props = defineProps<{
	localPluginId: string;
	conversationId: string;
	open: boolean;
}>();
const emit = defineEmits<{
	"update:open": [open: boolean];
	select: [conversationId: string];
	"new-window": [conversationId: string];
	close: [conversationId: string];
}>();
const search = ref("");
const conversationList = useConversationList(props.localPluginId);
const visible = computed(() => {
	const query = search.value.trim().toLocaleLowerCase();
	return [...conversationList.conversations.value]
		.filter(
			(conversation) =>
				!query || conversation.title.toLocaleLowerCase().includes(query),
		)
		.sort(
			(a, b) =>
				Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
				b.updatedAt.localeCompare(a.updatedAt),
		);
});
function select(conversationId: string) {
	emit("select", conversationId);
	emit("update:open", false);
}
function create() {
	try {
		const conversation = conversationList.create();
		select(conversation.id);
		return conversation;
	} catch (error) {
		push.error(error instanceof Error ? error.message : "无法新建会话。");
		return null;
	}
}
async function remove(conversationId: string) {
	if (
		conversationId !== props.conversationId &&
		(await host.desktop?.window.isConversationOpen(conversationId))
	) {
		push.info("请先关闭正在使用该会话的窗口。");
		return;
	}
	const conversation = [...conversationList.conversations.value].find(
		(value) => value.id === conversationId,
	);
	if (!conversation || !window.confirm(`删除会话“${conversation.title}”？`))
		return;
	conversationList.delete(conversationId);
	emit("close", conversationId);
	if (conversationId === props.conversationId) {
		const next = [...conversationList.conversations.value][0] ?? create();
		if (next) emit("select", next.id);
	}
}
function togglePinned(conversationId: string, event: MouseEvent) {
	event.stopPropagation();
	const conversation = [...conversationList.conversations.value].find(
		(value) => value.id === conversationId,
	);
	if (!conversation) return;
	conversation.pinned = !conversation.pinned;
	conversation.updatedAt = new Date().toISOString();
	useSyncStore().markDirty({ type: "meta", id: conversation.id });
}
</script>

<template>
  <aside v-if="props.open" class="flex h-full w-80 max-w-[85vw] shrink-0 flex-col border-l bg-background mobile:absolute mobile:inset-y-0 mobile:right-0 mobile:z-40 mobile:shadow-2xl">
    <header class="flex items-center gap-2 border-b p-3"><div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-8 pl-8 text-xs" placeholder="搜索会话…" /></div><Button variant="ghost" size="icon-sm" title="关闭会话列表" @click="emit('update:open', false)"><X class="size-4" /></Button></header>
    <div class="flex gap-2 border-b p-3"><Button size="sm" class="flex-1" @click="create"><Plus class="size-4" />新建会话</Button></div>
    <ScrollArea class="min-h-0 flex-1"><div class="space-y-1 p-2">
      <button v-for="conversation in visible" :key="conversation.id" type="button" class="group flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted" :class="conversation.id === props.conversationId && 'bg-primary/10'" @click="select(conversation.id)">
        <span class="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><MessageCircle class="size-3.5" /></span>
        <span class="min-w-0 flex-1"><span class="flex items-center gap-1"><span class="truncate text-sm font-medium">{{ conversation.title }}</span><Badge v-if="conversation.lifetime === 'app'" variant="secondary" class="px-1 text-[10px]">临时</Badge></span><span class="block truncate text-[10px] text-muted-foreground">{{ conversation.lastMessagePreview || '暂无消息' }}</span></span>
        <Button v-if="host.desktop" variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100 mobile:opacity-100" title="在新窗口打开" @click.stop="emit('new-window', conversation.id)"><ExternalLink class="size-3.5" /></Button>
        <Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100" :class="conversation.pinned && 'text-primary opacity-100'" title="置顶" @click="togglePinned(conversation.id, $event)"><Pin class="size-3.5" /></Button>
        <Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100 hover:text-destructive" title="删除" @click.stop="remove(conversation.id)"><Trash2 class="size-3.5" /></Button>
      </button>
      <p v-if="!visible.length" class="py-12 text-center text-sm text-muted-foreground">暂无会话</p>
    </div></ScrollArea>
  </aside>
</template>
