<script setup lang="ts">
import { computed, reactive } from "vue";
import { Camera, Check, ChevronLeft, ChevronRight, ChevronsRight, Copy, Database, GitBranch, Languages, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Star, StarOff, Trash2, Volume2 } from "lucide-vue-next";
import { push } from "notivue";
import { toBlob } from "html-to-image";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ConversationMarkdown from "@/features/Conversation/stage/markstream/ConversationMarkdown.vue";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import { useConversation } from "@/features/Conversation/use-conversation";
import { useMessageStore } from "./message-store";
import { useTranslateStore } from "@/features/Translate/translate-store";
import { playMessageSpeech } from "@/features/TTS/message-speech-cache";
import ChatSteps from "./ChatSteps.vue";
import type {
	ChatMessage,
	ChatMessageContainer,
	FilePart,
} from "./conversation-types";
import {
	attachmentPreviewUrl,
	formatAttachmentSize,
	openMessageAttachment,
} from "./message-attachment";

const props = defineProps<{
	container: ChatMessageContainer;
	message: ChatMessage | null;
}>();
const conversation = useConversation(computed(() => props.container.conversationid));
const messages = useMessageStore();
const translate = useTranslateStore();
const editing = reactive({ active: false, content: "" });
const thinking = computed(
	() =>
		props.message?.meta.steps.filter(
			(step) =>
				step.type === "thinking" ||
				step.type === "tool-call" ||
				step.type === "tool-result",
		) ?? [],
);
const attachments = computed(
	() =>
		props.message?.parts?.filter(
			(part): part is FilePart => part.type === "file",
		) ?? [],
);
function startEdit() { if (props.message) { editing.active = true; editing.content = props.message.content; } }
async function saveEdit() { if (!props.message) return; await conversation.updateMessage(props.container.id, editing.content); editing.active = false; }
async function copy() { if (!props.message?.content) return; await navigator.clipboard.writeText(props.message.content); push.success("已复制"); }
async function remove() { if (!window.confirm("删除这条消息？")) return; await conversation.deleteMessage(props.container.id); }
async function speak() { if (!props.message?.content.trim()) return; try { await playMessageSpeech(props.message.id, props.message.content); } catch (error) { push.error(error instanceof Error ? error.message : "朗读失败"); } }
async function toggleFavorite() { if (!props.message) return; props.message.favorite = !props.message.favorite; await messages.persist(props.container); }
async function translateMessage() {
  if (!props.message || !props.message.content.trim() || translate.translating) return;
  if (props.message.meta.translation) {
    props.message.content = props.message.meta.translation.originalContent;
    delete props.message.meta.translation;
  } else {
    const originalContent = props.message.content;
    try {
      props.message.content = await translate.translateText(originalContent, true);
      props.message.meta.translation = { originalContent, translatedAt: new Date().toISOString() };
    } catch { push.error(translate.errorText || "翻译失败"); return; }
  }
  await messages.persist(props.container);
}
async function exportScreenshot() {
  const element = document.getElementById(`message-bubble-${props.container.id}`);
  if (!element) return;
  try {
    const blob = await toBlob(element, { cacheBust: true, pixelRatio: 2, style: { borderRadius: "16px" } });
    if (!blob) throw new Error("生成截图失败");
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    push.success("截图已复制到剪切板");
  } catch (error) { push.error(error instanceof Error ? error.message : "截图导出失败"); }
}
function messageTime() { const value = props.message?.createdAt ?? props.message?.meta.generateInfo?.startTime; return value ? new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""; }
function formatValue(value: unknown) { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
</script>

<template>
  <Message :align="container.role === 'user' ? 'end' : 'start'" class="group/message flex-col gap-1">
    <MessageContent :class="container.role === 'user' ? 'max-w-[77%] self-end mobile:max-w-[88%]' : 'w-full'">
      <Bubble :id="`message-bubble-${container.id}`" :align="container.role === 'user' ? 'end' : 'start'" :variant="container.role === 'user' ? 'tinted' : 'ghost'" :class="[container.role === 'user' ? 'max-w-full' : 'w-full p-0', message?.type === 'error' ? 'border border-destructive/30 bg-destructive/10 text-destructive' : '']">
        <BubbleContent :class="container.role === 'user' ? 'rounded-2xl' : 'w-full bg-transparent p-0'">
          <ChatSteps :steps="thinking" />
          <div v-if="attachments.length" class="mb-2 flex flex-wrap gap-2">
            <button v-for="attachment in attachments" :key="attachment.filename" type="button" class="rounded-md border px-2 py-1 text-left text-xs" @click="openMessageAttachment(attachment)">
              <img v-if="attachmentPreviewUrl(attachment)" :src="attachmentPreviewUrl(attachment)" class="mr-1 inline size-5 rounded object-cover" alt="" />{{ attachment.filename }} · {{ formatAttachmentSize(attachment.size) }}
            </button>
          </div>
          <ConversationComposerEditor v-if="editing.active" v-model="editing.content" compact inline-message-edit class="w-full" @submit="saveEdit" />
          <ConversationMarkdown v-else-if="message?.type === 'error'" :model-value="message.content" :plugin-id="message.meta.environmentInfo?.pluginId" />
          <ConversationMarkdown v-else :model-value="message?.content ?? ''" :plugin-id="message?.meta.environmentInfo?.pluginId" />
        </BubbleContent>
      </Bubble>
      <MessageFooter v-if="message" data-window-drag-block class="mt-1 flex h-7 w-full justify-between gap-2 px-0 transition-opacity" :class="container.role === 'assistant' ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 mobile:opacity-100'">
        <div class="flex min-w-0 items-center gap-0.5">
          <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="上一个版本" :disabled="(container.activeMessage ?? 0) <= 0" @click="conversation.navigateAssistantVersion(container.id, -1)"><ChevronLeft class="size-4" /></Button>
          <span class="px-1 text-xs text-muted-foreground">{{ (container.activeMessage ?? 0) + 1 }}/{{ Math.max(container.content.length, 1) }}</span>
          <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="下一个版本；末版时重新生成" :disabled="conversation.generating.value" @click="conversation.navigateAssistantVersion(container.id, 1)"><ChevronRight class="size-4" /></Button>
          <Button v-if="editing.active" variant="ghost" size="icon-sm" class="rounded-full" title="保存" @click="saveEdit"><Check class="size-4" /></Button>
          <Button v-else variant="ghost" size="icon-sm" class="rounded-full" title="编辑" @click="startEdit"><Pencil class="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" class="rounded-full" title="复制" @click="copy"><Copy class="size-4" /></Button>
          <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="重新生成" :disabled="conversation.generating.value" @click="conversation.regenerate(container.id)"><RefreshCw class="size-4" /></Button>
          <Popover v-if="container.role !== 'user'"><PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full" title="分支"><GitBranch class="size-4" /></Button></PopoverTrigger><PopoverContent class="w-56 p-2"><Button variant="outline" size="sm" class="mb-2 w-full" :disabled="conversation.generating.value" @click="conversation.createBranch(container.id)"><Plus class="size-4" />新分支</Button><div class="grid grid-cols-5 gap-1"><Button v-for="(branchId, index) in conversation.branchIdsFor(container.id)" :key="branchId" size="icon-sm" :variant="conversation.activeBranchIdFor(container.id) === branchId ? 'default' : 'ghost'" @click="conversation.switchBranch(container.id, branchId)">{{ index + 1 }}</Button></div></PopoverContent></Popover>
          <DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full" title="更多操作"><MoreHorizontal class="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem @click="speak"><Volume2 data-icon="inline-start" />朗读</DropdownMenuItem><DropdownMenuItem v-if="container.role === 'assistant'" :disabled="conversation.generating.value" @click="conversation.continueFrom(container.id)"><ChevronsRight data-icon="inline-start" />继续</DropdownMenuItem><DropdownMenuItem @click="exportScreenshot"><Camera data-icon="inline-start" />截图并导出</DropdownMenuItem><DropdownMenuItem @click="toggleFavorite"><StarOff v-if="message.favorite" data-icon="inline-start" /><Star v-else data-icon="inline-start" />{{ message.favorite ? '取消收藏' : '收藏' }}</DropdownMenuItem><DropdownMenuItem v-if="container.role !== 'user'" @click="translateMessage"><RotateCcw v-if="message.meta.translation" data-icon="inline-start" /><Languages v-else data-icon="inline-start" />{{ message.meta.translation ? '还原原文' : '翻译' }}</DropdownMenuItem><DropdownMenuItem class="text-destructive focus:text-destructive" @click="remove"><Trash2 data-icon="inline-start" />删除消息</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
        <div class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><Popover v-if="message.meta.resourceUpdate?.operations?.length"><PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="h-6 gap-1 rounded-full px-1.5 text-[11px] text-amber-500 hover:bg-amber-500/10 hover:text-amber-600" title="查看资源更新记录"><Database class="size-3" /><span>资源更新</span></Button></PopoverTrigger><PopoverContent align="end" class="w-[min(28rem,calc(100vw-1rem))] space-y-2 p-3 font-mono text-xs"><div class="flex items-center gap-1.5 border-b pb-1.5 font-semibold text-amber-500"><Database class="size-4" />消息资源 Overlay 更新</div><div class="max-h-64 space-y-2 overflow-y-auto"><pre v-for="(operation, index) in message.meta.resourceUpdate.operations" :key="index" class="whitespace-pre-wrap break-words rounded border bg-muted/60 p-2">{{ formatValue(operation) }}</pre></div></PopoverContent></Popover><span class="tabular-nums">{{ messageTime() }}</span></div>
      </MessageFooter>
    </MessageContent>
  </Message>
</template>
