<script setup lang="ts">
import { Grid2X2, List, Pin, Plus, Upload, Search } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { selectAllChats } from "@/features/Conversation/chats/chat-service";
import type { Conversation } from "@/features/Conversation/chats/chat-types";
import { applyStImportPlan } from "@/features/Migrations/SillyTavern/import/st-import-apply";
import { buildStImportPlan, readStResourceFile } from "@/features/Migrations/SillyTavern/import/st-import-plan";
import { initializeWorlds, useWorld } from "./tree/world-store";
import { useLocalPluginStore } from "./local-plugin-store";
import { host } from "@/host";

const props = defineProps<{ localPluginId: string; buttonClass?: string }>();
const emit = defineEmits<{ select: [localPluginId: string]; "open-change": [open: boolean] }>();

const store = useLocalPluginStore();
const open = ref(false);
const search = ref("");
const renaming = ref(false);
const nameDraft = ref("");
const allChats = ref<Conversation[]>([]);
const view = ref<"list" | "grid">(
	(localStorage.getItem("pulsarai:role-view-mode") as "list" | "grid") || "list",
);

watch(view, (val) => localStorage.setItem("pulsarai:role-view-mode", val));

const selected = computed(() => store.localPlugins.find((item) => item.id === props.localPluginId) ?? null);
const visible = computed(() => {
	const q = search.value.trim().toLowerCase();
	return store.localPlugins.filter(
		(item) => !q || item.name.toLowerCase().includes(q) || item.tags?.some((tag) => tag.toLowerCase().includes(q)),
	);
});
const pinned = computed(() => visible.value.filter((item) => store.preferences[item.id]?.pinned));
const others = computed(() => visible.value.filter((item) => !store.preferences[item.id]?.pinned));

watch(open, async (value) => {
	emit("open-change", value);
	if (value) {
		void store.refresh();
		allChats.value = await selectAllChats();
	}
});

function getChatCount(pluginId: string) {
	return allChats.value.filter((c) => c.localPluginId === pluginId).length;
}


async function create() {
	const item = await store.create();
	open.value = false;
	emit("select", item.id);
}

async function togglePin(id = props.localPluginId) {
	await store.updatePreferences(id, { pinned: !store.preferences[id]?.pinned });
}

function rename() {
	if (!selected.value) return;
	nameDraft.value = selected.value.name;
	renaming.value = true;
}

async function confirmRename() {
	const item = selected.value;
	const name = nameDraft.value.trim();
	renaming.value = false;
	if (!item || !name || name === item.name) return;
	await initializeWorlds(item.id);
	const world = useWorld({ localPluginId: item.id, applyReplay: false });
	await world.updateFile("/self/definition.package.json", { content: { ...item, name } });
	await store.refresh();
}

async function removeSelected() {
	const item = selected.value;
	if (!item || !window.confirm(`删除本地 Plugin “${item.name}”及其所有会话？此操作不可恢复。`)) return;
	await store.removeLocalPlugin(item.id);
	const next = store.localPlugins[0] ?? (await store.create());
	emit("select", next.id);
}

async function importCharacter() {
	try {
		const path = await host.dialog.open({
			title: "导入 SillyTavern 角色卡",
			multiple: false,
			directory: false,
			properties: ["openFile"],
			filters: [{ name: "SillyTavern 角色卡", extensions: ["png", "json"] }],
		});
		if (typeof path !== "string") return;
		const file = await readStResourceFile(path);
		const plan = buildStImportPlan(file.fileName, file);
		if (plan.kind !== "character" || !plan.character) throw new Error("所选文件不是 SillyTavern 角色卡。");
		const item = await store.create({
			name: plan.character.name,
			nickname: file.fileName.replace(/\.[^.]+$/, ""),
			description: plan.character.description || undefined,
		});
		await initializeWorlds(item.id);
		await applyStImportPlan(useWorld({ localPluginId: item.id, applyReplay: false }), plan, "/self");
		await store.refresh();
		open.value = false;
		emit("select", item.id);
		toast.success(`已导入“${item.name}”。`);
	} catch (error) {
		toast.error(error instanceof Error ? error.message : "角色卡导入失败");
	}
}

defineExpose({ rename, removeSelected, togglePin });
</script>

<template>
  <div class="relative flex min-w-0 items-center">
    <Input v-if="renaming" v-model="nameDraft" autofocus class="h-8 w-40" @keydown.enter.prevent="confirmRename" @blur="confirmRename" />
    <Popover v-else v-model:open="open">
      <PopoverTrigger as-child>
        <button type="button" class="flex h-9 max-w-44 items-center gap-2 rounded-lg px-2 text-left" :class="buttonClass">
          <img
            v-if="selected?.coverUrl || selected?.avatarUrl"
            :src="selected.avatarUrl || selected.coverUrl"
            class="size-7 shrink-0 rounded-full object-cover shadow-xs"
            :alt="selected?.name"
          />
          <span
            v-else
            class="grid size-7 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary shadow-xs"
          >
            {{ selected?.name.slice(0, 1) ?? 'P' }}
          </span>
          <span class="truncate text-sm font-medium">{{ selected?.name ?? '选择角色' }}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" :side-offset="8" class="w-[min(26rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-2xl border-border/80 p-0 shadow-2xl">
        <!-- 搜索与操作栏 -->
        <div class="flex items-center gap-2 border-b bg-muted/20 p-2.5">
          <div class="relative min-w-0 flex-1">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" placeholder="搜索角色…" class="h-8 bg-background pl-8 text-xs shadow-none" />
          </div>
          <!-- 视图切换器 -->
          <div class="flex items-center rounded-lg border bg-muted/40 p-0.5">
            <Button
              size="icon-sm"
              :variant="view === 'list' ? 'secondary' : 'ghost'"
              class="size-7 rounded-md"
              title="列表视图"
              @click="view = 'list'"
            >
              <List class="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              :variant="view === 'grid' ? 'secondary' : 'ghost'"
              class="size-7 rounded-md"
              title="卡片视图"
              @click="view = 'grid'"
            >
              <Grid2X2 class="size-3.5" />
            </Button>
          </div>
          <Button size="sm" class="h-8 gap-1 px-2.5 text-xs" @click="create">
            <Plus class="size-3.5" />新建
          </Button>
          <Button size="sm" variant="outline" class="h-8 gap-1 px-2 text-xs" title="导入角色卡" @click="importCharacter">
            <Upload class="size-3.5" />
          </Button>
        </div>

        <!-- 列表与卡片滚动展示区域 -->
        <ScrollArea class="h-[min(25rem,60vh)]">
          <!-- 列表模式 -->
          <div v-if="view === 'list'" class="space-y-0.5 p-1.5">
            <p v-if="pinned.length" class="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">置顶角色</p>
            <button
              v-for="item in pinned"
              :key="item.id"
              type="button"
              class="group relative flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition hover:bg-muted/80"
              :class="item.id === localPluginId && 'bg-primary/10'"
              @click="open = false; emit('select', item.id)"
            >
              <img
                v-if="item.avatarUrl || item.coverUrl"
                :src="item.avatarUrl || item.coverUrl"
                class="size-9 shrink-0 rounded-full object-cover shadow-xs"
                :alt="item.name"
              />
              <span
                v-else
                class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary shadow-xs"
              >
                {{ item.name.slice(0, 1) }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ item.name }}</span>
                <span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{{ item.description || item.tags?.join(' · ') || '本地角色' }}</span>
              </span>
              <span class="shrink-0 text-[10px] tabular-nums text-muted-foreground">{{ getChatCount(item.id) }} 会话</span>
              <Button
                size="icon-sm"
                variant="ghost"
                class="size-7 text-primary opacity-100"
                title="取消置顶"
                @click.stop="togglePin(item.id)"
              >
                <Pin class="size-3.5" />
              </Button>
            </button>

            <p v-if="others.length" class="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground">全部角色</p>
            <button
              v-for="item in others"
              :key="item.id"
              type="button"
              class="group relative flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition hover:bg-muted/80"
              :class="item.id === localPluginId && 'bg-primary/10'"
              @click="open = false; emit('select', item.id)"
            >
              <img
                v-if="item.avatarUrl || item.coverUrl"
                :src="item.avatarUrl || item.coverUrl"
                class="size-9 shrink-0 rounded-full object-cover shadow-xs"
                :alt="item.name"
              />
              <span
                v-else
                class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary shadow-xs"
              >
                {{ item.name.slice(0, 1) }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ item.name }}</span>
                <span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{{ item.description || item.tags?.join(' · ') || '本地角色' }}</span>
              </span>
              <span class="shrink-0 text-[10px] tabular-nums text-muted-foreground">{{ getChatCount(item.id) }} 会话</span>
              <Button
                size="icon-sm"
                variant="ghost"
                class="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                title="置顶角色"
                @click.stop="togglePin(item.id)"
              >
                <Pin class="size-3.5" />
              </Button>
            </button>
            <p v-if="!visible.length" class="py-12 text-center text-sm text-muted-foreground">没有匹配的角色</p>
          </div>

          <!-- 卡片网格模式 -->
          <div v-else class="grid grid-cols-2 gap-2.5 p-2.5">
            <button
              v-for="item in visible"
              :key="item.id"
              type="button"
              class="group relative aspect-4/5 overflow-hidden rounded-xl text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              @click="open = false; emit('select', item.id)"
            >
              <img
                v-if="item.coverUrl || item.avatarUrl"
                :src="item.coverUrl || item.avatarUrl"
                class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                :alt="item.name"
              />
              <div v-else class="absolute inset-0 bg-muted/40" />
              <span class="absolute inset-0 bg-gradient-to-tr from-black/80 via-black/25 to-white/10" />
              <span class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
              <div class="absolute right-1.5 top-1.5 z-10">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="size-7 rounded-full bg-black/40 text-white backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60"
                  :class="store.preferences[item.id]?.pinned && '!opacity-100 text-primary'"
                  :title="store.preferences[item.id]?.pinned ? '取消置顶' : '置顶角色'"
                  @click.stop="togglePin(item.id)"
                >
                  <Pin class="size-3.5" />
                </Button>
              </div>
              <div class="absolute inset-x-0 bottom-0 p-3 text-white">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-semibold leading-tight">{{ item.name }}</span>
                </div>
                <p class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/80">
                  {{ item.description || item.tags?.join(' · ') || '本地角色' }}
                </p>
                <span class="mt-1.5 inline-block text-[10px] text-white/60">
                  {{ getChatCount(item.id) }} 个会话
                </span>
              </div>
            </button>
            <p v-if="!visible.length" class="col-span-2 py-12 text-center text-sm text-muted-foreground">
              没有匹配的角色
            </p>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  </div>
</template>
