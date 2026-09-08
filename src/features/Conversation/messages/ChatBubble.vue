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
	RefreshCw,
	Trash2,
	Volume2,
} from "lucide-vue-next";
import {
	Button,
	ChatMessage,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/fluid";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import ComposerAttachmentStrip from "@/features/Conversation/composer/ComposerAttachmentStrip.vue";
import ConversationMarkdown from "@/features/Conversation/stage/markstream/ConversationMarkdown.vue";
import { computed } from "vue";
import type { MessageBubbleViewModel } from "../use-conversation";
import ChatSteps from "./ChatSteps.vue";
import WorldUpdateDivider from "./WorldUpdateDivider.vue";

const props = defineProps<{
	viewModel: MessageBubbleViewModel;
	generating?: boolean;
}>();

const emit = defineEmits<{
	"process-interaction": [];
	"delete-message": [containerId: string];
	"toggle-interval": [intervalId: string];
}>();

const actions = computed(() => props.viewModel.actions);
</script>

<template>
  <button
    v-if="viewModel.intervalSummary"
    type="button"
    class="mx-auto flex max-w-full items-center gap-2 rounded-full border bg-muted/65 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    @click="emit('toggle-interval', viewModel.intervalSummary.id)"
  >
    <Pencil class="size-3.5" />
    <span>{{ viewModel.intervalSummary.open ? '编辑模式中' : viewModel.intervalSummary.collapsed ? `编辑子对话 · ${viewModel.intervalSummary.count} 条消息` : '收起编辑子对话' }}</span>
  </button>
  <WorldUpdateDivider
    v-else-if="viewModel.role === 'system' && viewModel.pulses.length > 0"
    :updates="viewModel.pulses"
  />
  <ChatMessage
    v-else
    :id="`message-bubble-${viewModel.containerId}`"
    :from="viewModel.role === 'user' ? 'user' : 'assistant'"
    :time="viewModel.messageTime"
    :class="[
      viewModel.role === 'user'
        ? 'w-fit max-w-[77%] self-end ml-auto mobile:max-w-[88%]'
        : 'w-full max-w-full self-start',
    ]"
  >
    <div class="w-full min-w-0 whitespace-normal">
	  <ComposerAttachmentStrip
		v-if="viewModel.attachments.length || viewModel.references.length"
		:attachments="[...viewModel.attachments, ...viewModel.references]"
		:removable="false"
		class="mb-2"
	  />
      <ChatSteps
        :steps="viewModel.thinking as any"
        :working="viewModel.isGenerating ?? (generating && viewModel.role === 'assistant')"
        :started-at="viewModel.message?.meta?.generateInfo?.startTime"
        @interaction="emit('process-interaction')"
      />
      <ConversationComposerEditor
        v-if="actions.editState.isEditing"
        v-model="actions.editState.draftContent"
        compact
        inline-message-edit
        class="w-full"
        @submit="actions.saveEdit"
      />
      <ConversationMarkdown
        v-else
        :model-value="viewModel.message?.content ?? ''"
        class="w-full min-w-0"
      />
    </div>

    <template #actions>
      <div v-if="viewModel.message" data-window-drag-block class="flex items-center gap-0.5">
        <Button v-if="viewModel.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="上一个版本" :disabled="viewModel.activeVersionIndex <= 0" @click="actions.prevVersion()"><ChevronLeft class="size-4" /></Button>
        <span v-if="viewModel.role === 'assistant'" class="px-1 text-xs text-muted-foreground">{{ viewModel.activeVersionIndex + 1 }}/{{ viewModel.versionCount }}</span>
        <Button
          v-if="viewModel.role === 'assistant'"
          variant="ghost"
          size="icon-sm"
          class="rounded-full"
          :title="viewModel.isLastAssistant && viewModel.activeVersionIndex >= viewModel.versionCount - 1 ? '重新生成 (下一个版本)' : '下一个版本'"
          :disabled="viewModel.activeVersionIndex >= viewModel.versionCount - 1 ? (viewModel.isLastAssistant ? generating : true) : false"
          @click="actions.nextVersion()"
        >
          <ChevronRight class="size-4" />
        </Button>
        <Button v-if="actions.editState.isEditing" variant="ghost" size="icon-sm" class="rounded-full" title="保存" @click="actions.saveEdit"><Check class="size-4" /></Button>
        <Button v-else variant="ghost" size="icon-sm" class="rounded-full" title="编辑" @click="actions.startEdit"><Pencil class="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" class="rounded-full" title="复制" @click="actions.copy()"><Copy class="size-4" /></Button>
        <Button v-if="viewModel.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="重新生成" :disabled="generating" @click="actions.regenerate()"><RefreshCw class="size-4" /></Button>
        <Popover v-if="viewModel.hasPluginChanges">
          <PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="h-6 gap-1 rounded-full px-1.5 text-[11px] text-amber-500 hover:bg-amber-500/10 hover:text-amber-600" title="查看消息附属的 World 更新"><Database class="size-3" /><span>{{ viewModel.resourceSummary }}</span></Button></PopoverTrigger>
          <PopoverContent align="start" class="w-[min(28rem,calc(100vw-1rem))] space-y-3 p-3 text-xs">
            <div class="flex items-center gap-1.5 border-b pb-1.5 font-semibold text-amber-500"><Database class="size-4" />版本 World 更新</div>
            <div class="rounded-lg bg-muted/50 p-2 font-mono text-[11px]">{{ viewModel.pulses.length }} 个 Pulse</div>
          </PopoverContent>
        </Popover>
        <Popover v-if="viewModel.branchCount > 1">
          <PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full" title="分支"><GitBranch class="size-4" /></Button></PopoverTrigger>
          <PopoverContent class="w-56 p-2">
            <div class="grid grid-cols-5 gap-1">
              <Button v-for="(branchId, index) in viewModel.branchIds" :key="branchId" size="icon-sm" :variant="viewModel.activeBranchIndex === index ? 'default' : 'ghost'" @click="actions.gotoBranch(branchId)">{{ index + 1 }}</Button>
            </div>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full" title="更多操作"><MoreHorizontal class="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="actions.speak()"><Volume2 data-icon="inline-start" />朗读</DropdownMenuItem>
            <DropdownMenuItem @click="actions.exportScreenshot(null)"><Camera data-icon="inline-start" />截图并导出</DropdownMenuItem>
            <DropdownMenuItem v-if="viewModel.role !== 'user'" @click="actions.translate()"><Languages data-icon="inline-start" />翻译</DropdownMenuItem>
            <DropdownMenuItem class="text-destructive focus:text-destructive" @click="emit('delete-message', viewModel.containerId)"><Trash2 data-icon="inline-start" />删除消息</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span v-if="viewModel.role === 'assistant'" class="ml-2 text-xs text-muted-foreground tabular-nums">{{ viewModel.messageTime }}</span>
      </div>
    </template>
  </ChatMessage>
</template>
