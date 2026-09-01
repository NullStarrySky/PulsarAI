<script setup lang="ts">
import { Grid2X2, List, Plus, Search } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePackageStore } from "./package-store";
import type { CharacterPackage } from "./package-types";

const props = defineProps<{ packageId: string; buttonClass?: string }>();
const emit = defineEmits<{
	select: [packageId: string];
	"open-change": [open: boolean];
}>();
const packages = usePackageStore();
const open = ref(false);
const search = ref("");
const renaming = ref(false);
const nameDraft = ref("");
const view = ref<"list" | "card">("list");
const selected = computed(
	() => packages.packages.find((item) => item.id === props.packageId) ?? null,
);
const visiblePackages = computed(() => {
	const keyword = search.value.trim().toLocaleLowerCase();
	return packages.sortedPackages.filter(
		(item) =>
			!keyword ||
			item.name.toLocaleLowerCase().includes(keyword) ||
			item.description?.toLocaleLowerCase().includes(keyword),
	);
});

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
    <Input v-if="renaming" v-model="nameDraft" autofocus class="h-8 min-w-24 max-w-44 px-2 text-sm mobile:max-w-32" @keydown.enter.prevent="confirmRename" @keydown.esc.prevent="renaming = false" @blur="confirmRename" />
    <Popover v-else v-model:open="open">
      <PopoverTrigger as-child>
      <button type="button" class="flex h-9 min-w-0 max-w-44 items-center gap-2 rounded-lg px-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mobile:max-w-32" :class="props.buttonClass" data-window-drag-block>
        <Avatar class="size-7 shrink-0"><AvatarImage v-if="selected?.icon" :src="selected.icon" :alt="selected.name" /><AvatarFallback class="font-semibold text-white" :style="color(selected)">{{ selected?.name.slice(0, 1) ?? 'P' }}</AvatarFallback></Avatar>
        <span class="truncate text-sm font-medium">{{ selected?.name ?? '选择角色' }}</span>
      </button>
      </PopoverTrigger>
      <PopoverContent align="start" :side-offset="7" class="w-[min(25rem,calc(100vw-1rem))] gap-0 rounded-xl border border-border/80 p-2 shadow-xl" data-window-drag-block>
      <div class="flex items-center gap-2 p-1">
        <div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-9 pl-8 focus-visible:ring-0!" placeholder="搜索角色" /></div>
        <Button variant="secondary" size="icon-sm" title="新建角色包" @click="create"><Plus class="size-4" /></Button>
        <div class="flex shrink-0 rounded-lg border bg-muted/20 p-0.5"><Button :variant="view === 'list' ? 'secondary' : 'ghost'" size="icon-sm" title="列表模式" @click="view = 'list'"><List class="size-4" /></Button><Button :variant="view === 'card' ? 'secondary' : 'ghost'" size="icon-sm" title="卡片模式" @click="view = 'card'"><Grid2X2 class="size-4" /></Button></div>
      </div>
      <ScrollArea class="mt-1 h-[min(23rem,58vh)]">
        <div v-if="view === 'list'" class="grid grid-cols-1 gap-1 p-1">
          <button v-for="item in visiblePackages" :key="item.id" type="button" class="group relative flex min-w-0 items-center gap-2.5 rounded-lg p-2 text-left hover:bg-muted/70" @click="select(item)"><Avatar class="size-10"><AvatarImage v-if="item.icon" :src="item.icon" :alt="item.name" /><AvatarFallback class="font-semibold text-white" :style="color(item)">{{ item.name.slice(0, 1) }}</AvatarFallback></Avatar><span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ item.name }}</span><span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ item.description || '暂无描述' }}</span></span></button>
        </div>
        <div v-else class="grid grid-cols-2 gap-2 p-1"><button v-for="item in visiblePackages" :key="item.id" type="button" class="group relative aspect-4/5 overflow-hidden rounded-xl border text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl" :style="color(item)" @click="select(item)"><span class="absolute inset-0 bg-linear-to-t from-black/90 via-black/10 to-transparent" /><span class="absolute inset-x-0 bottom-0 p-3 text-white"><span class="block text-sm font-semibold">{{ item.name }}</span><span class="mt-1 block max-h-0 overflow-hidden text-xs leading-5 text-white/75 opacity-0 transition-all group-hover:max-h-20 group-hover:opacity-100">{{ item.description || '暂无描述' }}</span></span></button></div>
        <p v-if="visiblePackages.length === 0" class="py-12 text-center text-sm text-muted-foreground">没有匹配的角色</p>
      </ScrollArea>
      </PopoverContent>
    </Popover>
  </div>
</template>
