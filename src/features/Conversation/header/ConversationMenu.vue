<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { push } from "notivue";
import {
  ChevronDown,
  Clock,
  FilePlus2,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  TimerOff,
  Trash2,
} from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
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
import type { Conversation } from "@/features/Conversation/messages/conversation-types";

/**
 * Conversation management for the stage header: selector popover with search,
 * the new-conversation split button (default/blank/ephemeral), inline rename,
 * and the active-conversation operations menu. `active` reports whether any of
 * its surfaces is open so the header shell stays visible while interacting.
 */
const props = defineProps<{
  buttonClass?: string;
}>();

const active = defineModel<boolean>("active", { required: true });

const conversation = useConversationStore();
const conversationMenuOpen = ref(false);
const opsMenuOpen = ref(false);
const conversationSearch = ref("");
const renamingConversation = ref(false);
const conversationTitleDraft = ref("");

watchEffect(() => {
  active.value = conversationMenuOpen.value
    || opsMenuOpen.value
    || renamingConversation.value;
});

const visibleConversations = computed(() => {
  const keyword = conversationSearch.value.trim().toLocaleLowerCase();
  return conversation.conversations
    .filter((item) => item.packageId === conversation.activePackageId)
    .filter((item) => !keyword || item.title.toLocaleLowerCase().includes(keyword))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      || b.updatedAt.localeCompare(a.updatedAt));
});

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

async function createConversation(options: { ignoreTemplate?: boolean; isEphemeral?: boolean } = {}) {
  if (!conversation.activePackageId) return;
  conversationMenuOpen.value = false;
  await conversation.createConversation(conversation.activePackageId, options);
}

async function cancelActiveConversationEphemeral() {
  if (!conversation.activeConversation) return;
  await conversation.updateConversation(conversation.activeConversation.id, { isEphemeral: false });
  push.success("已取消临时状态，转换为普通会话");
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
  <div class="relative flex min-w-0 items-center gap-0.5">
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
        <button type="button" class="flex h-9 min-w-0 max-w-[320px] items-center rounded-lg px-2 text-left text-base font-medium mobile:max-w-[42vw] mobile:text-sm" :class="props.buttonClass">
          <span class="truncate">{{ conversation.activeConversation?.title ?? "选择会话" }}</span>
          <Badge v-if="conversation.activeConversation?.isTemplate" variant="secondary" class="ml-1 shrink-0 px-1.5 text-[10px]">模板</Badge>
          <Badge v-if="conversation.activeConversation?.isEphemeral" variant="secondary" class="ml-1 shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 text-[10px]">临时</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" :side-offset="7" class="w-[min(20rem,calc(100vw-1rem))] gap-0 rounded-xl border border-border/80 p-2 shadow-xl">
        <div class="flex items-center gap-2 p-1">
          <div class="relative min-w-0 flex-1">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="conversationSearch" class="h-9 pl-8 focus:!border-border focus-visible:!border-border focus-visible:!ring-0 focus-visible:!ring-offset-0" placeholder="搜索会话" />
          </div>
          <div class="flex items-center">
            <Button variant="secondary" size="icon-sm" class="rounded-r-none border-r border-border/60" :disabled="!conversation.activePackageId" title="新建会话" @click="createConversation()"><Plus class="size-4" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="secondary" size="icon-sm" class="w-6 rounded-l-none px-0" :disabled="!conversation.activePackageId" title="新建方式">
                  <ChevronDown class="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-36">
                <DropdownMenuItem @click="createConversation()"><Plus data-icon="inline-start" />新建默认会话</DropdownMenuItem>
                <DropdownMenuItem @click="createConversation({ ignoreTemplate: true })"><FilePlus2 data-icon="inline-start" />新建空白会话</DropdownMenuItem>
                <DropdownMenuItem @click="createConversation({ isEphemeral: true })"><Clock data-icon="inline-start" />新建临时会话</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <ScrollArea class="mt-1 h-[min(19rem,55vh)]">
          <div class="space-y-0.5 p-1">
            <button v-for="item in visibleConversations" :key="item.id" type="button" class="group flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left hover:bg-muted/70" :class="conversation.activeConversationId === item.id && 'bg-muted/55'" @click="selectConversation(item)">
              <Pin v-if="item.pinned" class="size-3.5 shrink-0 fill-current text-muted-foreground" />
              <span class="flex min-w-0 flex-1 items-center gap-1">
                <span class="truncate text-sm">{{ item.title }}</span>
                <Badge v-if="item.isTemplate" variant="secondary" class="shrink-0 px-1.5 text-[10px]">模板</Badge>
                <Badge v-if="item.isEphemeral" variant="secondary" class="shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 text-[10px]">临时</Badge>
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

    <DropdownMenu v-model:open="opsMenuOpen">
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon-sm" class="rounded-full" :class="props.buttonClass" title="会话操作">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-48">
        <DropdownMenuItem :disabled="!conversation.activeConversation" @click="conversation.activeConversation && toggleConversationPin(conversation.activeConversation)">
          {{ conversation.activeConversation?.pinned ? "取消置顶会话" : "置顶会话" }}
        </DropdownMenuItem>
        <DropdownMenuItem :disabled="!conversation.activeConversation" @click="toggleActiveConversationTemplate">
          {{ conversation.activeConversation?.isTemplate ? "取消会话模板" : "将对话设为模板" }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="conversation.activeConversation?.isEphemeral" @click="cancelActiveConversationEphemeral">
          <TimerOff data-icon="inline-start" />取消临时状态
        </DropdownMenuItem>
        <DropdownMenuItem :disabled="!conversation.activeConversation" @click="renameActiveConversation">重命名会话</DropdownMenuItem>
        <DropdownMenuItem class="text-destructive focus:text-destructive" :disabled="!conversation.activeConversation" @click="conversation.activeConversation && removeConversation(conversation.activeConversation)">删除会话</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
