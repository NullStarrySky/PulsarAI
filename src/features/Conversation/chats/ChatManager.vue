<script setup lang="ts">
import { MessageCircle, Pin, Plus, Search } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatStore } from "./chat-store";

const props = defineProps<{
	packageId: string;
	chatId: string;
	buttonClass?: string;
}>();
const emit = defineEmits<{
	select: [chatId: string];
	"open-change": [open: boolean];
}>();
const chats = useChatStore();
const open = ref(false);
const search = ref("");
const renaming = ref(false);
const titleDraft = ref("");
const items = computed(() => chats.chatsForPackage(props.packageId));
const selected = computed(
	() => items.value.find((item) => item.id === props.chatId) ?? null,
);
const visibleChats = computed(() => {
	const keyword = search.value.trim().toLocaleLowerCase();
	return items.value.filter(
		(item) => !keyword || item.title.toLocaleLowerCase().includes(keyword),
	);
});
const pinnedChats = computed(() =>
	visibleChats.value.filter((item) => item.pinned),
);
const recentChats = computed(() =>
	visibleChats.value.filter((item) => !item.pinned),
);
watch([open, renaming], () =>
	emit("open-change", open.value || renaming.value),
);
watch(
	() => props.packageId,
	async (packageId) => {
		if (packageId) await chats.loadForPackage(packageId);
	},
	{ immediate: true },
);
async function create() {
	if (!props.packageId) return;
	const chat = await chats.create({
		packageId: props.packageId,
		activate: false,
	});
	open.value = false;
	emit("select", chat.id);
}
function select(id: string) {
	open.value = false;
	emit("select", id);
}
function updatedAtLabel(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? ""
		: date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}
async function togglePin() {
	if (selected.value)
		await chats.update(selected.value.id, { pinned: !selected.value.pinned });
}
async function toggleItemPin(id: string, event: MouseEvent) {
	event.stopPropagation();
	const item = items.value.find((chat) => chat.id === id);
	if (item) await chats.update(item.id, { pinned: !item.pinned });
}
function rename() {
	if (!selected.value) return;
	titleDraft.value = selected.value.title;
	renaming.value = true;
}
async function confirmRename() {
	const title = titleDraft.value.trim();
	const item = selected.value;
	renaming.value = false;
	if (item && title && title !== item.title)
		await chats.update(item.id, { title });
}
async function removeSelected() {
	if (!selected.value || !window.confirm(`删除会话“${selected.value.title}”？`))
		return;
	const removedId = selected.value.id;
	await chats.remove(removedId);
	const next =
		chats.chatsForPackage(props.packageId)[0] ??
		(await chats.create({ packageId: props.packageId, activate: false }));
	emit("select", next.id);
}

defineExpose({ rename, removeSelected, togglePin });
</script>

<template>
  <div class="relative flex min-w-0 items-center gap-0.5">
    <Input v-if="renaming" v-model="titleDraft" autofocus class="h-8 min-w-24 max-w-[320px] px-2 text-sm font-medium mobile:max-w-[42vw]" @keydown.enter.prevent="confirmRename" @keydown.esc.prevent="renaming = false" @blur="confirmRename" />
    <Popover v-else v-model:open="open">
      <PopoverTrigger as-child>
        <button type="button" class="flex h-9 min-w-24 max-w-[320px] items-center gap-2 rounded-lg px-2 text-left text-sm font-medium mobile:max-w-[42vw]" :class="props.buttonClass" data-window-drag-block><span class="min-w-0 flex-1 truncate">{{ selected?.title || '选择会话' }}</span><Badge v-if="selected?.isTemplate" variant="secondary" class="shrink-0 px-1.5 text-[10px]">模板</Badge></button>
      </PopoverTrigger>
      <PopoverContent align="start" :side-offset="8" class="w-[min(21rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-xl border-border/80 bg-popover p-0 shadow-2xl" data-window-drag-block>
        <div class="flex items-center gap-2 border-b bg-muted/20 p-2"><div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-8 bg-background pl-8 text-xs shadow-none focus-visible:ring-1" placeholder="搜索会话…" /></div><Button size="sm" class="h-8 gap-1.5 px-2.5 text-xs" :disabled="!props.packageId" @click="create"><Plus class="size-3.5" />新建</Button></div>
        <ScrollArea class="h-[min(19rem,55vh)]"><div class="space-y-0.5 p-1.5"><p v-if="pinnedChats.length" class="px-2 pb-1 pt-1 text-[10px] tracking-[0.12em] text-muted-foreground">置顶</p><button v-for="item in pinnedChats" :key="item.id" type="button" class="group relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-muted/70" :class="item.id === props.chatId && 'bg-primary/8'" @click="select(item.id)"><span class="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><MessageCircle class="size-3.5" /></span><span class="min-w-0 flex-1"><span class="flex items-center gap-1"><span class="truncate text-sm font-medium">{{ item.title }}</span><Badge v-if="item.isTemplate" variant="secondary" class="shrink-0 px-1.5 text-[10px]">模板</Badge></span><span class="block text-[10px] text-muted-foreground">置顶会话</span></span><Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" :class="item.pinned && 'text-primary opacity-100'" title="取消置顶" @click="toggleItemPin(item.id, $event)"><Pin class="size-3.5" /></Button></button><p v-if="recentChats.length" class="px-2 pb-1 pt-3 text-[10px] tracking-[0.12em] text-muted-foreground">最近活动</p><button v-for="item in recentChats" :key="item.id" type="button" class="group relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-muted/70" :class="item.id === props.chatId && 'bg-primary/8'" @click="select(item.id)"><span class="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><MessageCircle class="size-3.5" /></span><span class="min-w-0 flex-1"><span class="flex items-center gap-1"><span class="truncate text-sm font-medium">{{ item.title }}</span><Badge v-if="item.isTemplate" variant="secondary" class="shrink-0 px-1.5 text-[10px]">模板</Badge></span><span class="block text-[10px] text-muted-foreground">{{ updatedAtLabel(item.updatedAt) || '刚刚更新' }}</span></span><Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" title="置顶会话" @click="toggleItemPin(item.id, $event)"><Pin class="size-3.5" /></Button></button><p v-if="!visibleChats.length" class="py-12 text-center text-sm text-muted-foreground">暂无匹配会话</p></div></ScrollArea>
      </PopoverContent>
    </Popover>
  </div>
</template>
