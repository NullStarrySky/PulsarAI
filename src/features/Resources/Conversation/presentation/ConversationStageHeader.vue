<script setup lang="ts">
import {
  CalendarClock,
  FolderTree,
  Grid2X2,
  List,
  Maximize2,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCommandStore } from "@/features/Hotkey/application/command-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import SchedulePage from "@/features/UI/schedule/presentation/SchedulePage.vue";
import { useConversationStore } from "../application/conversation-store";
import type { CharacterPackage, Conversation } from "../domain/conversation-types";
import { startWindowDragFromBackground } from "@/features/UI/application/window-drag";

const assetOpen = defineModel<boolean>("assetOpen", { required: true });
const conversation = useConversationStore();
const command = useCommandStore();
const layout = useLayoutStore();
const packageMenuOpen = ref(false);
const conversationMenuOpen = ref(false);
const scheduleOpen = ref(false);
const packageSearch = ref("");
const conversationSearch = ref("");
const packageView = ref<"list" | "card">("list");
const renamingPackage = ref(false);
const renamingConversation = ref(false);
const descriptionEditorOpen = ref(false);
const packageNameDraft = ref("");
const conversationTitleDraft = ref("");
const packageDescriptionDraft = ref("");
const avatarInput = ref<HTMLInputElement | null>(null);

const visiblePackages = computed(() => {
  const keyword = packageSearch.value.trim().toLocaleLowerCase();
  return [...conversation.packages]
    .filter((item) => !keyword || item.name.toLocaleLowerCase().includes(keyword)
      || item.description?.toLocaleLowerCase().includes(keyword))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      || (a.order ?? 0) - (b.order ?? 0));
});

const visibleConversations = computed(() => {
  const keyword = conversationSearch.value.trim().toLocaleLowerCase();
  return conversation.conversations
    .filter((item) => item.packageId === conversation.activePackageId)
    .filter((item) => !keyword || item.title.toLocaleLowerCase().includes(keyword))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      || b.updatedAt.localeCompare(a.updatedAt));
});

function packageColor(item?: CharacterPackage) {
  const source = item?.id ?? "pulsar";
  let hash = 0;
  for (const character of source) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return { background: `linear-gradient(135deg, hsl(${hue} 45% 38%), hsl(${(hue + 52) % 360} 60% 58%))` };
}

function updatedAtLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
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

async function createConversation() {
  if (!conversation.activePackageId) return;
  conversationMenuOpen.value = false;
  await conversation.createConversation(conversation.activePackageId);
}

function selectConversation(item: Conversation) {
  conversation.openConversation(item.id);
  conversationMenuOpen.value = false;
}

async function removeConversation(item: Conversation) {
  if (!window.confirm(`删除会话“${item.title}”？`)) return;
  await conversation.deleteConversation(item.id);
}

async function toggleConversationPin(item: Conversation) {
  await conversation.updateConversation(item.id, { pinned: !item.pinned });
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

async function updateActivePackageDescription() {
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

function renameActiveConversation() {
  const item = conversation.activeConversation;
  if (!item) return;
  conversationTitleDraft.value = item.title;
  renamingConversation.value = true;
}

async function confirmConversationRename() {
  if (!renamingConversation.value) return;
  renamingConversation.value = false;
  const item = conversation.activeConversation;
  const title = conversationTitleDraft.value.trim();
  if (item && title && title !== item.title) await conversation.updateConversation(item.id, { title });
}

async function toggleActiveConversationTemplate() {
  const item = conversation.activeConversation;
  if (!item) return;
  await conversation.updateConversation(item.id, { isTemplate: !item.isTemplate });
}
</script>

<template>
  <header class="relative z-30 flex h-12 shrink-0 select-none items-center border-b border-border/60 bg-transparent px-3 mobile:h-14 mobile:px-2" @mousedown="startWindowDragFromBackground">
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
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
          <button type="button" class="flex h-9 min-w-0 max-w-44 items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mobile:max-w-32">
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

      <div
        v-if="descriptionEditorOpen"
        class="absolute left-3 top-[calc(100%+0.25rem)] z-50 flex w-[min(22rem,calc(100vw-1rem))] items-center gap-2 rounded-xl border border-border/80 bg-popover p-2 shadow-xl"
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

      <span class="h-4 w-px shrink-0 bg-border" />

      <Input
        v-if="renamingConversation"
        v-model="conversationTitleDraft"
        autofocus
        class="h-8 min-w-24 max-w-[320px] px-2 text-base font-medium mobile:max-w-[42vw] mobile:text-sm"
        @keydown.enter.prevent="confirmConversationRename"
        @keydown.esc.prevent="renamingConversation = false"
        @blur="confirmConversationRename"
      />
      <Popover v-else v-model:open="conversationMenuOpen">
        <PopoverTrigger as-child>
          <button type="button" class="flex h-9 min-w-0 max-w-[320px] items-center rounded-lg px-2 text-left text-base font-medium hover:bg-muted/60 mobile:max-w-[42vw] mobile:text-sm">
            <span class="truncate">{{ conversation.activeConversation?.title ?? "选择会话" }}</span>
            <Badge v-if="conversation.activeConversation?.isTemplate" variant="secondary" class="ml-1 shrink-0 px-1.5 text-[10px]">模板</Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" :side-offset="7" class="w-[min(20rem,calc(100vw-1rem))] gap-0 rounded-xl border border-border/80 p-2 shadow-xl">
          <div class="flex items-center gap-2 p-1">
            <div class="relative min-w-0 flex-1">
              <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="conversationSearch" class="h-9 pl-8 focus:!border-border focus-visible:!border-border focus-visible:!ring-0 focus-visible:!ring-offset-0" placeholder="搜索会话" />
            </div>
            <Button variant="secondary" size="icon-sm" :disabled="!conversation.activePackageId" title="新建会话" @click="createConversation"><Plus class="size-4" /></Button>
          </div>
          <ScrollArea class="mt-1 h-[min(19rem,55vh)]">
            <div class="space-y-0.5 p-1">
              <button v-for="item in visibleConversations" :key="item.id" type="button" class="group flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left hover:bg-muted/70" :class="conversation.activeConversationId === item.id && 'bg-muted/55'" @click="selectConversation(item)">
                <Pin v-if="item.pinned" class="size-3.5 shrink-0 fill-current text-muted-foreground" />
                <span class="flex min-w-0 flex-1 items-center gap-1">
                  <span class="truncate text-sm">{{ item.title }}</span>
                  <Badge v-if="item.isTemplate" variant="secondary" class="shrink-0 px-1.5 text-[10px]">模板</Badge>
                </span>
                <span class="shrink-0 text-xs text-muted-foreground group-hover:hidden">{{ updatedAtLabel(item.updatedAt) }}</span>
                <span class="hidden shrink-0 group-hover:flex mobile:flex">
                  <Button variant="ghost" size="icon-sm" @click.stop="toggleConversationPin(item)"><Pin class="size-3.5" :class="item.pinned && 'fill-current'" /></Button>
                  <Button variant="ghost" size="icon-sm" class="hover:text-destructive" @click.stop="removeConversation(item)"><Trash2 class="size-3.5" /></Button>
                </span>
              </button>
              <p v-if="visibleConversations.length === 0" class="py-12 text-center text-sm text-muted-foreground">暂无会话</p>
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground" title="角色与会话操作">
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
          <DropdownMenuSeparator />
          <DropdownMenuItem :disabled="!conversation.activeConversation" @click="conversation.activeConversation && toggleConversationPin(conversation.activeConversation)">
            {{ conversation.activeConversation?.pinned ? "取消置顶会话" : "置顶会话" }}
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="!conversation.activeConversation" @click="toggleActiveConversationTemplate">
            {{ conversation.activeConversation?.isTemplate ? "取消会话模板" : "将对话设为模板" }}
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="!conversation.activeConversation" @click="renameActiveConversation">重命名会话</DropdownMenuItem>
          <DropdownMenuItem class="text-destructive focus:text-destructive" :disabled="!conversation.activeConversation" @click="conversation.activeConversation && removeConversation(conversation.activeConversation)">删除会话</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="flex shrink-0 items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground/65 hover:bg-muted/60" title="设置" @click="layout.openSettings"><Settings class="size-4.5" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground/65 hover:bg-muted/60" title="定时任务" @click="scheduleOpen = true"><CalendarClock class="size-4.5" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground/65 hover:bg-muted/60" title="搜索" @click="command.openPalette()"><Search class="size-4.5" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground/65 hover:bg-muted/60" :class="assetOpen && 'bg-muted/75'" title="资产" @click="assetOpen = !assetOpen"><FolderTree class="size-4.5" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground/65 hover:bg-muted/60" title="沉浸全屏" @click="layout.setImmersiveConversation(true)"><Maximize2 /></Button>
    </div>
  </header>

  <input ref="avatarInput" class="hidden" type="file" accept="image/*" @change="saveActivePackageIcon" />

  <Dialog v-model:open="scheduleOpen">
    <DialogContent class="h-[min(46rem,calc(100dvh-2rem))] max-w-5xl overflow-hidden p-0">
      <DialogHeader class="sr-only"><DialogTitle>定时任务</DialogTitle></DialogHeader>
      <SchedulePage />
    </DialogContent>
  </Dialog>
</template>
