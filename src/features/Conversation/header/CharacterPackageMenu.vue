<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import {
  Grid2X2,
  List,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Trash2,
} from "lucide-vue-next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import type { CharacterPackage } from "@/features/Conversation/messages/conversation-types";

/**
 * Character-package management for the stage header: selector popover with
 * search/list/card views, inline rename, description editor, avatar upload,
 * and the active-package operations menu. `active` reports whether any of its
 * surfaces is open so the header shell stays visible while interacting.
 */
const props = defineProps<{
  buttonClass?: string;
}>();

const active = defineModel<boolean>("active", { required: true });

const conversation = useConversationStore();
const packageMenuOpen = ref(false);
const opsMenuOpen = ref(false);
const packageSearch = ref("");
const packageView = ref<"list" | "card">("list");
const renamingPackage = ref(false);
const descriptionEditorOpen = ref(false);
const packageNameDraft = ref("");
const packageDescriptionDraft = ref("");
const avatarInput = ref<HTMLInputElement | null>(null);

watchEffect(() => {
  active.value = packageMenuOpen.value
    || opsMenuOpen.value
    || descriptionEditorOpen.value
    || renamingPackage.value;
});

const visiblePackages = computed(() => {
  const keyword = packageSearch.value.trim().toLocaleLowerCase();
  return [...conversation.packages]
    .filter((item) => !keyword || item.name.toLocaleLowerCase().includes(keyword)
      || item.description?.toLocaleLowerCase().includes(keyword))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      || (a.order ?? 0) - (b.order ?? 0));
});

function packageColor(item?: CharacterPackage) {
  const source = item?.id ?? "pulsar";
  let hash = 0;
  for (const character of source) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return { background: `linear-gradient(135deg, hsl(${hue} 45% 38%), hsl(${(hue + 52) % 360} 60% 58%))` };
}

async function createPackage() {
  packageMenuOpen.value = false;
  await conversation.createPackage();
}

async function selectPackage(item: CharacterPackage) {
  packageMenuOpen.value = false;
  await conversation.openPackage(item.id);
}

async function removePackage(item: CharacterPackage) {
  if (!window.confirm(`删除角色包“${item.name}”及其会话和本地插件？`)) return;
  await conversation.deletePackage(item.id);
}

async function togglePackagePin(item: CharacterPackage) {
  await conversation.updatePackage(item.id, { pinned: !item.pinned });
}

function renameActivePackage() {
  const item = conversation.activePackage;
  if (!item) return;
  packageNameDraft.value = item.name;
  renamingPackage.value = true;
}

async function confirmPackageRename() {
  if (!renamingPackage.value) return;
  renamingPackage.value = false;
  const item = conversation.activePackage;
  const name = packageNameDraft.value.trim();
  if (item && name && name !== item.name) await conversation.updatePackage(item.id, { name });
}

function updateActivePackageDescription() {
  const item = conversation.activePackage;
  if (!item) return;
  packageDescriptionDraft.value = item.description ?? "";
  descriptionEditorOpen.value = true;
}

async function confirmPackageDescription() {
  const item = conversation.activePackage;
  if (!item) return;
  descriptionEditorOpen.value = false;
  await conversation.updatePackage(item.id, { description: packageDescriptionDraft.value.trim() });
}

function updateActivePackageIcon() {
  avatarInput.value?.click();
}

async function saveActivePackageIcon(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  const item = conversation.activePackage;
  if (!file || !item) return;
  const icon = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  await conversation.updatePackage(item.id, { icon });
}
</script>

<template>
  <div class="relative flex min-w-0 items-center gap-0.5">
    <div v-if="renamingPackage" class="flex h-9 min-w-0 max-w-44 items-center gap-2 px-1.5 mobile:max-w-32">
      <Avatar class="size-7 shrink-0">
        <AvatarImage v-if="conversation.activePackage?.icon" :src="conversation.activePackage.icon" :alt="conversation.activePackage.name" />
        <AvatarFallback class="font-semibold text-white" :style="packageColor(conversation.activePackage)">{{ conversation.activePackage?.name?.slice(0, 1) ?? "P" }}</AvatarFallback>
      </Avatar>
      <Input
        v-model="packageNameDraft"
        autofocus
        class="h-8 min-w-0 px-2 text-sm"
        @keydown.enter.prevent="confirmPackageRename"
        @keydown.esc.prevent="renamingPackage = false"
        @blur="confirmPackageRename"
      />
    </div>
    <Popover v-else v-model:open="packageMenuOpen">
      <PopoverTrigger as-child>
        <button type="button" class="flex h-9 min-w-0 max-w-44 items-center gap-2 rounded-lg px-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mobile:max-w-32" :class="props.buttonClass">
          <Avatar class="size-7">
            <AvatarImage v-if="conversation.activePackage?.icon" :src="conversation.activePackage.icon" :alt="conversation.activePackage.name" />
            <AvatarFallback class="font-semibold text-white" :style="packageColor(conversation.activePackage)">
              {{ conversation.activePackage?.name?.slice(0, 1) ?? "P" }}
            </AvatarFallback>
          </Avatar>
          <span class="truncate text-sm font-medium">{{ conversation.activePackage?.name ?? "选择角色" }}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" :side-offset="7" class="w-[min(25rem,calc(100vw-1rem))] gap-0 rounded-xl border border-border/80 p-2 shadow-xl">
        <div class="flex items-center gap-2 p-1">
          <div class="relative min-w-0 flex-1">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="packageSearch" class="h-9 pl-8 focus:!border-border focus-visible:!border-border focus-visible:!ring-0 focus-visible:!ring-offset-0" placeholder="搜索角色" />
          </div>
          <Button variant="secondary" size="icon-sm" title="新建角色包" @click="createPackage"><Plus class="size-4" /></Button>
          <div class="flex shrink-0 rounded-lg border bg-muted/20 p-0.5">
            <Button :variant="packageView === 'list' ? 'secondary' : 'ghost'" size="icon-sm" title="列表模式" @click="packageView = 'list'"><List class="size-4" /></Button>
            <Button :variant="packageView === 'card' ? 'secondary' : 'ghost'" size="icon-sm" title="卡片模式" @click="packageView = 'card'"><Grid2X2 class="size-4" /></Button>
          </div>
        </div>
        <ScrollArea class="mt-1 h-[min(23rem,58vh)]">
          <div v-if="packageView === 'list'" class="grid grid-cols-1 gap-1 p-1">
            <button v-for="item in visiblePackages" :key="item.id" type="button" class="group relative flex min-w-0 items-center gap-2.5 rounded-lg p-2 text-left hover:bg-muted/70" @click="selectPackage(item)">
              <Avatar class="size-10">
                <AvatarImage v-if="item.icon" :src="item.icon" :alt="item.name" />
                <AvatarFallback class="font-semibold text-white" :style="packageColor(item)">{{ item.name.slice(0, 1) }}</AvatarFallback>
              </Avatar>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1 text-sm font-medium"><span class="truncate">{{ item.name }}</span><Pin v-if="item.pinned" class="size-3 fill-current text-muted-foreground" /></span>
                <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ item.description || "暂无描述" }}</span>
              </span>
              <span class="absolute right-1.5 flex rounded-md bg-muted opacity-0 shadow-sm group-hover:opacity-100 mobile:opacity-100">
                <Button variant="ghost" size="icon-sm" @click.stop="togglePackagePin(item)"><Pin class="size-3.5" :class="item.pinned && 'fill-current'" /></Button>
                <Button variant="ghost" size="icon-sm" class="hover:text-destructive" @click.stop="removePackage(item)"><Trash2 class="size-3.5" /></Button>
              </span>
            </button>
          </div>
          <div v-else class="grid grid-cols-2 gap-2 p-1">
            <button v-for="item in visiblePackages" :key="item.id" type="button" class="group relative aspect-[4/5] overflow-hidden rounded-xl border text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl" :style="packageColor(item)" @click="selectPackage(item)">
              <span class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
              <span class="absolute inset-x-0 bottom-0 p-3 text-white"><span class="block text-sm font-semibold">{{ item.name }}</span><span class="mt-1 block max-h-0 overflow-hidden text-xs leading-5 text-white/75 opacity-0 transition-all group-hover:max-h-20 group-hover:opacity-100">{{ item.description || "暂无描述" }}</span></span>
              <span class="absolute right-1.5 top-1.5 flex rounded-md bg-black/35 opacity-0 backdrop-blur-sm group-hover:opacity-100 mobile:opacity-100">
                <Button variant="ghost" size="icon-sm" class="text-white hover:bg-white/15 hover:text-white" @click.stop="togglePackagePin(item)"><Pin class="size-3.5" :class="item.pinned && 'fill-current'" /></Button>
                <Button variant="ghost" size="icon-sm" class="text-white hover:bg-white/15 hover:text-red-300" @click.stop="removePackage(item)"><Trash2 class="size-3.5" /></Button>
              </span>
            </button>
          </div>
          <p v-if="visiblePackages.length === 0" class="py-12 text-center text-sm text-muted-foreground">没有匹配的角色</p>
        </ScrollArea>
      </PopoverContent>
    </Popover>

    <DropdownMenu v-model:open="opsMenuOpen">
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon-sm" class="rounded-full" :class="props.buttonClass" title="角色操作">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-48">
        <DropdownMenuItem :disabled="!conversation.activePackage" @click="conversation.activePackage && togglePackagePin(conversation.activePackage)">
          {{ conversation.activePackage?.pinned ? "取消置顶角色" : "置顶角色" }}
        </DropdownMenuItem>
        <DropdownMenuItem :disabled="!conversation.activePackage" @click="renameActivePackage">重命名角色</DropdownMenuItem>
        <DropdownMenuItem :disabled="!conversation.activePackage" @click="updateActivePackageDescription">更改角色描述</DropdownMenuItem>
        <DropdownMenuItem :disabled="!conversation.activePackage" @click="updateActivePackageIcon">更换角色头像</DropdownMenuItem>
        <DropdownMenuItem class="text-destructive focus:text-destructive" :disabled="!conversation.activePackage" @click="conversation.activePackage && removePackage(conversation.activePackage)">删除角色</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <div
      v-if="descriptionEditorOpen"
      class="absolute left-0 top-[calc(100%+0.25rem)] z-50 flex w-[min(22rem,calc(100vw-1rem))] items-center gap-2 rounded-xl border border-border/80 bg-popover p-2 shadow-xl"
      @mousedown.stop
    >
      <Input
        v-model="packageDescriptionDraft"
        autofocus
        class="h-9 min-w-0 flex-1"
        placeholder="角色描述"
        @keydown.enter.prevent="confirmPackageDescription"
        @keydown.esc.prevent="descriptionEditorOpen = false"
      />
      <Button size="sm" @click="confirmPackageDescription">保存</Button>
    </div>

    <input ref="avatarInput" class="hidden" type="file" accept="image/*" @change="saveActivePackageIcon" />
  </div>
</template>
