<script setup lang="ts">
import {
	Camera,
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Database,
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
	Volume2,
} from "lucide-vue-next";
import { toRef } from "vue";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Message,
	MessageContent,
	MessageFooter,
} from "@/components/ui/message";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import ConversationMarkdown from "@/features/Conversation/stage/markstream/ConversationMarkdown.vue";
import ChatSteps from "./ChatSteps.vue";
import type { ChatMessage, ChatMessageContainer } from "./conversation-types";
import { useMessageBubble } from "./use-message-bubble";

const props = defineProps<{
	container: ChatMessageContainer;
	message: ChatMessage | null;
}>();
const emit = defineEmits<{ "process-interaction": [] }>();
const {
  conversation,
  editing,
  thinking,
  attachments,
  pluginChanges,
  hasPluginChanges,
  agentWorking,
  hasVisibleMessage,
  canNavigateNext,
  resourceSummary,
  startEdit,
  saveEdit,
  exportScreenshot,
  messageTime,
  attachmentPreviewUrl,
  formatAttachmentSize,
  openMessageAttachment,
} = useMessageBubble(toRef(props, "container"), toRef(props, "message"));
</script>

<template>
  <Message :align="container.role === 'user' ? 'end' : 'start'" class="group/message flex-col gap-1">
    <MessageContent :class="container.role === 'user' ? 'max-w-[77%] self-end mobile:max-w-[88%]' : 'w-full'">
      <Bubble :id="`message-bubble-${container.id}`" :align="container.role === 'user' ? 'end' : 'start'" :variant="container.role === 'user' ? 'tinted' : 'ghost'" :class="[container.role === 'user' ? 'max-w-full' : 'w-full p-0', message?.type === 'error' ? 'border border-destructive/30 bg-destructive/10 text-destructive' : '']">
        <BubbleContent :class="container.role === 'user' ? 'rounded-2xl' : 'w-full bg-transparent p-0'">
          <ChatSteps
            :steps="thinking"
            :working="agentWorking"
            :started-at="message?.meta.generateInfo?.startTime"
            :elapsed-ms="message?.meta.generateInfo?.timeUsed"
            @interaction="emit('process-interaction')"
          />
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
      <MessageFooter v-if="message && hasVisibleMessage" data-window-drag-block class="mt-1 flex h-7 w-full justify-between gap-2 px-0 transition-opacity" :class="container.role === 'assistant' ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 mobile:opacity-100'">
        <div class="flex min-w-0 items-center gap-0.5">
          <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="上一个版本" :disabled="(container.activeMessage ?? 0) <= 0" @click="conversation.navigateAssistantVersion(container.id, -1)"><ChevronLeft class="size-4" /></Button>
          <span class="px-1 text-xs text-muted-foreground">{{ (container.activeMessage ?? 0) + 1 }}/{{ Math.max(container.content.length, 1) }}</span>
          <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="下一个版本；末版时重新生成" :disabled="!canNavigateNext" @click="conversation.navigateAssistantVersion(container.id, 1)"><ChevronRight class="size-4" /></Button>
          <Button v-if="editing.active" variant="ghost" size="icon-sm" class="rounded-full" title="保存" @click="saveEdit"><Check class="size-4" /></Button>
          <Button v-else variant="ghost" size="icon-sm" class="rounded-full" title="编辑" @click="startEdit"><Pencil class="size-4" /></Button>
          <Button variant="ghost" size="icon-sm" class="rounded-full" title="复制" @click="conversation.copyMessage(container.id)"><Copy class="size-4" /></Button>
          <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="重新生成" :disabled="conversation.generating.value" @click="conversation.regenerate(container.id)"><RefreshCw class="size-4" /></Button>
          <slot name="messageAction" :container="container" :message="message" :conversation="conversation" />
          <Popover v-if="hasPluginChanges">
            <PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="h-6 gap-1 rounded-full px-1.5 text-[11px] text-amber-500 hover:bg-amber-500/10 hover:text-amber-600" title="查看消息附属的 Plugin 统计"><Database class="size-3" /><span>{{ resourceSummary }}</span></Button></PopoverTrigger>
            <PopoverContent align="start" class="w-[min(28rem,calc(100vw-1rem))] space-y-3 p-3 text-xs">
              <div class="flex items-center gap-1.5 border-b pb-1.5 font-semibold text-amber-500"><Database class="size-4" />版本 Plugin 变更</div>
              <div v-if="pluginChanges?.stats" class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-2 font-mono text-[11px]"><span>变更 {{ pluginChanges.changes.length }}</span><span>日志 {{ pluginChanges.stats.logCount }}</span><span>CodeAct {{ pluginChanges.stats.codeAct.attempted }}</span><span>编辑 {{ pluginChanges.stats.edit }}</span><span>创建 {{ pluginChanges.stats.create }}</span><span>移动 {{ pluginChanges.stats.move }}</span><span>删除 {{ pluginChanges.stats.remove }}</span><span>配置 {{ pluginChanges.stats.configure }}</span></div>
            </PopoverContent>
          </Popover>
          <Popover v-if="container.role !== 'user'"><PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full" title="分支"><GitBranch class="size-4" /></Button></PopoverTrigger><PopoverContent class="w-56 p-2"><Button variant="outline" size="sm" class="mb-2 w-full" :disabled="conversation.generating.value" @click="conversation.createBranch(container.id)"><Plus class="size-4" />新分支</Button><div class="grid grid-cols-5 gap-1"><Button v-for="(branchId, index) in conversation.branchIdsFor(container.id)" :key="branchId" size="icon-sm" :variant="conversation.activeBranchIdFor(container.id) === branchId ? 'default' : 'ghost'" @click="conversation.switchBranch(container.id, branchId)">{{ index + 1 }}</Button></div></PopoverContent></Popover>
          <DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full" title="更多操作"><MoreHorizontal class="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem @click="conversation.speakMessage(container.id)"><Volume2 data-icon="inline-start" />朗读</DropdownMenuItem><DropdownMenuItem @click="exportScreenshot"><Camera data-icon="inline-start" />截图并导出</DropdownMenuItem><DropdownMenuItem @click="conversation.toggleMessageFavorite(container.id)"><StarOff v-if="message.favorite" data-icon="inline-start" /><Star v-else data-icon="inline-start" />{{ message.favorite ? '取消收藏' : '收藏' }}</DropdownMenuItem><DropdownMenuItem v-if="container.role !== 'user'" @click="conversation.translateMessage(container.id)"><RotateCcw v-if="message.meta.translation" data-icon="inline-start" /><Languages v-else data-icon="inline-start" />{{ message.meta.translation ? '还原原文' : '翻译' }}</DropdownMenuItem><DropdownMenuItem class="text-destructive focus:text-destructive" @click="conversation.confirmDeleteMessage(container.id)"><Trash2 data-icon="inline-start" />删除消息</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
        <div class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><span class="tabular-nums">{{ messageTime() }}</span></div>
      </MessageFooter>
    </MessageContent>
  </Message>
</template>
