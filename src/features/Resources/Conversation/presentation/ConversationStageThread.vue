<script setup lang="ts">
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Languages,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from "lucide-vue-next";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslateStore } from "@/features/Translate/application/translate-store";
import { useConversationStore } from "../application/conversation-store";
import type { ActionPart, ChatMessage, ChatMessageContainer, FilePart } from "../domain/conversation-types";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";
import ConversationMessageContent from "./ConversationMessageContent.vue";
import MessageActionBadge from "./MessageActionBadge.vue";
import MessageAttachmentStrip from "./MessageAttachmentStrip.vue";

const conversation = useConversationStore();
const translate = useTranslateStore();
const root = ref<HTMLElement | null>(null);
const editing = reactive({ containerId: "", messageId: "", content: "" });
const activePath = computed(() => conversation.activePath.filter((item) =>
  item.role !== "system" || Boolean(messageOf(item)?.content),
));

function messageOf(container: ChatMessageContainer) {
  return conversation.currentMessage(container);
}

function fileParts(message?: ChatMessage | null): FilePart[] {
  return (message?.parts ?? []).filter((part): part is FilePart => part.type === "file");
}

function actionPart(message?: ChatMessage | null) {
  return message?.parts?.find((part): part is ActionPart => part.type === "action") ?? null;
}

function generating(container: ChatMessageContainer) {
  const info = messageOf(container)?.meta.generateInfo;
  return conversation.isConversationGenerating(container.conversationid)
    && info !== undefined
    && info.timeUsed === undefined;
}

function isEditing(container: ChatMessageContainer) {
  return editing.containerId === container.id && editing.messageId === messageOf(container)?.id;
}

function startEdit(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) return;
  Object.assign(editing, { containerId: container.id, messageId: message.id, content: message.content });
}

async function saveEdit() {
  if (!editing.containerId || !editing.messageId) return;
  await conversation.editMessage(editing.containerId, editing.messageId, editing.content);
  Object.assign(editing, { containerId: "", messageId: "", content: "" });
}

async function copy(container: ChatMessageContainer) {
  const content = messageOf(container)?.content;
  if (!content) return;
  await navigator.clipboard.writeText(content);
  push.success("已复制");
}

async function toggleFavorite(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) return;
  await conversation.setMessageFavorite(container.id, message.id, !message.favorite);
}

async function translateMessage(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) return;
  if (message.meta.translation) {
    await conversation.restoreMessageOriginal(container.id, message.id);
    return;
  }
  if (!message.content.trim() || translate.translating) return;
  try {
    const translated = await translate.translateText(message.content, true);
    await conversation.setMessageTranslation(container.id, message.id, translated);
  } catch {
    push.error(translate.errorText || "翻译失败");
  }
}

async function switchMessage(container: ChatMessageContainer, direction: -1 | 1) {
  const active = container.activeMessage ?? 0;
  const next = active + direction;
  if (next >= container.content.length) {
    await conversation.regenerate(container.id);
    return;
  }
  await conversation.switchMessage(container.id, Math.max(0, next));
}

function scrollToBottom() {
  void nextTick(() => {
    const viewport = root.value?.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']");
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  });
}

watch(
  () => activePath.value.map((item) => `${item.id}:${messageOf(item)?.content.length ?? 0}`).join("|"),
  scrollToBottom,
  { immediate: true },
);
</script>

<template>
  <div ref="root" class="absolute inset-0 min-h-0 min-w-0">
    <ScrollArea class="h-full w-full">
      <div class="grid min-h-full w-full grid-cols-[minmax(1rem,1fr)_minmax(0,724px)_minmax(1rem,1fr)] mobile:block">
        <div aria-hidden="true" class="mobile:hidden" />
        <div class="flex min-h-full min-w-0 flex-col justify-end px-4 pb-48 pt-5 mobile:px-3 mobile:pb-44">
          <div v-if="activePath.length" class="flex flex-col gap-4">
            <article v-for="container in activePath" :key="container.id" class="group/message min-w-0" :class="container.role === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start'">
              <details v-if="messageOf(container)?.meta.steps?.length" class="mb-2 w-full max-w-xl rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                <summary class="cursor-pointer font-medium">过程步骤（{{ messageOf(container)?.meta.steps.length }}）</summary>
                <pre class="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words border-t pt-2 text-[11px]">{{ JSON.stringify(messageOf(container)?.meta.steps, null, 2) }}</pre>
              </details>

              <div
                class="min-w-0 text-[0.9375rem] leading-6"
                :class="[
                  container.role === 'user' ? 'max-w-[77%] rounded-2xl bg-foreground/5 px-3 py-2 mobile:max-w-[88%]' : 'w-full',
                  messageOf(container)?.type === 'error' && 'rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive',
                ]"
              >
                <MessageActionBadge v-if="actionPart(messageOf(container))" :action="actionPart(messageOf(container))!" class="mb-2" />
                <MessageAttachmentStrip v-if="fileParts(messageOf(container)).length" :attachments="fileParts(messageOf(container))" class="mb-2" />
                <ConversationComposerEditor v-if="isEditing(container)" v-model="editing.content" compact @submit="saveEdit" />
                <ConversationMessageContent
                  v-else
                  :content="messageOf(container)?.content || (generating(container) ? '生成中…' : '')"
                  :compact="messageOf(container)?.type === 'error'"
                />
              </div>

              <div class="mt-1 flex h-7 items-center gap-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 mobile:opacity-100" :class="container.role === 'user' && 'flex-row-reverse'">
                <Button variant="ghost" size="icon-sm" class="rounded-full" title="上一个版本" @click="switchMessage(container, -1)"><ChevronLeft class="size-3.5" /></Button>
                <span class="px-1 text-xs">{{ (container.activeMessage ?? 0) + 1 }}/{{ Math.max(container.content.length, 1) }}</span>
                <Button variant="ghost" size="icon-sm" class="rounded-full" title="下一个版本" @click="switchMessage(container, 1)"><ChevronRight class="size-3.5" /></Button>
                <Button v-if="isEditing(container)" variant="ghost" size="icon-sm" class="rounded-full" title="保存" @click="saveEdit"><Check class="size-3.5" /></Button>
                <Button v-else variant="ghost" size="icon-sm" class="rounded-full" title="编辑" @click="startEdit(container)"><Pencil class="size-3.5" /></Button>
                <Button variant="ghost" size="icon-sm" class="rounded-full" title="复制" @click="copy(container)"><Copy class="size-3.5" /></Button>
                <Button v-if="container.role !== 'user'" variant="ghost" size="icon-sm" class="rounded-full" title="重新生成" @click="conversation.regenerate(container.id)"><RefreshCw class="size-3.5" /></Button>
                <Popover v-if="container.role !== 'user'">
                  <PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full" title="分支"><GitBranch class="size-3.5" /></Button></PopoverTrigger>
                  <PopoverContent class="w-56 p-2">
                    <Button variant="outline" size="sm" class="mb-2 w-full" @click="conversation.createBranch(container.id)"><Plus class="size-3.5" />新分支</Button>
                    <div class="grid grid-cols-5 gap-1">
                      <Button v-for="(branchId, index) in conversation.branchIdsFor(container.id)" :key="branchId" size="icon-sm" :variant="conversation.activeBranchIdFor(container.id) === branchId ? 'default' : 'ghost'" @click="conversation.switchBranch(container.id, branchId)">{{ index + 1 }}</Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full"><MoreHorizontal class="size-3.5" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @click="toggleFavorite(container)"><StarOff v-if="messageOf(container)?.favorite" class="mr-2 size-4" /><Star v-else class="mr-2 size-4" />{{ messageOf(container)?.favorite ? "取消收藏" : "收藏" }}</DropdownMenuItem>
                    <DropdownMenuItem v-if="container.role !== 'user'" @click="translateMessage(container)"><RotateCcw v-if="messageOf(container)?.meta.translation" class="mr-2 size-4" /><Languages v-else class="mr-2 size-4" />{{ messageOf(container)?.meta.translation ? "还原原文" : "翻译" }}</DropdownMenuItem>
                    <DropdownMenuItem class="text-destructive focus:text-destructive" @click="conversation.deleteContainer(container.id)"><Trash2 class="mr-2 size-4" />删除消息</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </article>
          </div>

          <div v-else class="flex min-h-72 flex-1 flex-col items-center justify-center text-center">
            <div class="flex size-14 items-center justify-center rounded-2xl bg-muted text-xl font-semibold text-muted-foreground">{{ conversation.activePackage?.name.slice(0, 1) ?? "P" }}</div>
            <h1 class="mt-4 text-lg font-medium">和 {{ conversation.activePackage?.name ?? "Pulsar" }} 开始新的会话</h1>
            <p class="mt-1 max-w-sm text-sm text-muted-foreground">{{ conversation.activePackage?.description || "输入一条消息开始。" }}</p>
          </div>
        </div>
        <div aria-hidden="true" class="mobile:hidden" />
      </div>
    </ScrollArea>
  </div>
</template>
