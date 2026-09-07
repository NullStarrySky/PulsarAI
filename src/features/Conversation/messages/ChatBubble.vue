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
import ConversationMarkdown from "@/features/Conversation/stage/markstream/ConversationMarkdown.vue";
import type { MessageBubbleViewModel } from "../use-conversation";
import ChatSteps from "./ChatSteps.vue";

const props = defineProps<{
	viewModel: MessageBubbleViewModel;
	generating?: boolean;
}>();

const emit = defineEmits<{
	"process-interaction": [];
	"delete-message": [containerId: string];
}>();

const actions = props.viewModel.actions;
</script>

<template>
  <ChatMessage
    :id="`message-bubble-${viewModel.containerId}`"
    :from="viewModel.role === 'user' ? 'user' : 'assistant'"
    :time="viewModel.messageTime"
    :class="[
      viewModel.role === 'user'
        ? 'max-w-[77%] self-end mobile:max-w-[88%]'
        : 'w-full max-w-full self-start',
      viewModel.message?.type === 'error'
        ? 'border border-destructive/30 bg-destructive/10 text-destructive rounded-2xl p-3'
        : '',
    ]"
  >
    <div class="whitespace-normal">
      <ChatSteps
        :steps="viewModel.thinking as any"
        :working="generating && viewModel.role === 'assistant'"
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
        v-else-if="viewModel.message?.type === 'error'"
        :model-value="viewModel.message.content"
      />
      <ConversationMarkdown
        v-else
        :model-value="viewModel.message?.content ?? ''"
      />
    </div>

    <template #actions>
      <div v-if="viewModel.message" data-window-drag-block class="flex items-center gap-0.5">
        <Button v-if="viewModel.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="上一个版本" :disabled="viewModel.activeVersionIndex <= 0" @click="actions.prevVersion()"><ChevronLeft class="size-4" /></Button>
        <span v-if="viewModel.role === 'assistant'" class="px-1 text-xs text-muted-foreground">{{ viewModel.activeVersionIndex + 1 }}/{{ viewModel.versionCount }}</span>
        <Button v-if="viewModel.role === 'assistant'" variant="ghost" size="icon-sm" class="rounded-full" title="下一个版本" :disabled="viewModel.activeVersionIndex >= viewModel.versionCount - 1" @click="actions.nextVersion()"><ChevronRight class="size-4" /></Button>
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
