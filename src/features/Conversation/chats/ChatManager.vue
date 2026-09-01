<script setup lang="ts">
import { Plus, Search } from "lucide-vue-next";
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
    <Input v-if="renaming" v-model="titleDraft" autofocus class="h-8 min-w-24 max-w-[320px] px-2 text-base font-medium mobile:max-w-[42vw] mobile:text-sm" @keydown.enter.prevent="confirmRename" @keydown.esc.prevent="renaming = false" @blur="confirmRename" />
    <Popover v-else v-model:open="open">
      <PopoverTrigger as-child>
        <button type="button" class="flex h-9 min-w-24 max-w-[320px] items-center rounded-lg px-2 text-left text-base font-medium mobile:max-w-[42vw] mobile:text-sm" :class="props.buttonClass" data-window-drag-block><span class="truncate">{{ selected?.title || '选择会话' }}</span><Badge v-if="selected?.isTemplate" variant="secondary" class="ml-1 shrink-0 px-1.5 text-[10px]">模板</Badge></button>
      </PopoverTrigger>
    <PopoverContent align="start" :side-offset="7" class="w-[min(20rem,calc(100vw-1rem))] gap-0 rounded-xl border border-border/80 p-2 shadow-xl" data-window-drag-block>
      <div class="flex items-center gap-2 p-1"><div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-9 pl-8 focus-visible:!ring-0" placeholder="搜索会话" /></div><Button variant="secondary" size="icon-sm" :disabled="!props.packageId" title="新建会话" @click="create"><Plus class="size-4" /></Button></div>
      <ScrollArea class="mt-1 h-[min(19rem,55vh)]"><div class="space-y-0.5 p-1"><button v-for="item in visibleChats" :key="item.id" type="button" class="group flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left hover:bg-muted/70" @click="select(item.id)"><span class="flex min-w-0 flex-1 items-center gap-1"><span class="truncate text-sm">{{ item.title }}</span><Badge v-if="item.isTemplate" variant="secondary" class="shrink-0 px-1.5 text-[10px]">模板</Badge></span><span class="shrink-0 text-xs text-muted-foreground">{{ updatedAtLabel(item.updatedAt) }}</span></button><p v-if="visibleChats.length === 0" class="py-12 text-center text-sm text-muted-foreground">暂无会话</p></div></ScrollArea>
    </PopoverContent>
    </Popover>
  </div>
</template>
