<script setup lang="ts">
import { Grid2X2, List, Pin, Plus, Search } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import Segmented from "@/components/common/segmented/Segmented.vue";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { selectAllChats } from "@/features/Conversation/chats/chat-service";
import type { Conversation } from "@/features/Conversation/chats/chat-types";
import { usePackageStore } from "./package-store";
import type { CharacterPackage } from "./package-types";

const props = defineProps<{ packageId: string; buttonClass?: string }>();
const emit = defineEmits<{
	select: [packageId: string];
	"open-change": [open: boolean];
}>();
const packages = usePackageStore();
const allChats = ref<Conversation[]>([]);
const open = ref(false);
const search = ref("");
const renaming = ref(false);
const nameDraft = ref("");
const view = ref<"list" | "card">("list");
const viewOptions = [
	{ value: "list", label: "列表模式" },
	{ value: "card", label: "卡片模式" },
];
const selected = computed(
	() => packages.packages.find((item) => item.id === props.packageId) ?? null,
);
const chatCountByPackage = computed(() => {
	const map = new Map<string, number>();
	for (const chat of allChats.value) {
		map.set(chat.packageId, (map.get(chat.packageId) ?? 0) + 1);
	}
	return map;
});
function getChatCount(pkgId: string) {
	return chatCountByPackage.value.get(pkgId) ?? 0;
}

watch(open, async (val) => {
	if (val) {
		allChats.value = await selectAllChats();
	}
});

const visiblePackages = computed(() => {
	const keyword = search.value.trim().toLocaleLowerCase();
	return packages.sortedPackages.filter(
		(item) =>
			!keyword ||
			item.name.toLocaleLowerCase().includes(keyword) ||
			item.description?.toLocaleLowerCase().includes(keyword),
	);
});
const pinnedPackages = computed(() =>
	visiblePackages.value.filter((item) => item.pinned),
);
const otherPackages = computed(() =>
	visiblePackages.value.filter((item) => !item.pinned),
);

watch([open, renaming], () =>
	emit("open-change", open.value || renaming.value),
);
function color(item?: CharacterPackage | null) {
	const source = item?.id ?? "pulsar";
	const hue = [...source].reduce(
		(hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0,
		0,
	);
	return {
		background: `linear-gradient(135deg, hsl(${Math.abs(hue) % 360} 45% 38%), hsl(${(Math.abs(hue) + 52) % 360} 60% 58%))`,
	};
}
async function create() {
	const item = await packages.create();
	open.value = false;
	emit("select", item.id);
}
function select(item: CharacterPackage) {
	open.value = false;
	emit("select", item.id);
}
async function togglePin() {
	if (selected.value)
		await packages.update(selected.value.id, {
			pinned: !selected.value.pinned,
		});
}
async function toggleItemPin(item: CharacterPackage, event: MouseEvent) {
	event.stopPropagation();
	await packages.update(item.id, { pinned: !item.pinned });
}
function rename() {
	if (!selected.value) return;
	nameDraft.value = selected.value.name;
	renaming.value = true;
}
async function confirmRename() {
	const name = nameDraft.value.trim();
	const item = selected.value;
	renaming.value = false;
	if (item && name && name !== item.name)
		await packages.update(item.id, { name });
}
async function removeSelected() {
	if (
		!selected.value ||
		!window.confirm(`删除角色包“${selected.value.name}”？`)
	)
		return;
	await packages.remove(selected.value.id);
	const next = packages.sortedPackages[0] ?? (await packages.create());
	emit("select", next.id);
}

defineExpose({ rename, removeSelected, togglePin });
</script>

<template>
  <div class="relative flex min-w-0 items-center gap-0.5">
    <Input v-if="renaming" v-model="nameDraft" autofocus class="h-8 min-w-24 max-w-44 px-2 text-sm font-medium mobile:max-w-32" @keydown.enter.prevent="confirmRename" @keydown.esc.prevent="renaming = false" @blur="confirmRename" />
    <Popover v-else v-model:open="open">
      <PopoverTrigger as-child>
      <button type="button" class="group flex h-9 min-w-0 max-w-44 items-center gap-2 rounded-lg px-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mobile:max-w-32" :class="props.buttonClass" data-window-drag-block>
        <Avatar class="size-7 shrink-0"><AvatarImage v-if="selected?.icon" :src="selected.icon" :alt="selected.name" /><AvatarFallback class="font-semibold text-white" :style="color(selected)">{{ selected?.name.slice(0, 1) ?? 'P' }}</AvatarFallback></Avatar>
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ selected?.name ?? '选择角色' }}</span>
      </button>
      </PopoverTrigger>
      <PopoverContent align="start" :side-offset="8" class="w-[min(25rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-xl border-border/80 bg-popover p-0 shadow-2xl" data-window-drag-block>
      <div class="flex items-center gap-2 border-b bg-muted/20 p-2"><div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-8 bg-background pl-8 text-xs shadow-none focus-visible:ring-1" placeholder="搜索角色…" /></div><Segmented v-model="view" mode="icon" variant="outlined" :options="viewOptions" class="shrink-0"><template #option="{ option }"><List v-if="option.value === 'list'" class="size-3.5" /><Grid2X2 v-else class="size-3.5" /></template></Segmented><Button size="sm" class="h-8 gap-1.5 px-2.5 text-xs" title="新建角色包" @click="create"><Plus class="size-3.5" />新建</Button></div>
      <ScrollArea class="h-[min(23rem,58vh)]"><div v-if="view === 'list'" class="space-y-0.5 p-1.5"><p v-if="pinnedPackages.length" class="px-2 pb-1 pt-1 text-[10px] tracking-[0.12em] text-muted-foreground">置顶</p><button v-for="item in pinnedPackages" :key="item.id" type="button" class="group relative flex min-h-14 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted/70" :class="item.id === props.packageId && 'bg-primary/8'" @click="select(item)"><Avatar class="size-10"><AvatarImage v-if="item.icon" :src="item.icon" :alt="item.name" /><AvatarFallback class="font-semibold text-white" :style="color(item)">{{ item.name.slice(0, 1) }}</AvatarFallback></Avatar><span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold">{{ item.name }}</span><span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{{ item.description || '置顶角色包' }}</span></span><span class="shrink-0 text-[10px] text-muted-foreground">{{ getChatCount(item.id) }} 会话</span><Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" :class="item.pinned && 'text-primary opacity-100'" title="取消置顶" @click="toggleItemPin(item, $event)"><Pin class="size-3.5" /></Button></button><p v-if="otherPackages.length" class="px-2 pb-1 pt-3 text-[10px] tracking-[0.12em] text-muted-foreground">全部角色</p><button v-for="item in otherPackages" :key="item.id" type="button" class="group relative flex min-h-14 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted/70" :class="item.id === props.packageId && 'bg-primary/8'" @click="select(item)"><Avatar class="size-10"><AvatarImage v-if="item.icon" :src="item.icon" :alt="item.name" /><AvatarFallback class="font-semibold text-white" :style="color(item)">{{ item.name.slice(0, 1) }}</AvatarFallback></Avatar><span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold">{{ item.name }}</span><span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{{ item.description || '暂无描述' }}</span></span><span class="shrink-0 text-[10px] text-muted-foreground">{{ getChatCount(item.id) }} 会话</span><Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" title="置顶角色" @click="toggleItemPin(item, $event)"><Pin class="size-3.5" /></Button></button><p v-if="!visiblePackages.length" class="py-12 text-center text-sm text-muted-foreground">没有匹配的角色</p></div><div v-else class="grid grid-cols-2 gap-2 p-2.5"><button v-for="item in visiblePackages" :key="item.id" type="button" class="group relative aspect-4/5 overflow-hidden rounded-xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg" :class="item.id === props.packageId && 'border-primary'" :style="color(item)" @click="select(item)"><span class="absolute inset-0 bg-linear-to-t from-black/90 via-black/10 to-transparent" /><Button variant="ghost" size="icon-sm" class="absolute left-1.5 top-1.5 z-10 size-7 bg-black/25 text-white opacity-0 backdrop-blur-sm group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/50" :class="item.pinned && 'opacity-100 text-primary'" :title="item.pinned ? '取消置顶' : '置顶角色'" @click="toggleItemPin(item, $event)"><Pin class="size-3.5" /></Button><span class="absolute inset-x-0 bottom-0 p-3 text-white"><span class="block truncate text-sm font-semibold">{{ item.name }}</span><span class="mt-1 block max-h-0 overflow-hidden text-xs leading-5 text-white/75 opacity-0 transition-all group-hover:max-h-20 group-hover:opacity-100">{{ item.description || '暂无描述' }}</span></span></button><p v-if="!visiblePackages.length" class="col-span-2 py-12 text-center text-sm text-muted-foreground">没有匹配的角色</p></div></ScrollArea>

      </PopoverContent>
    </Popover>
  </div>
</template>
