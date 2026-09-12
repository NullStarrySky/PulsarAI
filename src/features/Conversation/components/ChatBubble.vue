<script setup lang="ts">
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Pencil,
	RefreshCw,
	Trash2,
	Volume2,
} from "lucide-vue-next";
import { computed } from "vue";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	ChatMessage as FluidChatMessage,
} from "@/components/fluid";
import { useContainerComposable } from "../dataflow/containerComposable";
import ConversationMarkdown from "../stage/markstream/ConversationMarkdown.vue";
import ChatSteps from "./ChatSteps.vue";

const props = defineProps<{
	chatId: string;
	containerId: string;
	intervalSummary?: {
		id: string;
		count: number;
		collapsed: boolean;
		open: boolean;
	};
}>();
const emit = defineEmits<{
	regenerate: [containerId: string];
	deleteContainer: [containerId: string, deleteDescendants: boolean];
	toggleInterval: [id: string];
}>();
const item = useContainerComposable(props.chatId, props.containerId);
const container = item.container;
const message = computed(() => item.message.current.value);

function deleteMessage() {
	const deleteDescendants = window.confirm(
		"将删除这条消息。是否同时删除其后的所有容器？\n\n确定：删除后续容器\n取消：仅删除当前消息，并保留后续容器。",
	);
	emit("deleteContainer", props.containerId, deleteDescendants);
}
</script>

<template>
  <button v-if="props.intervalSummary" type="button" class="mx-auto flex max-w-full items-center gap-2 rounded-full border bg-muted/65 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" @click="emit('toggleInterval', props.intervalSummary.id)">
    <Pencil class="size-3.5" />
    <span>{{ props.intervalSummary.open ? '编辑模式中' : props.intervalSummary.collapsed ? `编辑子对话 · ${props.intervalSummary.count} 条消息` : '收起编辑子对话' }}</span>
  </button>
  <FluidChatMessage
    v-else-if="container && message"
    :from="container.role === 'user' ? 'user' : 'assistant'"
    :time="item.utility.messageTime.value"
    :class="container.role === 'user' ? 'ml-auto w-fit max-w-[77%] self-end mobile:max-w-[88%]' : 'w-full self-start'"
  >
    <div class="w-full min-w-0">
      <p v-if="container.role === 'system' && item.interval.operations.value.length" class="text-xs text-muted-foreground">{{ item.interval.operations.value[0]?.kind === 'interval.open' ? '编辑模式中' : '编辑模式已结束' }}</p>
      <ChatSteps :steps="message.meta.steps" />
      <textarea v-if="item.message.edit.active" v-model="item.message.edit.content" class="min-h-24 w-full rounded-md border bg-background p-2 text-sm" @keydown.ctrl.enter.prevent="item.message.saveEdit" />
      <ConversationMarkdown v-else :content="message.content" compact />
    </div>
    <template #actions>
      <div class="flex items-center gap-0.5">
        <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" :disabled="!item.version.canPrev.value" title="上一个版本" @click="item.version.prev"><ChevronLeft class="size-4" /></Button>
        <span v-if="container.role === 'assistant'" class="px-1 text-xs text-muted-foreground">{{ item.version.index.value + 1 }}/{{ item.version.count.value }}</span>
        <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" :disabled="!item.version.canNext.value" title="下一个版本" @click="item.version.next"><ChevronRight class="size-4" /></Button>
        <Button v-if="item.message.edit.active" variant="ghost" size="icon-sm" title="保存" @click="item.message.saveEdit"><Check class="size-4" /></Button>
        <Button v-else variant="ghost" size="icon-sm" title="编辑" @click="item.message.startEdit"><Pencil class="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" title="复制" @click="item.utility.copy"><Copy class="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" title="朗读" @click="item.utility.speak"><Volume2 class="size-4" /></Button>
        <Button v-if="container.role === 'assistant'" variant="ghost" size="icon-sm" title="重新生成" @click="emit('regenerate', container.id)"><RefreshCw class="size-4" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" title="更多操作"><Trash2 class="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem class="text-destructive focus:text-destructive" @click="deleteMessage"><Trash2 data-icon="inline-start" />删除消息</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </template>
  </FluidChatMessage>
</template>
