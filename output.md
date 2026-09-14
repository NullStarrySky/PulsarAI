

src/features/Conversation/clear-data.ts

import { push } from "notivue";
import { resetCharacterData } from "@/features/Database/database-service";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { clearResourceSyncMetadata } from "@/features/Database/sync-metadata";

/** Clear character-owned database records and discard their in-memory mirrors. */
export async function resetCharacterDataAction() {
	if (!window.confirm("清空全部角色包、对话、插件和本地资源，并恢复初始状态？设置、模型连接、密钥和备份不会改动。")) return;
	try {
		useSyncStore().clearAll();
		await resetCharacterData();
		clearResourceSyncMetadata();
		window.location.reload();
	} catch (error) {
		push.error(error instanceof Error ? error.message : "无法清理角色数据。");
	}
}


src/features/Conversation/components/ChatBubble.vue

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
} from "@/lib/phosphor-icons";
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


src/features/Conversation/components/ChatComposer.vue

<script setup lang="ts">
import { computed } from "vue";
import { InputMessage } from "@/components/fluid";
import { useActivePathComposable } from "../dataflow/activePathComposable";

const props = defineProps<{ chatId: string }>();
const conversation = useActivePathComposable(props.chatId);
const disabled = computed(() => !conversation.chat.value);
function send() {
	conversation.send();
}
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[756px] px-4 pb-4 mobile:px-2 mobile:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    <InputMessage v-model="conversation.draft.value" :disabled="disabled" class="pointer-events-auto" placeholder="输入消息…" send-label="发送" @send="send" />
  </div>
</template>


src/features/Conversation/components/ChatManager.vue

<script setup lang="ts">
import { MessageCircle, Pin, Plus, Search, Trash2, X } from "@/lib/phosphor-icons";
import { computed, ref } from "vue";
import { Badge, Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { useChatList } from "../dataflow/chats";

const props = defineProps<{
	localPluginId: string;
	chatId: string;
	open: boolean;
}>();
const emit = defineEmits<{
	"update:open": [open: boolean];
	select: [chatId: string];
	close: [chatId: string];
}>();
const search = ref("");
const chatList = useChatList(props.localPluginId);
const visible = computed(() => {
	const query = search.value.trim().toLocaleLowerCase();
	return [...chatList.chats.value]
		.filter((chat) => !query || chat.title.toLocaleLowerCase().includes(query))
		.sort(
			(a, b) =>
				Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
				b.updatedAt.localeCompare(a.updatedAt),
		);
});
function select(chatId: string) {
	emit("select", chatId);
	emit("update:open", false);
}
function create() {
	const chat = chatList.create();
	select(chat.id);
}
function remove(chatId: string) {
	const chat = [...chatList.chats.value].find((value) => value.id === chatId);
	if (!chat || !window.confirm(`删除会话“${chat.title}”？`)) return;
	chatList.delete(chatId);
	emit("close", chatId);
	if (chatId === props.chatId) {
		const next = [...chatList.chats.value][0] ?? chatList.create();
		emit("select", next.id);
	}
}
function togglePinned(chatId: string, event: MouseEvent) {
	event.stopPropagation();
	const chat = [...chatList.chats.value].find((value) => value.id === chatId);
	if (!chat) return;
	chat.pinned = !chat.pinned;
	chat.updatedAt = new Date().toISOString();
	useSyncStore().markDirty({ type: "meta", id: chat.id });
}
</script>

<template>
  <aside v-if="props.open" class="flex h-full w-80 max-w-[85vw] shrink-0 flex-col border-l bg-background mobile:absolute mobile:inset-y-0 mobile:right-0 mobile:z-40 mobile:shadow-2xl">
    <header class="flex items-center gap-2 border-b p-3"><div class="relative min-w-0 flex-1"><Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-8 pl-8 text-xs" placeholder="搜索会话…" /></div><Button variant="ghost" size="icon-sm" title="关闭会话列表" @click="emit('update:open', false)"><X class="size-4" /></Button></header>
    <div class="flex gap-2 border-b p-3"><Button size="sm" class="flex-1" @click="create"><Plus class="size-4" />新建会话</Button></div>
    <ScrollArea class="min-h-0 flex-1"><div class="space-y-1 p-2">
      <button v-for="chat in visible" :key="chat.id" type="button" class="group flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted" :class="chat.id === props.chatId && 'bg-primary/10'" @click="select(chat.id)">
        <span class="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><MessageCircle class="size-3.5" /></span>
        <span class="min-w-0 flex-1"><span class="flex items-center gap-1"><span class="truncate text-sm font-medium">{{ chat.title }}</span><Badge v-if="chat.lifetime === 'app'" variant="secondary" class="px-1 text-[10px]">临时</Badge></span><span class="block truncate text-[10px] text-muted-foreground">{{ chat.lastMessagePreview || '暂无消息' }}</span></span>
        <Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100" :class="chat.pinned && 'text-primary opacity-100'" title="置顶" @click="togglePinned(chat.id, $event)"><Pin class="size-3.5" /></Button>
        <Button variant="ghost" size="icon-sm" class="size-7 opacity-0 group-hover:opacity-100 hover:text-destructive" title="删除" @click.stop="remove(chat.id)"><Trash2 class="size-3.5" /></Button>
      </button>
      <p v-if="!visible.length" class="py-12 text-center text-sm text-muted-foreground">暂无会话</p>
    </div></ScrollArea>
  </aside>
</template>


src/features/Conversation/components/ChatSteps.vue

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ThinkingIndicator, ThinkingStep, ThinkingSteps, ThinkingStepsContent, ThinkingStepsHeader } from "@/components/fluid";
import type { ThinkingStep as MessageThinkingStep, ToolCallResult, ToolCallStep } from "../dataflow/types";

const props = defineProps<{ steps: Array<MessageThinkingStep | ToolCallStep | ToolCallResult>; working?: boolean; startedAt?: string }>();
const open = ref(true);
const elapsed = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
const rows = computed(() => props.steps.map(step => step.type === "thinking" ? { id: step.id, label: "思考", description: step.message } : { id: step.toolCallId, label: step.type === "tool-call" ? "调用" : "完成", description: step.toolName }));
function refreshElapsed() { const started = Date.parse(props.startedAt ?? ""); elapsed.value = Number.isFinite(started) ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : 0; }
watch(() => [props.working, props.startedAt], ([working]) => { if (timer) clearInterval(timer); refreshElapsed(); if (working) timer = setInterval(refreshElapsed, 1000); }, { immediate: true });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <ThinkingSteps v-if="rows.length" v-model:open="open" class="mb-2 w-full max-w-2xl text-xs">
    <ThinkingStepsHeader class="rounded-lg px-2 py-1"><span class="font-medium text-muted-foreground">{{ props.working ? `思考中 ${elapsed}s` : '思考过程' }}</span></ThinkingStepsHeader>
    <ThinkingStepsContent class="pt-1"><ThinkingStep v-for="row in rows" :key="row.id" :label="row.label" :description="row.description" :status="props.working ? 'active' : 'complete'" /></ThinkingStepsContent>
  </ThinkingSteps>
  <ThinkingIndicator v-else-if="props.working" size="compact" class="mb-2" />
</template>


src/features/Conversation/components/ChatThread.vue

<script setup lang="ts">
import { useVirtualizer } from "@tanstack/vue-virtual";
import {
	type ComponentPublicInstance,
	computed,
	onBeforeUnmount,
	onMounted,
	ref,
} from "vue";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { useActivePathComposable } from "../dataflow/activePathComposable";
import type { ChatContainer } from "../dataflow/types";
import ChatBubble from "./ChatBubble.vue";

const props = defineProps<{ chatId: string }>();
const conversation = useActivePathComposable(props.chatId);
const viewport = ref<{ element: HTMLElement | null } | null>(null);
const holdVirtualEnd = ref(false);
const expandedIntervals = ref(new Set<string>());

interface IntervalSummary {
	id: string;
	count: number;
	collapsed: boolean;
	open: boolean;
}
interface ThreadRow {
	container: ChatContainer;
	intervalSummary?: IntervalSummary;
}

const visibleRows = computed<ThreadRow[]>(() => {
	const source = conversation.activePath.value;
	const closed = new Map(
		conversation.intervals.value.spans
			.filter((span) => span.interval.type === "edit")
			.map((span) => [span.openedAt.containerId, span]),
	);
	const open = new Map(
		conversation.intervals.value.openIntervals
			.filter((item) => item.interval.type === "edit")
			.map((item) => [item.openedAt.containerId, item]),
	);
	const rows: ThreadRow[] = [];
	for (let index = 0; index < source.length; index += 1) {
		const container = source[index]!;
		const span = closed.get(container.id);
		if (span) {
			const closeIndex = source.findIndex(
				(item) => item.id === span.closedAt.containerId,
			);
			const summary = {
				id: span.interval.id,
				count: Math.max(0, closeIndex - index - 1),
				collapsed: !expandedIntervals.value.has(span.interval.id),
				open: false,
			};
			if (summary.collapsed && closeIndex >= index) {
				rows.push({ container: source[closeIndex]!, intervalSummary: summary });
				index = closeIndex;
				continue;
			}
			rows.push({ container, intervalSummary: summary });
			continue;
		}
		const opening = open.get(container.id);
		rows.push({
			container,
			...(opening
				? {
						intervalSummary: {
							id: opening.interval.id,
							count: opening.visibleContainersAfterOpen,
							collapsed: false,
							open: true,
						},
					}
				: {}),
		});
	}
	return rows.filter(
		(row) =>
			row.container.role !== "system" ||
			Boolean(row.intervalSummary) ||
			row.container.content.some(
				(message) => message.content || message.meta.pulses?.length,
			),
	);
});

const virtualizer = useVirtualizer(
	computed(() => ({
		count: visibleRows.value.length,
		getScrollElement: () => viewport.value?.element ?? null,
		getItemKey: (index: number) =>
			visibleRows.value[index]?.container.id ?? index,
		estimateSize: () => 240,
		overscan: 6,
		anchorTo: holdVirtualEnd.value ? undefined : ("end" as const),
		followOnAppend: true,
		scrollEndThreshold: 80,
	})),
);
const virtualItems = computed(() => virtualizer.value.getVirtualItems());

function measureRow(element: Element | ComponentPublicInstance | null) {
	if (element instanceof Element) virtualizer.value.measureElement(element);
}
function pauseVirtualEnd() {
	holdVirtualEnd.value = true;
}
function resumeVirtualEndAtBottom() {
	const element = viewport.value?.element;
	if (
		element &&
		element.scrollTop + element.clientHeight >= element.scrollHeight - 80
	)
		holdVirtualEnd.value = false;
}
function toggleInterval(id: string) {
	const next = new Set(expandedIntervals.value);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	expandedIntervals.value = next;
}
function editable(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	return (
		["input", "textarea", "select"].includes(target.tagName.toLowerCase()) ||
		target.isContentEditable ||
		Boolean(target.closest("[contenteditable='true']"))
	);
}
async function handleKeyDown(event: KeyboardEvent) {
	if (
		event.defaultPrevented ||
		event.ctrlKey ||
		event.altKey ||
		event.metaKey ||
		event.shiftKey ||
		editable(event.target) ||
		!["ArrowLeft", "ArrowRight"].includes(event.key)
	)
		return;
	const container = [...conversation.activePath.value]
		.reverse()
		.find((item) => item.role === "assistant");
	if (!container) return;
	const index = container.activeMessage ?? 0;
	if (event.key === "ArrowLeft" && index > 0) {
		event.preventDefault();
		conversation.selectVersion(container.id, index - 1);
	}
	if (event.key === "ArrowRight") {
		if (index < container.content.length - 1) {
			event.preventDefault();
			conversation.selectVersion(container.id, index + 1);
		} else if (!conversation.generating.value) {
			event.preventDefault();
			await conversation.regenerate(container.id);
		}
	}
}

onMounted(() => window.addEventListener("keydown", handleKeyDown));
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeyDown));
</script>

<template>
  <MessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
    <MessageScroller class="absolute inset-0 min-h-0 min-w-0">
      <MessageScrollerViewport ref="viewport" @scroll="resumeVirtualEndAtBottom">
        <MessageScrollerContent :virtual-count="visibleRows.length" class="gap-0">
          <div class="mx-auto flex min-h-full w-full max-w-[724px] flex-col justify-end px-4 pb-44 pt-5 mobile:px-3 mobile:pb-40">
            <div v-if="visibleRows.length" class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }">
              <div v-for="row in virtualItems" :key="String(row.key)" :ref="measureRow" :data-index="row.index" class="absolute left-0 top-0 w-full pb-4" :style="{ transform: `translateY(${row.start}px)` }" @pointerdown="pauseVirtualEnd">
                <MessageScrollerItem :message-id="visibleRows[row.index]!.container.id" :scroll-anchor="visibleRows[row.index]!.container.role === 'user'">
                  <ChatBubble :chat-id="props.chatId" :container-id="visibleRows[row.index]!.container.id" :interval-summary="visibleRows[row.index]!.intervalSummary" @regenerate="conversation.regenerate" @delete-container="conversation.deleteContainer" @toggle-interval="toggleInterval" />
                </MessageScrollerItem>
              </div>
            </div>
            <div v-else class="m-auto text-center"><h1 class="text-lg font-medium">开始新的会话</h1><p class="mt-1 text-sm text-muted-foreground">输入一条消息开始。</p></div>
          </div>
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton direction="end" />
    </MessageScroller>
  </MessageScrollerProvider>
</template>


src/features/Conversation/dataflow/activePathComposable/index.ts

import { computed } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	mediaLinks,
	removeMediaLink,
} from "@/features/Plugin/media/media-link";
import {
	compactPulses,
	type Pulse,
	usePluginData,
} from "@/features/Plugin/dataflow";
import { isChatGenerating, setChatGeneration, useChat } from "../chats";
import { useContainerVersion } from "../containerComposable";
import { usePureContainers } from "../containers";
import {
	type ChatContainer,
	type ChatMessage,
	createDraft,
	type Role,
} from "../types";
import { evaluateIntervals } from "./interval-services";
import {
	createContainer,
	currentMessage,
	modelMessagesFromPath,
	pathForTail,
} from "./message-service";

export interface ReplayGroup {
	container: ChatContainer;
	version: ChatMessage;
	pulses: Pulse[];
}

/** A message version is the sole durable owner of its resource Pulses. */
function applyVersionPulse(
	container: ChatContainer,
	version: ChatMessage,
	pulse: Pulse,
) {
	if (!container.content.some((candidate) => candidate.id === version.id))
		throw new Error("Pulse 必须绑定到消息容器中的具体版本。");
	version.meta.pulses ??= [];
	version.meta.pulses = compactPulses([...version.meta.pulses, pulse]);
	useSyncStore().markDirty({ type: "container", id: container.id });
}

export const toggleEditModeEvent = "pulsarai:conversation-toggle-edit-mode";

export function toggleEditModeAction() {
	window.dispatchEvent(new CustomEvent(toggleEditModeEvent));
}

/** Conversation-wide operations derived exclusively from its active path. */
export function useActivePathComposable(chatId: string) {
	const store = useSyncStore();
	const chat = useChat(chatId);
	const collection = usePureContainers(chatId);
	const activePath = computed(() =>
		pathForTail(collection.containers.value, chat.value?.lastContainerId),
	);
	const intervals = computed(() => evaluateIntervals(activePath.value));
	const replayGroups = computed<ReplayGroup[]>(() =>
		activePath.value.flatMap((container) => {
			const version = currentMessage(container);
			return version
				? [{ container, version, pulses: version.meta.pulses ?? [] }]
				: [];
		}),
	);
	const replayPulses = computed(() =>
		replayGroups.value.map((group) => group.pulses),
	);
	function forVersion(container: ChatContainer, version: ChatMessage) {
		if (container.conversationid !== chatId)
			throw new Error("消息版本不属于当前会话。");
		const groups = computed(() =>
			pathForTail(collection.containers.value, container.id).map((item) => {
				const message =
					item.id === container.id ? version : currentMessage(item);
				return message?.meta.pulses ?? [];
			}),
		);
		const filetree = usePluginData(
			() => chat.value?.localPluginId ?? "",
			groups,
			() => chat.value?.pluginVersionId ?? "",
		);
		return {
			filetree,
			applyPulse: (pulse: Pulse) =>
				applyVersionPulse(container, version, pulse),
		};
	}
	const editMode = computed(
		() =>
			intervals.value.openIntervals.find(
				(item) => item.interval.type === "edit",
			) ?? null,
	);
	const generating = isChatGenerating(chatId);
	const draft = computed({
		get: () => currentMessage(chat.value?.composerDraft)?.content ?? "",
		set(content: string) {
			const current = chat.value;
			const message = currentMessage(current?.composerDraft);
			if (!current || !message) return;
			message.content = content;
			store.markDirty({ type: "meta", id: current.id });
		},
	});
	function push(input: {
		role: Role;
		content?: string;
		previousContainer?: string | null;
	}) {
		const current = chat.value;
		if (!current) return null;
		const container = store.addContainer(
			createContainer({
				conversationId: current.id,
				...input,
				previousContainer: input.previousContainer ?? current.lastContainerId,
			}),
		);
		if (container.previousContainer) {
			const parent = [...collection.containers.value].find(
				(item) => item.id === container.previousContainer,
			);
			if (parent) {
				parent.availableNextContainer.push(container.id);
				parent.activeNextContainer = container.id;
				store.markDirty({ type: "container", id: parent.id });
			}
		}
		store.markDirty({ type: "container", id: container.id });
		if (!current.rootContainerId) current.rootContainerId = container.id;
		current.lastContainerId = container.id;
		if (input.role === "user")
			current.lastMessagePreview = (input.content ?? "").slice(0, 80);
		current.updatedAt = new Date().toISOString();
		store.markDirty({ type: "meta", id: current.id });
		return container;
	}
	function toggleEditMode() {
		const current = chat.value;
		if (!current) return null;
		const active = editMode.value;
		const marker = push({
			role: "system",
			content: active
				? `${active.interval.name ?? "编辑模式"}已结束`
				: "编辑模式",
		});
		const message = currentMessage(marker);
		if (!marker || !message) return null;
		message.meta.intervalOperations = active
			? [{ kind: "interval.close", intervalId: active.interval.id }]
			: [
					{
						kind: "interval.open",
						interval: {
							id: "builtin-edit",
							type: "edit",
							name: "编辑模式",
							content: { mode: "edit" },
						},
					},
				];
		store.markDirty({ type: "container", id: marker.id });
		return marker;
	}
	function versionAt(containerId: string, messageId?: string) {
		const container = [...collection.containers.value].find(
			(item) => item.id === containerId,
		);
		if (!container) return null;
		const version = useContainerVersion(container);
		if (messageId) {
			const index = container.content.findIndex(
				(message) => message.id === messageId,
			);
			if (index < 0) return null;
			version.goto(index);
		}
		return { container, version, message: version.current.value };
	}
	async function generate(containerId: string, messageId?: string) {
		const target = versionAt(containerId, messageId);
		const current = chat.value;
		if (
			!target?.message ||
			!current ||
			target.container.role !== "assistant" ||
			generating.value
		)
			return null;
		setChatGeneration(current.id, { messageId: target.message.id });
		try {
			const path = pathForTail(
				collection.containers.value,
				target.container.previousContainer,
			);
			const prompt = currentMessage(path[path.length - 1])?.content ?? "";
			const workspace = forVersion(target.container, target.message);
			const { runWorld } = await import("@/features/Plugin/runtime/run-api");
			await runWorld({
				conversationId: current.id,
				container: target.container,
				message: target.message,
				prompt,
				chat: await modelMessagesFromPath(path),
				filetree: workspace.filetree,
				applyPulse: workspace.applyPulse,
				context: {
					conversation: current,
					input: {
						read: () => currentMessage(current.composerDraft)?.content ?? "",
						write: (content: string) => {
							const draft = currentMessage(current.composerDraft);
							if (!draft) return;
							draft.content = content;
							store.markDirty({ type: "meta", id: current.id });
						},
						edit: (find: string, replace: string) => {
							const draft = currentMessage(current.composerDraft);
							if (!draft || !find || !draft.content.includes(find))
								return false;
							draft.content = draft.content.replace(find, replace);
							store.markDirty({ type: "meta", id: current.id });
							return true;
						},
					},
				},
			});
		} catch (error) {
			target.message.type = "error";
			const detail = error instanceof Error ? error.message : String(error);
			target.message.content = `> [!CAUTION]\n> **生成失败**：${detail}`;
			store.markDirty({ type: "container", id: target.container.id });
		} finally {
			setChatGeneration(current.id);
		}
		return versionAt(target.container.id, target.message.id)?.message ?? null;
	}
	async function regenerate(containerId: string) {
		const target = versionAt(containerId);
		if (!target) return null;
		if (target.container.role !== "assistant" || generating.value) return null;
		const version = target.version.create();
		return version ? generate(target.container.id, version.id) : null;
	}
	function selectVersion(containerId: string, index: number) {
		const target = versionAt(containerId);
		if (!target) return null;
		target.version.goto(index);
		return target.version.current.value;
	}
	async function deleteContainer(
		containerId: string,
		deleteDescendants = false,
	) {
		const list = store.containers.get(chatId) as Set<ChatContainer> | undefined;
		const container = [...(list ?? [])].find((item) => item.id === containerId);
		if (!container) return;
		const byId = new Map([...(list ?? [])].map((item) => [item.id, item]));
		const removed = new Set<string>();
		const collect = (id: string) => {
			if (removed.has(id)) return;
			removed.add(id);
			if (deleteDescendants)
				for (const child of byId.get(id)?.availableNextContainer ?? [])
					collect(child);
		};
		collect(containerId);
		const parent = container.previousContainer
			? byId.get(container.previousContainer)
			: undefined;
		const children = container.availableNextContainer.filter(
			(id) => byId.has(id) && !removed.has(id),
		);
		const replacementId = children.includes(container.activeNextContainer ?? "")
			? container.activeNextContainer!
			: (children[0] ?? null);
		if (parent) {
			parent.availableNextContainer = parent.availableNextContainer.flatMap(
				(id) => (id === containerId ? children : id),
			);
			if (parent.activeNextContainer === containerId)
				parent.activeNextContainer = replacementId;
			store.markDirty({ type: "container", id: parent.id });
		}
		for (const childId of children) {
			const child = byId.get(childId)!;
			child.previousContainer = container.previousContainer ?? null;
			store.markDirty({ type: "container", id: child.id });
		}
		const current = chat.value;
		if (current) {
			if (current.rootContainerId === containerId)
				current.rootContainerId = deleteDescendants ? null : replacementId;
			if (current.lastContainerId && removed.has(current.lastContainerId)) {
				let tail =
					parent ??
					(deleteDescendants ? undefined : byId.get(replacementId ?? ""));
				const seen = new Set<string>();
				while (tail?.activeNextContainer && !seen.has(tail.id)) {
					seen.add(tail.id);
					tail = byId.get(tail.activeNextContainer);
				}
				current.lastContainerId = tail?.id ?? null;
			}
			current.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: current.id });
		}
		const media = new Set(
			[...removed].flatMap(
				(id) =>
					byId
						.get(id)
						?.content.flatMap((message) => [
							...(message.parts
								?.filter((part) => part.type === "file")
								.map((part) => part.url) ?? []),
							...mediaLinks(message.content),
						]) ?? [],
			),
		);
		for (const url of media) await removeMediaLink(url);
		for (const id of removed) {
			list?.delete(byId.get(id)!);
			store.markDirty({ type: "container", id });
		}
	}
	async function send() {
		const content = draft.value.trim();
		if (!content || generating.value) return null;
		const user = push({ role: "user", content });
		if (!user || !chat.value) return null;
		chat.value.composerDraft = createDraft(chat.value.id);
		store.markDirty({ type: "meta", id: chat.value.id });
		const assistant = push({ role: "assistant", content: "" });
		const version = currentMessage(assistant);
		return assistant && version ? generate(assistant.id, version.id) : null;
	}
	return {
		chat,
		containers: collection.containers,
		activePath,
		intervals,
		replayGroups,
		replayPulses,
		forVersion,
		editMode: { active: editMode, toggle: toggleEditMode },
		draft,
		generating,
		push,
		send,
		generate,
		regenerate,
		selectVersion,
		deleteContainer,
	};
}


src/features/Conversation/dataflow/activePathComposable/interval-services.ts

import type { ChatContainer, ChatMessage } from "../types";

type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };
export interface IntervalDefinition {
	id: string;
	type: string;
	name?: string;
	content?: JsonValue;
	autoEndAfter?: number;
}
export type IntervalOperation =
	| { kind: "interval.open"; interval: IntervalDefinition }
	| { kind: "interval.close"; intervalId: string };
interface IntervalPosition {
	containerId: string;
	messageId: string;
}
interface OpenInterval {
	interval: IntervalDefinition;
	openedAt: IntervalPosition;
	visibleContainersAfterOpen: number;
}
interface IntervalSpan extends OpenInterval {
	closedAt: IntervalPosition;
	closeKind: "explicit" | "auto";
}
interface IntervalDiagnostic {
	code:
		| "interval.duplicate-open"
		| "interval.close-missing"
		| "interval.invalid-auto-end"
		| "interval.unclosed";
	messageId: string;
	containerId: string;
	intervalId: string;
}
export interface IntervalProjection {
	openIntervals: OpenInterval[];
	spans: IntervalSpan[];
	diagnostics: IntervalDiagnostic[];
}

function activeMessage(container: ChatContainer): ChatMessage | null {
	return (
		container.content[container.activeMessage ?? 0] ??
		container.content[0] ??
		null
	);
}

/** Reduces the selected versions along one active conversation path. */
export function evaluateIntervals(
	activePath: ChatContainer[],
): IntervalProjection {
	const open = new Map<string, OpenInterval>();
	const spans: IntervalSpan[] = [];
	const diagnostics: IntervalDiagnostic[] = [];
	for (const container of activePath) {
		const message = activeMessage(container);
		if (!message) continue;
		const position = { containerId: container.id, messageId: message.id };
		const visible = container.role !== "system";
		if (visible)
			for (const value of open.values()) value.visibleContainersAfterOpen++;
		for (const operation of message.meta.intervalOperations ?? []) {
			if (operation.kind === "interval.open") {
				if (open.has(operation.interval.id)) {
					diagnostics.push({
						code: "interval.duplicate-open",
						...position,
						intervalId: operation.interval.id,
					});
					continue;
				}
				if (
					operation.interval.autoEndAfter !== undefined &&
					(!Number.isInteger(operation.interval.autoEndAfter) ||
						operation.interval.autoEndAfter < 1)
				)
					diagnostics.push({
						code: "interval.invalid-auto-end",
						...position,
						intervalId: operation.interval.id,
					});
				open.set(operation.interval.id, {
					interval: operation.interval,
					openedAt: position,
					visibleContainersAfterOpen: 0,
				});
			} else {
				const opened = open.get(operation.intervalId);
				if (!opened)
					diagnostics.push({
						code: "interval.close-missing",
						...position,
						intervalId: operation.intervalId,
					});
				else {
					spans.push({ ...opened, closedAt: position, closeKind: "explicit" });
					open.delete(operation.intervalId);
				}
			}
		}
		if (visible)
			for (const [id, opened] of open)
				if (
					opened.interval.autoEndAfter &&
					opened.visibleContainersAfterOpen >= opened.interval.autoEndAfter
				) {
					spans.push({ ...opened, closedAt: position, closeKind: "auto" });
					open.delete(id);
				}
	}
	for (const opened of open.values())
		diagnostics.push({
			code: "interval.unclosed",
			...opened.openedAt,
			intervalId: opened.interval.id,
		});
	return { openIntervals: [...open.values()], spans, diagnostics };
}


src/features/Conversation/dataflow/activePathComposable/message-service.ts

import type { ModelMessage } from "ai";
import { readMediaLink } from "@/features/Plugin/media/media-link";
import type {
	AdditionalParts,
	ChatContainer,
	ChatMessage,
	Role,
} from "../types";

export function createMessage(
	input: {
		type?: ChatMessage["type"];
		content?: string;
		parts?: AdditionalParts[];
	} = {},
): ChatMessage {
	return {
		id: crypto.randomUUID(),
		type: input.type ?? "message",
		content: input.content ?? "",
		parts: input.parts ?? [],
		createdAt: new Date().toISOString(),
		meta: { steps: [] },
	};
}

export function createContainer(input: {
	conversationId: string;
	role: Role;
	content?: string;
	parts?: AdditionalParts[];
	previousContainer?: string | null;
}): ChatContainer {
	return {
		id: crypto.randomUUID(),
		role: input.role,
		conversationid: input.conversationId,
		content: [createMessage({ content: input.content, parts: input.parts })],
		activeMessage: 0,
		availableNextContainer: [],
		activeNextContainer: null,
		previousContainer: input.previousContainer ?? null,
	};
}

export function currentMessage(
	container: ChatContainer | null | undefined,
): ChatMessage | null {
	return (
		container?.content[container.activeMessage ?? 0] ??
		container?.content[0] ??
		null
	);
}

export function pathForTail(
	containers: Iterable<ChatContainer>,
	tailId?: string | null,
): ChatContainer[] {
	const byId = new Map([...containers].map((item) => [item.id, item]));
	const path: ChatContainer[] = [];
	const seen = new Set<string>();
	let current = tailId ? byId.get(tailId) : undefined;
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		path.unshift(current);
		current = current.previousContainer
			? byId.get(current.previousContainer)
			: undefined;
	}
	return path;
}

export async function modelMessagesFromPath(
	path: ChatContainer[],
): Promise<ModelMessage[]> {
	const messages: ModelMessage[] = [];
	for (const container of path) {
		const message = currentMessage(container);
		if (
			!message ||
			message.type === "error" ||
			message.meta.intervalOperations?.length
		)
			continue;
		if (container.role !== "user") {
			messages.push({
				role: container.role,
				content: message.content,
			} as ModelMessage);
			continue;
		}
		const content: Array<
			| { type: "text"; text: string }
			| { type: "file"; data: Uint8Array | string; mimeType: string }
		> = message.content ? [{ type: "text", text: message.content }] : [];
		for (const part of message.parts ?? []) {
			if (part.type === "file") {
				const media = await readMediaLink(part.url);
				content.push({
					type: "file",
					data: media?.bytes ? Uint8Array.from(media.bytes) : part.url,
					mimeType: part.mediaType,
				});
			}
			if (part.type === "reference")
				content.push({
					type: "text",
					text: `\n[引用${part.referenceType === "file" ? "文件" : "消息"}：${part.label}${part.path ? ` (${part.path})` : ""}]\n${part.content}`,
				});
		}
		messages.push({ role: "user", content } as ModelMessage);
	}
	return messages;
}


src/features/Conversation/dataflow/chats.ts

import { computed } from "vue";
import { selectAll } from "@/features/Database/database-service";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { latestPluginVersion } from "@/features/Plugin/dataflow/plugin-version";
import {
	type ChatGenerationState,
	type ChatMeta,
	createChatMeta,
	type PersistedChatMeta,
} from "./types";

function chatsForPlugin(pluginId: string) {
	return useSyncStore().chatMeta.get(pluginId) as
		| Map<string, ChatMeta>
		| undefined;
}

function findChat(chatId: string) {
	return [...useSyncStore().chatMeta.values()]
		.map((list) => list.get(chatId))
		.find(Boolean);
}

registerSyncHandler<ChatMeta, PersistedChatMeta>("meta", {
	table: "conversations",
	value: findChat,
	serialize(chat) {
		const { generation: _generation, ...record } = chat;
		return record;
	},
});

/** A loaded set of a role's conversations. Its actions are the only mutations. */
export function useChatList(pluginId: string) {
	const store = useSyncStore();
	const chats = computed(
		() => new Set(chatsForPlugin(pluginId)?.values() ?? []),
	);
	function create(
		input: Partial<Pick<ChatMeta, "title" | "lifetime" | "isTemplate">> = {},
	) {
		const plugin = store.plugins.get(pluginId);
		const version = plugin && latestPluginVersion(plugin);
		if (!version)
			throw new Error(`本地 Plugin 没有可用于会话的版本：${pluginId}`);
		const chat = createChatMeta({
			localPluginId: pluginId,
			pluginVersionId: version.id,
			...input,
		});
		store.addChat(chat);
		store.markDirty({ type: "meta", id: chat.id });
		return chat;
	}
	function remove(chatId: string) {
		if (!chatsForPlugin(pluginId)?.has(chatId)) return;
		store.removeChat(chatId);
	}
	return { chats, create, delete: remove };
}

/** Thin reactive address lookup; it adds no persistence behavior. */
export function useChat(chatId: string) {
	return computed(() => findChat(chatId) ?? null);
}

/** Generation is runtime state; changing it must not cause a persistence write. */
export function setChatGeneration(chatId: string, value?: ChatGenerationState) {
	const chat = findChat(chatId);
	if (chat) chat.generation = value;
}

export function isChatGenerating(chatId: string) {
	return computed(() => Boolean(findChat(chatId)?.generation));
}

/** Removes app-lifetime chats left by a previous process, including their containers. */
export async function cleanupAppLifetimeChats() {
	const store = useSyncStore();
	const chats = (await selectAll<ChatMeta>("conversations"))
		.map((record) => record.value)
		.filter((chat) => chat.lifetime === "app");
	for (const chat of chats) {
		await store.load({ type: "chatList", id: chat.localPluginId });
		await store.load({ type: "chat", id: chat.id });
		store.removeChat(chat.id);
	}
	await store._sync();
	return chats.length;
}


src/features/Conversation/dataflow/containerComposable/actions.ts

import { push } from "notivue";
import { computed, type MaybeRef, unref } from "vue";
import { currentMessage } from "../activePathComposable/message-service";
import type { ChatContainer } from "../types";

export function useContainerActions(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const content = computed(() => currentMessage(unref(source))?.content ?? "");
	async function copy() {
		try {
			await navigator.clipboard.writeText(content.value);
			push.success("已复制到剪贴板");
		} catch {
			push.error("复制失败");
		}
	}
	function speak() {
		if (content.value.trim() && "speechSynthesis" in window) {
			window.speechSynthesis.cancel();
			window.speechSynthesis.speak(new SpeechSynthesisUtterance(content.value));
		}
	}
	const messageTime = computed(() => {
		const time = currentMessage(unref(source))?.createdAt;
		return time && !Number.isNaN(new Date(time).getTime())
			? new Date(time).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				})
			: "";
	});
	function exportScreenshot() {
		push.info("截图功能开发中");
	}
	function formatJson(value: unknown) {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}
	return { copy, speak, messageTime, exportScreenshot, formatJson };
}


src/features/Conversation/dataflow/containerComposable/attachments.ts

import { computed, type MaybeRef, unref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	isTextMediaType,
	mediaLink,
	resolveMediaUrl,
	writeMedia,
} from "@/features/Plugin/media/media-link";
import { currentMessage } from "../activePathComposable/message-service";
import type { ChatContainer, FilePart, ReferencePart } from "../types";

export function useContainerAttachments(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const container = computed(() => unref(source));
	const message = computed(() => currentMessage(container.value));
	const files = computed(() =>
		(message.value?.parts ?? []).filter(
			(part): part is FilePart => part.type === "file",
		),
	);
	const references = computed(() =>
		(message.value?.parts ?? []).filter(
			(part): part is ReferencePart => part.type === "reference",
		),
	);
	function markDirty() {
		if (container.value)
			useSyncStore().markDirty({ type: "container", id: container.value.id });
	}
	async function fromFile(file: File): Promise<FilePart> {
		const mediaType = file.type || "application/octet-stream";
		const url = isTextMediaType(mediaType)
			? await readAsDataUrl(file)
			: mediaLink(
					(
						await writeMedia(
							new Uint8Array(await file.arrayBuffer()),
							mediaType,
							"attachments",
						)
					).id,
				);
		return {
			type: "file",
			url,
			filename: file.name,
			mediaType,
			size: file.size,
		};
	}
	function add(part: FilePart | ReferencePart) {
		if (!message.value) return;
		message.value.parts ??= [];
		message.value.parts.push(part);
		markDirty();
	}
	function remove(id: string) {
		if (!message.value) return;
		message.value.parts = message.value.parts?.filter((part) =>
			part.type === "file" ? part.url !== id : part.id !== id,
		);
		markDirty();
	}
	async function preview(part: FilePart) {
		return part.mediaType.startsWith("image/") ? resolveMediaUrl(part.url) : "";
	}
	async function open(part: FilePart) {
		const source = await resolveMediaUrl(part.url);
		const blob = await (await fetch(source)).blob();
		const url = URL.createObjectURL(blob);
		if (
			part.mediaType.startsWith("image/") ||
			part.mediaType.startsWith("text/") ||
			part.mediaType === "application/pdf"
		)
			window.open(url, "_blank", "noopener,noreferrer");
		else {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = part.filename || "attachment";
			anchor.click();
		}
		window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
	}
	function formatSize(size?: number) {
		if (size == null || !Number.isFinite(size)) return "";
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024)
			return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
		return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
	}
	return {
		files,
		references,
		fromFile,
		add,
		remove,
		preview,
		open,
		formatSize,
	};
}

function readAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error(`无法读取文件：${file.name}`));
		reader.onload = () =>
			resolve(typeof reader.result === "string" ? reader.result : "");
		reader.readAsDataURL(file);
	});
}


src/features/Conversation/dataflow/containerComposable/branch.ts

import { computed, type MaybeRef, unref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { createContainer } from "../activePathComposable/message-service";
import type { ChatContainer } from "../types";

/** Chooses or creates the sibling branch for one concrete container. */
export function useContainerBranch(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const store = useSyncStore();
	const container = computed(() => unref(source));
	const siblings = computed(() => {
		const value = container.value;
		if (!value?.previousContainer) return value ? [value.id] : [];
		const all = [...(store.containers.get(value.conversationid) ?? [])];
		return (
			all.find((item) => item.id === value.previousContainer)
				?.availableNextContainer ?? [value.id]
		);
	});
	const index = computed(() =>
		container.value ? siblings.value.indexOf(container.value.id) : -1,
	);
	const count = computed(() => siblings.value.length);
	const canPrev = computed(() => index.value > 0);
	const canNext = computed(
		() => index.value >= 0 && index.value < count.value - 1,
	);
	const canCreate = computed(() => Boolean(container.value?.previousContainer));
	function goto(branchId: string) {
		const value = container.value;
		if (!value?.previousContainer || !siblings.value.includes(branchId)) return;
		const all = [...(store.containers.get(value.conversationid) ?? [])];
		const parent = all.find((item) => item.id === value.previousContainer);
		const branch = all.find((item) => item.id === branchId);
		if (!parent || !branch) return;
		let tail: ChatContainer = branch;
		parent.activeNextContainer = branchId;
		const seen = new Set<string>();
		while (tail.activeNextContainer && !seen.has(tail.id)) {
			seen.add(tail.id);
			const next = all.find((item) => item.id === tail.activeNextContainer);
			if (!next) break;
			tail = next;
		}
		const chat = [...store.chatMeta.values()]
			.map((items) => items.get(value.conversationid))
			.find(Boolean);
		if (chat) {
			chat.lastContainerId = tail.id;
			chat.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: chat.id });
		}
		store.markDirty({ type: "container", id: parent.id });
	}
	function prev() {
		const id = siblings.value[index.value - 1];
		if (id) goto(id);
	}
	function next() {
		const id = siblings.value[index.value + 1];
		if (id) goto(id);
	}
	function create() {
		const value = container.value;
		if (!value?.previousContainer) return null;
		const parent = [...(store.containers.get(value.conversationid) ?? [])].find(
			(item) => item.id === value.previousContainer,
		);
		if (!parent) return null;
		const branch = createContainer({
			conversationId: value.conversationid,
			role: value.role,
			previousContainer: value.previousContainer,
		});
		store.addContainer(branch);
		parent.availableNextContainer.push(branch.id);
		parent.activeNextContainer = branch.id;
		store.markDirty({ type: "container", id: parent.id });
		const chat = [...store.chatMeta.values()]
			.map((items) => items.get(value.conversationid))
			.find(Boolean);
		if (chat) {
			chat.lastContainerId = branch.id;
			chat.updatedAt = new Date().toISOString();
			store.markDirty({ type: "meta", id: chat.id });
		}
		store.markDirty({ type: "container", id: branch.id });
		return branch;
	}
	return {
		index,
		count,
		canPrev,
		canNext,
		canCreate,
		goto,
		prev,
		next,
		create,
	};
}


src/features/Conversation/dataflow/containerComposable/index.ts

import { usePureContainer } from "../containers";
import { useContainerActions } from "./actions";
import { useContainerAttachments } from "./attachments";
import { useContainerBranch } from "./branch";
import { useContainerIntervals } from "./intervals";
import { useContainerMessage } from "./message";
import { useContainerVersion } from "./version";

/** All behaviour scoped to one persisted message container. */
export function useContainerComposable(chatId: string, containerId: string) {
	const container = usePureContainer(chatId, containerId);
	return {
		container,
		version: useContainerVersion(container),
		branch: useContainerBranch(container),
		message: useContainerMessage(container),
		attachments: useContainerAttachments(container),
		interval: useContainerIntervals(container),
		utility: useContainerActions(container),
	};
}

export * from "./actions";
export * from "./attachments";
export * from "./branch";
export * from "./intervals";
export * from "./message";
export * from "./version";


src/features/Conversation/dataflow/containerComposable/intervals.ts

import { computed, type MaybeRef, unref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import type {
	IntervalDefinition,
	IntervalOperation,
} from "../activePathComposable/interval-services";
import { currentMessage } from "../activePathComposable/message-service";
import type { ChatContainer } from "../types";

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value))
	)
		return true;
	if (Array.isArray(value)) {
		if (seen.has(value)) return false;
		seen.add(value);
		return value.every((item) => isJsonValue(item, seen));
	}
	if (typeof value !== "object" || seen.has(value)) return false;
	seen.add(value);
	return Object.values(value).every((item) => isJsonValue(item, seen));
}

/** Interval operations belong to the active version of one message container. */
export function useContainerIntervals(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const container = computed(() => unref(source));
	const message = computed(() => currentMessage(container.value));
	const operations = computed(
		() => message.value?.meta.intervalOperations ?? [],
	);
	function append(operation: IntervalOperation) {
		const target = message.value;
		const owner = container.value;
		if (!target || !owner) return;
		target.meta.intervalOperations ??= [];
		target.meta.intervalOperations.push(operation);
		useSyncStore().markDirty({ type: "container", id: owner.id });
		return operation;
	}
	function open(interval: IntervalDefinition) {
		if (!interval.id.trim() || !interval.type.trim())
			throw new Error("Interval 必须包含非空 id 和 type。");
		if (
			interval.autoEndAfter !== undefined &&
			(!Number.isInteger(interval.autoEndAfter) || interval.autoEndAfter < 1)
		)
			throw new Error("Interval autoEndAfter 必须是正整数。");
		if (interval.content !== undefined && !isJsonValue(interval.content))
			throw new Error("Interval content 必须是 JsonValue。");
		return append({
			kind: "interval.open",
			interval: structuredClone(interval),
		});
	}
	function close(intervalId: string) {
		if (!intervalId.trim()) throw new Error("Interval ID 不能为空。");
		return append({ kind: "interval.close", intervalId });
	}
	return { operations, open, close };
}


src/features/Conversation/dataflow/containerComposable/message.ts

import { push } from "notivue";
import { computed, type MaybeRef, reactive, ref, unref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { useEnvironmentStore } from "@/features/Environment/store";
import { currentMessage } from "../activePathComposable/message-service";
import type { ChatContainer, ChatMessage, ThinkingStep } from "../types";

export function useContainerMessage(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const environment = useEnvironmentStore();
	const container = computed(() => unref(source));
	const current = computed(() => currentMessage(container.value));
	const thinking = computed(
		() =>
			current.value?.meta.steps.filter(
				(step): step is ThinkingStep => step.type === "thinking",
			) ?? [],
	);
	const pulses = computed(() => current.value?.meta.pulses ?? []);
	const hasPluginChanges = computed(() => pulses.value.length > 0);
	const resourceSummary = computed(() =>
		hasPluginChanges.value ? `修改了 ${pulses.value.length} 项资源` : "",
	);
	const edit = reactive({ active: false, content: "" });
	const translating = ref(false);
	function markDirty() {
		if (container.value)
			useSyncStore().markDirty({ type: "container", id: container.value.id });
	}
	function setContent(content: string) {
		const message = current.value;
		if (!message) return;
		message.content = content;
		delete message.meta.translation;
		markDirty();
	}
	function setTranslation(
		translation: NonNullable<ChatMessage["meta"]["translation"]>,
	) {
		const message = current.value;
		if (!message) return;
		message.meta.translation = translation;
		markDirty();
	}
	function startEdit() {
		if (current.value) {
			edit.content = current.value.content;
			edit.active = true;
		}
	}
	function saveEdit() {
		if (edit.active) setContent(edit.content);
		edit.active = false;
	}
	function cancelEdit() {
		edit.active = false;
		edit.content = "";
	}
	async function translate() {
		if (!current.value?.content.trim() || translating.value) return;
		translating.value = true;
		try {
			const translatedContent = await environment.translateText(
				current.value.content,
			);
			if (translatedContent) {
				setTranslation({
					translatedContent,
					targetLanguage: environment.translateSettings.targetLanguage,
					lastUpdated: new Date().toISOString(),
				});
				push.success("翻译完成");
			}
		} catch {
			push.error("翻译失败");
		} finally {
			translating.value = false;
		}
	}
	return {
		current,
		thinking,
		pulses,
		hasPluginChanges,
		resourceSummary,
		edit,
		translating,
		setContent,
		setTranslation,
		startEdit,
		saveEdit,
		cancelEdit,
		translate,
	};
}


src/features/Conversation/dataflow/containerComposable/version.ts

import { computed, type MaybeRef, unref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	createMessage,
	currentMessage,
} from "../activePathComposable/message-service";
import type { ChatContainer } from "../types";

export function useContainerVersion(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const container = computed(() => unref(source));
	const index = computed(() => container.value?.activeMessage ?? 0);
	const count = computed(() => container.value?.content.length ?? 0);
	const current = computed(() => currentMessage(container.value));
	const canPrev = computed(() => index.value > 0);
	const canNext = computed(() => index.value < count.value - 1);
	const canDelete = computed(() => count.value > 1);
	function goto(next: number) {
		const value = container.value;
		if (!value || next < 0 || next >= value.content.length) return;
		value.activeMessage = next;
		useSyncStore().markDirty({ type: "container", id: value.id });
	}
	function prev() {
		goto(index.value - 1);
	}
	function next() {
		goto(index.value + 1);
	}
	function create(input: Parameters<typeof createMessage>[0] = {}) {
		const value = container.value;
		if (!value) return null;
		value.content.push(createMessage(input));
		value.activeMessage = value.content.length - 1;
		useSyncStore().markDirty({ type: "container", id: value.id });
		return current.value;
	}
	function remove(target = index.value) {
		const value = container.value;
		if (
			!value ||
			value.content.length <= 1 ||
			target < 0 ||
			target >= value.content.length
		)
			return null;
		const [message] = value.content.splice(target, 1);
		value.activeMessage = Math.min(target, value.content.length - 1);
		useSyncStore().markDirty({ type: "container", id: value.id });
		return message ?? null;
	}
	return {
		current,
		index,
		count,
		canPrev,
		canNext,
		canDelete,
		goto,
		prev,
		next,
		create,
		delete: remove,
	};
}


src/features/Conversation/dataflow/containers.ts

import { computed } from "vue";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { compactPulses } from "@/features/Plugin/dataflow/pulse";
import type { ChatContainer } from "./types";

function containersForChat(chatId: string) {
	return useSyncStore().containers.get(chatId) as
		| Set<ChatContainer>
		| undefined;
}

function findContainer(chatId: string, containerId: string) {
	return [...(containersForChat(chatId) ?? [])].find(
		(item) => item.id === containerId,
	);
}

function findContainerById(containerId: string) {
	return [...useSyncStore().containers.values()]
		.flatMap((items) => [...items])
		.find((item) => item.id === containerId);
}

registerSyncHandler<ChatContainer>("container", {
	table: "message_containers",
	value: findContainerById,
	serialize(container) {
		return {
			...container,
			content: container.content.map((message) => ({
				...message,
				meta: {
					...message.meta,
					...(message.meta.pulses
						? { pulses: compactPulses(message.meta.pulses) }
						: {}),
				},
			})),
		};
	},
});

export function usePureContainers(chatId: string) {
	const containers = computed(() => new Set(containersForChat(chatId) ?? []));
	return { containers };
}

/** Thin reactive address lookup; it adds no persistence behavior. */
export function usePureContainer(chatId: string, containerId: string) {
	return computed(() => findContainer(chatId, containerId) ?? null);
}


src/features/Conversation/dataflow/types.ts

import type { Pulse } from "@/features/Plugin/dataflow";

export type Role = "user" | "assistant" | "system";

export interface FilePart {
	type: "file";
	mediaType: string;
	url: string;
	filename?: string;
	size?: number;
}
interface ActionPart {
	type: "action";
	id: string;
	label: string;
	action: string;
	params?: Record<string, unknown>;
}
export interface ReferencePart {
	type: "reference";
	referenceType: "file" | "message";
	id: string;
	label: string;
	path?: string;
	content: string;
}
export type AdditionalParts = FilePart | ActionPart | ReferencePart;
export interface ThinkingStep {
	type: "thinking";
	id?: string;
	message: string;
}
export interface ToolCallStep {
	type: "tool-call";
	toolCallId: string;
	toolName: string;
	input: unknown;
}
export interface ToolCallResult {
	type: "tool-result";
	toolCallId: string;
	toolName: string;
	input: unknown;
	output: unknown;
}
interface TokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

interface MessageMeta {
	steps: Array<ThinkingStep | ToolCallStep | ToolCallResult>;
	intervalOperations?: import("./activePathComposable/interval-services").IntervalOperation[];
	pulses?: Pulse[];
	generateInfo?: {
		modelName?: string;
		startTime?: string;
		finishTime?: string;
		usage?: TokenUsage;
	};
	translation?: {
		translatedContent: string;
		modelName?: string;
		targetLanguage: string;
		lastUpdated?: string;
	};
}

export interface ChatMessage {
	id: string;
	type: "message" | "error";
	content: string;
	createdAt: string;
	parts?: AdditionalParts[];
	favorite?: boolean;
	meta: MessageMeta;
}

export interface ChatContainer {
	id: string;
	role: Role;
	conversationid: string;
	content: ChatMessage[];
	activeMessage?: number | null;
	availableNextContainer: string[];
	activeNextContainer?: string | null;
	previousContainer?: string | null;
}

/** Fields that are permitted to reach the conversations table. */
export interface PersistedChatMeta {
	id: string;
	localPluginId: string;
	pluginVersionId: string;
	title: string;
	rootContainerId: string | null;
	lastContainerId: string | null;
	lastMessagePreview?: string;
	composerDraft: ChatContainer;
	createdAt: string;
	updatedAt: string;
	lifetime: "persistent" | "app";
	pinned?: boolean;
	isTemplate?: boolean;
}

/** Runtime-only generation progress. It deliberately has no database shape. */
export interface ChatGenerationState {
	messageId?: string;
}

export interface ChatMeta extends PersistedChatMeta {
	generation?: ChatGenerationState;
}

export function createDraft(conversationid = ""): ChatContainer {
	return {
		id: "draft-container",
		role: "user",
		conversationid,
		content: [
			{
				id: "draft-message",
				type: "message",
				content: "",
				createdAt: new Date().toISOString(),
				parts: [],
				meta: { steps: [] },
			},
		],
		activeMessage: 0,
		availableNextContainer: [],
		activeNextContainer: null,
		previousContainer: null,
	};
}

export function createChatMeta(
	input: Pick<ChatMeta, "localPluginId" | "pluginVersionId"> &
		Partial<Pick<ChatMeta, "title" | "lifetime" | "isTemplate">>,
): ChatMeta {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	return {
		id,
		localPluginId: input.localPluginId,
		pluginVersionId: input.pluginVersionId,
		title: input.title?.trim() || "新对话",
		rootContainerId: null,
		lastContainerId: null,
		composerDraft: createDraft(id),
		createdAt: now,
		updatedAt: now,
		lifetime: input.lifetime ?? "persistent",
		pinned: false,
		isTemplate: input.isTemplate ?? false,
	};
}


src/features/Conversation/stage/ConversationSurface.vue

<script setup lang="ts">
import { computed } from "vue";
import {
	type ResourcePath,
	resourceType,
	usePluginData,
	useSlot,
} from "@/features/Plugin/dataflow";
import { readFile } from "@/features/Plugin/dataflow/pulse";
import PluginTypeRenderer from "@/features/Plugin/resources/PluginTypeRenderer.vue";
import type { ResourceFile } from "@/features/Plugin/resources/resource-types";
import ChatComposer from "../components/ChatComposer.vue";
import ChatThread from "../components/ChatThread.vue";
import { useActivePathComposable } from "../dataflow/activePathComposable";

const props = defineProps<{ chatId: string }>();
const conversation = useActivePathComposable(props.chatId);
const filetree = usePluginData(
	() => conversation.chat.value?.localPluginId ?? "",
	conversation.replayPulses,
	() => conversation.chat.value?.pluginVersionId ?? "",
);
const slots = useSlot({ filetree, applyPulse: () => undefined });

function components(slotId: string) {
	return computed<ResourceFile[]>(() => {
		const data = filetree.value;
		if (!data) return [];
		return (slots.get(slotId)?.selectedResources ?? []).flatMap(
			({ meta, path }) => {
				if (resourceType(path) !== "component") return [];
				try {
					return [
						{
							...meta,
							path: path as ResourcePath,
							content: readFile(data, path),
						},
					];
				} catch {
					return [];
				}
			},
		);
	});
}

const topPanels = components("panel-top");
const leftPanels = components("panel-left");
const rightPanels = components("panel-right");
</script>

<template>
  <main class="relative h-full min-h-0 overflow-hidden bg-background">
    <ChatThread :chat-id="props.chatId" />
    <ChatComposer :chat-id="props.chatId" />
    <div class="pointer-events-none absolute inset-0 z-20">
      <div v-if="topPanels.length" class="pointer-events-auto absolute inset-x-4 top-4 mx-auto flex max-h-[30%] w-fit max-w-[min(34rem,calc(100%-2rem))] flex-col gap-2 overflow-auto mobile:inset-x-2">
        <PluginTypeRenderer v-for="panel in topPanels" :key="panel.path" :file="panel" :model-value="panel.content" />
      </div>
      <div v-if="leftPanels.length" class="pointer-events-auto absolute bottom-32 left-4 top-4 hidden w-64 flex-col gap-2 overflow-auto md:flex">
        <PluginTypeRenderer v-for="panel in leftPanels" :key="panel.path" :file="panel" :model-value="panel.content" />
      </div>
      <div v-if="rightPanels.length" class="pointer-events-auto absolute bottom-32 right-4 top-4 hidden w-64 flex-col gap-2 overflow-auto md:flex">
        <PluginTypeRenderer v-for="panel in rightPanels" :key="panel.path" :file="panel" :model-value="panel.content" />
      </div>
    </div>
  </main>
</template>


src/features/Conversation/stage/markstream/ConversationMarkdown.vue

<script setup lang="ts">
import { computed } from "vue";
import { MarkdownRender } from "markstream-vue";
import "markstream-vue/index.css";
import "katex/dist/katex.min.css";

const props = withDefaults(defineProps<{ content: string; compact?: boolean }>(), { compact: false });
const dark = computed(() => typeof document === "undefined" || document.documentElement.classList.contains("dark"));
</script>

<template>
  <MarkdownRender
    :content="props.content"
    :mode="props.compact ? 'chat' : 'docs'"
    :is-dark="dark"
    :code-block-props="{ theme: { light: 'vitesse-dark', dark: 'vitesse-dark' } }"
    class="conversation-markstream w-full min-w-0"
  />
</template>

<style>
.conversation-markstream { --ms-text-body: var(--editor-font-size, 14px) !important; --ms-leading-body: var(--editor-line-height, 1.5) !important; --ms-font-sans: var(--font-sans, sans-serif); --ms-font-mono: var(--font-mono, monospace); color: var(--foreground); }
.conversation-markstream pre, .conversation-markstream .code-block-container, .conversation-markstream .table-node-wrapper { max-width: 100%; overflow-x: auto; }
.conversation-markstream img { max-width: 100%; height: auto; border-radius: var(--radius); }
</style>


src/features/Database/database-service.ts

import { host } from "@/host";
import { markLocalDatabaseChange } from "./sync-metadata";

export interface DatabaseRecord<T> {
	id: string | null;
	value: T;
}

export async function selectAll<T>(
	table: string,
): Promise<Array<DatabaseRecord<T>>> {
	return host.database.selectAll<T>(table);
}

export async function selectByField<T>(
	table: string,
	field: "localPluginId" | "conversationid",
	value: string,
): Promise<Array<DatabaseRecord<T>>> {
	return host.database.selectByField<T>(table, field, value);
}

export async function selectOne<T>(
	table: string,
	id: string,
): Promise<T | null> {
	return host.database.selectOne<T>(table, id);
}

export async function upsert<T>(table: string, id: string, value: T) {
	const raw = JSON.parse(JSON.stringify(value));
	await host.database.upsert(table, id, raw);
	markLocalDatabaseChange(table, id, false, raw);
}

export async function remove(table: string, id: string) {
	const previous = await selectOne(table, id);
	await host.database.remove(table, id);
	markLocalDatabaseChange(table, id, true, previous);
}

export async function resetCharacterData() {
	await host.database.resetCharacterData();
}


src/features/Database/dbsync-store.ts

import { acceptHMRUpdate, defineStore } from "pinia";
import { reactive, shallowReactive, type WatchStopHandle, watch } from "vue";
import type {
	ChatContainer,
	ChatMeta,
} from "@/features/Conversation/dataflow/types";
import {
	latestPluginVersion,
	replayPluginVersion,
} from "@/features/Plugin/dataflow/plugin-version";
import type { PluginDocument } from "@/features/Plugin/dataflow/types";
import {
	type CharacterData,
	characterFromPlugin,
} from "@/features/Plugin/resources/types/character/plugin-character";
import {
	remove,
	selectAll,
	selectByField,
	selectOne,
	upsert,
} from "./database-service";

export type SyncTarget =
	| { type: "chatList"; id: string }
	| { type: "chat"; id: string };
export type DirtyTarget =
	| { type: "meta"; id: string }
	| { type: "container"; id: string }
	| { type: "plugin"; id: string };
export type SyncKind = DirtyTarget["type"];

export interface SyncHandler<TMemory, TPersisted = TMemory> {
	table: string;
	value(id: string): TMemory | undefined;
	recordId?: (id: string) => string;
	/** Maps runtime state to its persisted form; omit it for an identity write. */
	serialize?: (value: TMemory) => TPersisted;
}

const handlers = new Map<SyncKind, SyncHandler<unknown, unknown>>();

/** Feature-owned record mappings. The store only batches and owns memory. */
export function registerSyncHandler<TMemory, TPersisted = TMemory>(
	kind: SyncKind,
	handler: SyncHandler<TMemory, TPersisted>,
) {
	handlers.set(kind, handler as unknown as SyncHandler<unknown, unknown>);
}

function dirtyKey(target: DirtyTarget) {
	return `${target.type}:${target.id}`;
}

function parseDirtyKey(key: string): DirtyTarget {
	const index = key.indexOf(":");
	return { type: key.slice(0, index) as SyncKind, id: key.slice(index + 1) };
}

/**
 * The only in-memory source for conversation data. Features mutate these
 * collections; feature actions mark persistent changes dirty for batched writes.
 */
export const useSyncStore = defineStore("dbsync", () => {
	const characters = reactive(new Set<CharacterData>());
	const plugins = reactive(new Map<string, PluginDocument>());
	const chatMeta = shallowReactive(new Map<string, Map<string, ChatMeta>>());
	const containers = shallowReactive(new Map<string, Set<ChatContainer>>());
	const chatPluginVersions = new Map<
		string,
		{ pluginId: string; versionId: string }
	>();
	const pluginVersionUses = new Map<string, Map<string, number>>();
	const metaWatchers = new Map<string, WatchStopHandle>();
	const containerWatchers = new Map<string, WatchStopHandle>();
	const dirty = new Set<string>();
	const loadedChatLists = new Set<string>();
	const loadedChats = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let initialized = false;
	let hydrating = 0;

	function schedule() {
		if (timer) return;
		timer = setTimeout(() => {
			timer = undefined;
			void _sync();
		}, 500);
	}

	function markDirty(target: DirtyTarget) {
		if (hydrating) return;
		const key = dirtyKey(target);
		dirty.add(key);
		schedule();
	}

	function trackChatPluginVersion(value: ChatMeta) {
		const previous = chatPluginVersions.get(value.id);
		if (
			previous?.pluginId === value.localPluginId &&
			previous.versionId === value.pluginVersionId
		)
			return;
		if (previous) {
			const versions = pluginVersionUses.get(previous.pluginId)!;
			const count = versions.get(previous.versionId)! - 1;
			if (count) versions.set(previous.versionId, count);
			else versions.delete(previous.versionId);
		}
		chatPluginVersions.set(value.id, {
			pluginId: value.localPluginId,
			versionId: value.pluginVersionId,
		});
		const versions = pluginVersionUses.get(value.localPluginId) ?? new Map();
		pluginVersionUses.set(value.localPluginId, versions);
		versions.set(
			value.pluginVersionId,
			(versions.get(value.pluginVersionId) ?? 0) + 1,
		);
	}

	function untrackChatPluginVersion(chatId: string) {
		const previous = chatPluginVersions.get(chatId);
		if (!previous) return;
		chatPluginVersions.delete(chatId);
		const versions = pluginVersionUses.get(previous.pluginId)!;
		const count = versions.get(previous.versionId)! - 1;
		if (count) versions.set(previous.versionId, count);
		else versions.delete(previous.versionId);
	}

	function isPluginVersionUsed(pluginId: string, versionId: string) {
		return (pluginVersionUses.get(pluginId)?.get(versionId) ?? 0) > 0;
	}

	function watchMeta(_pluginId: string, chatId: string, value: ChatMeta) {
		const key = `meta:${chatId}`;
		metaWatchers.get(key)?.();
		// Keep runtime-only generation progress out of both the record and dirty queue.
		metaWatchers.set(
			key,
			watch(
				() => ({
					id: value.id,
					localPluginId: value.localPluginId,
					pluginVersionId: value.pluginVersionId,
					title: value.title,
					rootContainerId: value.rootContainerId,
					lastContainerId: value.lastContainerId,
					lastMessagePreview: value.lastMessagePreview,
					composerDraft: value.composerDraft,
					createdAt: value.createdAt,
					updatedAt: value.updatedAt,
					lifetime: value.lifetime,
					pinned: value.pinned,
					isTemplate: value.isTemplate,
				}),
				() => {
					trackChatPluginVersion(value);
					markDirty({ type: "meta", id: chatId });
				},
				{ deep: true },
			),
		);
	}

	function watchContainers(chatId: string, value: Set<ChatContainer>) {
		const key = `container:${chatId}`;
		containerWatchers.get(key)?.();
		containerWatchers.set(
			key,
			watch(
				value,
				() => {
					for (const item of value as Set<{ id?: string }>)
						if (item.id) markDirty({ type: "container", id: item.id });
				},
				{ deep: true },
			),
		);
	}

	function addChat(value: ChatMeta) {
		trackChatPluginVersion(value);
		let list = chatMeta.get(value.localPluginId);
		if (!list) {
			list = shallowReactive(new Map<string, ChatMeta>());
			chatMeta.set(value.localPluginId, list);
		}
		const chat = reactive(value) as ChatMeta;
		list.set(value.id, chat);
		watchMeta(value.localPluginId, value.id, chat);
		return chat;
	}

	function addContainers(chatId: string, values: ChatContainer[]) {
		const list = shallowReactive(
			new Set<ChatContainer>(
				values.map((value) => reactive(value) as ChatContainer),
			),
		);
		containers.set(chatId, list);
		watchContainers(chatId, list);
		return list;
	}

	function addContainer(value: ChatContainer) {
		let list = containers.get(value.conversationid);
		if (!list) list = addContainers(value.conversationid, []);
		list.add(reactive(value) as ChatContainer);
		return [...list].find((item) => item.id === value.id)!;
	}

	function refreshCharacter(id: string) {
		const current = [...characters].find((item) => item.id === id);
		const plugin = plugins.get(id);
		if (!plugin) {
			if (current) characters.delete(current);
			return;
		}
		const version = latestPluginVersion(plugin);
		if (!version) throw new Error(`Plugin 没有可加载的版本：${id}`);
		const next = characterFromPlugin(
			id,
			replayPluginVersion(plugin, version.id),
		);
		if (current) Object.assign(current, next);
		else characters.add(next);
	}

	function addPlugin(id: string, value: PluginDocument) {
		const plugin = reactive(value) as PluginDocument;
		plugins.set(id, plugin);
		refreshCharacter(id);
		return plugin;
	}

	/** Removes one chat's memory graph after queuing database deletes. */
	function removeChat(chatId: string) {
		const chat = [...chatMeta.values()]
			.map((list) => list.get(chatId))
			.find(Boolean);
		for (const container of containers.get(chatId) ?? [])
			markDirty({ type: "container", id: container.id });
		if (chat) markDirty({ type: "meta", id: chat.id });
		containerWatchers.get(`container:${chatId}`)?.();
		containerWatchers.delete(`container:${chatId}`);
		containers.delete(chatId);
		if (chat) {
			untrackChatPluginVersion(chat.id);
			metaWatchers.get(`meta:${chat.id}`)?.();
			metaWatchers.delete(`meta:${chat.id}`);
			chatMeta.get(chat.localPluginId)?.delete(chat.id);
		}
		loadedChats.delete(chatId);
	}

	async function init() {
		if (initialized) return;
		initialized = true;
		hydrating++;
		try {
			const [plugins, chats] = await Promise.all([
				selectAll<PluginDocument>("resource_worlds"),
				selectAll<ChatMeta>("conversations"),
			]);
			for (const row of plugins) {
				const value = row.value;
				if (!value.id?.startsWith("local:")) continue;
				const id = value.id.slice("local:".length);
				addPlugin(id, value);
			}
			for (const row of chats)
				if (row.value.localPluginId && row.value.pluginVersionId)
					trackChatPluginVersion(row.value);
		} finally {
			hydrating--;
		}
	}

	async function load(target: SyncTarget) {
		if (target.type === "chatList") {
			if (loadedChatLists.has(target.id)) return;
			loadedChatLists.add(target.id);
			hydrating++;
			try {
				const rows = await selectByField<ChatMeta>(
					"conversations",
					"localPluginId",
					target.id,
				);
				for (const row of rows) addChat(row.value);
			} finally {
				hydrating--;
			}
			return;
		}
		if (loadedChats.has(target.id)) return;
		loadedChats.add(target.id);
		hydrating++;
		try {
			const known = [...chatMeta.values()]
				.map((list) => list.get(target.id))
				.find(Boolean);
			const chat =
				known ?? (await selectOne<ChatMeta>("conversations", target.id));
			if (!chat) return;
			if (![...chatMeta.values()].some((list) => list.has(chat.id)))
				addChat(chat);
			if (containers.has(target.id)) return;
			const rows = await selectByField<ChatContainer>(
				"message_containers",
				"conversationid",
				target.id,
			);
			addContainers(
				target.id,
				rows.map((row) => row.value),
			);
		} finally {
			hydrating--;
		}
	}

	async function syncTarget(target: DirtyTarget) {
		const key = dirtyKey(target);
		if (!dirty.has(key)) return;
		const handler = handlers.get(target.type);
		if (!handler) throw new Error(`syncStore 缺少 ${target.type} 的同步实现。`);
		const recordId = handler.recordId?.(target.id) ?? target.id;
		const value = handler.value(target.id);
		if (value === undefined) await remove(handler.table, recordId);
		else
			await upsert(
				handler.table,
				recordId,
				handler.serialize?.(value) ?? value,
			);
		dirty.delete(key);
	}

	async function _sync(target?: DirtyTarget) {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
		const entries = target ? [target] : [...dirty].map(parseDirtyKey);
		for (const entry of entries) await syncTarget(entry);
	}

	async function unload(target: SyncTarget) {
		if (target.type === "chatList") {
			if (!loadedChatLists.delete(target.id)) return;
			const list = chatMeta.get(target.id);
			for (const chat of [...(list?.values() ?? [])] as Array<{ id: string }>) {
				const id = (chat as { id: string }).id;
				if (loadedChats.has(id)) continue;
				await _sync({ type: "meta", id });
				metaWatchers.get(`meta:${id}`)?.();
				metaWatchers.delete(`meta:${id}`);
				list?.delete(id);
			}
			return;
		}
		if (!loadedChats.delete(target.id)) return;
		await _sync();
		const chat = [...chatMeta.values()]
			.map((list) => list.get(target.id))
			.find(Boolean);
		if (chat) await _sync({ type: "meta", id: chat.id });
		for (const item of (containers.get(target.id) as Set<{ id: string }>) ?? [])
			await _sync({ type: "container", id: item.id });
		containerWatchers.get(`container:${target.id}`)?.();
		containerWatchers.delete(`container:${target.id}`);
		containers.delete(target.id);
		if (chat && !loadedChatLists.has(chat.localPluginId)) {
			metaWatchers.get(`meta:${target.id}`)?.();
			metaWatchers.delete(`meta:${target.id}`);
			chatMeta.get(chat.localPluginId)?.delete(chat.id);
		}
	}

	/** Drop every cached record and its watchers. Persistent records are untouched. */
	function clearAll() {
		if (timer) clearTimeout(timer);
		timer = undefined;
		for (const stop of metaWatchers.values()) stop();
		for (const stop of containerWatchers.values()) stop();
		metaWatchers.clear();
		containerWatchers.clear();
		characters.clear();
		plugins.clear();
		chatPluginVersions.clear();
		pluginVersionUses.clear();
		chatMeta.clear();
		containers.clear();
		dirty.clear();
		loadedChatLists.clear();
		loadedChats.clear();
		initialized = false;
	}

	return {
		characters,
		plugins,
		chatMeta,
		containers,
		init,
		load,
		unload,
		markDirty,
		_sync,
		clearAll,
		addChat,
		addPlugin,
		refreshCharacter,
		isPluginVersionUsed,
		removeChat,
		addContainers,
		addContainer,
	};
});

if (import.meta.hot)
	import.meta.hot.accept(acceptHMRUpdate(useSyncStore, import.meta.hot));


src/features/Database/mock-database.ts

/**
 * In-memory implementation of the `HostDatabase` contract for debugging and agent testing outside Electron.
 */

import { toRaw } from "vue";

export interface JsonPatch {
	op: "add" | "replace" | "remove";
	path: string;
	value?: unknown;
}

type StoredValue = Record<string, unknown>;

function deepToRaw<T>(val: T): T {
	const raw = toRaw(val);
	if (raw && typeof raw === "object") {
		return JSON.parse(JSON.stringify(raw));
	}
	return raw;
}

function pointerParts(path: string) {
	return path
		.split("/")
		.filter(Boolean)
		.map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function applyPatch(record: StoredValue, patch: JsonPatch) {
	const parts = pointerParts(patch.path);
	if (!parts.length) return;
	let parent: Record<string, unknown> = record;
	for (const key of parts.slice(0, -1)) {
		const next = parent[key];
		if (next === null || typeof next !== "object") {
			parent[key] = {};
		}
		parent = parent[key] as Record<string, unknown>;
	}
	const key = parts[parts.length - 1]!;
	if (patch.op === "remove") delete parent[key];
	else parent[key] = structuredClone(patch.value);
}

const state = { tables: new Map<string, Map<string, StoredValue>>() };

function table(name: string) {
	let map = state.tables.get(name);
	if (!map) {
		map = new Map();
		state.tables.set(name, map);
	}
	return map;
}

export const mockHostDatabase = {
	selectAll<T>(
		tableName: string,
	): Promise<Array<{ id: string | null; value: T }>> {
		return Promise.resolve(
			Array.from(table(tableName).entries()).map(([id, value]) => ({
				id,
				value: structuredClone(value) as T,
			})),
		);
	},
	selectByField<T>(
		tableName: string,
		field: "localPluginId" | "conversationid",
		value: string,
	): Promise<Array<{ id: string | null; value: T }>> {
		return mockHostDatabase.selectAll<T>(tableName).then((rows) =>
			rows.filter((row) => {
				const val = row.value as Record<string, unknown> | null | undefined;
				if (!val) return false;
				return (
					val[field] === value ||
					(field === "conversationid" && val["conversationId"] === value)
				);
			}),
		);
	},
	selectOne<T>(tableName: string, id: string): Promise<T | null> {
		const value = table(tableName).get(id);
		return Promise.resolve(value ? (deepToRaw(value) as T) : null);
	},
	upsert<T>(tableName: string, id: string, value: T): Promise<void> {
		table(tableName).set(id, deepToRaw(value) as StoredValue);
		return Promise.resolve();
	},
	update(tableName: string, id: string, patches: JsonPatch[]): Promise<void> {
		const record = table(tableName).get(id);
		if (!record) throw new Error(`mock update 目标不存在：${tableName}/${id}`);
		for (const patch of patches) applyPatch(record, patch);
		return Promise.resolve();
	},
	remove(tableName: string, id: string): Promise<void> {
		table(tableName).delete(id);
		return Promise.resolve();
	},
	resetCharacterData(): Promise<void> {
		for (const name of Array.from(state.tables.keys())) {
			if (name.startsWith("resource_")) state.tables.delete(name);
		}
		return Promise.resolve();
	},
};


src/features/Database/sync-metadata.ts

interface EntitySyncMeta {
	vector: Record<string, number>;
	updatedAt: string;
	deleted?: boolean;
	scopeLocalPluginId?: string | null;
	parentConversationId?: string;
	syncable?: boolean;
}

interface SyncMetadataSnapshot {
	counter: number;
	entities: Record<string, EntitySyncMeta>;
}

const deviceIdKey = "pulsar:sync:device-id";
const metadataKey = "pulsar:sync:entity-metadata:v1";
const remoteWriteDepth = 0;

const memoryStore = new Map<string, string>();
const storage = {
	getItem(key: string): string | null {
		if (typeof localStorage !== "undefined") {
			return localStorage.getItem(key);
		}
		return memoryStore.get(key) ?? null;
	},
	setItem(key: string, value: string): void {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(key, value);
		} else {
			memoryStore.set(key, value);
		}
	},
	removeItem(key: string): void {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(key);
		} else {
			memoryStore.delete(key);
		}
	},
};

function getLocalDeviceId() {
	let deviceId = storage.getItem(deviceIdKey);
	if (!deviceId) {
		deviceId = crypto.randomUUID();
		storage.setItem(deviceIdKey, deviceId);
	}
	return deviceId;
}

function syncEntityKey(table: string, id: string) {
	return `${table}:${id}`;
}

function readSyncMetadata(): SyncMetadataSnapshot {
	const raw = storage.getItem(metadataKey);
	if (!raw) {
		return { counter: 0, entities: {} };
	}
	try {
		const parsed = JSON.parse(raw) as Partial<SyncMetadataSnapshot>;
		return {
			counter: Number(parsed.counter) || 0,
			entities:
				parsed.entities && typeof parsed.entities === "object"
					? parsed.entities
					: {},
		};
	} catch {
		return { counter: 0, entities: {} };
	}
}

function writeSyncMetadata(snapshot: SyncMetadataSnapshot) {
	storage.setItem(metadataKey, JSON.stringify(snapshot));
}

export function clearResourceSyncMetadata() {
	storage.removeItem(metadataKey);
}

export function markLocalDatabaseChange(
	table: string,
	id: string,
	deleted = false,
	value?: unknown,
) {
	if (remoteWriteDepth > 0 || !table.startsWith("resource_")) {
		return;
	}
	const snapshot = readSyncMetadata();
	const deviceId = getLocalDeviceId();
	snapshot.counter += 1;
	const key = syncEntityKey(table, id);
	const previous = snapshot.entities[key];
	const record =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	const scopeLocalPluginId =
		table === "resource_worlds" && id.startsWith("local:")
			? id.slice("local:".length)
			: typeof record.localPluginId === "string" ||
					record.localPluginId === null
				? (record.localPluginId as string | null)
				: previous?.scopeLocalPluginId;
	const parentConversationId =
		typeof record.conversationid === "string"
			? record.conversationid
			: previous?.parentConversationId;
	snapshot.entities[key] = {
		vector: {
			...(previous?.vector ?? {}),
			[deviceId]: snapshot.counter,
		},
		updatedAt: new Date().toISOString(),
		deleted,
		scopeLocalPluginId,
		parentConversationId,
		syncable: previous?.syncable ?? true,
	};
	writeSyncMetadata(snapshot);
}


src/features/Database/test/dbsync-character.test.ts

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const { selectAll, upsert } = vi.hoisted(() => ({
	selectAll: vi.fn(),
	upsert: vi.fn(async () => {}),
}));

vi.mock("../database-service", () => ({
	selectAll,
	selectByField: vi.fn(async () => []),
	selectOne: vi.fn(async () => null),
	upsert,
	remove: vi.fn(async () => {}),
}));

import { useCharacterList } from "@/features/Plugin/dataflow/use-plugin-data";
import { useSyncStore } from "../dbsync-store";

describe("character projection", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		upsert.mockClear();
		selectAll.mockResolvedValue([
			{
				id: "local:role-1",
				value: {
					id: "local:role-1",
					tree: {
						"definition.package.json": JSON.stringify({
							name: "旧名称",
							globalPlugins: ["core", "default"],
						}),
						"avatar.png": "data:image/png;base64,avatar",
					},
					meta: {},
				},
			},
		]);
	});

	it("creates a local Plugin and exposes its role projection", async () => {
		const store = useSyncStore();
		await store.init();
		const list = useCharacterList();

		const character = await list.create();

		expect(character.name).toBe("新角色");
		expect(store.plugins.get(character.id)?.id).toBe(`local:${character.id}`);
		expect(upsert).toHaveBeenCalledWith(
			"resource_worlds",
			`local:${character.id}`,
			expect.objectContaining({ id: `local:${character.id}` }),
		);
		store.clearAll();
	});

	it("refreshes when Plugin source changes", async () => {
		const store = useSyncStore();
		await store.init();
		const character = [...store.characters][0]!;
		expect(character.avatarUrl).toBe("data:image/png;base64,avatar");

		store.plugins.get("role-1")!.tree["definition.package.json"] =
			JSON.stringify({ name: "新名称" });
		await nextTick();
		expect(character.name).toBe("新名称");
		store.clearAll();
	});
});


src/features/Environment/backup/backup-store.ts

import { defineStore } from "pinia";
import { toRaw } from "vue";
import type {
	ChatContainer as ChatMessageContainer,
	ChatMeta as Conversation,
} from "@/features/Conversation/dataflow/types";
import { selectAll, upsert } from "@/features/Database/database-service";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	preparePluginDocument,
	replayPluginVersion,
} from "@/features/Plugin/dataflow/plugin-version";
import type { PluginDocument as WorldDocument } from "@/features/Plugin/dataflow/types";
import { parseCharacterDefinition } from "@/features/Plugin/resources/types/character/plugin-character";
import { host } from "@/host";
import {
	createResourceBundle,
	type ResourceBundleFiles,
	readResourceBundle,
} from "./resource-bundle";

const worldTable = "resource_worlds";
const localPluginWorldDocumentId = (id: string) => `local:${id}`;
const selectAllChats = async () =>
	(await selectAll<Conversation>("conversations")).map((row) => row.value);
const selectAllContainers = async () =>
	(await selectAll<ChatMessageContainer>("message_containers")).map(
		(row) => row.value,
	);
const persistChat = (chat: Conversation) =>
	upsert("conversations", chat.id, chat);
async function initializeWorlds() {
	const sync = useSyncStore();
	sync.clearAll();
	await sync.init();
}

type BackupInterval = "off" | "10m" | "30m" | "1h" | "6h" | "1d" | "1w";
type BackupLimit = "3" | "5" | "10" | "20" | "50" | "unlimited";
export type ResourceImportMode = "copy" | "update";
type RestorableResourceType = "local-plugin" | "conversation";
export interface BackupInfo {
	id: string;
	name: string;
	path: string;
	createdAt: string;
	size: number;
}
export interface BackupEndpointSettings {
	directory: string;
	selectedBackup: string;
	autoInterval: BackupInterval;
	maxBackups: BackupLimit;
}
interface RemoteBackupSettings {
	username: string;
	password: string;
	address: string;
	path: string;
	selectedBackup: string;
	autoInterval: BackupInterval;
	maxBackups: BackupLimit;
}
export interface LanSyncSettings {
	enabled: boolean;
	port: number;
	pairingKey: string;
	peerAddress: string;
	deviceName: string;
}
export interface BackupResourceSnapshot {
	localPlugins: WorldDocument[];
	conversations: Conversation[];
	containers: ChatMessageContainer[];
	worlds: WorldDocument[];
}
export interface ResourceArchivePayload {
	rootType: RestorableResourceType;
	rootId: string;
	snapshot: BackupResourceSnapshot;
}
export interface RestorableResource {
	key: string;
	id: string;
	type: RestorableResourceType;
	name: string;
	localPluginId: string | null;
}
const storageKey = "pulsarai:version-management-settings:v2";
function clone<T>(value: T): T {
	return structuredClone(toRaw(value));
}
function settings() {
	try {
		return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
	} catch {
		return {};
	}
}
function persistentSnapshot(
	data: BackupResourceSnapshot,
): BackupResourceSnapshot {
	const conversations = data.conversations.filter(
		(chat) => chat.lifetime !== "app",
	);
	const conversationIds = new Set(conversations.map((chat) => chat.id));
	return {
		...data,
		conversations,
		containers: data.containers.filter((container) =>
			conversationIds.has(container.conversationid),
		),
	};
}
function setBackupResources(
	target: unknown,
	data: BackupResourceSnapshot | null,
) {
	(
		target as { backupResources: BackupResourceSnapshot | null }
	).backupResources = data;
}
async function snapshot(): Promise<BackupResourceSnapshot> {
	const worlds = (await selectAll<WorldDocument>(worldTable)).map(
		(row) => row.value,
	);
	return persistentSnapshot({
		localPlugins: worlds.filter((world) => world.id.startsWith("local:")),
		worlds,
		conversations: await selectAllChats(),
		containers: await selectAllContainers(),
	});
}
export const useBackupStore = defineStore("backup", {
	state: () => {
		const saved = settings();
		return {
			backups: [] as BackupInfo[],
			status: "",
			loadingResources: false,
			syncing: false,
			serverRunning: false,
			lastSyncByDevice: {} as Record<string, string>,
			selectedResourceKeys: [] as string[],
			backupResources: null as BackupResourceSnapshot | null,
			local: {
				directory: saved.local?.directory ?? "",
				selectedBackup: "",
				autoInterval: saved.local?.autoInterval ?? "off",
				maxBackups: saved.local?.maxBackups ?? "10",
			} as BackupEndpointSettings,
			remote: {
				username: "",
				password: "",
				address: "",
				path: "",
				selectedBackup: "",
				autoInterval: "off",
				maxBackups: "10",
			} as RemoteBackupSettings,
			lan: {
				enabled: false,
				port: 17321,
				pairingKey: "",
				peerAddress: "",
				deviceName: "PulsarAI",
			} as LanSyncSettings,
		};
	},
	getters: {
		restorableResources(state): RestorableResource[] {
			const data =
				state.backupResources as unknown as BackupResourceSnapshot | null;
			if (!data) return [];
			return [
				...data.localPlugins.map((document) => {
					const version = document.versions?.at(-1);
					const name = parseCharacterDefinition(
						(version ? replayPluginVersion(document, version.id) : document)
							.tree["definition.package.json"],
					).name;
					return {
						key: `local-plugin:${document.id.slice(6)}`,
						id: document.id.slice(6),
						type: "local-plugin" as const,
						name,
						localPluginId: document.id.slice(6),
					};
				}),
				...data.conversations.map((chat) => ({
					key: `conversation:${chat.id}`,
					id: chat.id,
					type: "conversation" as const,
					name: chat.title,
					localPluginId: chat.localPluginId,
				})),
			];
		},
	},
	actions: {
		persist() {
			localStorage.setItem(storageKey, JSON.stringify({ local: this.local }));
		},
		async initialize() {
			this.backups = await host.backup.invoke<BackupInfo[]>("backup_list", {
				directory: this.local.directory,
			});
		},
		updateLocal(patch: Partial<BackupEndpointSettings>) {
			Object.assign(this.local, patch);
			this.persist();
		},
		updateLan(patch: Partial<LanSyncSettings>) {
			Object.assign(this.lan, patch);
		},
		async selectDirectory() {
			const path = await host.dialog.open({
				title: "选择备份目录",
				directory: true,
				multiple: false,
				properties: ["openDirectory"],
			});
			if (typeof path === "string") this.updateLocal({ directory: path });
		},
		async createLocalBackup() {
			this.backups = await host.backup.invoke<BackupInfo[]>("backup_create", {
				directory: this.local.directory,
				maxBackups: this.local.maxBackups,
			});
		},
		async restoreLocalBackup() {
			if (!this.local.selectedBackup) return;
			await host.backup.invoke("backup_restore", {
				directory: this.local.directory,
				backupId: this.local.selectedBackup,
			});
		},
		async deleteLocalBackup() {
			if (!this.local.selectedBackup) return;
			await host.backup.invoke("backup_delete", {
				directory: this.local.directory,
				backupId: this.local.selectedBackup,
			});
			await this.initialize();
		},
		async loadBackupResources() {
			if (!this.local.selectedBackup) return false;
			this.loadingResources = true;
			try {
				const data = await host.backup.invoke<BackupResourceSnapshot>(
					"backup_load_resources",
					{
						directory: this.local.directory,
						backupId: this.local.selectedBackup,
					},
				);
				setBackupResources(this, persistentSnapshot(data));
				this.selectedResourceKeys = [];
				return Boolean(this.backupResources);
			} finally {
				this.loadingResources = false;
			}
		},
		toggleResource(key: string, selected: boolean) {
			this.selectedResourceKeys = selected
				? [...new Set([...this.selectedResourceKeys, key])]
				: this.selectedResourceKeys.filter((item) => item !== key);
		},
		async exportResource(key: string) {
			const data = await snapshot();
			const [type, id] = key.split(":", 2) as [RestorableResourceType, string];
			const root =
				type === "local-plugin"
					? data.localPlugins.find(
							(item) => item.id === localPluginWorldDocumentId(id),
						)
					: data.conversations.find((item) => item.id === id);
			if (!root) throw new Error("资源不存在。");
			const localPluginId =
				type === "local-plugin" ? id : (root as Conversation).localPluginId;
			const payload: ResourceArchivePayload = {
				rootType: type,
				rootId: id,
				snapshot: {
					localPlugins: data.localPlugins.filter(
						(item) => item.id === localPluginWorldDocumentId(localPluginId),
					),
					worlds: data.worlds.filter(
						(item) =>
							item.id === "global" ||
							item.id === localPluginWorldDocumentId(localPluginId),
					),
					conversations: data.conversations.filter(
						(item) => item.localPluginId === localPluginId,
					),
					containers: data.containers.filter((item) =>
						data.conversations.some(
							(chat) =>
								chat.id === item.conversationid &&
								chat.localPluginId === localPluginId,
						),
					),
				},
			};
			const path = await host.dialog.save({
				title: "导出资源文件夹",
				defaultPath: `${id}.pulsar-resource.zip`,
				filters: [{ name: "PulsarAI 资源文件夹", extensions: ["zip"] }],
			});
			if (typeof path === "string")
				await host.backup.invoke("resource_bundle_write", {
					path,
					bytes: [...createResourceBundle(payload)],
				});
		},
		async importResourceArchive(mode: ResourceImportMode) {
			const path = await host.dialog.open({
				title: "导入资源文件夹或压缩包",
				directory: true,
				multiple: false,
				properties: ["openFile", "openDirectory"],
				filters: [{ name: "PulsarAI 资源文件夹", extensions: ["zip"] }],
			});
			if (typeof path !== "string") return null;
			const source = await host.backup.invoke<number[] | ResourceBundleFiles>(
				"resource_bundle_read",
				{ path },
			);
			const payload = readResourceBundle(
				Array.isArray(source) ? Uint8Array.from(source) : source,
			);
			setBackupResources(this, persistentSnapshot(payload.snapshot));
			this.selectedResourceKeys = [`${payload.rootType}:${payload.rootId}`];
			await this.restoreSelectedResources(mode);
			return payload.rootType === "local-plugin" ? payload.rootId : null;
		},
		async restoreSelectedResources(_mode: ResourceImportMode) {
			const source = this
				.backupResources as unknown as BackupResourceSnapshot | null;
			if (!source) return false;
			const data = persistentSnapshot(source);
			const ids = new Set(
				this.selectedResourceKeys
					.filter((key) => key.startsWith("local-plugin:"))
					.map((key) => key.slice("local-plugin:".length)),
			);
			for (const document of data.localPlugins.filter((item) =>
				ids.has(item.id.slice(6)),
			)) {
				const imported = await preparePluginDocument(clone(document));
				await upsert(worldTable, imported.id, imported);
			}
			await initializeWorlds();
			for (const chat of data.conversations.filter((item) =>
				ids.has(item.localPluginId),
			))
				await persistChat(clone(chat));
			for (const container of data.containers.filter((item) =>
				data.conversations.some(
					(chat) =>
						ids.has(chat.localPluginId) && chat.id === item.conversationid,
				),
			))
				await upsert("message_containers", container.id, clone(container));
			return true;
		},
		async toggleLanServer(enabled: boolean) {
			this.serverRunning = enabled;
			if (enabled)
				await host.backup.invoke("lan_sync_start", {
					port: this.lan.port,
					pairingKey: this.lan.pairingKey,
				});
			else await host.backup.invoke("lan_sync_stop");
		},
		async publishSnapshot() {},
		async syncWithPeer() {
			this.status = "本地 Plugin 同步由资源归档执行。";
		},
		async setLocalPluginSyncEnabled(_id: string, _enabled: boolean) {},
	},
});


src/features/Environment/backup/BackupResourceRestoreDialog.vue

<script setup lang="ts">
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/fluid";
import { Checkbox } from "@/components/ui/checkbox";
import { ArchiveRestore, Box, MessageSquareText } from "@/lib/phosphor-icons";
import { useBackupStore } from "./backup-store";

const open = defineModel<boolean>("open", { default: false });
const backup = useBackupStore();

async function restore() {
	if (await backup.restoreSelectedResources("update")) open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle><ArchiveRestore class="mr-2 inline size-5" />恢复本地 Plugin</DialogTitle>
        <DialogDescription>会话会随所属本地 Plugin 一起恢复。</DialogDescription>
      </DialogHeader>
      <div class="grid gap-2">
        <label v-for="item in backup.restorableResources" :key="item.key" class="flex items-center gap-3 rounded border p-3">
          <Checkbox :model-value="backup.selectedResourceKeys.includes(item.key)" @update:model-value="backup.toggleResource(item.key, Boolean($event))" />
          <Box v-if="item.type === 'local-plugin'" class="size-4" />
          <MessageSquareText v-else class="size-4" />
          <span>{{ item.name }}</span>
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">取消</Button>
        <Button :disabled="!backup.selectedResourceKeys.length" @click="restore">恢复</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>


src/features/Environment/backup/BackupSettingsPage.vue

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { useSyncStore } from "@/features/Database/dbsync-store";
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import {
	ArchiveRestore,
	DatabaseBackup,
	Download,
	ShieldCheck,
	Upload,
} from "@/lib/phosphor-icons";
import BackupResourceRestoreDialog from "./BackupResourceRestoreDialog.vue";
import { useBackupStore } from "./backup-store";

const backup = useBackupStore();
const sync = useSyncStore();
const restoreOpen = ref(false);
const selected = ref("");
const choices = computed(() =>
	[...sync.characters].map((item) => ({
		value: `local-plugin:${item.id}`,
		label: item.name,
	})),
);

onMounted(async () => {
	await Promise.all([backup.initialize(), sync.init()]);
});

async function exportSelected() {
	if (selected.value) await backup.exportResource(selected.value);
}
</script>

<template>
  <SettingPage title="版本管理" description="本地 Plugin、其 World 与会话可作为同一资源恢复或导出。">
    <p v-if="backup.status" class="rounded border p-3 text-sm">{{ backup.status }}</p>
    <SettingGroup title="资源导入与导出">
      <SettingItem title="导出本地 Plugin" description="导出为含 manifest.json 的文件夹压缩包；导入也接受解压后的文件夹。">
        <div class="flex gap-2">
          <Select v-model="selected"><SelectTrigger><SelectValue placeholder="选择本地 Plugin" /></SelectTrigger><SelectContent><SelectItem v-for="item in choices" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent></Select>
          <Button :disabled="!selected" @click="exportSelected"><Download />导出</Button>
          <Button @click="backup.importResourceArchive('update')"><Upload />导入</Button>
        </div>
      </SettingItem>
    </SettingGroup>
    <SettingGroup title="本地历史备份">
      <SettingItem title="创建备份" description="创建当前数据库的历史快照。"><Button @click="backup.createLocalBackup"><DatabaseBackup />立即备份</Button></SettingItem>
      <SettingItem title="历史版本" description="选择后可恢复全部数据库或具体本地 Plugin。">
        <div class="flex gap-2">
          <Select v-model="backup.local.selectedBackup"><SelectTrigger><SelectValue placeholder="选择备份" /></SelectTrigger><SelectContent><SelectItem v-for="item in backup.backups" :key="item.id" :value="item.id">{{ item.name }}</SelectItem></SelectContent></Select>
          <Button variant="outline" :disabled="!backup.local.selectedBackup" @click="backup.loadBackupResources().then((ok) => restoreOpen = ok)"><ArchiveRestore />恢复资源</Button>
          <Button variant="outline" :disabled="!backup.local.selectedBackup" @click="backup.restoreLocalBackup"><ShieldCheck />全量恢复</Button>
        </div>
      </SettingItem>
      <SettingItem title="备份目录"><Input :model-value="backup.local.directory" @update:model-value="backup.updateLocal({ directory: String($event) })" /></SettingItem>
    </SettingGroup>
    <BackupResourceRestoreDialog v-model:open="restoreOpen" />
  </SettingPage>
</template>


src/features/Environment/backup/resource-bundle.ts

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ResourceArchivePayload } from "./backup-store";

const format = "pulsarai.resource-folder.v1";
type BundleManifest = {
	format: typeof format;
	rootType: ResourceArchivePayload["rootType"];
	rootId: string;
	entry: string;
	files: string[];
};
export type ResourceBundleFiles = Record<string, number[]>;

function folderName(payload: ResourceArchivePayload) {
	return `${payload.rootType}-${payload.rootId}`.replace(/[\\/:*?"<>|]/g, "_");
}

export function createResourceBundle(
	payload: ResourceArchivePayload,
): Uint8Array {
	const root = folderName(payload);
	const files: Record<string, Uint8Array> = {};
	const add = (name: string, value: unknown) => {
		files[`${root}/${name}`] = strToU8(JSON.stringify(value, null, 2));
	};
	add("local-plugins.json", payload.snapshot.localPlugins);
	add("worlds.json", payload.snapshot.worlds);
	add("conversations.json", payload.snapshot.conversations);
	add("message-containers.json", payload.snapshot.containers);
	const manifest: BundleManifest = {
		format,
		rootType: payload.rootType,
		rootId: payload.rootId,
		entry: "manifest.json",
		files: Object.keys(files).map((key) => key.slice(root.length + 1)),
	};
	add("manifest.json", manifest);
	return zipSync(files, { level: 6 });
}

export function readResourceBundle(
	input: Uint8Array | ResourceBundleFiles,
): ResourceArchivePayload {
	const files =
		input instanceof Uint8Array
			? unzipSync(input)
			: Object.fromEntries(
					Object.entries(input).map(([key, value]) => [
						key,
						Uint8Array.from(value),
					]),
				);
	const manifestPath = Object.keys(files).find(
		(path) => path.endsWith("/manifest.json") || path === "manifest.json",
	);
	if (!manifestPath) throw new Error("导入文件夹缺少 manifest.json。");
	const prefix = manifestPath.slice(0, -"manifest.json".length);
	const read = <T>(name: string): T => {
		const bytes = files[`${prefix}${name}`];
		if (!bytes) throw new Error(`导入文件夹缺少 ${name}。`);
		return JSON.parse(strFromU8(bytes)) as T;
	};
	const manifest = read<BundleManifest>("manifest.json");
	if (manifest.format !== format) throw new Error("不是 PulsarAI 资源文件夹。");
	return {
		rootType: manifest.rootType,
		rootId: manifest.rootId,
		snapshot: {
			localPlugins: read("local-plugins.json"),
			worlds: read("worlds.json"),
			conversations: read("conversations.json"),
			containers: read("message-containers.json"),
		},
	};
}


src/features/Environment/components/AppContainer.vue

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ChatManager from "@/features/Conversation/components/ChatManager.vue";
import {
	toggleEditModeAction,
	toggleEditModeEvent,
} from "@/features/Conversation/dataflow/activePathComposable";
import {
	cleanupAppLifetimeChats,
	useChatList,
} from "@/features/Conversation/dataflow/chats";
import ConversationSurface from "@/features/Conversation/stage/ConversationSurface.vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import "@/features/Plugin/dataflow";
import CharacterEntryPage from "@/features/Tabs/CharacterEntryPage.vue";
import { useTabsStore } from "@/features/Tabs/store";
import { popOutTarget } from "@/features/Tabs/subWindow/sub-window-service";
import AppHeader from "./AppHeader.vue";

const sync = useSyncStore();
const tabs = useTabsStore();
const activeChatId = computed(() =>
	tabs.activeTab?.type === "chat" ? tabs.activeTab.id : "",
);
const activeTab = computed(() =>
	tabs.views.find((tab) => tab.id === tabs.activeId),
);
const managerOpen = ref(false);
const managerPluginId = ref("");

async function openChat(chatId: string) {
	await tabs.open({ type: "chat", contentid: chatId });
}
function toggleEditMode() {
	if (activeChatId.value) toggleEditModeAction();
}

async function openCharacter(localPluginId: string) {
	const homeId = tabs.activeTab?.type === "home" ? tabs.activeTab.id : null;
	await sync.load({ type: "chatList", id: localPluginId });
	const chats = useChatList(localPluginId);
	const chat =
		[...chats.chats.value].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		)[0] ?? chats.create();
	await openChat(chat.id);
	if (homeId) tabs.close(homeId);
}

function createPage() {
	void tabs.open({ type: "home" });
}
function tabAction(
	id: string,
	action: "close" | "others" | "left" | "right" | "reload" | "popout",
) {
	if (action === "close") return tabs.close(id);
	if (action === "others") return tabs.closeOthers(id);
	if (action === "left") return tabs.closeLeft(id);
	if (action === "right") return tabs.closeRight(id);
	if (action === "reload") return void tabs.reload(id);
	const tab = tabs.views.find((item) => item.id === id);
	if (tab?.type === "chat")
		void popOutTarget(
			{
				type: "resource",
				resourceType: "chat",
				resourceId: id,
				localPluginId: tab.localPluginId,
			},
			tab.name,
		);
}

watch(
	activeTab,
	(tab) => {
		if (tab?.localPluginId) managerPluginId.value = tab.localPluginId;
		else managerOpen.value = false;
	},
	{ immediate: true },
);
watch(managerOpen, async (open) => {
	if (open && managerPluginId.value)
		await sync.load({ type: "chatList", id: managerPluginId.value });
});
onMounted(async () => {
	await sync.init();
	await cleanupAppLifetimeChats();
});
onMounted(() => window.addEventListener(toggleEditModeEvent, toggleEditMode));
onBeforeUnmount(() => {
	window.removeEventListener(toggleEditModeEvent, toggleEditMode);
	for (const tab of [...tabs.tabs]) tabs.close(tab.id);
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-background">
    <AppHeader :tabs="tabs.views" :active-id="tabs.activeId" v-model:manager-open="managerOpen" @activate="tabs.active" @close="tabs.close" @action="tabAction" @reorder="tabs.reorder" @create="createPage" />
    <ConversationSurface v-if="activeChatId" :key="activeChatId" :chat-id="activeChatId" />
    <CharacterEntryPage v-else @open="openCharacter" />
    <ChatManager v-if="managerPluginId" :key="managerPluginId" :local-plugin-id="managerPluginId" :chat-id="activeChatId" v-model:open="managerOpen" @select="openChat" @close="tabs.close" />
  </section>
</template>


src/features/Environment/components/AppHeader.vue

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/fluid";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import { useEnvironmentStore } from "@/features/Environment/store";
import type { TabView } from "@/features/Tabs/store";
import TabBar from "@/features/Tabs/TabBar.vue";
import { host } from "@/host";
import { History, Maximize2, Minus, Settings, X } from "@/lib/phosphor-icons";

const props = defineProps<{
	tabs: TabView[];
	activeId: string | null;
	managerOpen: boolean;
}>();
const emit = defineEmits<{
	"update:managerOpen": [open: boolean];
	activate: [id: string];
	close: [id: string];
	reorder: [fromIndex: number, toIndex: number];
	create: [];
	action: [
		id: string,
		action: "close" | "others" | "left" | "right" | "reload" | "popout",
	];
}>();
const environment = useEnvironmentStore();
const responsive = useResponsiveStore();
const appWindow = host.desktop?.window;
const topBarClass = computed(() =>
	!environment.appearance.zenFrameEnabled
		? "bg-background text-foreground border-b border-border/80"
		: environment.zenFrameIsDark
			? "bg-zen-frame-bg text-white"
			: "bg-zen-frame-bg text-slate-900",
);
const buttonClass = computed(() =>
	!environment.appearance.zenFrameEnabled
		? "text-muted-foreground hover:bg-muted hover:text-foreground"
		: environment.zenFrameIsDark
			? "text-white/80 hover:bg-white/15 hover:text-white"
			: "text-slate-700 hover:bg-black/10 hover:text-slate-950",
);
function reorder(fromIndex: number, toIndex: number) {
	emit("reorder", fromIndex, toIndex);
}
</script>

<template>
  <header class="relative z-30 flex h-10 shrink-0 select-none items-stretch px-3 mobile:h-12 mobile:px-2" :class="[topBarClass, host.desktop && 'electron-window-drag-region']">
    <div class="h-full min-w-0 flex-1" :class="host.desktop && 'electron-window-drag-region'"><TabBar class="max-w-[min(52vw,44rem)]" data-window-drag-block :tabs="props.tabs" :active-id="props.activeId" :inactive-class="buttonClass" @activate="emit('activate', $event)" @close="emit('close', $event)" @action="(id, action) => emit('action', id, action)" @reorder="reorder" @create="emit('create')" /></div>
    <div class="flex shrink-0 items-center gap-0.5" data-window-drag-block>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="会话列表" @click="emit('update:managerOpen', !props.managerOpen)"><History class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="设置" @click="environment.settingsOpen = true"><Settings class="size-4" /></Button>
    </div>
    <div v-if="host.desktop && !responsive.isMobileLayout" class="ml-1 flex shrink-0 items-center gap-0.5 border-l pl-1" data-window-drag-block><Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最小化" @click="appWindow?.minimize()"><Minus class="size-4" /></Button><Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最大化或还原" @click="appWindow?.toggleMaximize()"><Maximize2 class="size-4" /></Button><Button variant="ghost" size="icon-sm" class="rounded-full hover:bg-destructive hover:text-destructive-foreground" title="关闭" @click="appWindow?.close()"><X class="size-4" /></Button></div>
  </header>
</template>


src/features/Environment/components/AppIcon.vue

<script setup lang="ts">
import logoUrl from "../../../assets/logo.png";

withDefaults(
	defineProps<{
		alt?: string;
	}>(),
	{
		alt: "PulsarAI",
	},
);
</script>

<template>
  <img
    :src="logoUrl"
    :alt="alt"
    class="shrink-0 rounded-[22%] ring-1 ring-foreground/10 shadow-sm dark:ring-white/15 dark:shadow-black/40"
  />
</template>


src/features/Environment/components/AppShell.vue

<script setup lang="ts">
import { Notification, Notivue } from "notivue";
import { onMounted } from "vue";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import SettingsDialog from "@/features/Environment/setting/SettingsDialog.vue";
import {
	useEnvironmentHotkeys,
	useEnvironmentStore,
} from "@/features/Environment/store";
import AppContainer from "./AppContainer.vue";

const environment = useEnvironmentStore();
const responsive = useResponsiveStore();
useEnvironmentHotkeys();

onMounted(() => {
	void environment.initialize();
	responsive.refreshPlatform();
});
</script>

<template>
  <div
    class="flex h-[100dvh] min-w-0 flex-col overflow-hidden text-foreground"
    :class="environment.appearance.zenFrameEnabled ? 'bg-zen-frame-bg' : 'bg-background'"
    :style="environment.appearance.zenFrameEnabled ? { padding: `${environment.appearance.zenFrameWidth}px` } : undefined"
  >
    <div
      class="min-h-0 flex-1"
      :class="environment.appearance.zenFrameEnabled && 'overflow-hidden rounded-xl border border-zen-frame-border/80 bg-background shadow-sm mobile:rounded-lg'"
    >
      <AppContainer />
    </div>
    <SettingsDialog />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>


src/features/Environment/defaults.ts

import type { Component } from "vue";
import type { ModelSelection } from "@/features/Request/types";
import type { ThemeDefinition, ThemeMode } from "./theme/theme-registry";

export type AgentLoadingStyle = "drive" | "dots" | "orbit";
export type WindowCloseBehavior = "ask" | "exit" | "tray";
export type WebSearchProviderId = "playwright" | "exa";
export type TranslationProvider = "microsoft" | "google";

export interface FontDefinition {
	id: string;
	name: string;
	sans: string;
	serif: string;
	mono: string;
}

export interface AppearanceSettings {
	themeId: string;
	themeMode: ThemeMode;
	customThemes: ThemeDefinition[];
	customCss: string;
	fontId: string;
	customFonts: FontDefinition[];
	fontSize: number;
	uiScale: number;
	composerSendWithEnter: boolean;
	interactiveCodePreview: boolean;
	agentLoadingStyle: AgentLoadingStyle;
	zenFrameEnabled: boolean;
	zenFrameWidth: number;
	frameColorMode: "auto" | "custom";
	frameCustomColor: string;
	editorFontSize: number;
	editorLineHeight: number;
	shapeVariant: "square" | "rounded" | "pill";
}

export interface WebSearchSettings {
	activeProviderId: WebSearchProviderId;
	playwrightEnabled: boolean;
	exaEnabled: boolean;
	resultLimit: number;
}

export interface WebSearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface TranslateState {
	sourceLanguage: string;
	targetLanguage: string;
	provider: TranslationProvider;
	azureKey: string;
	azureRegion: string;
	azureEndpoint: string;
	useLlm: boolean;
	llmModel: ModelSelection | null;
	prompt: string;
}

export interface RuntimePreferences {
	playSoundOnReplyComplete: boolean;
	notifyOnReplyComplete: boolean;
	replyCompletionOnlyWhenBackground: boolean;
}

export interface EnvironmentSettingPage {
	meta: { id: string; icon: Component; title: string };
	component?: Component;
	tabs?: Array<{ id: string; title: string; component: Component }>;
}

export const EXA_API_KEY_SECRET = "webSearch.exa.apiKey";

/* -------------------------------------------------------------------------- */
/*                                默认值获取函数                              */
/* -------------------------------------------------------------------------- */

export function getDefaultAppearance(): AppearanceSettings {
	return {
		themeId: "default",
		themeMode: "system",
		customThemes: [],
		customCss: "",
		fontId: "inter",
		customFonts: [],
		fontSize: 16,
		uiScale: 100,
		composerSendWithEnter: true,
		interactiveCodePreview: false,
		agentLoadingStyle: "drive",
		zenFrameEnabled: true,
		zenFrameWidth: 6,
		frameColorMode: "auto",
		frameCustomColor: "#1e1e24",
		editorFontSize: 14,
		editorLineHeight: 16,
		shapeVariant: "rounded",
	};
}

export function getDefaultWebSearchSettings(): WebSearchSettings {
	return {
		activeProviderId: "playwright",
		playwrightEnabled: true,
		exaEnabled: false,
		resultLimit: 5,
	};
}

export function getDefaultTranslateSettings(): TranslateState {
	return {
		sourceLanguage: "auto",
		targetLanguage: "zh-CN",
		provider: "google",
		azureKey: "",
		azureRegion: "",
		azureEndpoint: "https://api.cognitive.microsofttranslator.com",
		useLlm: false,
		llmModel: null,
		prompt:
			"你是专业翻译助手。请把输入内容从 {{sourceLanguage}} 翻译为 {{targetLanguage}}，保留原文格式，不要添加解释。",
	};
}

export function getDefaultHotkeys(): Record<string, string> {
	return {
		settings: "Ctrl+,",
		toggleEditMode: "Ctrl+Shift+E",
		resetCharacterData: "Ctrl+Shift+R",
	};
}

export function getDefaultRuntimePreferences(): RuntimePreferences {
	return {
		playSoundOnReplyComplete: false,
		notifyOnReplyComplete: false,
		replyCompletionOnlyWhenBackground: true,
	};
}

export function getBuiltInFonts(): FontDefinition[] {
	return [
		{
			id: "inter",
			name: "System UI",
			sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
			serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
			mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
		},
		{
			id: "serif",
			name: "Serif Notes",
			sans: 'Georgia, Cambria, "Times New Roman", Times, serif',
			serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
			mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
		},
		{
			id: "mono",
			name: "Mono Workbench",
			sans: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
			serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
			mono: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
		},
	];
}

export function createImportedFont(
	name: string,
	family: string,
): FontDefinition {
	const fonts = getBuiltInFonts();
	return {
		id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
		name,
		sans: family,
		serif: family,
		mono: fonts[0].mono,
	};
}

export const environmentHotkeyLabels = {
	settings: { title: "打开设置", description: "打开应用设置。" },
	toggleEditMode: {
		title: "切换编辑子对话模式",
		description: "插入或关闭内联编辑区间。",
	},
	resetCharacterData: {
		title: "清空全部角色数据",
		description: "清空角色包、对话和插件；保留设置、模型和密钥。",
	},
} as const;

export const translateLanguages = [
	{ id: "auto", name: "自动检测" },
	{ id: "zh-CN", name: "简体中文" },
	{ id: "zh-TW", name: "繁体中文" },
	{ id: "en", name: "English" },
	{ id: "ja", name: "日本語" },
	{ id: "ko", name: "한국어" },
	{ id: "fr", name: "Français" },
	{ id: "de", name: "Deutsch" },
	{ id: "es", name: "Español" },
	{ id: "ru", name: "Русский" },
];


src/features/Environment/floating-surface.ts

import interact from "interactjs";
import { computed, nextTick, onBeforeUnmount, type Ref, ref, watch } from "vue";
import { useResponsiveStore } from "./responsive-store";

export type FloatingFrame = {
	x: number;
	y: number;
	width: number;
	height: number;
};
const memory = new Map<string, FloatingFrame>();

/** Shared drag/resize controller for bounded desktop floating surfaces. */
export function useFloatingSurface(options: {
	surfaceId: string;
	open: Ref<boolean>;
	element: Ref<HTMLElement | { $el?: unknown } | null>;
	initialSize: { width: number; height: number };
	minSize: { width: number; height: number };
	zIndex?: number;
	persistGeometry?: boolean;
	dragHandleId?: string;
	initialPosition?: { x: number; y: number };
}) {
	const responsive = useResponsiveStore();
	const saved = (() => {
		try {
			return options.persistGeometry
				? (JSON.parse(
						localStorage.getItem(`pulsarai:surface:${options.surfaceId}`) ??
							"null",
					) as FloatingFrame | null)
				: null;
		} catch {
			return null;
		}
	})();
	const frame = ref<FloatingFrame>(
		memory.get(options.surfaceId) ??
			saved ?? { x: 0, y: 0, ...options.initialSize },
	);
	let instance: ReturnType<typeof interact> | null = null;
	const style = computed(() =>
		responsive.isMobileLayout
			? {
					inset: "0",
					width: "100vw",
					height: "100dvh",
					left: "0",
					top: "0",
					zIndex: options.zIndex ?? 50,
				}
			: {
					width: `${frame.value.width}px`,
					height: `${frame.value.height}px`,
					left: `${frame.value.x}px`,
					top: `${frame.value.y}px`,
					zIndex: options.zIndex ?? 50,
				},
	);
	function center() {
		const width = Math.min(
			options.initialSize.width,
			Math.max(options.minSize.width, window.innerWidth - 32),
		);
		const height = Math.min(
			options.initialSize.height,
			Math.max(options.minSize.height, window.innerHeight - 32),
		);
		frame.value = memory.get(options.surfaceId) ??
			saved ?? {
				x:
					options.initialPosition?.x ??
					Math.max(8, Math.round((window.innerWidth - width) / 2)),
				y:
					options.initialPosition?.y ??
					Math.max(8, Math.round((window.innerHeight - height) / 2)),
				width,
				height,
			};
	}
	function stop() {
		instance?.unset();
		instance = null;
	}
	function start() {
		stop();
		const candidate = options.element.value;
		let element =
			candidate instanceof HTMLElement
				? candidate
				: candidate?.$el instanceof HTMLElement
					? candidate.$el
					: null;
		if (!element && typeof document !== "undefined") {
			element = document.querySelector(
				`[data-settings-dialog]`,
			) as HTMLElement | null;
		}
		if (!element || responsive.isMobileLayout) return;
		const allowFrom = options.dragHandleId
			? `#${CSS.escape(options.dragHandleId)}`
			: "[data-floating-drag-handle]";
		instance = interact(element)
			.draggable({
				allowFrom,
				ignoreFrom:
					"button, input, textarea, select, [role='button'], [role='tab'], [role='combobox']",
				modifiers: [
					interact.modifiers.restrictRect({
						restriction: "parent",
						elementRect: { left: 0, right: 1, top: 0, bottom: 1 },
					}),
				],
				listeners: {
					move(event) {
						frame.value = {
							...frame.value,
							x: Math.max(0, frame.value.x + event.dx),
							y: Math.max(0, frame.value.y + event.dy),
						};
						save();
					},
				},
			})
			.resizable({
				edges: { left: true, right: true, top: true, bottom: true },
				margin: 8,
				modifiers: [
					interact.modifiers.restrictEdges({ outer: "parent" }),
					interact.modifiers.restrictSize({ min: options.minSize }),
				],
				listeners: {
					move(event) {
						const delta = event.deltaRect ?? { left: 0, top: 0 };
						frame.value = {
							x: Math.max(0, frame.value.x + delta.left),
							y: Math.max(0, frame.value.y + delta.top),
							width: event.rect.width,
							height: event.rect.height,
						};
						save();
					},
				},
			});
	}
	function save() {
		memory.set(options.surfaceId, { ...frame.value });
		if (options.persistGeometry)
			localStorage.setItem(
				`pulsarai:surface:${options.surfaceId}`,
				JSON.stringify(frame.value),
			);
	}
	watch(
		[options.open, () => responsive.isMobileLayout],
		async ([open]) => {
			stop();
			if (!open) return;
			center();
			await nextTick();
			start();
		},
		{ immediate: true },
	);
	onBeforeUnmount(stop);
	return { frame, style, start, stop, center };
}


src/features/Environment/pages/about/AboutSettingsPage.vue

<script setup lang="ts">
import { ref, watch } from "vue";
import { Button, Switch } from "@/components/fluid";
import AppIcon from "@/features/Environment/components/AppIcon.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import { Info, RefreshCcw } from "@/lib/phosphor-icons";

const version = "0.1.0";
const autoCheckUpdates = ref(
	localStorage.getItem("pulsarai:auto-check-updates") !== "false",
);
const checking = ref(false);
const updateStatus = ref("");
const changelogOpen = ref(false);
const layout = useEnvironmentStore();

watch(autoCheckUpdates, (enabled) => {
	localStorage.setItem("pulsarai:auto-check-updates", String(enabled));
});

async function checkForUpdates() {
	checking.value = true;
	updateStatus.value = "";
	await Promise.resolve();
	updateStatus.value = "暂未配置更新源";
	checking.value = false;
}
</script>

<template>
  <SettingPage title="关于" description="PulsarAI 版本与更新信息。">
    <div class="mx-auto flex min-h-full w-full max-w-xl flex-col py-4 mobile:py-0">
      <section class="flex flex-col items-center py-3 text-center">
        <AppIcon class="size-20" />
        <h2 class="mt-3 text-3xl font-semibold tracking-tight">PulsarAI</h2>
        <p class="mt-1 text-sm text-muted-foreground">版本 v{{ version }}</p>
      </section>

      <section class="mt-8 flex flex-col gap-6">
        <div class="flex items-center justify-between gap-6 px-4">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold">自动检查更新</h3>
            <p class="mt-1 text-xs text-muted-foreground">启动时自动检查新版本</p>
          </div>
          <Switch v-model="autoCheckUpdates" aria-label="自动检查更新" />
        </div>

        <Button
          variant="outline"
          class="h-10 w-full rounded-full"
          :disabled="checking"
          @click="checkForUpdates"
        >
          <RefreshCcw data-icon="inline-start" :class="checking && 'animate-spin'" />
          {{ checking ? "检查中" : "检查更新" }}
        </Button>

        <p v-if="updateStatus" class="text-center text-xs text-muted-foreground">{{ updateStatus }}</p>

        <Button variant="ghost" class="mx-auto" @click="changelogOpen = !changelogOpen">
          <Info data-icon="inline-start" />
          查看更新日志
        </Button>

        <div v-if="changelogOpen" class="rounded-xl bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
          当前开发版本暂无公开更新记录。
        </div>
      </section>

      <div class="mt-auto flex justify-end pt-10">
        <Button class="rounded-full px-7" @click="layout.settingsOpen = false">完成</Button>
      </div>
    </div>
  </SettingPage>
</template>


src/features/Environment/pages/appearance/AppearanceSettingsPage.vue

<script setup lang="ts">
import { push } from "notivue";
import { computed, ref } from "vue";
import {
	Button,
	ColorPickerPopover,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Slider,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import SettingForm from "@/features/Environment/setting/SettingForm.vue";
import SettingFormField from "@/features/Environment/setting/SettingFormField.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import {
	Check,
	FileCode2,
	Import,
	Monitor,
	Moon,
	Sun,
	Type,
} from "@/lib/phosphor-icons";

const store = useEnvironmentStore();
const appearance = store.appearance;
const themeFileInput = ref<HTMLInputElement | null>(null);
const themeImportOpen = ref(false);
const themeCss = ref("");
const themeFileName = ref("");
const fontName = ref("");
const fontFamily = ref("");

const activeAccent = computed(() => store.activeTheme.accent);
const themeModeOptions = [
	{ id: "light", label: "浅色", icon: Sun },
	{ id: "dark", label: "深色", icon: Moon },
	{ id: "system", label: "系统", icon: Monitor },
] as const;

function themeDescription(themeId: string) {
	if (appearance.customThemes.some((theme) => theme.id === themeId))
		return "导入的自定义配色";
	return "内置配色方案";
}

function openThemeImport() {
	themeCss.value = "";
	themeFileName.value = "";
	themeImportOpen.value = true;
}

async function importThemeFile(file: File) {
	themeCss.value = await file.text();
	themeFileName.value = file.name;
}

async function readThemeCss(event: Event) {
	const file = (event.target as HTMLInputElement).files?.[0];
	if (!file) return;
	await importThemeFile(file);
	(event.target as HTMLInputElement).value = "";
}

function importTheme() {
	if (!themeCss.value.trim()) return;
	try {
		const theme = store.importThemeCss(themeCss.value);
		push.success(`已导入主题：${theme.name}`);
		themeImportOpen.value = false;
	} catch (error) {
		push.error(error instanceof Error ? error.message : "主题导入失败");
	}
}

function importFont() {
	const name = fontName.value.trim();
	const family = fontFamily.value.trim();
	if (!name || !family) return;
	store.importFont(name, family);
	fontName.value = "";
	fontFamily.value = "";
}
</script>

<template>
  <SettingPage title="主题" description="调整主题、字体和界面显示比例。">
    <section class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold">外观模式</h3>
      <ToggleGroup v-model="appearance.themeMode" type="single" variant="outline" :spacing="1" class="rounded-full bg-muted/55 p-1">
        <ToggleGroupItem
          v-for="option in themeModeOptions"
          :key="option.id"
          :value="option.id"
          class="h-9 rounded-full border-0 px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm"
        >
          <component :is="option.icon" data-icon="inline-start" />
          {{ option.label }}
        </ToggleGroupItem>
      </ToggleGroup>
    </section>

    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-4">
        <h3 class="text-sm font-semibold">颜色主题</h3>
        <Button variant="ghost" size="sm" class="rounded-full" @click="openThemeImport">
          <Import data-icon="inline-start" />
          导入主题
        </Button>
      </div>
      <div class="grid grid-cols-3 gap-2 mobile:grid-cols-1">
        <button
          v-for="theme in store.themes"
          :key="theme.id"
          type="button"
          class="group flex min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted/65"
          :class="appearance.themeId === theme.id && 'bg-muted text-foreground shadow-sm'"
          @click="appearance.themeId = theme.id"
        >
          <span class="size-9 shrink-0 rounded-full ring-1 ring-border/70" :style="{ backgroundColor: theme.accent }" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ theme.name }}</span>
            <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ themeDescription(theme.id) }}</span>
          </span>
          <Check v-if="appearance.themeId === theme.id" class="size-4 shrink-0" />
        </button>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="size-3 rounded-full" :style="{ backgroundColor: activeAccent }" />
        <h3 class="text-sm font-semibold">自定义</h3>
      </div>
      <SettingForm>

      <SettingFormField
        title="自定义 CSS"
        description="在主题样式之后应用到整个应用。内容会实时生效并保存在本机；错误的选择器可能影响界面可用性。"
      >
        <template #bottom>
          <Textarea
            v-model="appearance.customCss"
            class="min-h-48 resize-y font-mono text-xs leading-5"
            placeholder="/* 例如：调整工作区圆角 */&#10;.workspace-panel { border-radius: 12px; }"
            spellcheck="false"
          />
        </template>
      </SettingFormField>

      <SettingFormField title="字体" description="选择字体方案。">
        <Select v-model="appearance.fontId">
          <SelectTrigger class="ml-auto w-40"><SelectValue placeholder="选择字体" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem v-for="font in store.fonts" :key="font.id" :value="font.id">
                {{ font.name }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </SettingFormField>

      <SettingFormField title="导入字体" description="填写字体名称和 CSS font-family 值。">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[1fr_1fr_auto] gap-2">
          <Input v-model="fontName" class="h-9" placeholder="名称" />
          <Input v-model="fontFamily" class="h-9" placeholder="字体族" />
          <Button variant="outline" size="icon" title="导入字体" @click="importFont">
            <Type class="size-4" />
          </Button>
        </div>
      </SettingFormField>

      <SettingFormField title="组件圆角" description="全局组件圆角曲率风格（方角、圆角、全圆角）。">
        <ToggleGroup v-model="appearance.shapeVariant" type="single" variant="outline" :spacing="1" class="ml-auto rounded-full bg-muted/55 p-1">
          <ToggleGroupItem value="square" class="h-8 rounded-full border-0 px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">方角</ToggleGroupItem>
          <ToggleGroupItem value="rounded" class="h-8 rounded-full border-0 px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">圆角</ToggleGroupItem>
          <ToggleGroupItem value="pill" class="h-8 rounded-full border-0 px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">全圆角</ToggleGroupItem>
        </ToggleGroup>
      </SettingFormField>

      <SettingFormField title="字体大小">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
          <Slider v-model="appearance.fontSize" :min="12" :max="22" :step="1" />
          <span class="text-right text-sm text-muted-foreground">{{ appearance.fontSize }}px</span>
        </div>
      </SettingFormField>

      <SettingFormField title="界面缩放">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
          <Slider v-model="appearance.uiScale" :min="80" :max="140" :step="5" />
          <span class="text-right text-sm text-muted-foreground">{{ appearance.uiScale }}%</span>
        </div>
      </SettingFormField>

      <SettingFormField title="编辑器段落字号" description="Milkdown 编辑器与消息渲染段落 (.milkdown .ProseMirror p) 的字体大小。">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
          <Slider v-model="appearance.editorFontSize" :min="10" :max="40" :step="1" />
          <div class="flex items-center gap-1">
            <Input
              v-model.number="appearance.editorFontSize"
              type="number"
              min="10"
              max="40"
              class="h-8 w-14 px-1.5 text-center text-xs font-mono"
            />
            <span class="text-xs text-muted-foreground">px</span>
          </div>
        </div>
      </SettingFormField>

      <SettingFormField title="编辑器段落行高" description="Milkdown 编辑器与消息渲染段落 (.milkdown .ProseMirror p) 的行高。">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
          <Slider v-model="appearance.editorLineHeight" :min="10" :max="60" :step="1" />
          <div class="flex items-center gap-1">
            <Input
              v-model.number="appearance.editorLineHeight"
              type="number"
              min="10"
              max="60"
              class="h-8 w-14 px-1.5 text-center text-xs font-mono"
            />
            <span class="text-xs text-muted-foreground">px</span>
          </div>
        </div>
      </SettingFormField>

      <SettingFormField
        title="交互式代码预览"
        description="将消息中包含 HTML 或脚本的代码块放入隔离页面运行。最新消息会优先显示预览，仍可随时切回源码。"
      >
        <Switch
          v-model="appearance.interactiveCodePreview"
          aria-label="启用交互式代码预览"
        />
      </SettingFormField>

      <SettingFormField
        title="Agent 加载动画"
        description="Agent 正在思考或调用工具时，过程栏使用的像素加载样式。"
      >
        <Select v-model="appearance.agentLoadingStyle">
          <SelectTrigger class="ml-auto w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="drive">Drive</SelectItem>
            <SelectItem value="dots">Dots</SelectItem>
            <SelectItem value="orbit">Orbit</SelectItem>
          </SelectContent>
        </Select>
      </SettingFormField>

      <SettingFormField
        title="Zen 包裹边框"
        description="为应用整体包裹一层沉浸式边框。关闭后应用视图无缝充满窗口。"
      >
        <Switch
          v-model="appearance.zenFrameEnabled"
          aria-label="启用 Zen 包裹边框"
        />
      </SettingFormField>

      <SettingFormField
        v-if="appearance.zenFrameEnabled"
        title="Zen 边框宽度"
        description="调整应用内容与窗口边缘之间的包裹宽度。"
      >
        <div class="ml-auto flex w-52 items-center gap-3">
          <Slider v-model="appearance.zenFrameWidth" :min="0" :max="24" :step="1" />
          <span class="w-10 text-right text-xs tabular-nums text-muted-foreground">{{ appearance.zenFrameWidth }} px</span>
        </div>
      </SettingFormField>

      <SettingFormField
        v-if="appearance.zenFrameEnabled"
        title="Zen 边框颜色"
        description="应用整体包裹边框与顶栏基础底色。默认基于颜色主题自动推断，也可自定义指定。"
      >
        <div class="ml-auto flex items-center gap-2">
          <Select v-model="appearance.frameColorMode">
            <SelectTrigger class="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动推断</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
          <ColorPickerPopover
            v-if="appearance.frameColorMode === 'custom'"
            :value="appearance.frameCustomColor"
            size="compact"
            trigger-label="边框颜色"
            :swatches="['#1e1e24', '#0f172a', '#18181b', '#27272a', '#3f3f46', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']"
            @update:value="(val) => appearance.frameCustomColor = val"
          />
        </div>
      </SettingFormField>
      </SettingForm>
    </section>

    <Dialog v-model:open="themeImportOpen">
      <DialogContent class="flex h-[min(52rem,88vh)] max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl mobile:h-[100dvh] mobile:max-h-none mobile:w-screen mobile:rounded-none mobile:border-0">
        <DialogHeader class="shrink-0 border-b px-5 pb-4 pt-5 mobile:pr-14">
          <DialogTitle>导入 CSS 主题</DialogTitle>
          <DialogDescription>
            读取 CSS 文件或直接粘贴内容。确认前可以检查和修改源码。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea class="min-h-0 flex-1">
          <div class="grid gap-3 px-5 py-4">
            <div class="flex min-w-0 items-center gap-2">
              <Button variant="outline" @click="themeFileInput?.click()">
                <FileCode2 class="size-4" />
                读取 CSS 文件
              </Button>
              <span class="min-w-0 truncate text-xs leading-5 text-muted-foreground">
                {{ themeFileName || "也可以直接在下方粘贴 CSS" }}
              </span>
              <input
                ref="themeFileInput"
                type="file"
                accept=".css,text/css"
                class="hidden"
                @change="readThemeCss"
              />
            </div>
            <Textarea
              v-model="themeCss"
              class="min-h-[32rem] resize-y font-mono text-xs leading-5 mobile:min-h-[65dvh]"
              placeholder="粘贴主题 CSS，或点击上方按钮读取文件……"
              spellcheck="false"
            />
          </div>
        </ScrollArea>

        <DialogFooter class="shrink-0 border-t bg-background px-5 py-4">
          <Button variant="outline" @click="themeImportOpen = false">取消</Button>
          <Button :disabled="!themeCss.trim()" @click="importTheme">导入并应用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SettingPage>
</template>


src/features/Environment/pages/favorite/ConversationFavoriteSettingsPage.vue

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Button } from "@/components/fluid";
import type {
	ChatContainer,
	ChatMessage,
} from "@/features/Conversation/dataflow/types";
import { useSyncStore } from "@/features/Database/dbsync-store";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import { ArrowUpRight, Star, Trash2 } from "@/lib/phosphor-icons";

interface FavoriteMessageEntry {
	container: ChatContainer;
	message: ChatMessage;
	messageIndex: number;
}

const dbsync = useSyncStore();
const layout = useEnvironmentStore();
const deletingId = ref("");
const navigatingId = ref("");

const favoriteMessages = computed<FavoriteMessageEntry[]>(() => {
	const result: FavoriteMessageEntry[] = [];
	for (const containerSet of dbsync.containers.values()) {
		for (const container of containerSet) {
			container.content.forEach((message, index) => {
				if (message.favorite) {
					result.push({
						container,
						message,
						messageIndex: index,
					});
				}
			});
		}
	}

	return result.sort((a, b) => {
		const aTime = a.message.createdAt
			? new Date(a.message.createdAt).getTime()
			: 0;
		const bTime = b.message.createdAt
			? new Date(b.message.createdAt).getTime()
			: 0;
		return bTime - aTime;
	});
});

onMounted(async () => {
	await dbsync.init();
});

function formatTime(createdAt?: string) {
	if (!createdAt) {
		return "";
	}
	return new Date(createdAt).toLocaleString("zh-CN", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function roleLabel(role: ChatContainer["role"]) {
	switch (role) {
		case "user":
			return "用户";
		case "assistant":
			return "助手";
		case "system":
			return "系统";
	}
}

async function removeFavorite(entry: FavoriteMessageEntry) {
	deletingId.value = entry.message.id;
	try {
		entry.message.favorite = false;
		dbsync.markDirty({ type: "container", id: entry.container.id });
	} finally {
		deletingId.value = "";
	}
}

async function openFavorite(entry: FavoriteMessageEntry) {
	if (navigatingId.value) {
		return;
	}

	navigatingId.value = entry.message.id;
	try {
		entry.container.activeMessage = entry.messageIndex;
		dbsync.markDirty({ type: "container", id: entry.container.id });
		layout.settingsOpen = false;
	} finally {
		navigatingId.value = "";
	}
}
</script>

<template>
  <SettingPage
    title="消息收藏"
    description="查看在对话中收藏的消息并快速定位。"
  >
    <div v-if="favoriteMessages.length === 0" class="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Star class="size-10 stroke-1 opacity-30" />
      <p class="mt-3 text-sm">暂无收藏的消息</p>
      <p class="mt-1 text-xs opacity-60">在对话中点击消息菜单可以添加收藏</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="entry in favoriteMessages"
        :key="entry.message.id"
        class="group relative rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              class="rounded px-1.5 py-0.5 font-medium"
              :class="entry.container.role === 'user' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
            >
              {{ roleLabel(entry.container.role) }}
            </span>
            <span>{{ formatTime(entry.message.createdAt) }}</span>
          </div>

          <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs"
              :disabled="navigatingId === entry.message.id"
              @click="openFavorite(entry)"
            >
              <ArrowUpRight class="mr-1 size-3" />
              前往
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs text-destructive hover:text-destructive"
              :disabled="deletingId === entry.message.id"
              @click="removeFavorite(entry)"
            >
              <Trash2 class="size-3" />
            </Button>
          </div>
        </div>

        <p class="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {{ entry.message.content }}
        </p>
      </div>
    </div>
  </SettingPage>
</template>


src/features/Environment/pages/general/GeneralSettingsPage.vue

<script setup lang="ts">
import { ref } from "vue";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@/components/fluid";
import type { WindowCloseBehavior } from "@/features/Environment/defaults";
import { useEnvironmentStore } from "@/features/Environment/store";
import SettingGroup from "../../setting/SettingGroup.vue";
import SettingItem from "../../setting/SettingItem.vue";
import SettingPage from "../../setting/SettingPage.vue";

const compactMode = ref(false);
const enableAnimations = ref(true);
const store = useEnvironmentStore();
const appearance = store.appearance;

function setCloseBehavior(value: unknown) {
	if (value === "ask" || value === "exit" || value === "tray") {
		store.setCloseBehavior(value satisfies WindowCloseBehavior);
	}
}
</script>

<template>
  <SettingPage title="通用设置" description="管理 Pulsar 的基础界面行为。">
    <SettingGroup title="界面">
      <SettingItem title="紧凑模式" description="降低侧栏和列表密度，适合更小窗口。">
        <Switch v-model="compactMode" />
      </SettingItem>
      <SettingItem title="启用动画" description="侧栏、弹窗和交互反馈默认保留平滑过渡。">
        <Switch v-model="enableAnimations" />
      </SettingItem>
      <SettingItem
        title="Enter 发送消息"
        description="开启时 Enter 发送、Shift+Enter 换行；关闭后交换两者的行为。"
      >
        <Switch v-model="appearance.composerSendWithEnter" />
      </SettingItem>
    </SettingGroup>

    <SettingGroup title="启动与关闭">
      <SettingItem
        title="关闭主窗口时"
        description="决定点击关闭按钮后是询问、直接退出，还是继续在系统托盘运行。"
      >
        <Select
          :model-value="store.closeBehavior"
          @update:model-value="setCloseBehavior"
        >
          <SelectTrigger class="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ask">每次询问</SelectItem>
            <SelectItem value="exit">直接退出</SelectItem>
            <SelectItem value="tray">最小化到托盘</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>


src/features/Environment/pages/general/RuntimeSettingsPage.vue

<script setup lang="ts">
import { push } from "notivue";
import { computed, onMounted, ref } from "vue";
import { Button, Switch } from "@/components/fluid";
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import { isAndroidPlatform } from "@/features/Environment/utils/platform";
import { host } from "@/host";

interface AndroidBatteryOptimizationStatus {
	available: boolean;
	isOptimized: boolean;
	isIgnoringOptimizations: boolean;
}

const environment = useEnvironmentStore();
const runtime = environment.runtime;
const batteryStatus = ref<AndroidBatteryOptimizationStatus | null>(null);
const checkingBattery = ref(false);
const android = computed(() => isAndroidPlatform());

async function getAndroidBatteryOptimizationStatus(): Promise<AndroidBatteryOptimizationStatus> {
	if (!host.mobile) {
		return {
			available: false,
			isOptimized: false,
			isIgnoringOptimizations: false,
		};
	}
	return host.mobile.battery.getStatus();
}

async function requestAndroidBatteryOptimizationExemption() {
	await host.mobile?.battery.requestExemption();
}

async function openAndroidBatteryOptimizationSettings() {
	await host.mobile?.battery.openSettings();
}

async function ensureNotificationPermission() {
	const granted = await host.notifications.isPermissionGranted();
	if (granted) return true;
	return (await host.notifications.requestPermission()) === "granted";
}

onMounted(() => {
	void refreshBatteryStatus();
});

async function refreshBatteryStatus() {
	if (!android.value) return;
	checkingBattery.value = true;
	try {
		batteryStatus.value = await getAndroidBatteryOptimizationStatus();
	} finally {
		checkingBattery.value = false;
	}
}

async function requestBatteryExemption() {
	await requestAndroidBatteryOptimizationExemption();
	await refreshBatteryStatus();
}

async function requestNotificationPermission() {
	push.success(
		(await ensureNotificationPermission())
			? "通知权限已可用"
			: "通知权限未授予",
	);
}
</script>

<template>
  <SettingPage title="运行时" description="管理通知、声音和移动端后台运行能力。">
    <SettingGroup title="回复完成">
      <SettingItem title="播放声音" description="回复完成后播放一声简短提示音。">
        <Switch v-model="runtime.playSoundOnReplyComplete" />
      </SettingItem>
      <SettingItem title="发送通知" description="回复完成后发送系统通知。">
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="requestNotificationPermission">授权</Button>
          <Switch v-model="runtime.notifyOnReplyComplete" />
        </div>
      </SettingItem>
      <SettingItem title="仅在后台触发" description="应用不在前台时才播放声音或发送通知。">
        <Switch v-model="runtime.replyCompletionOnlyWhenBackground" />
      </SettingItem>
    </SettingGroup>

    <SettingGroup v-if="android" title="Android 电源控制">
      <SettingItem
        title="电池优化状态"
        :description="batteryStatus?.isOptimized ? '当前可能受到 Doze 和电池优化限制。' : '当前未检测到电池优化限制。'"
      >
        <Button variant="outline" size="sm" :disabled="checkingBattery" @click="refreshBatteryStatus">
          检查
        </Button>
      </SettingItem>
      <SettingItem title="请求后台无限制" description="打开系统弹窗，请求允许 Pulsar 不受电池优化限制。">
        <Button size="sm" @click="requestBatteryExemption">请求允许</Button>
      </SettingItem>
      <SettingItem title="系统电池设置" description="打开 Android 系统电池优化设置页，手动调整应用权限。">
        <Button variant="outline" size="sm" @click="openAndroidBatteryOptimizationSettings">打开设置</Button>
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>


src/features/Environment/pages/hotkey/HotkeyRecorder.vue

<script setup lang="ts">
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { RotateCcw, X } from "@/lib/phosphor-icons";

defineProps<{
	modelValue: string;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
	reset: [];
	clear: [];
}>();

function record(event: KeyboardEvent) {
	event.preventDefault();
	event.stopPropagation();
	const hotkey = [
		event.ctrlKey && "Ctrl",
		event.altKey && "Alt",
		event.shiftKey && "Shift",
		event.metaKey && "Meta",
		!["Control", "Alt", "Shift", "Meta"].includes(event.key) &&
			(event.key.length === 1 ? event.key.toUpperCase() : event.key),
	]
		.filter(Boolean)
		.join("+");
	if (hotkey) {
		emit("update:modelValue", hotkey);
	}
}
</script>

<template>
  <div class="flex w-full items-center justify-end gap-2">
    <Input
      class="h-9 min-w-0 flex-1 text-right font-mono"
      :model-value="modelValue"
      placeholder="点击后按下快捷键"
      readonly
      @keydown="record"
    />
    <Button size="icon" variant="ghost" title="重置" @click="$emit('reset')">
      <RotateCcw class="size-4" />
    </Button>
    <Button size="icon" variant="ghost" title="清除" @click="$emit('clear')">
      <X class="size-4" />
    </Button>
  </div>
</template>


src/features/Environment/pages/hotkey/HotkeySettingsPage.vue

<script setup lang="ts">
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { environmentHotkeyLabels, getDefaultHotkeys } from "../../defaults";
import { useEnvironmentStore } from "../../store";
import HotkeyRecorder from "./HotkeyRecorder.vue";

const environment = useEnvironmentStore();
const defaults = getDefaultHotkeys();
</script>

<template>
  <SettingPage title="快捷键" description="为固定的应用动作绑定快捷键。">
    <SettingGroup title="应用动作">
      <SettingItem v-for="(meta, key) in environmentHotkeyLabels" :key="key" :title="meta.title" :description="meta.description">
        <HotkeyRecorder
          :model-value="environment.hotkeys[key]"
          @update:model-value="environment.hotkeys[key] = $event"
          @reset="environment.hotkeys[key] = defaults[key]"
          @clear="environment.hotkeys[key] = ''"
        />
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>


src/features/Environment/pages/index.ts

import { markRaw } from "vue";
import DefaultSettingsPage from "@/features/Request/components/DefaultSettingsPage.vue";
import RequestSettingsPage from "@/features/Request/components/RequestSettingsPage.vue";
import {
	ArchiveRestore,
	Brain,
	ChartNoAxesCombined,
	CreditCard,
	Globe,
	Info,
	Keyboard,
	Languages,
	Palette,
	Settings,
	Star,
} from "@/lib/phosphor-icons";
import type { EnvironmentSettingPage } from "../defaults";
import BackupSettingsPage from "../backup/BackupSettingsPage.vue";
import AboutSettingsPage from "./about/AboutSettingsPage.vue";
import AppearanceSettingsPage from "./appearance/AppearanceSettingsPage.vue";
import ConversationFavoriteSettingsPage from "./favorite/ConversationFavoriteSettingsPage.vue";
import GeneralSettingsPage from "./general/GeneralSettingsPage.vue";
import RuntimeSettingsPage from "./general/RuntimeSettingsPage.vue";
import HotkeySettingsPage from "./hotkey/HotkeySettingsPage.vue";
import StatisticSettingsPage from "./statistic/StatisticSettingsPage.vue";
import SubscriptionSettingsPage from "./subscription/SubscriptionSettingsPage.vue";
import TranslateSettingsPage from "./translate/TranslateSettingsPage.vue";
import WebSearchSettingsPage from "./web-search/WebSearchSettingsPage.vue";

export function createBuiltInSettingPages(): EnvironmentSettingPage[] {
	return [
		{
			meta: { id: "general", icon: markRaw(Settings), title: "通用" },
			tabs: [
				{
					id: "application",
					title: "应用",
					component: markRaw(GeneralSettingsPage),
				},
				{
					id: "defaults",
					title: "默认项",
					component: markRaw(DefaultSettingsPage),
				},
				{
					id: "runtime",
					title: "运行时",
					component: markRaw(RuntimeSettingsPage),
				},
			],
		},
		{
			meta: { id: "appearance.theme", icon: markRaw(Palette), title: "主题" },
			component: markRaw(AppearanceSettingsPage),
		},
		{
			meta: {
				id: "data.backup",
				icon: markRaw(ArchiveRestore),
				title: "版本管理",
			},
			component: markRaw(BackupSettingsPage),
		},
		{
			meta: { id: "provider.models", icon: markRaw(Brain), title: "模型" },
			component: markRaw(RequestSettingsPage),
		},
		{
			meta: { id: "tools.hotkey", icon: markRaw(Keyboard), title: "快捷键" },
			component: markRaw(HotkeySettingsPage),
		},
		{
			meta: {
				id: "provider.web-search",
				icon: markRaw(Globe),
				title: "网络搜索",
			},
			component: markRaw(WebSearchSettingsPage),
		},
		{
			meta: { id: "tools.translate", icon: markRaw(Languages), title: "翻译" },
			component: markRaw(TranslateSettingsPage),
		},
		{
			meta: {
				id: "data.statistic",
				icon: markRaw(ChartNoAxesCombined),
				title: "数据统计",
			},
			component: markRaw(StatisticSettingsPage),
		},
		{
			meta: {
				id: "conversation.favorites",
				icon: markRaw(Star),
				title: "消息收藏",
			},
			component: markRaw(ConversationFavoriteSettingsPage),
		},
		{
			meta: {
				id: "account.subscription",
				icon: markRaw(CreditCard),
				title: "订阅方案",
			},
			component: markRaw(SubscriptionSettingsPage),
		},
		{
			meta: { id: "about.app", icon: markRaw(Info), title: "关于" },
			component: markRaw(AboutSettingsPage),
		},
	];
}

export const builtInSettingPages: EnvironmentSettingPage[] =
	createBuiltInSettingPages();



src/features/Environment/pages/statistic/StatisticSettingsPage.vue

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { Button } from "@/components/fluid";
import type {
	ChatContainer as ChatMessageContainer,
	ChatMeta as Conversation,
} from "@/features/Conversation/dataflow/types";
import { selectAll } from "@/features/Database/database-service";
import { useSyncStore } from "@/features/Database/dbsync-store";
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";

interface StatisticEvent {
	id: string;
	type: "app.launch" | "message.user" | "message.assistant";
	createdAt: string;
}

interface HeatmapDay {
	date: string;
	count: number;
}

const diskMode = ref<"type" | "package">("type");
const events = ref<StatisticEvent[]>([]);
const loaded = ref(false);
const sync = useSyncStore();
const allChats = shallowRef<Conversation[]>([]);
const allContainers = shallowRef<ChatMessageContainer[]>([]);

const localPlugins = computed(() => [...sync.characters]);
const packageCount = computed(() => localPlugins.value.length);
const conversationCount = computed(() => allChats.value.length);
const messageCount = computed(() =>
	allContainers.value.reduce(
		(total, container) => total + container.content.length,
		0,
	),
);

function createYearHeatmap(
	eventList: StatisticEvent[],
	today = new Date(),
): HeatmapDay[] {
	const start = new Date(today);
	start.setDate(start.getDate() - 364);
	start.setHours(0, 0, 0, 0);

	const counts = new Map<string, number>();
	for (const event of eventList) {
		const key = event.createdAt.slice(0, 10);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return Array.from({ length: 365 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const key = date.toISOString().slice(0, 10);
		return { date: key, count: counts.get(key) ?? 0 };
	});
}

const heatmap = computed(() => createYearHeatmap(events.value));
const maxHeat = computed(() =>
	Math.max(1, ...heatmap.value.map((day) => day.count)),
);

function byteSize(value: unknown) {
	return new Blob([JSON.stringify(value)]).size;
}

const sizeByType = computed(() => {
	const conversationsBytes = byteSize(allChats.value);
	const containersBytes = byteSize(allContainers.value);
	const packagesBytes = byteSize(localPlugins.value);
	return [
		{
			id: "packages",
			label: "角色包",
			bytes: packagesBytes,
			color: "var(--chart-1)",
		},
		{
			id: "conversations",
			label: "对话",
			bytes: conversationsBytes,
			color: "var(--chart-2)",
		},
		{
			id: "messages",
			label: "消息",
			bytes: containersBytes,
			color: "var(--chart-3)",
		},
	];
});

const sizeByPackage = computed(() =>
	localPlugins.value.map((item, index) => {
		const pkgConversations = allChats.value.filter(
			(conversationItem) => conversationItem.localPluginId === item.id,
		);
		const conversationIds = new Set(
			pkgConversations.map((conversationItem) => conversationItem.id),
		);
		const pkgContainers = allContainers.value.filter((container) =>
			conversationIds.has(container.conversationid),
		);
		return {
			id: item.id,
			label: item.name,
			bytes:
				byteSize(item) + byteSize(pkgConversations) + byteSize(pkgContainers),
			color: `hsl(${(index * 67) % 360} 70% 55%)`,
		};
	}),
);

const sizeSegments = computed(() =>
	diskMode.value === "type" ? sizeByType.value : sizeByPackage.value,
);
const totalSize = computed(() =>
	Math.max(
		1,
		sizeSegments.value.reduce((total, segment) => total + segment.bytes, 0),
	),
);

async function initialize() {
	if (loaded.value) return;
	events.value = (await selectAll<StatisticEvent>("statistic_events")).map(
		(item) => item.value,
	);
	await sync.init();
	allChats.value = (await selectAll<Conversation>("conversations")).map(
		(item) => item.value,
	);
	allContainers.value = (
		await selectAll<ChatMessageContainer>("message_containers")
	).map((item) => item.value);
	loaded.value = true;
}

onMounted(async () => {
	await initialize();
});

function heatClass(count: number) {
	const level = Math.ceil((count / maxHeat.value) * 4);
	return (
		[
			"bg-muted",
			"bg-emerald-950",
			"bg-emerald-800",
			"bg-emerald-600",
			"bg-emerald-400",
		][level] ?? "bg-muted"
	);
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <SettingPage title="数据统计" description="查看本地数据规模和最近一年的活动情况。">
    <section class="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-3 mobile:gap-2">
      <div class="min-w-0 rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">角色数</p>
        <p class="mt-2 text-2xl font-semibold">{{ packageCount }}</p>
      </div>
      <div class="min-w-0 rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">对话数</p>
        <p class="mt-2 text-2xl font-semibold">{{ conversationCount }}</p>
      </div>

      <div class="min-w-0 rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">消息数</p>
        <p class="mt-2 text-2xl font-semibold">{{ messageCount }}</p>
      </div>
    </section>

    <SettingGroup title="过去一年热力图">
      <div class="min-w-0 max-w-full px-4 py-4">
        <div class="grid max-w-full grid-flow-col grid-rows-7 justify-start gap-1 overflow-x-auto pb-1">
          <span
            v-for="day in heatmap"
            :key="day.date"
            class="size-3 rounded-sm"
            :class="heatClass(day.count)"
            :title="`${day.date}: ${day.count}`"
          />
        </div>
      </div>
    </SettingGroup>

    <SettingGroup title="磁盘管理">
      <SettingItem title="分析维度" description="切换类型占比或角色包占比。">
        <div class="flex gap-1 rounded-md bg-muted p-1">
          <Button size="sm" :variant="diskMode === 'type' ? 'secondary' : 'ghost'" @click="diskMode = 'type'">资源</Button>
          <Button size="sm" :variant="diskMode === 'package' ? 'secondary' : 'ghost'" @click="diskMode = 'package'">角色</Button>
        </div>
      </SettingItem>
      <div class="min-w-0 max-w-full px-4 py-4">
        <div class="flex h-4 overflow-hidden rounded-full bg-muted">
          <div
            v-for="segment in sizeSegments"
            :key="segment.id"
            class="h-full"
            :style="{ width: `${Math.max(2, (segment.bytes / totalSize) * 100)}%`, backgroundColor: segment.color }"
          />
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2 mobile:grid-cols-1">
          <div
            v-for="segment in sizeSegments"
            :key="segment.id"
            class="flex items-center justify-between rounded-md border p-3"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: segment.color }" />
              <span class="truncate text-sm font-medium">{{ segment.label }}</span>
            </div>
            <span class="shrink-0 text-sm text-muted-foreground">{{ formatSize(segment.bytes) }}</span>
          </div>
        </div>
      </div>
    </SettingGroup>
  </SettingPage>
</template>


src/features/Environment/pages/subscription/SubscriptionSettingsPage.vue

<script setup lang="ts">
import { ref } from "vue";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/fluid";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { host } from "@/host";
import { Check, ExternalLink, Sparkles } from "@/lib/phosphor-icons";

const SUBSCRIPTION_URL = "https://www.youtube.com/watch?v=hvL1339luv0";

const plans = [
	{
		id: "starter",
		name: "启航版",
		description: "适合希望稳定使用核心功能的个人用户。",
		price: "¥18",
		featured: false,
		features: [
			"每月 1,000 次智能对话",
			"跨设备同步基础配置",
			"7 天会话历史版本",
			"社区支持",
		],
		buttonLabel: "选择启航版",
	},
	{
		id: "pro",
		name: "星轨版",
		description: "为高频创作、研究和日常工作提供更充裕的空间。",
		price: "¥48",
		featured: true,
		features: [
			"每月 5,000 次智能对话",
			"更高并发与优先响应",
			"完整会话历史版本",
			"高级插件与自动化",
			"优先邮件支持",
		],
		buttonLabel: "升级至星轨版",
	},
	{
		id: "studio",
		name: "远星版",
		description: "面向多人协作与需要集中管理资源的小型团队。",
		price: "¥98",
		featured: false,
		features: [
			"每月 15,000 次智能对话",
			"最多 5 位协作者",
			"共享角色、预设与知识资源",
			"团队用量与权限管理",
			"专属技术支持",
		],
		buttonLabel: "选择远星版",
	},
] as const;

const openingPlanId = ref<string | null>(null);

async function openSubscription(planId: string) {
	openingPlanId.value = planId;
	try {
		await host.external.open(SUBSCRIPTION_URL);
	} finally {
		openingPlanId.value = null;
	}
}
</script>

<template>
  <SettingPage
    title="订阅方案"
    description="选择与你的使用方式相匹配的方案，随时可以更改或取消。"
  >
    <div class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
      <Card
        v-for="plan in plans"
        :key="plan.id"
        class="relative flex min-w-0 flex-col overflow-hidden"
        :class="plan.featured && 'border-primary shadow-sm ring-1 ring-primary/20'"
      >
        <div v-if="plan.featured" class="h-1 bg-primary" />
        <CardHeader class="gap-4">
          <div class="flex min-h-6 items-center justify-between gap-3">
            <CardTitle class="text-lg">{{ plan.name }}</CardTitle>
            <Badge v-if="plan.featured" class="shrink-0 gap-1">
              <Sparkles class="size-3" />
              最受欢迎
            </Badge>
          </div>
          <CardDescription class="min-h-10 leading-5">
            {{ plan.description }}
          </CardDescription>
          <div class="flex items-end gap-1">
            <span class="text-3xl font-semibold tracking-tight">{{ plan.price }}</span>
            <span class="pb-1 text-sm text-muted-foreground">/ 月</span>
          </div>
        </CardHeader>

        <CardContent class="flex-1">
          <ul class="space-y-3 text-sm">
            <li
              v-for="feature in plan.features"
              :key="feature"
              class="flex items-start gap-2.5"
            >
              <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check class="size-3.5" />
              </span>
              <span class="leading-5">{{ feature }}</span>
            </li>
          </ul>
        </CardContent>

        <CardFooter>
          <Button
            class="h-10 w-full"
            :variant="plan.featured ? 'default' : 'outline'"
            :disabled="openingPlanId !== null"
            @click="openSubscription(plan.id)"
          >
            {{ openingPlanId === plan.id ? "正在前往订阅…" : plan.buttonLabel }}
            <ExternalLink v-if="openingPlanId !== plan.id" class="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>

    <p class="text-center text-xs leading-5 text-muted-foreground">
      所有方案均按月计费并自动续订。价格已包含适用税费，取消后权益保留至当前周期结束。
    </p>
  </SettingPage>
</template>


src/features/Environment/pages/translate/TranslateSettingsPage.vue

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import DefaultPicker from "@/features/Request/components/DefaultPicker.vue";
import { useRequestDefaults } from "@/features/Request/defaults";
import { ArrowLeftRight, Languages } from "@/lib/phosphor-icons";
import { translateLanguages } from "../../defaults";
import { useEnvironmentStore } from "../../store";

const defaultSource = `I wandered lonely as a cloud
That floats on high o'er vales and hills,
When all at once I saw a crowd,
A host, of golden daffodils;`;

const environment = useEnvironmentStore();
const state = environment.translateSettings;

const sourceText = ref(defaultSource);
const targetText = ref("");
const errorText = ref("");
const status = ref("");
const translating = ref(false);

onMounted(() => {
	if (!state.llmModel) {
		state.llmModel = useRequestDefaults().defaults.fastModel;
	}
});

async function testProvider() {
	try {
		await environment.translateText("hello");
		status.value = "测试通过";
	} catch (error) {
		errorText.value = error instanceof Error ? error.message : "测试失败";
		status.value = "测试失败";
	}
}

async function translateForPanel() {
	translating.value = true;
	errorText.value = "";
	status.value = "正在翻译...";
	try {
		const translated = await environment.translateText(sourceText.value);
		targetText.value = translated;
		status.value = "翻译完成";
	} catch (error) {
		const message = error instanceof Error ? error.message : "翻译失败";
		errorText.value = message;
		status.value = message;
	} finally {
		translating.value = false;
	}
}

function swapText() {
	[sourceText.value, targetText.value] = [targetText.value, sourceText.value];
}
</script>

<template>
  <SettingPage title="翻译" description="提供非 LLM 和 LLM 翻译服务，并向外暴露 Pinia 服务。">
    <SettingGroup title="翻译设置">
      <SettingItem title="源语言" description="自动检测适合多数输入。">
        <Select v-model="state.sourceLanguage">
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="language in translateLanguages" :key="language.id" :value="language.id">
              {{ language.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title="目标语言" description="翻译输出语言。">
        <Select v-model="state.targetLanguage">
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="language in translateLanguages.filter((item) => item.id !== 'auto')" :key="language.id" :value="language.id">
              {{ language.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title="非 LLM 提供商" description="Google 可直接测试，Microsoft 需要 Azure 订阅配置。">
        <div class="flex w-full gap-2 sm:w-80">
          <Select v-model="state.provider">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="microsoft">Microsoft</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" @click="testProvider">测试</Button>
        </div>
      </SettingItem>
      <SettingItem title="Azure 密钥" description="Microsoft Translator 的 Ocp-Apim-Subscription-Key。">
        <Input
          v-model="state.azureKey"
          class="w-full sm:w-80"
          type="password"
          placeholder="Azure Translator Key"
        />
      </SettingItem>
      <SettingItem title="Azure 区域" description="区域或多服务资源需要填写，例如 eastasia、eastus。">
        <Input
          v-model="state.azureRegion"
          class="w-full sm:w-80"
          placeholder="region"
        />
      </SettingItem>
      <SettingItem title="Azure 地址" description="默认使用 Microsoft Translator 全局地址。">
        <Input
          v-model="state.azureEndpoint"
          class="w-full sm:w-80"
          placeholder="https://api.cognitive.microsofttranslator.com"
        />
      </SettingItem>
      <SettingItem title="使用 LLM 进行翻译" description="开启后使用下方模型和提示词。">
        <Switch v-model="state.useLlm" />
      </SettingItem>
      <SettingItem title="LLM 提供商" description="选择翻译使用的模型。">
        <DefaultPicker v-model="state.llmModel" kind="text" allow-empty />
      </SettingItem>
      <SettingItem title="翻译提示词" description="右上角按钮可弹窗编辑。">
        <Textarea v-model="state.prompt" class="min-h-24 w-full sm:w-80" />
      </SettingItem>
    </SettingGroup>

    <section class="rounded-md border bg-card">
      <header class="flex items-center gap-2 border-b px-4 py-3">
        <Languages class="size-4 text-primary" />
        <h2 class="text-sm font-semibold">翻译测试</h2>
        <span class="ml-auto text-xs text-muted-foreground">{{ status }}</span>
      </header>
      <div class="grid min-h-[320px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] divide-x mobile:grid-cols-1 mobile:grid-rows-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] mobile:divide-x-0 mobile:divide-y">
        <Textarea
          v-model="sourceText"
          placeholder="输入原文..."
          class="min-h-[320px] resize-none rounded-none border-0 bg-transparent focus-visible:ring-0 mobile:min-h-48"
        />
        <div class="flex w-16 flex-col items-center justify-center gap-2 bg-muted/20 px-2 mobile:h-14 mobile:w-full mobile:flex-row mobile:px-3">
          <Button size="icon" :disabled="translating" title="翻译" @click="translateForPanel">
            <Languages class="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="交换原文译文" @click="swapText">
            <ArrowLeftRight class="size-4" />
          </Button>
        </div>
        <Textarea
          v-model="targetText"
          placeholder="译文..."
          :class="[
            'min-h-[320px] resize-none rounded-none border-0 bg-transparent focus-visible:ring-0 mobile:min-h-48',
            errorText && 'border-destructive text-destructive focus-visible:ring-destructive',
          ]"
        />
      </div>
      <p v-if="errorText" class="border-t px-4 py-2 text-sm text-destructive">
        {{ errorText }}
      </p>
    </section>
  </SettingPage>
</template>


src/features/Environment/pages/web-search/WebSearchSettingsPage.vue

<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { push } from "notivue";
import { computed, onMounted, ref, toRef } from "vue";
import { Button, Slider } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import SettingForm from "@/features/Environment/setting/SettingForm.vue";
import SettingFormField from "@/features/Environment/setting/SettingFormField.vue";
import ServiceProviderSettingsLayout from "@/features/Request/provider/shared/components/ServiceProviderSettingsLayout.vue";
import type { ServiceProviderView } from "@/features/Request/provider/shared/service-provider";
import { host } from "@/host";
import {
	EXA_API_KEY_SECRET,
	type WebSearchProviderId,
	type WebSearchResult,
} from "../../defaults";
import { useEnvironmentStore } from "../../store";

const secretMask = "••••••••";
const environment = useEnvironmentStore();
const settings = toRef(environment, "webSearchSettings");
const exaApiKey = ref("");
const exaHasApiKey = ref(false);
const checking = ref(false);
const testQuery = ref("PulsarAI 网络搜索连接测试");
const results = ref<WebSearchResult[]>([]);
const testError = ref("");

const hasSecret = (name: string) => host.secrets.has(name);
const setSecret = (name: string, value: string) =>
	host.secrets.set(name, value);
const clearSecretValue = (name: string) => host.secrets.clearValue(name);

function hasExaApiKey() {
	return hasSecret(EXA_API_KEY_SECRET);
}

function saveExaApiKey(value: string) {
	return value.trim()
		? setSecret(EXA_API_KEY_SECRET, value.trim())
		: clearSecretValue(EXA_API_KEY_SECRET);
}

const providers = computed<ServiceProviderView[]>(
	() =>
		[
			...(host.desktop
				? [
						{
							id: "playwright",
							name: "Playwright 浏览器",
							description:
								"本机无头 Chromium 搜索 DuckDuckGo；不需要 API Key，仅支持桌面端。",
							enabled: settings.value.playwrightEnabled,
							source: "feature",
						},
					]
				: []),
			{
				id: "exa",
				name: "Exa",
				description:
					"Exa Search API / ExaJS 兼容提供商，返回结构化网页结果并需要 API Key。",
				enabled: settings.value.exaEnabled,
				source: "feature",
			},
		] as ServiceProviderView[],
);

const activeProviderId = computed<WebSearchProviderId>(
	() => settings.value.activeProviderId,
);
const isExa = computed(() => activeProviderId.value === "exa");

const persistExaKey = useDebounceFn(async (value: string) => {
	if (value === secretMask) return;
	await saveExaApiKey(value);
	exaHasApiKey.value = Boolean(value.trim());
}, 600);

onMounted(async () => {
	exaHasApiKey.value = await hasExaApiKey();
	exaApiKey.value = exaHasApiKey.value ? secretMask : "";
});

function selectProvider(providerId: string) {
	if ((host.desktop && providerId === "playwright") || providerId === "exa") {
		settings.value.activeProviderId = providerId;
	}
}

function toggleProvider(providerId: string, enabled: boolean) {
	if (host.desktop && providerId === "playwright")
		settings.value.playwrightEnabled = enabled;
	if (providerId === "exa") settings.value.exaEnabled = enabled;
}

function updateExaKey(value: string) {
	exaApiKey.value = value;
	void persistExaKey(value);
}

async function testSearch() {
	const provider = activeProviderId.value;
	if (provider === "exa" && !exaHasApiKey.value) {
		push.warning("请先填写 Exa API Key。 ");
		return;
	}
	if (provider === "exa" && !settings.value.exaEnabled) {
		push.warning("请先启用 Exa。 ");
		return;
	}
	if (
		host.desktop &&
		provider === "playwright" &&
		!settings.value.playwrightEnabled
	) {
		push.warning("请先启用 Playwright 浏览器。 ");
		return;
	}
	checking.value = true;
	testError.value = "";
	results.value = [];
	try {
		results.value = await environment.webSearch(
			testQuery.value.trim() || "PulsarAI",
			settings.value.resultLimit,
			provider,
		);
		push.success(`搜索可用，返回 ${results.value.length} 条结果。`);
	} catch (error) {
		testError.value =
			error instanceof Error ? error.message : "搜索连接检查失败";
		push.error("搜索连接检查失败");
	} finally {
		checking.value = false;
	}
}
</script>

<template>
  <ServiceProviderSettingsLayout
    :providers="providers"
    :active-provider-id="activeProviderId"
    search=""
    @update:search="() => undefined"
    @select-provider="selectProvider"
    @toggle-provider="toggleProvider"
  >
    <SettingForm>
      <template v-if="isExa">
        <SettingFormField title="Exa API Key" description="保存在 Secret 数据表中；请求只在原生网络层注入 x-api-key，前端不会读取明文。">
          <Input
            :model-value="exaApiKey"
            type="password"
            placeholder="Exa API Key"
            @update:model-value="updateExaKey(String($event ?? ''))"
          />
        </SettingFormField>
      </template>
      <template v-else-if="host.desktop">
        <SettingFormField title="Playwright Chromium" description="使用内置 Playwright 原生运行时在隔离无头 Chromium 中检索公开搜索结果。无需浏览器驱动或 Selenium。">
          <p class="text-sm text-muted-foreground">仅提供有边界的搜索与结果摘录；不向模型暴露任意 DOM 执行或浏览器控制能力。</p>
        </SettingFormField>
      </template>

      <SettingFormField title="默认结果数" description="每次搜索返回 1 到 10 条候选结果。">
        <div class="flex w-full items-center gap-4">
          <Slider
            :model-value="[settings.resultLimit]"
            :min="1"
            :max="10"
            :step="1"
            class="flex-1"
            @update:model-value="settings.resultLimit = Array.isArray($event) ? ($event[0] ?? settings.resultLimit) : (Number($event) || settings.resultLimit)"
          />
          <span class="w-8 text-right text-sm tabular-nums">{{ settings.resultLimit }}</span>
        </div>
      </SettingFormField>

      <SettingFormField title="连接测试" description="使用当前选中的提供商执行一次真实搜索。">
        <div class="grid w-full gap-3">
          <div class="flex gap-2">
            <Input v-model="testQuery" class="min-w-0 flex-1" placeholder="测试关键词" @keydown.enter.prevent="testSearch" />
            <Button :disabled="checking" @click="testSearch">{{ checking ? "搜索中…" : "测试搜索" }}</Button>
          </div>
          <p v-if="testError" class="text-sm text-destructive">{{ testError }}</p>
          <ul v-if="results.length" class="grid gap-2 text-sm">
            <li v-for="result in results" :key="result.url" class="rounded-lg border bg-muted/20 p-3">
              <a :href="result.url" target="_blank" rel="noreferrer" class="font-medium hover:underline">{{ result.title }}</a>
              <p v-if="result.snippet" class="mt-1 line-clamp-2 text-muted-foreground">{{ result.snippet }}</p>
            </li>
          </ul>
        </div>
      </SettingFormField>
    </SettingForm>
  </ServiceProviderSettingsLayout>
</template>



src/features/Environment/responsive-store.ts

import { useMediaQuery } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
	getMobilePlatformOverride,
	isMobilePlatform,
	setMobilePlatformOverride,
} from "./utils/platform";

const mobileViewportQuery = "(max-width: 767px)";

export const useResponsiveStore = defineStore("responsive", () => {
	const narrowViewport = useMediaQuery(mobileViewportQuery);
	const platformMobile = ref(isMobilePlatform());
	const mobilePreviewEnabled = ref(getMobilePlatformOverride() === true);
	const isMobileLayout = computed(
		() => platformMobile.value || narrowViewport.value,
	);

	watch(
		isMobileLayout,
		(mobile) => {
			if (typeof document === "undefined") {
				return;
			}
			document.documentElement.classList.toggle("mobile-layout", mobile);
			document.documentElement.dataset.mobileLayout = String(mobile);
		},
		{ immediate: true },
	);

	function refreshPlatform() {
		platformMobile.value = isMobilePlatform();
	}

	function setMobilePreview(enabled: boolean) {
		setMobilePlatformOverride(enabled ? true : null);
		mobilePreviewEnabled.value = enabled;
		refreshPlatform();
	}

	return {
		narrowViewport,
		platformMobile,
		mobilePreviewEnabled,
		isMobileLayout,
		refreshPlatform,
		setMobilePreview,
	};
});


src/features/Environment/setting/SettingForm.vue

<template>
  <div class="divide-y divide-border/70">
    <slot />
  </div>
</template>


src/features/Environment/setting/SettingFormField.vue

<script setup lang="ts">
defineProps<{
	title: string;
	description?: string;
	required?: boolean;
}>();
</script>

<template>
  <div class="grid min-h-20 gap-4 py-4 sm:grid-cols-[minmax(13rem,1fr)_minmax(14rem,28rem)] sm:items-center">
    <div class="min-w-0">
      <div class="block text-sm font-medium leading-5">
        <span v-if="required" class="text-destructive">*</span>
        {{ title }}
      </div>
      <div v-if="description" class="mt-1 block max-w-2xl text-xs leading-5 text-muted-foreground">{{ description }}</div>
    </div>
    <div class="flex min-w-0 flex-col items-stretch justify-center gap-2 sm:items-end">
      <div class="flex w-full justify-end mobile:justify-start">
        <slot />
      </div>
      <div v-if="$slots.description" class="block w-full text-[13px] leading-5 text-muted-foreground sm:text-right">
        <slot name="description" />
      </div>
    </div>
    <div v-if="$slots.bottom" class="min-w-0 sm:col-span-2">
      <slot name="bottom" />
    </div>
  </div>
</template>


src/features/Environment/setting/SettingGroup.vue

<script setup lang="ts">
defineProps<{
	title?: string;
}>();
</script>

<template>
  <section>
    <header v-if="title || $slots.actions" class="mb-2 flex min-h-8 items-center justify-between gap-4">
      <div class="min-w-0">
        <h3 v-if="title" class="text-sm font-semibold leading-5 text-foreground/90">{{ title }}</h3>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>
    <div class="divide-y divide-border/70">
      <slot />
    </div>
  </section>
</template>


src/features/Environment/setting/SettingItem.vue

<script setup lang="ts">
defineProps<{
	title: string;
	description?: string;
}>();
</script>

<template>
  <div class="grid min-h-16 gap-3 py-4 sm:grid-cols-[minmax(13rem,1fr)_minmax(12rem,auto)] sm:items-center">
    <div class="min-w-0">
      <h4 class="text-sm font-medium leading-5 text-foreground/90">{{ title }}</h4>
      <p v-if="description" class="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{{ description }}</p>
      <div v-if="$slots.bottom" class="mt-2">
        <slot name="bottom" />
      </div>
    </div>
    <div v-if="$slots.default" class="flex min-w-0 items-center justify-start sm:justify-end">
      <slot />
    </div>
  </div>
</template>


src/features/Environment/setting/SettingPage.vue

<script setup lang="ts">
import { ScrollArea } from "@/components/ui/scroll-area";

defineProps<{
	title: string;
	description?: string;
}>();
</script>

<template>
  <ScrollArea class="h-full">
    <section class="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-7 pb-8 pt-2 mobile:gap-5 mobile:px-4 mobile:pb-5">
      <h2 class="sr-only">{{ title }}</h2>
      <slot />
    </section>
  </ScrollArea>
</template>


src/features/Environment/setting/SettingsDialog.vue

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watchEffect } from "vue";
import {
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	Dropdown,
	MenuItem,
	TabItem,
	Tabs,
	TabsList,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFloatingSurface } from "@/features/Environment/floating-surface";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import { useEnvironmentStore } from "@/features/Environment/store";
import { Menu, Search, X } from "@/lib/phosphor-icons";
import { cn } from "@/lib/utils";

const layout = useEnvironmentStore();
const responsive = useResponsiveStore();
const { settingsOpen } = storeToRefs(layout);
const { isMobileLayout } = storeToRefs(responsive);
const activePageId = ref("");
const activeTabId = ref("");
const sidebarOpen = ref(true);
const settingsSearch = ref("");
const dialog = ref<HTMLElement | { $el?: unknown } | null>(null);
const floating = useFloatingSurface({
	surfaceId: "settings",
	open: settingsOpen,
	element: dialog,
	initialSize: { width: 1040, height: 680 },
	minSize: { width: 620, height: 440 },
});
const floatingStyle = computed(() => floating.style.value);

const pages = computed(() => layout.settingPages);
const activePage = computed(
	() =>
		layout.settingPages.find((page) => page.meta.id === activePageId.value) ??
		pages.value[0],
);
const activeTabs = computed(() => activePage.value?.tabs ?? []);
const activeComponent = computed(() => {
	const page = activePage.value;
	if (!page) return null;
	if (!page.tabs?.length) return page.component ?? null;
	return (
		page.tabs.find((tab) => tab.id === activeTabId.value)?.component ??
		page.tabs[0]?.component ??
		null
	);
});
const filteredPages = computed(() => {
	const keyword = settingsSearch.value.trim().toLocaleLowerCase();
	return pages.value.filter(
		(page) =>
			!keyword ||
			page.meta.title.toLocaleLowerCase().includes(keyword) ||
			page.tabs?.some((tab) => tab.title.toLocaleLowerCase().includes(keyword)),
	);
});
const activePageIndex = computed(() =>
	filteredPages.value.findIndex((p) => p.meta.id === activePage.value?.meta.id),
);

watchEffect(() => {
	if (!activePageId.value && pages.value[0])
		activePageId.value = pages.value[0].meta.id;
	const tabs = activePage.value?.tabs ?? [];
	if (tabs.length && !tabs.some((tab) => tab.id === activeTabId.value)) {
		activeTabId.value = tabs[0]?.id;
	}
});

watchEffect(() => {
	if (settingsOpen.value && isMobileLayout.value) sidebarOpen.value = false;
});

function selectPage(pageId: string) {
	activePageId.value = pageId;
	const page = layout.settingPages.find((item) => item.meta.id === pageId);
	activeTabId.value = page?.tabs?.[0]?.id ?? "";
	if (isMobileLayout.value) sidebarOpen.value = false;
}
</script>

<template>
  <Dialog :open="settingsOpen" @update:open="layout.settingsOpen = $event">
    <DialogContent
      ref="dialog"
      data-settings-dialog
      custom-position
      :show-close-button="false"
      :style="floatingStyle"
      class="flex max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-popover p-0 shadow-2xl sm:max-w-none mobile:rounded-none mobile:border-0"
      @open-auto-focus.prevent
    >
      <div class="sr-only">
        <DialogTitle>设置</DialogTitle>
        <DialogDescription>管理 Pulsar 的应用设置。</DialogDescription>
      </div>

      <div class="relative grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)] overflow-hidden mobile:grid-cols-1">
        <button
          v-if="isMobileLayout && sidebarOpen"
          type="button"
          class="absolute inset-0 z-20 bg-foreground/20"
          aria-label="关闭设置导航"
          @click="sidebarOpen = false"
        />

        <aside
          :class="cn(
            'min-h-0 overflow-hidden border-r border-border/60 bg-muted/45',
            isMobileLayout && [
              'absolute inset-y-0 left-0 z-30 w-[min(19rem,88vw)] shadow-xl transition-transform',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            ],
          )"
        >
          <nav class="flex h-full min-h-0 flex-col">
            <div class="relative shrink-0 px-4 pb-3 pt-4">
              <div data-floating-drag-handle class="absolute inset-x-0 top-0 h-14 cursor-grab active:cursor-grabbing" />
              <div data-floating-drag-handle class="mb-3 flex h-7 cursor-grab items-center gap-2 px-1 active:cursor-grabbing">
                <h2 class="text-base font-semibold">设置</h2>
                <kbd class="rounded-md bg-background/65 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Ctrl+,</kbd>
              </div>
              <div class="relative">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input v-model="settingsSearch" class="h-10 rounded-xl border-0 bg-background/55 pl-9 shadow-none" placeholder="搜索" />
              </div>
            </div>

            <ScrollArea class="min-h-0 flex-1">
              <div class="px-2 pb-4">
                <Dropdown
                  v-if="filteredPages.length > 0"
                  :checked-index="activePageIndex"
                  :shadow-level="0"
                  class="w-full bg-transparent border-0 shadow-none gap-0.5"
                >
                  <MenuItem
                    v-for="(page, idx) in filteredPages"
                    :key="page.meta.id"
                    :index="idx"
                    :icon="page.meta.icon"
                    :label="page.meta.title"
                    :checked="activePage?.meta.id === page.meta.id"
                    @select="selectPage(page.meta.id)"
                  />
                </Dropdown>
                <p v-else class="px-3 py-10 text-center text-xs text-muted-foreground">没有匹配的设置</p>
              </div>
            </ScrollArea>
          </nav>
        </aside>

        <main class="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-background/30">
          <header data-floating-drag-handle class="relative shrink-0 cursor-grab px-7 pb-3 pt-5 active:cursor-grabbing mobile:pl-16 mobile:pr-4">
            <div data-floating-drag-handle class="absolute inset-x-0 top-0 h-14 cursor-grab active:cursor-grabbing" />
            <div class="flex min-h-9 items-center justify-between gap-4">
              <h1 data-floating-drag-handle class="truncate text-xl font-semibold tracking-tight cursor-grab active:cursor-grabbing">{{ activePage?.meta.title ?? "设置" }}</h1>
              <DialogClose as-child>
                <Button variant="ghost" size="icon" class="size-9 rounded-full text-muted-foreground" title="关闭设置">
                  <X />
                </Button>
              </DialogClose>
            </div>

            <Tabs
              v-if="activeTabs.length > 1"
              v-model="activeTabId"
              class="mt-4"
            >
              <TabsList>
                <TabItem
                  v-for="tab in activeTabs"
                  :key="tab.id"
                  :value="tab.id"
                  :label="tab.title"
                />
              </TabsList>
            </Tabs>
          </header>

          <Button
            v-if="isMobileLayout && !sidebarOpen"
            class="absolute left-4 top-5 z-20 size-9 rounded-full"
            size="icon"
            variant="ghost"
            title="打开设置导航"
            @click="sidebarOpen = true"
          >
            <Menu />
          </Button>

          <div class="min-h-0 flex-1 overflow-hidden">
            <component :is="activeComponent" v-if="activeComponent" :key="`${activePage?.meta.id}:${activeTabId}`" />
          </div>

          <div
            v-if="!isMobileLayout"
            data-floating-drag-handle
            class="absolute inset-x-0 bottom-0 z-10 h-4 cursor-grab active:cursor-grabbing"
            aria-hidden="true"
          />
        </main>
      </div>
    </DialogContent>
  </Dialog>
</template>


src/features/Environment/store.ts

import { useMagicKeys, useStyleTag } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { resetCharacterDataAction } from "@/features/Conversation/clear-data";
import { toggleEditModeAction } from "@/features/Conversation/dataflow/activePathComposable";
import { useRequestDefaults } from "@/features/Request/defaults";
import { host } from "@/host";
import {
	type AppearanceSettings,
	createImportedFont,
	type EnvironmentSettingPage,
	getBuiltInFonts,
	getDefaultAppearance,
	getDefaultHotkeys,
	getDefaultRuntimePreferences,
	getDefaultTranslateSettings,
	getDefaultWebSearchSettings,
	type RuntimePreferences,
	type TranslateState,
	type WebSearchProviderId,
	type WebSearchResult,
	type WebSearchSettings,
	type WindowCloseBehavior,
} from "./defaults";
import { builtInSettingPages } from "./pages";
import { builtInThemes, normalizeImportedTheme } from "./theme/theme-registry";
import { applyTheme, isCssColorDark } from "./utils/theme-dom";
import {
	translateWithLlm,
	translateWithProvider,
} from "./utils/translate-service";

/* -------------------------------------------------------------------------- */
/*                                Pinia Store                                 */
/* -------------------------------------------------------------------------- */

export const useEnvironmentStore = defineStore("environment", () => {
	/* Group 1: 外观 (Appearance) */
	const appearance = ref<AppearanceSettings>(getDefaultAppearance());
	const zenFrameIsDark = ref(true);

	const themes = computed(() => [
		...builtInThemes,
		...appearance.value.customThemes,
	]);
	const fonts = computed(() => [
		...getBuiltInFonts(),
		...appearance.value.customFonts,
	]);
	const activeTheme = computed(
		() =>
			themes.value.find((theme) => theme.id === appearance.value.themeId) ??
			builtInThemes[0],
	);
	const activeFont = computed(
		() =>
			fonts.value.find((font) => font.id === appearance.value.fontId) ??
			getBuiltInFonts()[0],
	);

	const customThemesStyle = useStyleTag("", { id: "pulsarai-custom-themes" });
	const customCssStyle = useStyleTag("", { id: "pulsarai-custom-css" });
	const appearanceVarsStyle = useStyleTag("", {
		id: "pulsarai-appearance-vars",
	});

	function importThemeCss(css: string) {
		if (!css.trim()) throw new Error("主题 CSS 不能为空。");
		const theme = normalizeImportedTheme(css);
		appearance.value.customThemes = [
			...appearance.value.customThemes.filter((item) => item.id !== theme.id),
			theme,
		];
		appearance.value.themeId = theme.id;
		return theme;
	}

	function importFont(name: string, family: string) {
		const font = createImportedFont(name, family);
		appearance.value.customFonts = [
			...appearance.value.customFonts.filter((item) => item.id !== font.id),
			font,
		];
		appearance.value.fontId = font.id;
	}

	function applyAppearance() {
		if (typeof document === "undefined") return;

		customThemesStyle.css.value = [
			...builtInThemes,
			...appearance.value.customThemes,
		]
			.map((theme) => theme.css ?? "")
			.join("\n\n");
		customCssStyle.css.value = appearance.value.customCss;

		appearanceVarsStyle.css.value = `
:root {
  --font-sans: ${activeFont.value.sans};
  --font-serif: ${activeFont.value.serif};
  --font-mono: ${activeFont.value.mono};
  font-size: ${appearance.value.fontSize}px;
  font-family: ${activeFont.value.sans};
  --editor-font-size: ${appearance.value.editorFontSize}px;
  --editor-line-height: ${appearance.value.editorLineHeight}px;
  ${
		appearance.value.frameColorMode === "custom" &&
		appearance.value.frameCustomColor
			? `--zen-frame-bg: ${appearance.value.frameCustomColor}; --zen-frame-border: ${appearance.value.frameCustomColor};`
			: ""
	}
}
body {
  zoom: ${appearance.value.uiScale / 100};
}
`;

		const topBarIsDark = applyTheme(
			activeTheme.value,
			appearance.value.themeMode,
			applyAppearance,
		);

		zenFrameIsDark.value = isCssColorDark(
			appearance.value.zenFrameEnabled
				? "var(--zen-frame-bg)"
				: "var(--background)",
			topBarIsDark,
		);
	}

	/* Group 2: 快捷键 (Hotkeys) */
	const hotkeys = ref<Record<string, string>>(getDefaultHotkeys());

	/* Group 4: 网络搜索 (WebSearch) */
	const webSearchSettings = ref<WebSearchSettings>(
		getDefaultWebSearchSettings(),
	);

	async function webSearch(
		query: string,
		limit?: number,
		provider?: WebSearchProviderId,
	): Promise<WebSearchResult[]> {
		const selectedProvider =
			provider ?? webSearchSettings.value.activeProviderId;
		if (
			selectedProvider === "playwright" &&
			!webSearchSettings.value.playwrightEnabled
		) {
			throw new Error("Playwright 浏览器搜索未启用。");
		}
		if (selectedProvider === "exa" && !webSearchSettings.value.exaEnabled) {
			throw new Error("Exa 搜索未启用。");
		}
		return host.network.webSearch<WebSearchResult[]>({
			query,
			limit: limit ?? webSearchSettings.value.resultLimit,
			provider: selectedProvider,
		});
	}

	/* Group 5: 翻译 (Translate) */
	const translateSettings = ref<TranslateState>(getDefaultTranslateSettings());

	async function translateText(text: string): Promise<string> {
		const state = translateSettings.value;
		if (!state.llmModel) {
			state.llmModel = useRequestDefaults().defaults.fastModel;
		}
		if (state.useLlm) {
			return translateWithLlm(text, state);
		}
		return translateWithProvider(text, state);
	}

	/* Group 6: 运行时 (Runtime Preferences) */
	const runtime = ref<RuntimePreferences>(getDefaultRuntimePreferences());

	/* Unified Auto-persistence Watcher */
	watch(
		[appearance, hotkeys, webSearchSettings, translateSettings, runtime],
		() => {
			void host.config.set("appearance", appearance.value);
			applyAppearance();
			void host.config.set("hotkeys", hotkeys.value);
			void host.config.set("webSearch.settings", webSearchSettings.value);
			void host.config.set("translate", translateSettings.value);
			void host.config.set("runtime", runtime.value);
		},
		{ deep: true },
	);

	/* Group 7: 窗口与设置生命周期 (Window & Lifecycle) */
	const settingsOpen = ref(false);
	const immersiveConversation = ref(false);
	const closeBehavior = ref<WindowCloseBehavior>("ask");
	const closePromptOpen = ref(false);
	const rememberCloseChoice = ref(false);

	function setCloseBehavior(value: WindowCloseBehavior) {
		closeBehavior.value = value;
		void host.config.set("windowCloseBehavior", value);
	}

	async function handleCloseRequest() {
		if (closeBehavior.value === "ask") {
			rememberCloseChoice.value = false;
			closePromptOpen.value = true;
			return;
		}
		await applyCloseChoice(closeBehavior.value);
	}

	function dismissClosePrompt() {
		closePromptOpen.value = false;
		rememberCloseChoice.value = false;
	}

	async function chooseCloseBehavior(
		choice: Exclude<WindowCloseBehavior, "ask">,
	) {
		if (rememberCloseChoice.value) setCloseBehavior(choice);
		closePromptOpen.value = false;
		rememberCloseChoice.value = false;
		await applyCloseChoice(choice);
	}

	async function applyCloseChoice(choice: Exclude<WindowCloseBehavior, "ask">) {
		if (choice === "tray") await host.desktop?.window.hide();
		else await host.desktop?.window.close();
	}

	/* Group 8: 设置页面注册表 (Setting Pages) */
	const settingPages = ref<EnvironmentSettingPage[]>(builtInSettingPages);

	function registerSettingPage(page: EnvironmentSettingPage) {
		const index = settingPages.value.findIndex(
			(item) => item.meta.id === page.meta.id,
		);
		if (index < 0) settingPages.value.push(page);
		else settingPages.value[index] = page;
	}

	/* Shared config facade */
	const config = host.config;

	/* Global initialization */
	async function initialize() {
		const [
			storedAppearance,
			storedHotkeys,
			storedWebSearch,
			storedTranslate,
			storedRuntime,
			storedCloseBehavior,
		] = await Promise.all([
			host.config.get<AppearanceSettings>("appearance"),
			host.config.get<Record<string, string>>("hotkeys"),
			host.config.get<WebSearchSettings>("webSearch.settings"),
			host.config.get<TranslateState>("translate"),
			host.config.get<RuntimePreferences>("runtime"),
			host.config.get<WindowCloseBehavior>("windowCloseBehavior"),
		]);

		if (storedAppearance) Object.assign(appearance.value, storedAppearance);
		if (storedHotkeys) Object.assign(hotkeys.value, storedHotkeys);
		if (storedWebSearch)
			Object.assign(webSearchSettings.value, storedWebSearch);
		if (storedTranslate)
			Object.assign(translateSettings.value, storedTranslate);
		if (storedRuntime) Object.assign(runtime.value, storedRuntime);
		if (storedCloseBehavior) closeBehavior.value = storedCloseBehavior;
		await useRequestDefaults().initialize();

		applyAppearance();
	}

	return {
		/* State Groups */
		appearance,
		hotkeys,
		webSearchSettings,
		translateSettings,
		runtime,

		/* Appearance computed & actions */
		activeFont,
		activeTheme,
		fonts,
		themes,
		zenFrameIsDark,
		importFont,
		importThemeCss,
		applyAppearance,

		/* WebSearch actions */
		webSearch,

		/* Translate actions */
		translateText,

		/* Window & dialog state & actions */
		settingsOpen,
		immersiveConversation,
		closeBehavior,
		closePromptOpen,
		rememberCloseChoice,
		settingPages,
		registerSettingPage,
		setCloseBehavior,
		handleCloseRequest,
		dismissClosePrompt,
		chooseCloseBehavior,

		/* Shared config facade */
		config,
		initialize,
	};
});

/* -------------------------------------------------------------------------- */
/*                           Composable & Functions                           */
/* -------------------------------------------------------------------------- */

export function useEnvironmentHotkeys() {
	const environment = useEnvironmentStore();
	const keys = useMagicKeys({ passive: false });
	watchEffect((onCleanup) => {
		const bindings = [
			[environment.hotkeys.settings, () => (environment.settingsOpen = true)],
			[environment.hotkeys.toggleEditMode, toggleEditModeAction],
			[environment.hotkeys.resetCharacterData, resetCharacterDataAction],
		] as const;
		const stops = bindings.map(([hotkey, run]) =>
			watch(
				() => (hotkey ? keys[hotkey]?.value : false),
				(pressed) => {
					if (pressed) void run();
				},
			),
		);
		onCleanup(() => {
			stops.forEach((stop) => {
				stop();
			});
		});
	});
}


src/features/Environment/test/backup-store.test.ts

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useBackupStore } from "../backup/backup-store";

describe("backup settings", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		localStorage.clear();
	});

	it("persists local backup settings", () => {
		const store = useBackupStore();
		store.updateLocal({ directory: "C:/backup", maxBackups: "20" });
		expect(store.local).toMatchObject({
			directory: "C:/backup",
			maxBackups: "20",
		});
	});
});



src/features/Environment/theme/builtInTheme/amber-minimal.css

.theme-amberminimal {
	--background: oklch(1 0 0);
	--foreground: oklch(0.2686 0 0);
	--card: oklch(1 0 0);
	--card-foreground: oklch(0.2686 0 0);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.2686 0 0);
	--primary: oklch(0.7686 0.1647 70.0804);
	--primary-foreground: oklch(0 0 0);
	--secondary: oklch(0.967 0.0029 264.5419);
	--secondary-foreground: oklch(0.4461 0.0263 256.8018);
	--muted: oklch(0.9846 0.0017 247.8389);
	--muted-foreground: oklch(0.551 0.0234 264.3637);
	--accent: oklch(0.9869 0.0214 95.2774);
	--accent-foreground: oklch(0.4732 0.1247 46.2007);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.9276 0.0058 264.5313);
	--input: oklch(0.9276 0.0058 264.5313);
	--ring: oklch(0.7686 0.1647 70.0804);
	--chart-1: oklch(0.7686 0.1647 70.0804);
	--chart-2: oklch(0.6658 0.1574 58.3183);
	--chart-3: oklch(0.5553 0.1455 48.9975);
	--chart-4: oklch(0.4732 0.1247 46.2007);
	--chart-5: oklch(0.4137 0.1054 45.9038);
	--sidebar: oklch(0.9846 0.0017 247.8389);
	--sidebar-foreground: oklch(0.2686 0 0);
	--sidebar-primary: oklch(0.7686 0.1647 70.0804);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.9869 0.0214 95.2774);
	--sidebar-accent-foreground: oklch(0.4732 0.1247 46.2007);
	--sidebar-border: oklch(0.9276 0.0058 264.5313);
	--sidebar-ring: oklch(0.7686 0.1647 70.0804);
	--font-sans: Inter, sans-serif;
	--font-serif: Source Serif 4, serif;
	--font-mono: JetBrains Mono, monospace;
	--radius: 0.375rem;
	--shadow-x: 0px;
	--shadow-y: 4px;
	--shadow-blur: 8px;
	--shadow-spread: -1px;
	--shadow-opacity: 0.1;
	--shadow-color: hsl(0 0% 0%);
	--shadow-2xs: 0px 4px 8px -1px hsl(0 0% 0% / 0.05);
	--shadow-xs: 0px 4px 8px -1px hsl(0 0% 0% / 0.05);
	--shadow-sm:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 1px 2px -2px hsl(0 0% 0% / 0.1);
	--shadow:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 1px 2px -2px hsl(0 0% 0% / 0.1);
	--shadow-md:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 2px 4px -2px hsl(0 0% 0% / 0.1);
	--shadow-lg:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 4px 6px -2px hsl(0 0% 0% / 0.1);
	--shadow-xl:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 8px 10px -2px hsl(0 0% 0% / 0.1);
	--shadow-2xl: 0px 4px 8px -1px hsl(0 0% 0% / 0.25);
}

.dark.theme-amberminimal {
	--background: oklch(0.2046 0 0);
	--foreground: oklch(0.9219 0 0);
	--card: oklch(0.2686 0 0);
	--card-foreground: oklch(0.9219 0 0);
	--popover: oklch(0.2686 0 0);
	--popover-foreground: oklch(0.9219 0 0);
	--primary: oklch(0.7686 0.1647 70.0804);
	--primary-foreground: oklch(0 0 0);
	--secondary: oklch(0.2686 0 0);
	--secondary-foreground: oklch(0.9219 0 0);
	--muted: oklch(0.2393 0 0);
	--muted-foreground: oklch(0.7155 0 0);
	--accent: oklch(0.4732 0.1247 46.2007);
	--accent-foreground: oklch(0.9243 0.1151 95.7459);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.3715 0 0);
	--input: oklch(0.3715 0 0);
	--ring: oklch(0.7686 0.1647 70.0804);
	--chart-1: oklch(0.8369 0.1644 84.4286);
	--chart-2: oklch(0.6658 0.1574 58.3183);
	--chart-3: oklch(0.4732 0.1247 46.2007);
	--chart-4: oklch(0.5553 0.1455 48.9975);
	--chart-5: oklch(0.4732 0.1247 46.2007);
	--sidebar: oklch(0.1684 0 0);
	--sidebar-foreground: oklch(0.9219 0 0);
	--sidebar-primary: oklch(0.7686 0.1647 70.0804);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.4732 0.1247 46.2007);
	--sidebar-accent-foreground: oklch(0.9243 0.1151 95.7459);
	--sidebar-border: oklch(0.3715 0 0);
	--sidebar-ring: oklch(0.7686 0.1647 70.0804);
}


src/features/Environment/theme/builtInTheme/catppuccin.css

.theme-catppuccin {
	--background: oklch(0.9578 0.0058 264.5321);
	--foreground: oklch(0.4355 0.043 279.325);
	--card: oklch(1 0 0);
	--card-foreground: oklch(0.4355 0.043 279.325);
	--popover: oklch(0.8575 0.0145 268.4756);
	--popover-foreground: oklch(0.4355 0.043 279.325);
	--primary: oklch(0.5547 0.2503 297.0156);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.8575 0.0145 268.4756);
	--secondary-foreground: oklch(0.4355 0.043 279.325);
	--muted: oklch(0.906 0.0117 264.5071);
	--muted-foreground: oklch(0.5471 0.0343 279.0837);
	--accent: oklch(0.682 0.1448 235.3822);
	--accent-foreground: oklch(1 0 0);
	--destructive: oklch(0.5505 0.2155 19.8095);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.8083 0.0174 271.1982);
	--input: oklch(0.8575 0.0145 268.4756);
	--ring: oklch(0.5547 0.2503 297.0156);
	--chart-1: oklch(0.5547 0.2503 297.0156);
	--chart-2: oklch(0.682 0.1448 235.3822);
	--chart-3: oklch(0.625 0.1772 140.4448);
	--chart-4: oklch(0.692 0.2041 42.4293);
	--chart-5: oklch(0.7141 0.1045 33.0967);
	--sidebar: oklch(0.9335 0.0087 264.5206);
	--sidebar-foreground: oklch(0.4355 0.043 279.325);
	--sidebar-primary: oklch(0.5547 0.2503 297.0156);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.682 0.1448 235.3822);
	--sidebar-accent-foreground: oklch(1 0 0);
	--sidebar-border: oklch(0.8083 0.0174 271.1982);
	--sidebar-ring: oklch(0.5547 0.2503 297.0156);
	--font-sans: Montserrat, sans-serif;
	--font-serif: Georgia, serif;
	--font-mono: Fira Code, monospace;
	--radius: 0.35rem;
	--shadow-x: 0px;
	--shadow-y: 4px;
	--shadow-blur: 6px;
	--shadow-spread: 0px;
	--shadow-opacity: 0.12;
	--shadow-color: hsl(240 30% 25%);
	--shadow-2xs: 0px 4px 6px 0px hsl(240 30% 25% / 0.06);
	--shadow-xs: 0px 4px 6px 0px hsl(240 30% 25% / 0.06);
	--shadow-sm:
		0px 4px 6px 0px hsl(240 30% 25% / 0.12),
		0px 1px 2px -1px hsl(240 30% 25% / 0.12);
	--shadow:
		0px 4px 6px 0px hsl(240 30% 25% / 0.12),
		0px 1px 2px -1px hsl(240 30% 25% / 0.12);
	--shadow-md:
		0px 4px 6px 0px hsl(240 30% 25% / 0.12),
		0px 2px 4px -1px hsl(240 30% 25% / 0.12);
	--shadow-lg:
		0px 4px 6px 0px hsl(240 30% 25% / 0.12),
		0px 4px 6px -1px hsl(240 30% 25% / 0.12);
	--shadow-xl:
		0px 4px 6px 0px hsl(240 30% 25% / 0.12),
		0px 8px 10px -1px hsl(240 30% 25% / 0.12);
	--shadow-2xl: 0px 4px 6px 0px hsl(240 30% 25% / 0.3);
}

.dark.theme-catppuccin {
	--background: oklch(0.2155 0.0254 284.0647);
	--foreground: oklch(0.8787 0.0426 272.2767);
	--card: oklch(0.2429 0.0304 283.911);
	--card-foreground: oklch(0.8787 0.0426 272.2767);
	--popover: oklch(0.4037 0.032 280.152);
	--popover-foreground: oklch(0.8787 0.0426 272.2767);
	--primary: oklch(0.7871 0.1187 304.7693);
	--primary-foreground: oklch(0.2429 0.0304 283.911);
	--secondary: oklch(0.4765 0.034 278.643);
	--secondary-foreground: oklch(0.8787 0.0426 272.2767);
	--muted: oklch(0.2973 0.0294 276.2144);
	--muted-foreground: oklch(0.751 0.0396 273.932);
	--accent: oklch(0.8467 0.0833 210.2545);
	--accent-foreground: oklch(0.2429 0.0304 283.911);
	--destructive: oklch(0.7556 0.1297 2.7642);
	--destructive-foreground: oklch(0.2429 0.0304 283.911);
	--border: oklch(0.324 0.0319 281.9784);
	--input: oklch(0.324 0.0319 281.9784);
	--ring: oklch(0.7871 0.1187 304.7693);
	--chart-1: oklch(0.7871 0.1187 304.7693);
	--chart-2: oklch(0.8467 0.0833 210.2545);
	--chart-3: oklch(0.8577 0.1092 142.7153);
	--chart-4: oklch(0.8237 0.1015 52.6294);
	--chart-5: oklch(0.9226 0.0238 30.4919);
	--sidebar: oklch(0.1828 0.0204 284.2039);
	--sidebar-foreground: oklch(0.8787 0.0426 272.2767);
	--sidebar-primary: oklch(0.7871 0.1187 304.7693);
	--sidebar-primary-foreground: oklch(0.2429 0.0304 283.911);
	--sidebar-accent: oklch(0.8467 0.0833 210.2545);
	--sidebar-accent-foreground: oklch(0.2429 0.0304 283.911);
	--sidebar-border: oklch(0.4037 0.032 280.152);
	--sidebar-ring: oklch(0.7871 0.1187 304.7693);
}


src/features/Environment/theme/builtInTheme/claymorphism.css

.theme-claymorphism {
	--background: oklch(0.9232 0.0026 48.7171);
	--foreground: oklch(0.2795 0.0368 260.031);
	--card: oklch(0.9699 0.0013 106.4238);
	--card-foreground: oklch(0.2795 0.0368 260.031);
	--popover: oklch(0.9699 0.0013 106.4238);
	--popover-foreground: oklch(0.2795 0.0368 260.031);
	--primary: oklch(0.5854 0.2041 277.1173);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.8687 0.0043 56.366);
	--secondary-foreground: oklch(0.4461 0.0263 256.8018);
	--muted: oklch(0.9232 0.0026 48.7171);
	--muted-foreground: oklch(0.551 0.0234 264.3637);
	--accent: oklch(0.9376 0.026 321.9388);
	--accent-foreground: oklch(0.3729 0.0306 259.7328);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.8687 0.0043 56.366);
	--input: oklch(0.8687 0.0043 56.366);
	--ring: oklch(0.5854 0.2041 277.1173);
	--chart-1: oklch(0.5854 0.2041 277.1173);
	--chart-2: oklch(0.5106 0.2301 276.9656);
	--chart-3: oklch(0.4568 0.2146 277.0229);
	--chart-4: oklch(0.3984 0.1773 277.3662);
	--chart-5: oklch(0.3588 0.1354 278.6973);
	--sidebar: oklch(0.8687 0.0043 56.366);
	--sidebar-foreground: oklch(0.2795 0.0368 260.031);
	--sidebar-primary: oklch(0.5854 0.2041 277.1173);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.9376 0.026 321.9388);
	--sidebar-accent-foreground: oklch(0.3729 0.0306 259.7328);
	--sidebar-border: oklch(0.8687 0.0043 56.366);
	--sidebar-ring: oklch(0.5854 0.2041 277.1173);
	--font-sans: Plus Jakarta Sans, sans-serif;
	--font-serif: Lora, serif;
	--font-mono: Roboto Mono, monospace;
	--radius: 1.25rem;
	--shadow-x: 2px;
	--shadow-y: 2px;
	--shadow-blur: 10px;
	--shadow-spread: 4px;
	--shadow-opacity: 0.18;
	--shadow-color: hsl(240 4% 60%);
	--shadow-2xs: 2px 2px 10px 4px hsl(240 4% 60% / 0.09);
	--shadow-xs: 2px 2px 10px 4px hsl(240 4% 60% / 0.09);
	--shadow-sm:
		2px 2px 10px 4px hsl(240 4% 60% / 0.18),
		2px 1px 2px 3px hsl(240 4% 60% / 0.18);
	--shadow:
		2px 2px 10px 4px hsl(240 4% 60% / 0.18),
		2px 1px 2px 3px hsl(240 4% 60% / 0.18);
	--shadow-md:
		2px 2px 10px 4px hsl(240 4% 60% / 0.18),
		2px 2px 4px 3px hsl(240 4% 60% / 0.18);
	--shadow-lg:
		2px 2px 10px 4px hsl(240 4% 60% / 0.18),
		2px 4px 6px 3px hsl(240 4% 60% / 0.18);
	--shadow-xl:
		2px 2px 10px 4px hsl(240 4% 60% / 0.18),
		2px 8px 10px 3px hsl(240 4% 60% / 0.18);
	--shadow-2xl: 2px 2px 10px 4px hsl(240 4% 60% / 0.45);
}

.dark.theme-claymorphism {
	--background: oklch(0.2244 0.0074 67.437);
	--foreground: oklch(0.9288 0.0126 255.5078);
	--card: oklch(0.2801 0.008 59.3379);
	--card-foreground: oklch(0.9288 0.0126 255.5078);
	--popover: oklch(0.2801 0.008 59.3379);
	--popover-foreground: oklch(0.9288 0.0126 255.5078);
	--primary: oklch(0.6801 0.1583 276.9349);
	--primary-foreground: oklch(0.2244 0.0074 67.437);
	--secondary: oklch(0.3359 0.0077 59.4197);
	--secondary-foreground: oklch(0.8717 0.0093 258.3382);
	--muted: oklch(0.2287 0.0074 67.4469);
	--muted-foreground: oklch(0.7137 0.0192 261.3246);
	--accent: oklch(0.3896 0.0074 59.4734);
	--accent-foreground: oklch(0.8717 0.0093 258.3382);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(0.2244 0.0074 67.437);
	--border: oklch(0.3359 0.0077 59.4197);
	--input: oklch(0.3359 0.0077 59.4197);
	--ring: oklch(0.6801 0.1583 276.9349);
	--chart-1: oklch(0.6801 0.1583 276.9349);
	--chart-2: oklch(0.5854 0.2041 277.1173);
	--chart-3: oklch(0.5106 0.2301 276.9656);
	--chart-4: oklch(0.4568 0.2146 277.0229);
	--chart-5: oklch(0.3984 0.1773 277.3662);
	--sidebar: oklch(0.3359 0.0077 59.4197);
	--sidebar-foreground: oklch(0.9288 0.0126 255.5078);
	--sidebar-primary: oklch(0.6801 0.1583 276.9349);
	--sidebar-primary-foreground: oklch(0.2244 0.0074 67.437);
	--sidebar-accent: oklch(0.3896 0.0074 59.4734);
	--sidebar-accent-foreground: oklch(0.8717 0.0093 258.3382);
	--sidebar-border: oklch(0.3359 0.0077 59.4197);
	--sidebar-ring: oklch(0.6801 0.1583 276.9349);
	--font-sans: Plus Jakarta Sans, sans-serif;
	--font-serif: Lora, serif;
	--font-mono: Roboto Mono, monospace;
	--radius: 1.25rem;
	--shadow-x: 2px;
	--shadow-y: 2px;
	--shadow-blur: 10px;
	--shadow-spread: 4px;
	--shadow-opacity: 0.18;
	--shadow-color: hsl(0 0% 0%);
	--shadow-2xs: 2px 2px 10px 4px hsl(0 0% 0% / 0.09);
	--shadow-xs: 2px 2px 10px 4px hsl(0 0% 0% / 0.09);
	--shadow-sm:
		2px 2px 10px 4px hsl(0 0% 0% / 0.18), 2px 1px 2px 3px hsl(0 0% 0% / 0.18);
	--shadow:
		2px 2px 10px 4px hsl(0 0% 0% / 0.18), 2px 1px 2px 3px hsl(0 0% 0% / 0.18);
	--shadow-md:
		2px 2px 10px 4px hsl(0 0% 0% / 0.18), 2px 2px 4px 3px hsl(0 0% 0% / 0.18);
	--shadow-lg:
		2px 2px 10px 4px hsl(0 0% 0% / 0.18), 2px 4px 6px 3px hsl(0 0% 0% / 0.18);
	--shadow-xl:
		2px 2px 10px 4px hsl(0 0% 0% / 0.18), 2px 8px 10px 3px hsl(0 0% 0% / 0.18);
	--shadow-2xl: 2px 2px 10px 4px hsl(0 0% 0% / 0.45);
}


src/features/Environment/theme/builtInTheme/clean-slate.css

.theme-cleanslate {
	--background: oklch(0.9842 0.0034 247.8575);
	--foreground: oklch(0.2795 0.0368 260.031);
	--card: oklch(1 0 0);
	--card-foreground: oklch(0.2795 0.0368 260.031);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.2795 0.0368 260.031);
	--primary: oklch(0.5854 0.2041 277.1173);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.9276 0.0058 264.5313);
	--secondary-foreground: oklch(0.3729 0.0306 259.7328);
	--muted: oklch(0.967 0.0029 264.5419);
	--muted-foreground: oklch(0.551 0.0234 264.3637);
	--accent: oklch(0.9299 0.0334 272.7879);
	--accent-foreground: oklch(0.3729 0.0306 259.7328);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.8717 0.0093 258.3382);
	--input: oklch(0.8717 0.0093 258.3382);
	--ring: oklch(0.5854 0.2041 277.1173);
	--chart-1: oklch(0.5854 0.2041 277.1173);
	--chart-2: oklch(0.5106 0.2301 276.9656);
	--chart-3: oklch(0.4568 0.2146 277.0229);
	--chart-4: oklch(0.3984 0.1773 277.3662);
	--chart-5: oklch(0.3588 0.1354 278.6973);
	--sidebar: oklch(0.967 0.0029 264.5419);
	--sidebar-foreground: oklch(0.2795 0.0368 260.031);
	--sidebar-primary: oklch(0.5854 0.2041 277.1173);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.9299 0.0334 272.7879);
	--sidebar-accent-foreground: oklch(0.3729 0.0306 259.7328);
	--sidebar-border: oklch(0.8717 0.0093 258.3382);
	--sidebar-ring: oklch(0.5854 0.2041 277.1173);
	--font-sans: Inter, sans-serif;
	--font-serif: Merriweather, serif;
	--font-mono: JetBrains Mono, monospace;
	--radius: 0.5rem;
	--shadow-x: 0px;
	--shadow-y: 4px;
	--shadow-blur: 8px;
	--shadow-spread: -1px;
	--shadow-opacity: 0.1;
	--shadow-color: hsl(0 0% 0%);
	--shadow-2xs: 0px 4px 8px -1px hsl(0 0% 0% / 0.05);
	--shadow-xs: 0px 4px 8px -1px hsl(0 0% 0% / 0.05);
	--shadow-sm:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 1px 2px -2px hsl(0 0% 0% / 0.1);
	--shadow:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 1px 2px -2px hsl(0 0% 0% / 0.1);
	--shadow-md:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 2px 4px -2px hsl(0 0% 0% / 0.1);
	--shadow-lg:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 4px 6px -2px hsl(0 0% 0% / 0.1);
	--shadow-xl:
		0px 4px 8px -1px hsl(0 0% 0% / 0.1), 0px 8px 10px -2px hsl(0 0% 0% / 0.1);
	--shadow-2xl: 0px 4px 8px -1px hsl(0 0% 0% / 0.25);
}

.dark.theme-cleanslate {
	--background: oklch(0.2077 0.0398 265.7549);
	--foreground: oklch(0.9288 0.0126 255.5078);
	--card: oklch(0.2795 0.0368 260.031);
	--card-foreground: oklch(0.9288 0.0126 255.5078);
	--popover: oklch(0.2795 0.0368 260.031);
	--popover-foreground: oklch(0.9288 0.0126 255.5078);
	--primary: oklch(0.6801 0.1583 276.9349);
	--primary-foreground: oklch(0.2077 0.0398 265.7549);
	--secondary: oklch(0.3351 0.0331 260.912);
	--secondary-foreground: oklch(0.8717 0.0093 258.3382);
	--muted: oklch(0.2427 0.0381 259.9437);
	--muted-foreground: oklch(0.7137 0.0192 261.3246);
	--accent: oklch(0.3729 0.0306 259.7328);
	--accent-foreground: oklch(0.8717 0.0093 258.3382);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(0.2077 0.0398 265.7549);
	--border: oklch(0.4461 0.0263 256.8018);
	--input: oklch(0.4461 0.0263 256.8018);
	--ring: oklch(0.6801 0.1583 276.9349);
	--chart-1: oklch(0.6801 0.1583 276.9349);
	--chart-2: oklch(0.5854 0.2041 277.1173);
	--chart-3: oklch(0.5106 0.2301 276.9656);
	--chart-4: oklch(0.4568 0.2146 277.0229);
	--chart-5: oklch(0.3984 0.1773 277.3662);
	--sidebar: oklch(0.2795 0.0368 260.031);
	--sidebar-foreground: oklch(0.9288 0.0126 255.5078);
	--sidebar-primary: oklch(0.6801 0.1583 276.9349);
	--sidebar-primary-foreground: oklch(0.2077 0.0398 265.7549);
	--sidebar-accent: oklch(0.3729 0.0306 259.7328);
	--sidebar-accent-foreground: oklch(0.8717 0.0093 258.3382);
	--sidebar-border: oklch(0.4461 0.0263 256.8018);
	--sidebar-ring: oklch(0.6801 0.1583 276.9349);
}


src/features/Environment/theme/builtInTheme/default.css

:root {
	--background: oklch(0.9818 0.0054 95.0986);
	--foreground: oklch(0.3438 0.0269 95.7226);
	--card: oklch(0.9818 0.0054 95.0986);
	--card-foreground: oklch(0.1908 0.002 106.5859);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.2671 0.0196 98.939);
	--primary: oklch(0.6171 0.1375 39.0427);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.9245 0.0138 92.9892);
	--secondary-foreground: oklch(0.4334 0.0177 98.6048);
	--muted: oklch(0.9341 0.0153 90.239);
	--muted-foreground: oklch(0.6059 0.0075 97.4233);
	--accent: oklch(0.9245 0.0138 92.9892);
	--accent-foreground: oklch(0.2671 0.0196 98.939);
	--destructive: oklch(0.1908 0.002 106.5859);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.8847 0.0069 97.3627);
	--input: oklch(0.7621 0.0156 98.3528);
	--ring: oklch(0.6171 0.1375 39.0427);
	--chart-1: oklch(0.5583 0.1276 42.9956);
	--chart-2: oklch(0.6898 0.1581 290.4107);
	--chart-3: oklch(0.8816 0.0276 93.128);
	--chart-4: oklch(0.8822 0.0403 298.1792);
	--chart-5: oklch(0.5608 0.1348 42.0584);
	--sidebar: oklch(0.9663 0.008 98.8792);
	--sidebar-foreground: oklch(0.359 0.0051 106.6524);
	--sidebar-primary: oklch(0.6171 0.1375 39.0427);
	--sidebar-primary-foreground: oklch(0.9881 0 0);
	--sidebar-accent: oklch(0.9245 0.0138 92.9892);
	--sidebar-accent-foreground: oklch(0.325 0 0);
	--sidebar-border: oklch(0.9401 0 0);
	--sidebar-ring: oklch(0.7731 0 0);
	--font-sans:
		ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
		Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif,
		"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
		"Noto Color Emoji";
	--font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
	--font-mono:
		ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
		"Courier New", monospace;
	--radius: 0.5rem;
	--shadow-x: 0;
	--shadow-y: 1px;
	--shadow-blur: 3px;
	--shadow-spread: 0px;
	--shadow-opacity: 0.1;
	--shadow-color: oklch(0 0 0);
	--shadow-2xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
	--shadow-xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
	--shadow-sm:
		0 1px 3px 0px hsl(0 0% 0% / 0.1), 0 1px 2px -1px hsl(0 0% 0% / 0.1);
	--shadow: 0 1px 3px 0px hsl(0 0% 0% / 0.1), 0 1px 2px -1px hsl(0 0% 0% / 0.1);
	--shadow-md:
		0 1px 3px 0px hsl(0 0% 0% / 0.1), 0 2px 4px -1px hsl(0 0% 0% / 0.1);
	--shadow-lg:
		0 1px 3px 0px hsl(0 0% 0% / 0.1), 0 4px 6px -1px hsl(0 0% 0% / 0.1);
	--shadow-xl:
		0 1px 3px 0px hsl(0 0% 0% / 0.1), 0 8px 10px -1px hsl(0 0% 0% / 0.1);
	--shadow-2xl: 0 1px 3px 0px hsl(0 0% 0% / 0.25);
	--tracking-normal: 0em;
	--spacing: 0.25rem;
}

.dark {
	--background: oklch(0.2679 0.0036 106.6427);
	--foreground: oklch(0.8074 0.0142 93.0137);
	--card: oklch(0.2679 0.0036 106.6427);
	--card-foreground: oklch(0.9818 0.0054 95.0986);
	--popover: oklch(0.3085 0.0035 106.6039);
	--popover-foreground: oklch(0.9211 0.004 106.4781);
	--primary: oklch(0.6724 0.1308 38.7559);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.9818 0.0054 95.0986);
	--secondary-foreground: oklch(0.3085 0.0035 106.6039);
	--muted: oklch(0.2213 0.0038 106.707);
	--muted-foreground: oklch(0.7713 0.0169 99.0657);
	--accent: oklch(0.213 0.0078 95.4245);
	--accent-foreground: oklch(0.9663 0.008 98.8792);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.3618 0.0101 106.8928);
	--input: oklch(0.4336 0.0113 100.2195);
	--ring: oklch(0.6724 0.1308 38.7559);
	--chart-1: oklch(0.5583 0.1276 42.9956);
	--chart-2: oklch(0.6898 0.1581 290.4107);
	--chart-3: oklch(0.213 0.0078 95.4245);
	--chart-4: oklch(0.3074 0.0516 289.323);
	--chart-5: oklch(0.5608 0.1348 42.0584);
	--sidebar: oklch(0.2357 0.0024 67.7077);
	--sidebar-foreground: oklch(0.8074 0.0142 93.0137);
	--sidebar-primary: oklch(0.325 0 0);
	--sidebar-primary-foreground: oklch(0.9881 0 0);
	--sidebar-accent: oklch(0.168 0.002 106.6177);
	--sidebar-accent-foreground: oklch(0.8074 0.0142 93.0137);
	--sidebar-border: oklch(0.9401 0 0);
	--sidebar-ring: oklch(0.7731 0 0);
}


src/features/Environment/theme/builtInTheme/solar-dusk.css

.theme-solardusk {
	--background: oklch(0.9885 0.0057 84.5659);
	--foreground: oklch(0.366 0.0251 49.6085);
	--card: oklch(0.9686 0.0091 78.2818);
	--card-foreground: oklch(0.366 0.0251 49.6085);
	--popover: oklch(0.9686 0.0091 78.2818);
	--popover-foreground: oklch(0.366 0.0251 49.6085);
	--primary: oklch(0.5553 0.1455 48.9975);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.8276 0.0752 74.44);
	--secondary-foreground: oklch(0.4444 0.0096 73.639);
	--muted: oklch(0.9363 0.0218 83.2637);
	--muted-foreground: oklch(0.5534 0.0116 58.0708);
	--accent: oklch(0.9 0.05 74.9889);
	--accent-foreground: oklch(0.4444 0.0096 73.639);
	--destructive: oklch(0.4437 0.1613 26.8994);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.8866 0.0404 89.6994);
	--input: oklch(0.8866 0.0404 89.6994);
	--ring: oklch(0.5553 0.1455 48.9975);
	--chart-1: oklch(0.5553 0.1455 48.9975);
	--chart-2: oklch(0.5534 0.0116 58.0708);
	--chart-3: oklch(0.5538 0.1207 66.4416);
	--chart-4: oklch(0.5534 0.0116 58.0708);
	--chart-5: oklch(0.6806 0.1423 75.834);
	--sidebar: oklch(0.9363 0.0218 83.2637);
	--sidebar-foreground: oklch(0.366 0.0251 49.6085);
	--sidebar-primary: oklch(0.5553 0.1455 48.9975);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.5538 0.1207 66.4416);
	--sidebar-accent-foreground: oklch(1 0 0);
	--sidebar-border: oklch(0.8866 0.0404 89.6994);
	--sidebar-ring: oklch(0.5553 0.1455 48.9975);
	--font-sans: Oxanium, sans-serif;
	--font-serif: Merriweather, serif;
	--font-mono: Fira Code, monospace;
	--radius: 0.3rem;
	--shadow-x: 0px;
	--shadow-y: 2px;
	--shadow-blur: 3px;
	--shadow-spread: 0px;
	--shadow-opacity: 0.18;
	--shadow-color: hsl(28 18% 25%);
	--shadow-2xs: 0px 2px 3px 0px hsl(28 18% 25% / 0.09);
	--shadow-xs: 0px 2px 3px 0px hsl(28 18% 25% / 0.09);
	--shadow-sm:
		0px 2px 3px 0px hsl(28 18% 25% / 0.18),
		0px 1px 2px -1px hsl(28 18% 25% / 0.18);
	--shadow:
		0px 2px 3px 0px hsl(28 18% 25% / 0.18),
		0px 1px 2px -1px hsl(28 18% 25% / 0.18);
	--shadow-md:
		0px 2px 3px 0px hsl(28 18% 25% / 0.18),
		0px 2px 4px -1px hsl(28 18% 25% / 0.18);
	--shadow-lg:
		0px 2px 3px 0px hsl(28 18% 25% / 0.18),
		0px 4px 6px -1px hsl(28 18% 25% / 0.18);
	--shadow-xl:
		0px 2px 3px 0px hsl(28 18% 25% / 0.18),
		0px 8px 10px -1px hsl(28 18% 25% / 0.18);
	--shadow-2xl: 0px 2px 3px 0px hsl(28 18% 25% / 0.45);
}

.dark.theme-solardusk {
	--background: oklch(0.2161 0.0061 56.0434);
	--foreground: oklch(0.9699 0.0013 106.4238);
	--card: oklch(0.2685 0.0063 34.2976);
	--card-foreground: oklch(0.9699 0.0013 106.4238);
	--popover: oklch(0.2685 0.0063 34.2976);
	--popover-foreground: oklch(0.9699 0.0013 106.4238);
	--primary: oklch(0.7049 0.1867 47.6044);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.4444 0.0096 73.639);
	--secondary-foreground: oklch(0.9232 0.0026 48.7171);
	--muted: oklch(0.233 0.0073 67.4563);
	--muted-foreground: oklch(0.7161 0.0091 56.259);
	--accent: oklch(0.3598 0.0497 229.3202);
	--accent-foreground: oklch(0.9232 0.0026 48.7171);
	--destructive: oklch(0.5771 0.2152 27.325);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.3741 0.0087 67.5582);
	--input: oklch(0.3741 0.0087 67.5582);
	--ring: oklch(0.7049 0.1867 47.6044);
	--chart-1: oklch(0.7049 0.1867 47.6044);
	--chart-2: oklch(0.6847 0.1479 237.3225);
	--chart-3: oklch(0.7952 0.1617 86.0468);
	--chart-4: oklch(0.7161 0.0091 56.259);
	--chart-5: oklch(0.5534 0.0116 58.0708);
	--sidebar: oklch(0.2685 0.0063 34.2976);
	--sidebar-foreground: oklch(0.9699 0.0013 106.4238);
	--sidebar-primary: oklch(0.7049 0.1867 47.6044);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.6847 0.1479 237.3225);
	--sidebar-accent-foreground: oklch(0.2839 0.0734 254.5378);
	--sidebar-border: oklch(0.3741 0.0087 67.5582);
	--sidebar-ring: oklch(0.7049 0.1867 47.6044);
}


src/features/Environment/theme/builtInTheme/tangerine.css

.theme-tangerine {
	--background: oklch(0.9383 0.0042 236.4993);
	--foreground: oklch(0.3211 0 0);
	--card: oklch(1 0 0);
	--card-foreground: oklch(0.3211 0 0);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.3211 0 0);
	--primary: oklch(0.6397 0.172 36.4421);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.967 0.0029 264.5419);
	--secondary-foreground: oklch(0.4461 0.0263 256.8018);
	--muted: oklch(0.9846 0.0017 247.8389);
	--muted-foreground: oklch(0.551 0.0234 264.3637);
	--accent: oklch(0.9119 0.0222 243.8174);
	--accent-foreground: oklch(0.3791 0.1378 265.5222);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.9022 0.0052 247.8822);
	--input: oklch(0.97 0.0029 264.542);
	--ring: oklch(0.6397 0.172 36.4421);
	--chart-1: oklch(0.7156 0.0605 248.6845);
	--chart-2: oklch(0.7875 0.0917 35.9616);
	--chart-3: oklch(0.5778 0.0759 254.1573);
	--chart-4: oklch(0.5016 0.0849 259.4902);
	--chart-5: oklch(0.4241 0.0952 264.0306);
	--sidebar: oklch(0.903 0.0046 258.3257);
	--sidebar-foreground: oklch(0.3211 0 0);
	--sidebar-primary: oklch(0.6397 0.172 36.4421);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.9119 0.0222 243.8174);
	--sidebar-accent-foreground: oklch(0.3791 0.1378 265.5222);
	--sidebar-border: oklch(0.9276 0.0058 264.5313);
	--sidebar-ring: oklch(0.6397 0.172 36.4421);
	--font-sans: Inter, sans-serif;
	--font-serif: Source Serif 4, serif;
	--font-mono: JetBrains Mono, monospace;
	--radius: 0.75rem;
	--shadow-x: 0px;
	--shadow-y: 1px;
	--shadow-blur: 3px;
	--shadow-spread: 0px;
	--shadow-opacity: 0.1;
	--shadow-color: hsl(0 0% 0%);
	--shadow-2xs: 0px 1px 3px 0px hsl(0 0% 0% / 0.05);
	--shadow-xs: 0px 1px 3px 0px hsl(0 0% 0% / 0.05);
	--shadow-sm:
		0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 1px 2px -1px hsl(0 0% 0% / 0.1);
	--shadow:
		0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 1px 2px -1px hsl(0 0% 0% / 0.1);
	--shadow-md:
		0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 2px 4px -1px hsl(0 0% 0% / 0.1);
	--shadow-lg:
		0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 4px 6px -1px hsl(0 0% 0% / 0.1);
	--shadow-xl:
		0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 8px 10px -1px hsl(0 0% 0% / 0.1);
	--shadow-2xl: 0px 1px 3px 0px hsl(0 0% 0% / 0.25);
}

.dark.theme-tangerine {
	--background: oklch(0.2598 0.0306 262.6666);
	--foreground: oklch(0.9219 0 0);
	--card: oklch(0.3106 0.0301 268.6365);
	--card-foreground: oklch(0.9219 0 0);
	--popover: oklch(0.29 0.0249 268.3986);
	--popover-foreground: oklch(0.9219 0 0);
	--primary: oklch(0.6397 0.172 36.4421);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.3095 0.0266 266.7132);
	--secondary-foreground: oklch(0.9219 0 0);
	--muted: oklch(0.3095 0.0266 266.7132);
	--muted-foreground: oklch(0.7155 0 0);
	--accent: oklch(0.338 0.0589 267.5867);
	--accent-foreground: oklch(0.8823 0.0571 254.1284);
	--destructive: oklch(0.6368 0.2078 25.3313);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.3843 0.0301 269.7337);
	--input: oklch(0.3843 0.0301 269.7337);
	--ring: oklch(0.6397 0.172 36.4421);
	--chart-1: oklch(0.7156 0.0605 248.6845);
	--chart-2: oklch(0.7693 0.0876 34.1875);
	--chart-3: oklch(0.5778 0.0759 254.1573);
	--chart-4: oklch(0.5016 0.0849 259.4902);
	--chart-5: oklch(0.4241 0.0952 264.0306);
	--sidebar: oklch(0.31 0.0283 267.7408);
	--sidebar-foreground: oklch(0.9219 0 0);
	--sidebar-primary: oklch(0.6397 0.172 36.4421);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.338 0.0589 267.5867);
	--sidebar-accent-foreground: oklch(0.8823 0.0571 254.1284);
	--sidebar-border: oklch(0.3843 0.0301 269.7337);
	--sidebar-ring: oklch(0.6397 0.172 36.4421);
}


src/features/Environment/theme/builtInTheme/twitter.css

.theme-twitter {
	--background: oklch(1 0 0);
	--foreground: oklch(0.1884 0.0128 248.5103);
	--card: oklch(0.9784 0.0011 197.1387);
	--card-foreground: oklch(0.1884 0.0128 248.5103);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.1884 0.0128 248.5103);
	--primary: oklch(0.6723 0.1606 244.9955);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.1884 0.0128 248.5103);
	--secondary-foreground: oklch(1 0 0);
	--muted: oklch(0.9222 0.0013 286.3737);
	--muted-foreground: oklch(0.1884 0.0128 248.5103);
	--accent: oklch(0.9392 0.0166 250.8453);
	--accent-foreground: oklch(0.6723 0.1606 244.9955);
	--destructive: oklch(0.6188 0.2376 25.7658);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.9317 0.0118 231.6594);
	--input: oklch(0.9809 0.0025 228.7836);
	--ring: oklch(0.6818 0.1584 243.354);
	--chart-1: oklch(0.6723 0.1606 244.9955);
	--chart-2: oklch(0.6907 0.1554 160.3454);
	--chart-3: oklch(0.8214 0.16 82.5337);
	--chart-4: oklch(0.7064 0.1822 151.7125);
	--chart-5: oklch(0.5919 0.2186 10.5826);
	--sidebar: oklch(0.9784 0.0011 197.1387);
	--sidebar-foreground: oklch(0.1884 0.0128 248.5103);
	--sidebar-primary: oklch(0.6723 0.1606 244.9955);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.9392 0.0166 250.8453);
	--sidebar-accent-foreground: oklch(0.6723 0.1606 244.9955);
	--sidebar-border: oklch(0.9271 0.0101 238.5177);
	--sidebar-ring: oklch(0.6818 0.1584 243.354);
	--font-sans: Open Sans, sans-serif;
	--font-serif: Georgia, serif;
	--font-mono: Menlo, monospace;
	--radius: 1.3rem;
	--shadow-x: 0px;
	--shadow-y: 2px;
	--shadow-blur: 0px;
	--shadow-spread: 0px;
	--shadow-opacity: 0;
	--shadow-color: rgba(29, 161, 242, 0.15);
	--shadow-2xs: 0px 2px 0px 0px hsl(202.8169 89.1213% 53.1373% / 0);
	--shadow-xs: 0px 2px 0px 0px hsl(202.8169 89.1213% 53.1373% / 0);
	--shadow-sm:
		0px 2px 0px 0px hsl(202.8169 89.1213% 53.1373% / 0),
		0px 1px 2px -1px hsl(202.8169 89.1213% 53.1373% / 0);
	--shadow:
		0px 2px 0px 0px hsl(202.8169 89.1213% 53.1373% / 0),
		0px 1px 2px -1px hsl(202.8169 89.1213% 53.1373% / 0);
	--shadow-md:
		0px 2px 0px 0px hsl(202.8169 89.1213% 53.1373% / 0),
		0px 2px 4px -1px hsl(202.8169 89.1213% 53.1373% / 0);
	--shadow-lg:
		0px 2px 0px 0px hsl(202.8169 89.1213% 53.1373% / 0),
		0px 4px 6px -1px hsl(202.8169 89.1213% 53.1373% / 0);
	--shadow-xl:
		0px 2px 0px 0px hsl(202.8169 89.1213% 53.1373% / 0),
		0px 8px 10px -1px hsl(202.8169 89.1213% 53.1373% / 0);
	--shadow-2xl: 0px 2px 0px 0px hsl(202.8169 89.1213% 53.1373% / 0);
}

.dark.theme-twitter {
	--background: oklch(0 0 0);
	--foreground: oklch(0.9328 0.0025 228.7857);
	--card: oklch(0.2097 0.008 274.5332);
	--card-foreground: oklch(0.8853 0 0);
	--popover: oklch(0 0 0);
	--popover-foreground: oklch(0.9328 0.0025 228.7857);
	--primary: oklch(0.6692 0.1607 245.011);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.9622 0.0035 219.5331);
	--secondary-foreground: oklch(0.1884 0.0128 248.5103);
	--muted: oklch(0.209 0 0);
	--muted-foreground: oklch(0.5637 0.0078 247.9662);
	--accent: oklch(0.1928 0.0331 242.5459);
	--accent-foreground: oklch(0.6692 0.1607 245.011);
	--destructive: oklch(0.6188 0.2376 25.7658);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.2674 0.0047 248.0045);
	--input: oklch(0.302 0.0288 244.8244);
	--ring: oklch(0.6818 0.1584 243.354);
	--chart-1: oklch(0.6723 0.1606 244.9955);
	--chart-2: oklch(0.6907 0.1554 160.3454);
	--chart-3: oklch(0.8214 0.16 82.5337);
	--chart-4: oklch(0.7064 0.1822 151.7125);
	--chart-5: oklch(0.5919 0.2186 10.5826);
	--sidebar: oklch(0.2097 0.008 274.5332);
	--sidebar-foreground: oklch(0.8853 0 0);
	--sidebar-primary: oklch(0.6818 0.1584 243.354);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.1928 0.0331 242.5459);
	--sidebar-accent-foreground: oklch(0.6692 0.1607 245.011);
	--sidebar-border: oklch(0.3795 0.022 240.5943);
	--sidebar-ring: oklch(0.6818 0.1584 243.354);
}


src/features/Environment/theme/builtInTheme/violet-bloom.css

.theme-violetbloom {
	--background: oklch(0.994 0 0);
	--foreground: oklch(0 0 0);
	--card: oklch(0.994 0 0);
	--card-foreground: oklch(0 0 0);
	--popover: oklch(0.9911 0 0);
	--popover-foreground: oklch(0 0 0);
	--primary: oklch(0.5393 0.2713 286.7462);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.954 0.0063 255.4755);
	--secondary-foreground: oklch(0.1344 0 0);
	--muted: oklch(0.9702 0 0);
	--muted-foreground: oklch(0.4386 0 0);
	--accent: oklch(0.9393 0.0288 266.368);
	--accent-foreground: oklch(0.5445 0.1903 259.4848);
	--destructive: oklch(0.629 0.1902 23.0704);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.93 0.0094 286.2156);
	--input: oklch(0.9401 0 0);
	--ring: oklch(0 0 0);
	--chart-1: oklch(0.7459 0.1483 156.4499);
	--chart-2: oklch(0.5393 0.2713 286.7462);
	--chart-3: oklch(0.7336 0.1758 50.5517);
	--chart-4: oklch(0.5828 0.1809 259.7276);
	--chart-5: oklch(0.559 0 0);
	--sidebar: oklch(0.9777 0.0051 247.8763);
	--sidebar-foreground: oklch(0 0 0);
	--sidebar-primary: oklch(0 0 0);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.9401 0 0);
	--sidebar-accent-foreground: oklch(0 0 0);
	--sidebar-border: oklch(0.9401 0 0);
	--sidebar-ring: oklch(0 0 0);
	--font-sans: Plus Jakarta Sans, sans-serif;
	--font-serif: Lora, serif;
	--font-mono: IBM Plex Mono, monospace;
	--radius: 1.4rem;
	--shadow-x: 0px;
	--shadow-y: 2px;
	--shadow-blur: 3px;
	--shadow-spread: 0px;
	--shadow-opacity: 0.16;
	--shadow-color: hsl(0 0% 0%);
	--shadow-2xs: 0px 2px 3px 0px hsl(0 0% 0% / 0.08);
	--shadow-xs: 0px 2px 3px 0px hsl(0 0% 0% / 0.08);
	--shadow-sm:
		0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 1px 2px -1px hsl(0 0% 0% / 0.16);
	--shadow:
		0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 1px 2px -1px hsl(0 0% 0% / 0.16);
	--shadow-md:
		0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 2px 4px -1px hsl(0 0% 0% / 0.16);
	--shadow-lg:
		0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 4px 6px -1px hsl(0 0% 0% / 0.16);
	--shadow-xl:
		0px 2px 3px 0px hsl(0 0% 0% / 0.16), 0px 8px 10px -1px hsl(0 0% 0% / 0.16);
	--shadow-2xl: 0px 2px 3px 0px hsl(0 0% 0% / 0.4);
}

.dark.theme-violetbloom {
	--background: oklch(0.2223 0.006 271.1393);
	--foreground: oklch(0.9551 0 0);
	--card: oklch(0.2568 0.0076 274.6528);
	--card-foreground: oklch(0.9551 0 0);
	--popover: oklch(0.2568 0.0076 274.6528);
	--popover-foreground: oklch(0.9551 0 0);
	--primary: oklch(0.6132 0.2294 291.7437);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.294 0.013 272.9312);
	--secondary-foreground: oklch(0.9551 0 0);
	--muted: oklch(0.294 0.013 272.9312);
	--muted-foreground: oklch(0.7058 0 0);
	--accent: oklch(0.2795 0.0368 260.031);
	--accent-foreground: oklch(0.7857 0.1153 246.6596);
	--destructive: oklch(0.7106 0.1661 22.2162);
	--destructive-foreground: oklch(1 0 0);
	--border: oklch(0.3289 0.0092 268.3843);
	--input: oklch(0.3289 0.0092 268.3843);
	--ring: oklch(0.6132 0.2294 291.7437);
	--chart-1: oklch(0.8003 0.1821 151.711);
	--chart-2: oklch(0.6132 0.2294 291.7437);
	--chart-3: oklch(0.8077 0.1035 19.5706);
	--chart-4: oklch(0.6691 0.1569 260.1063);
	--chart-5: oklch(0.7058 0 0);
	--sidebar: oklch(0.2011 0.0039 286.0396);
	--sidebar-foreground: oklch(0.9551 0 0);
	--sidebar-primary: oklch(0.6132 0.2294 291.7437);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: oklch(0.294 0.013 272.9312);
	--sidebar-accent-foreground: oklch(0.6132 0.2294 291.7437);
	--sidebar-border: oklch(0.3289 0.0092 268.3843);
	--sidebar-ring: oklch(0.6132 0.2294 291.7437);
}


src/features/Environment/theme/theme-registry.ts

import amberMinimalCss from "./builtInTheme/amber-minimal.css?raw";
import catppuccinCss from "./builtInTheme/catppuccin.css?raw";
import claymorphismCss from "./builtInTheme/claymorphism.css?raw";
import cleanSlateCss from "./builtInTheme/clean-slate.css?raw";
import defaultCss from "./builtInTheme/default.css?raw";
import solarDuskCss from "./builtInTheme/solar-dusk.css?raw";
import tangerineCss from "./builtInTheme/tangerine.css?raw";
import twitterCss from "./builtInTheme/twitter.css?raw";
import violetBloomCss from "./builtInTheme/violet-bloom.css?raw";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeDefinition {
	id: string;
	name: string;
	className: string;
	accent: string;
	css?: string;
}

const builtInThemeFiles = [
	{ id: "default", name: "Default", css: defaultCss },
	{ id: "catppuccin", name: "Catppuccin", css: catppuccinCss },
	{ id: "tangerine", name: "Tangerine", css: tangerineCss },
	{ id: "amberminimal", name: "Amber Minimal", css: amberMinimalCss },
	{ id: "cleanslate", name: "Clean Slate", css: cleanSlateCss },
	{ id: "solardusk", name: "Solar Dusk", css: solarDuskCss },
	{ id: "claymorphism", name: "Claymorphism", css: claymorphismCss },
	{ id: "violetbloom", name: "Violet Bloom", css: violetBloomCss },
	{ id: "twitter", name: "Twitter", css: twitterCss },
];

export const builtInThemes: ThemeDefinition[] = builtInThemeFiles.map((file) =>
	parseThemeCss(file.css, file.id, file.name),
);

function parseThemeCss(
	css: string,
	fallbackId = `custom-${Date.now()}`,
	fallbackName = "Imported Theme",
) {
	const className =
		css.match(/\.([a-zA-Z0-9_-]*theme-[a-zA-Z0-9_-]+)/)?.[1] ??
		(fallbackId === "default" ? "" : `theme-${slugify(fallbackId)}`);
	const id = className ? className.replace(/^theme-/, "") : fallbackId;
	const accent = parseCssVariable(css, "--primary") ?? "oklch(0.7 0.18 260)";
	const name =
		fallbackName === "Imported Theme" ? toTitleCase(id) : fallbackName;

	return {
		id,
		name,
		className,
		accent,
		css:
			className && !css.includes(`.${className}`)
				? wrapCssInClass(css, className)
				: css,
	} satisfies ThemeDefinition;
}

export function normalizeImportedTheme(css: string) {
	const parsed = parseThemeCss(css);
	if (parsed.css?.includes(`.${parsed.className}`)) {
		return parsed;
	}
	return {
		...parsed,
		css: wrapCssInClass(css, parsed.className),
	};
}

function parseCssVariable(css: string, variableName: string) {
	const escaped = variableName.replace(/-/g, "\\-");
	return (
		css.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`))?.[1]?.trim() ?? null
	);
}

function wrapCssInClass(css: string, className: string) {
	return css.replace(/:root/g, `.${className}`);
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function toTitleCase(value: string) {
	return value
		.replace(/^theme-/, "")
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}


src/features/Environment/utils/platform.ts

import { host } from "@/host";

export type RuntimePlatform =
	| "windows"
	| "macos"
	| "linux"
	| "android"
	| "ios"
	| "unknown";

let mobilePlatformOverride: boolean | null = null;

export function getRuntimePlatform(): RuntimePlatform {
	try {
		return host.platform.platform() as RuntimePlatform;
	} catch {
		return "unknown";
	}
}

export function isAndroidPlatform(): boolean {
	return getRuntimePlatform() === "android";
}

export function isMobilePlatform(): boolean {
	return mobilePlatformOverride ?? isNativeMobilePlatform();
}

export function isNativeMobilePlatform(): boolean {
	return host.platform.isMobile;
}

export function setMobilePlatformOverride(value: boolean | null): void {
	mobilePlatformOverride = value;
}

export function getMobilePlatformOverride(): boolean | null {
	return mobilePlatformOverride;
}


src/features/Environment/utils/theme-dom.ts

import type { ThemeDefinition, ThemeMode } from "../theme/theme-registry";

const themeClassPrefix = "theme-";
let systemDarkQuery: MediaQueryList | null = null;
let systemDarkListener: (() => void) | null = null;

export function isCssColorDark(color: string, fallback: boolean): boolean {
	if (typeof document === "undefined") return fallback;
	const probe = document.createElement("span");
	probe.style.color = color;
	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	document.documentElement.append(probe);
	const resolvedColor = getComputedStyle(probe).color;
	probe.remove();

	const context = document
		.createElement("canvas")
		.getContext("2d", { willReadFrequently: true });
	if (!context || !resolvedColor) return fallback;
	context.fillStyle = resolvedColor;
	context.fillRect(0, 0, 1, 1);
	const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
	if (alpha === 0) return fallback;
	return (red * 299 + green * 587 + blue * 114) / 1000 < 150;
}

export function applyTheme(
	theme: ThemeDefinition,
	mode: ThemeMode,
	onSystemChange: () => void,
): boolean {
	const root = document.documentElement;
	for (const className of Array.from(root.classList)) {
		if (className.startsWith(themeClassPrefix)) {
			root.classList.remove(className);
		}
	}
	if (theme.className) {
		root.classList.add(theme.className);
	}

	installSystemModeListener(mode, onSystemChange);
	const shouldUseDark =
		mode === "dark" || (mode === "system" && Boolean(systemDarkQuery?.matches));
	root.classList.toggle("dark", shouldUseDark);
	root.style.colorScheme = shouldUseDark ? "dark" : "light";
	return shouldUseDark;
}

export function installSystemModeListener(
	mode: ThemeMode,
	onSystemChange: () => void,
): void {
	if (typeof window === "undefined") return;
	systemDarkQuery ??= window.matchMedia("(prefers-color-scheme: dark)");
	if (systemDarkListener) {
		systemDarkQuery.removeEventListener("change", systemDarkListener);
		systemDarkListener = null;
	}
	if (mode !== "system") return;
	systemDarkListener = () => {
		onSystemChange();
	};
	systemDarkQuery.addEventListener("change", systemDarkListener);
}


src/features/Environment/utils/translate-service.ts

import { generateText } from "@/features/Request/ai-sdk";
import { modelProxyFetch } from "@/features/Request/provider/shared/custom-fetch";
import type { TranslateState } from "../defaults";

export async function translateWithLlm(
	text: string,
	state: TranslateState,
): Promise<string> {
	const prompt = `${state.prompt
		.split("{{sourceLanguage}}")
		.join(state.sourceLanguage)
		.split("{{targetLanguage}}")
		.join(state.targetLanguage)}

${text}`;
	if (!state.llmModel) throw new Error("尚未配置翻译模型。");
	const result = await generateText({ model: state.llmModel, prompt });
	return result.text;
}

export async function translateWithProvider(
	text: string,
	state: TranslateState,
): Promise<string> {
	if (!text.trim()) return "";
	if (state.provider === "microsoft") return translateWithAzure(text, state);

	const params = new URLSearchParams({
		client: "gtx",
		sl: state.sourceLanguage === "auto" ? "auto" : state.sourceLanguage,
		tl: state.targetLanguage,
		dt: "t",
		q: text,
	});
	let response: Response;
	try {
		response = await fetch(
			`https://translate.googleapis.com/translate_a/single?${params}`,
		);
	} catch {
		response = await modelProxyFetch(
			`https://translate.googleapis.com/translate_a/single?${params}`,
		);
	}
	if (!response.ok) {
		throw new Error(`Google Translate 请求失败 (${response.status})`);
	}
	const data = (await response.json()) as [Array<[string]>];
	return (data[0] ?? []).map((part) => part[0] ?? "").join("");
}

export async function translateWithAzure(
	text: string,
	state: TranslateState,
): Promise<string> {
	if (!state.azureKey.trim()) {
		throw new Error("请先填写 Azure Translator 密钥。");
	}

	const endpoint =
		state.azureEndpoint.trim().replace(/\/$/, "") ||
		"https://api.cognitive.microsofttranslator.com";
	const params = new URLSearchParams({
		"api-version": "3.0",
		to: state.targetLanguage,
	});
	if (state.sourceLanguage !== "auto") {
		params.set("from", state.sourceLanguage);
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"Ocp-Apim-Subscription-Key": state.azureKey,
	};
	if (state.azureRegion.trim()) {
		headers["Ocp-Apim-Subscription-Region"] = state.azureRegion.trim();
	}

	const response = await modelProxyFetch(`${endpoint}/translate?${params}`, {
		method: "POST",
		headers,
		body: JSON.stringify([{ text }]),
	});
	if (!response.ok) {
		throw new Error(`Azure Translator 请求失败 (${response.status})`);
	}
	const data = (await response.json()) as Array<{
		translations?: Array<{ text?: string }>;
	}>;
	return data[0]?.translations?.[0]?.text ?? "";
}


src/features/Migrations/SillyTavern/模板转换.md

# SillyTavern 宏与 ST-Prompt-Template EJS 转换

外部模板只在迁移阶段解释。公共入口是 `application/external-template-converter.ts` 的 `convertExternalTemplateText()`；它输出 PulsarAI 已有的 `{{ JavaScript }}`，不会向 Sandbox、Conversation generation 或 Plugin resolver 注册 SillyTavern/EJS 解析器。

## 简单宏

只处理非嵌套、非作用域的 `{{name}}`、`{{name argument}}`、`{{name::arg1::arg2}}` 和旧式 `{{name:argument}}`。输出是普通 JavaScript 表达式。

已映射：

- `char/bot/group/groupNotMuted/charIfNotGroup`：调用 `capabilities.conversation.listPackages()`，以当前 `packageId` 查找角色包，优先返回导入卡文件名 `nickname`；没有 nickname 时返回角色包名称。
- `user/notChar`：使用导入会话或 persona 中可证明的用户名称。
- 角色字段：`description`、`personality`、`scenario`、`charPrompt/systemPrompt`、`charInstruction`、`charDepthPrompt`、`charCreatorNotes`、`charVersion`、`mesExamples`、`charFirstMessage`。只有角色卡来源拥有相应字段时才生成常量函数。
- 消息：`lastMessage`、`lastUserMessage`、`lastCharMessage`、`lastMessageId`、`allChatRange`，读取当前 `chat`。
- 局部变量：`getvar/setvar/addvar/incvar/decvar/hasvar/deletevar`，使用 `localStorage` 的 `pulsar:sillytavern:local:<packageId>:<conversationId>:` 前缀。
- 全局变量：对应 `*globalvar` 宏，使用 `pulsar:sillytavern:global:` 前缀。
- 工具：`random`、标准 `NdM±K` 的 `roll`、`newline`、`space`、`noop`、`reverse`、`trim`。
- 环境：`input`、`model`、`isMobile`、`time`、`date`、`weekday`、`isotime`、`isodate`。
- `{{// comment}}`：变成返回空字符串的 JavaScript 注释。

局部变量以角色包和会话共同隔离；全局变量跨会话共享。它们不参与 `.data.json` 的消息版本回放，因此只适合迁移酒馆原本就具有浏览器存储式副作用的简单模板状态，不能替代 PulsarAI 的可回放 Conversation data。

## 不转换的宏

以下语法会整体替换成 `{{("" /* reason */)}}`，同时产生 `sillytavern.macro.unsupported`：

| 类型 | 原因 |
| --- | --- |
| 嵌套宏 | 当前动态表达式没有酒馆的嵌套参数解析顺序。 |
| `if/else`、任意作用域和闭合标签 | 用户明确排除控制流屎山；保留正文会改变条件语义，因此整个块置空。 |
| `# ! ? ~ >` 标志 | 除注释外，不复制保留空白、立即、延迟、重求值或过滤阶段。 |
| `.name` / `$name` 变量简写 | 运算符语法和惰性求值不属于简单宏；使用完整变量宏后再迁移。 |
| `summary/original/outlet/banned/hasExtension` | 依赖酒馆扩展、PromptManager、文本补全或世界书 outlet。 |
| `pick` | 依赖酒馆聊天位置和 reroll-pick 状态，不能用普通随机数伪装。 |
| token 预算宏 | 模板读取时还没有最终模型 token 预算。 |
| `idleDuration/timeDiff/datetimeformat` | 原扩展的格式化与活动时间来源没有稳定等价契约。 |
| 独立宏/脚本资源 | 当前只转换已导入文本字段，不执行 Quick Reply、STScript 或扩展脚本。 |

## ST-Prompt-Template EJS

同一个公共入口识别 `<% ... %>`：

- `<%= expression %>` 与 `<%- expression %>`追加表达式结果；
- `<% code %>`保留同步 JavaScript 控制流；
- `<%# comment %>`删除；
- `print()` 写入模板输出；
- 提供基于同一 `localStorage` 前缀的 `variables` Proxy、`getvar/setvar/getglobalvar/setglobalvar`。

转换器在导入时把整段 EJS 编译为一个自执行 JavaScript 函数，再包进已有 `{{ ... }}`。执行层不包含 EJS runtime，也不会加载 ST-Prompt-Template 自带的 `ejs.js`、vm-browserify 或 `with` 环境。

下列 EJS 会注释动态标签并产生 `sillytavern.ejs.unsupported`：

- `await` 和其他异步模板；
- `include()`；
- `SillyTavern`、`TavernHelper`、`eventSource`；
- `getwi/getchat/getchar/getPromptsInjected/inject`；
- `window/document/jQuery/toastr` 等页面和 UI 依赖；
- `fetch/WebSocket/XMLHttpRequest/EventSource/Worker` 等外部连接或脱离生成生命周期的任务；
- `eval/Function/import/require` 等二次动态执行和模块加载；
- 原模板直接使用 `localStorage`，以及 `capabilities/runProcess/agent/skills/mcp` 等 PulsarAI 执行能力；变量只能经过转换器生成的命名空间函数访问；
- JavaScript 源码中与 `{{ JavaScript }}` 结束符冲突的连续 `}}`。

这些能力不能通过一个模板函数安全补齐：资源读取需要来源作用域的 `imports`，聊天和角色查询需要 PulsarAI Feature API，注入需要明确 Plugin 容器，UI/事件系统则不属于生成流程。迁移报告保留文件路径、字段路径、名称和原因，内置 Agent 可据此人工改写。


src/features/Migrations/SillyTavern/convert/external-template-converter.ts

export interface ExternalTemplateContext {
	characterFileName: string;
	userName?: string;
	character?: Record<string, string | string[]>;
}

export interface ExternalTemplateIssue {
	syntax: "sillytavern-macro" | "st-prompt-template-ejs";
	name: string;
	reason: string;
}

export interface ExternalTemplateConversion {
	text: string;
	issues: ExternalTemplateIssue[];
}

interface MacroToken {
	start: number;
	end: number;
	raw: string;
	body: string;
	nested: boolean;
}

const unsupportedEjsRuntime = new Map<string, string>([
	[
		"await",
		"PulsarAI 的 Markdown/Chat 动态表达式是同步求值，不能等待异步 EJS。",
	],
	["include", "EJS include 没有可验证的模板根路径；应改用 import() 显式引用。"],
	["SillyTavern", "不向 PulsarAI 执行层注入 SillyTavern API 兼容对象。"],
	["TavernHelper", "不向 PulsarAI 执行层注入 TavernHelper API。"],
	["getwi", "世界书读取必须改用来源作用域内的 imports() / slot.import()。"],
	[
		"getWorldInfo",
		"世界书读取必须改用来源作用域内的 imports() / slot.import()。",
	],
	[
		"getchat",
		"聊天访问应使用当前 Sandbox 的 chat/activePath，无法保持原扩展调用契约。",
	],
	[
		"getChatMessages",
		"聊天访问应使用当前 Sandbox 的 chat/activePath，无法保持原扩展调用契约。",
	],
	["getchar", "角色资源查询缺少与原扩展相同的角色数据库和模板契约。"],
	["inject", "任意注入事件不能映射为一个稳定的 Plugin 容器位置。"],
	["getPromptsInjected", "PulsarAI 没有 SillyTavern PromptManager 注入表。"],
	["eventSource", "不会复制 SillyTavern 通用事件总线。"],
	["document", "模板不得依赖 SillyTavern DOM。"],
	["window", "模板不得依赖 SillyTavern 页面全局对象。"],
	["jQuery", "模板不得依赖 SillyTavern/jQuery UI。"],
	["toastr", "模板渲染不负责 UI 通知。"],
	["fetch", "迁移模板不得通过网络补齐外部状态。"],
	["WebSocket", "迁移模板不得建立外部网络连接。"],
	["XMLHttpRequest", "迁移模板不得建立外部网络连接。"],
	["EventSource", "迁移模板不得建立外部事件连接。"],
	["Worker", "迁移模板不得创建脱离生成生命周期的 Worker。"],
	["eval", "不允许迁移模板再次执行动态代码生成。"],
	["Function", "不允许迁移模板再次执行动态代码生成。"],
	[
		"import",
		"EJS 模板不能动态加载模块；资源必须通过 Plugin imports 显式声明。",
	],
	["require", "EJS 模板不能加载 Node/CommonJS 模块。"],
	["localStorage", "模板只能通过生成的 getvar/setvar 命名空间访问存储。"],
	["capabilities", "外部 EJS 不能直接取得 PulsarAI Feature API。"],
	["runProcess", "外部 EJS 不能启动 Plugin 流程。"],
	["agent", "外部 EJS 不能直接调用 Agent。"],
	["skills", "外部 EJS 不能直接调用 Skill。"],
	["mcp", "外部 EJS 不能直接调用 MCP。"],
]);

/**
 * Shared import-time boundary for foreign prompt syntaxes. The output contains
 * only PulsarAI's existing `{{ JavaScript }}` expressions; no parser is added
 * to the normal Sandbox execution path.
 */
export function convertExternalTemplateText(
	input: string,
	context: ExternalTemplateContext,
): ExternalTemplateConversion {
	const macro = convertSillyTavernSimpleMacros(input, context);
	const ejs = convertStPromptTemplateEjs(macro.text);
	return {
		text: ejs.text,
		issues: uniqueIssues([...macro.issues, ...ejs.issues]),
	};
}

export function convertSillyTavernSimpleMacros(
	input: string,
	context: ExternalTemplateContext,
): ExternalTemplateConversion {
	const issues: ExternalTemplateIssue[] = [];
	const tokens = scanMacroTokens(input);
	const scopedRanges = findScopedRanges(tokens);
	const skipped = new Set<number>();
	const replacements: Array<{ start: number; end: number; value: string }> = [];

	for (const range of scopedRanges) {
		range.tokenIndexes.forEach((index) => skipped.add(index));
		const name = macroName(tokens[range.openIndex]?.body ?? "scope");
		const reason = "作用域、闭合标签和 if/else 控制流不属于单纯宏转换范围。";
		issues.push({ syntax: "sillytavern-macro", name, reason });
		replacements.push({
			start: tokens[range.openIndex]!.start,
			end: tokens[range.closeIndex]!.end,
			value: unsupportedExpression("ST scoped macro", reason),
		});
	}

	tokens.forEach((token, index) => {
		if (skipped.has(index)) return;
		const converted = convertMacroToken(token, context);
		if ("issue" in converted) issues.push(converted.issue);
		replacements.push({
			start: token.start,
			end: token.end,
			value: converted.value,
		});
	});

	return {
		text: applyReplacements(input, replacements),
		issues: uniqueIssues(issues),
	};
}

export function convertStPromptTemplateEjs(
	input: string,
): ExternalTemplateConversion {
	if (!/<%[\s\S]*?%>/.test(input)) return { text: input, issues: [] };
	const issues: ExternalTemplateIssue[] = [];
	const blocked = findBlockedEjsRuntime(input);
	if (blocked.length) {
		blocked.forEach(([name, reason]) =>
			issues.push({
				syntax: "st-prompt-template-ejs",
				name,
				reason,
			}),
		);
		return {
			text: commentEjsRegion(
				input,
				unsupportedExpression(
					"ST-Prompt-Template EJS",
					`已注释不可用 EJS：${blocked.map(([name]) => name).join(", ")}`,
				),
			),
			issues: uniqueIssues(issues),
		};
	}

	try {
		return { text: compileEjsToSandboxExpression(input), issues };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		issues.push({ syntax: "st-prompt-template-ejs", name: "template", reason });
		return {
			text: commentEjsRegion(
				input,
				unsupportedExpression("ST-Prompt-Template EJS", reason),
			),
			issues,
		};
	}
}

function convertMacroToken(
	token: MacroToken,
	context: ExternalTemplateContext,
) {
	const body = token.body.trim();
	const name = macroName(body);
	const unsupported = (reason: string) => ({
		value: unsupportedExpression(`ST macro ${name || "unknown"}`, reason),
		issue: {
			syntax: "sillytavern-macro" as const,
			name: name || "unknown",
			reason,
		},
	});
	if (token.nested) return unsupported("嵌套宏不属于单纯宏转换范围。");
	if (!body) return unsupported("空宏没有可转换的函数名称。");
	if (/^[!?#~>/. $]/.test(body)) {
		if (body.startsWith("//"))
			return { value: `{{("" /* SillyTavern comment */)}}` };
		return unsupported(
			"宏标志、闭合标签、注释块或变量简写不属于单纯宏转换范围。",
		);
	}
	const parsed = parseMacro(body);
	if (!parsed) return unsupported("宏名称或参数语法无法可靠解析。");
	const expression = macroExpression(parsed.name, parsed.args, context);
	if (!expression) return unsupported(unsupportedMacroReason(parsed.name));
	return { value: `{{(${expression})}}` };
}

function macroExpression(
	nameInput: string,
	args: string[],
	context: ExternalTemplateContext,
) {
	const name = nameInput.toLocaleLowerCase();
	const character = context.character ?? {};
	const literal = (value: unknown) => JSON.stringify(value ?? "");
	const arg = (index: number, fallback = "") =>
		literal(args[index] ?? fallback);
	const localKey = (key: string) =>
		`("pulsar:sillytavern:local:" + packageId + ":" + conversationId + ":" + String(${key}))`;
	const globalKey = (key: string) =>
		`("pulsar:sillytavern:global:" + String(${key}))`;
	const read = (key: string) =>
		`JSON.parse(localStorage.getItem(${key}) ?? "\\"\\"")`;
	const write = (key: string, value: string) =>
		`(localStorage.setItem(${key}, JSON.stringify(${value})), "")`;
	const messageContent = (message: string) =>
		`(typeof ${message}?.content === "string" ? ${message}.content : "")`;
	const lastMessage = "chat[chat.length - 1]";
	const findLastRole = (role: string) =>
		`chat.slice().reverse().find((message) => message.role === ${literal(role)})`;

	switch (name) {
		case "char":
		case "bot":
		case "group":
		case "groupnotmuted":
		case "charifnotgroup":
			return `(capabilities.conversation.listPackages().find((item) => item.id === packageId)?.nickname ?? capabilities.conversation.listPackages().find((item) => item.id === packageId)?.name ?? ${literal(context.characterFileName)})`;
		case "user":
			return literal(context.userName || "User");
		case "notchar":
			return literal(context.userName || "User");
		case "description":
			return `(capabilities.conversation.listPackages().find((item) => item.id === packageId)?.description ?? ${literal(character.description)})`;
		case "personality":
			return character.personality == null
				? null
				: literal(character.personality);
		case "scenario":
			return character.scenario == null ? null : literal(character.scenario);
		case "persona":
			return character.persona == null ? null : literal(character.persona);
		case "charprompt":
		case "systemprompt":
			return character.systemPrompt == null
				? null
				: literal(character.systemPrompt);
		case "charinstruction":
			return character.instruction == null
				? null
				: literal(character.instruction);
		case "chardepthprompt":
			return character.depthPrompt == null
				? null
				: literal(character.depthPrompt);
		case "charcreatornotes":
			return character.creatorNotes == null
				? null
				: literal(character.creatorNotes);
		case "charversion":
			return character.version == null ? null : literal(character.version);
		case "mesexamples":
		case "mesexamplesraw":
			return character.messageExamples == null
				? null
				: literal(character.messageExamples);
		case "charfirstmessage": {
			const greetings = Array.isArray(character.greetings)
				? character.greetings
				: [];
			const requested = Number(args[0] ?? 0);
			return literal(
				greetings[Number.isFinite(requested) ? requested : 0] ??
					greetings[0] ??
					"",
			);
		}
		case "lastmessage":
			return messageContent(lastMessage);
		case "lastuseridmessage":
		case "lastusermessage":
			return messageContent(findLastRole("user"));
		case "lastcharmessage":
		case "lastchatmessage":
			return messageContent(findLastRole("assistant"));
		case "lastmessageid":
			return `String(Math.max(0, chat.length - 1))`;
		case "allchatrange":
			return `("0-" + String(Math.max(0, chat.length - 1)))`;
		case "getvar":
			return read(localKey(arg(0)));
		case "setvar":
			return write(localKey(arg(0)), arg(1));
		case "hasvar":
			return `String(localStorage.getItem(${localKey(arg(0))}) !== null)`;
		case "deletevar":
			return `(localStorage.removeItem(${localKey(arg(0))}), "")`;
		case "incvar":
			return incrementExpression(localKey(arg(0)), 1);
		case "decvar":
			return incrementExpression(localKey(arg(0)), -1);
		case "addvar":
			return addExpression(localKey(arg(0)), arg(1));
		case "getglobalvar":
			return read(globalKey(arg(0)));
		case "setglobalvar":
			return write(globalKey(arg(0)), arg(1));
		case "hasglobalvar":
			return `String(localStorage.getItem(${globalKey(arg(0))}) !== null)`;
		case "deleteglobalvar":
			return `(localStorage.removeItem(${globalKey(arg(0))}), "")`;
		case "incglobalvar":
			return incrementExpression(globalKey(arg(0)), 1);
		case "decglobalvar":
			return incrementExpression(globalKey(arg(0)), -1);
		case "addglobalvar":
			return addExpression(globalKey(arg(0)), arg(1));
		case "random":
			return args.length
				? `${JSON.stringify(args)}[Math.floor(Math.random() * ${args.length})]`
				: `""`;
		case "roll":
			return diceExpression(args[0] ?? "1d20");
		case "newline":
			return `"\\n".repeat(Math.max(0, Number(${arg(0, "1")}) || 1))`;
		case "space":
			return `" ".repeat(Math.max(0, Number(${arg(0, "1")}) || 1))`;
		case "noop":
			return `""`;
		case "reverse":
			return `Array.from(String(${arg(0)})).reverse().join("")`;
		case "trim":
			return `String(${arg(0)}).replace(/^\\n+|\\n+$/g, "")`;
		case "input":
			return `String(prompt ?? "")`;
		case "model":
			return `""`;
		case "ismobile":
			return `String(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))`;
		case "time":
			return `new Date(now()).toLocaleTimeString()`;
		case "date":
			return `new Date(now()).toLocaleDateString()`;
		case "weekday":
			return `new Date(now()).toLocaleDateString(undefined, { weekday: "long" })`;
		case "isotime":
			return `new Date(now()).toISOString().slice(11, 16)`;
		case "isodate":
			return `new Date(now()).toISOString().slice(0, 10)`;
		default:
			return null;
	}
}

function incrementExpression(key: string, amount: number) {
	const current = `JSON.parse(localStorage.getItem(${key}) ?? "0")`;
	const next = `(Number(${current}) + ${amount})`;
	return `(localStorage.setItem(${key}, JSON.stringify(${next})), JSON.parse(localStorage.getItem(${key}) ?? "0"))`;
}

function addExpression(key: string, value: string) {
	const current = `JSON.parse(localStorage.getItem(${key}) ?? "\\"\\"")`;
	const next = `(Number.isFinite(Number(${current})) && Number.isFinite(Number(${value})) ? String(Number(${current}) + Number(${value})) : ${current} + String(${value}))`;
	return `(localStorage.setItem(${key}, JSON.stringify(${next})), "")`;
}

function diceExpression(input: string) {
	const match = /^\s*(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?\s*$/i.exec(input);
	if (!match) return null;
	const count = Math.min(100, Math.max(1, Number(match[1] || 1)));
	const sides = Math.max(1, Number(match[2]));
	const modifier = Number(match[4] || 0) * (match[3] === "-" ? -1 : 1);
	return `(Array.from({ length: ${count} }, () => 1 + Math.floor(Math.random() * ${sides})).reduce((sum, value) => sum + value, 0) + ${modifier})`;
}

function unsupportedMacroReason(name: string) {
	const runtimeReasons: Record<string, string> = {
		summary: "没有可证明等价的 Summarize 扩展状态。",
		original: "原始覆盖消息只存在于 SillyTavern PromptManager 阶段。",
		outlet: "世界书 outlet 应显式迁移为 Plugin 容器，不能按宏键查询。",
		banned: "PulsarAI Chat Completion 流程没有文本补全 banned-word 通道。",
		hasextension: "不会复制 SillyTavern 扩展注册表。",
		pick: "稳定 pick 依赖酒馆聊天位置和 reroll 状态。",
		datetimeformat: "自定义日期格式依赖酒馆使用的格式化库。",
		timediff: "酒馆的人类可读时间差格式没有稳定等价契约。",
		idleduration: "当前环境没有可靠的最后用户活动时间。",
		maxprompt: "当前模板求值阶段没有最终 token 预算。",
		maxcontexttokens: "当前模板求值阶段没有最终上下文 token 预算。",
		maxresponsetokens: "当前模板求值阶段没有最终回复 token 预算。",
	};
	return (
		runtimeReasons[name.toLocaleLowerCase()] ??
		"没有已验证的 PulsarAI 数据来源或等价运行时契约。"
	);
}

function compileEjsToSandboxExpression(input: string) {
	const pattern = /<%([#=_-]?)([\s\S]*?)([-_])?%>/g;
	const body: string[] = [];
	let cursor = 0;
	for (const match of input.matchAll(pattern)) {
		if (match.index == null) continue;
		const literal = input.slice(cursor, match.index);
		if (literal) body.push(`__out.push(${jsStringLiteral(literal)});`);
		const marker = match[1] ?? "";
		const source = (match[2] ?? "").trim();
		if (marker === "#") {
			body.push("/* EJS comment removed during migration. */");
		} else if (marker === "=" || marker === "-") {
			body.push(`__out.push(__string(${source || '""'}));`);
		} else {
			body.push(source);
		}
		cursor = match.index + match[0].length;
	}
	if (cursor < input.length)
		body.push(`__out.push(${jsStringLiteral(input.slice(cursor))});`);
	if (!body.length) throw new Error("EJS 标签无法解析。 ");
	const source = [
		"{{((() => {",
		"const __out = [];",
		'const __string = (value) => value == null ? "" : String(value);',
		"const print = (...values) => { __out.push(...values.map(__string)); };",
		'const __localKey = (name) => "pulsar:sillytavern:local:" + packageId + ":" + conversationId + ":" + String(name);',
		'const __globalKey = (name) => "pulsar:sillytavern:global:" + String(name);',
		"const getvar = (name) => JSON.parse(localStorage.getItem(__localKey(name)) ?? '\"\"');",
		'const setvar = (name, value) => { localStorage.setItem(__localKey(name), JSON.stringify(value)); return ""; };',
		"const getglobalvar = (name) => JSON.parse(localStorage.getItem(__globalKey(name)) ?? '\"\"');",
		'const setglobalvar = (name, value) => { localStorage.setItem(__globalKey(name), JSON.stringify(value)); return ""; };',
		"const variables = new Proxy(Object.create(null), {",
		"get: (_target, name) => getvar(name),",
		"set: (_target, name, value) => { setvar(name, value); return true; },",
		"has: (_target, name) => localStorage.getItem(__localKey(name)) !== null,",
		"deleteProperty: (_target, name) => { localStorage.removeItem(__localKey(name)); return true; },",
		"});",
		...body,
		'return __out.join("");',
		"})()) }}",
	].join("\n");
	if (source.slice(0, -2).includes("}}")) {
		throw new Error(
			"EJS JavaScript 包含与 PulsarAI 动态表达式结束符冲突的连续右花括号。 ",
		);
	}
	return source;
}

function commentEjsRegion(input: string, comment: string) {
	const start = input.indexOf("<%");
	const end = input.lastIndexOf("%>");
	if (start < 0 || end < start) return input;
	return input.slice(0, start) + comment + input.slice(end + 2);
}

function jsStringLiteral(value: string) {
	return JSON.stringify(value).replace(/}/g, "\\u007d");
}

function findBlockedEjsRuntime(input: string) {
	const blocked: Array<[string, string]> = [];
	const executableSource = Array.from(
		input.matchAll(/<%([#=_-]?)([\s\S]*?)(?:[-_])?%>/g),
	)
		.filter((match) => match[1] !== "#")
		.map((match) => match[2] ?? "")
		.join("\n");
	for (const [name, reason] of unsupportedEjsRuntime) {
		const pattern =
			name === "await"
				? /\bawait\b/
				: new RegExp(`\\b${escapeRegExp(name)}\\b`);
		if (pattern.test(executableSource)) blocked.push([name, reason]);
	}
	return blocked;
}

function scanMacroTokens(input: string) {
	const tokens: MacroToken[] = [];
	for (let index = 0; index < input.length - 1; ) {
		if (input[index] !== "{" || input[index + 1] !== "{") {
			index += 1;
			continue;
		}
		const start = index;
		let depth = 1;
		let nested = false;
		index += 2;
		while (index < input.length - 1 && depth > 0) {
			if (input[index] === "{" && input[index + 1] === "{") {
				depth += 1;
				nested = true;
				index += 2;
			} else if (input[index] === "}" && input[index + 1] === "}") {
				depth -= 1;
				index += 2;
			} else {
				index += 1;
			}
		}
		if (depth !== 0) break;
		const raw = input.slice(start, index);
		tokens.push({ start, end: index, raw, body: raw.slice(2, -2), nested });
	}
	return tokens;
}

function findScopedRanges(tokens: MacroToken[]) {
	const ranges: Array<{
		openIndex: number;
		closeIndex: number;
		tokenIndexes: number[];
	}> = [];
	const consumed = new Set<number>();
	tokens.forEach((token, closeIndex) => {
		const close = /^\s*\/\s*([A-Za-z][\w-]*)\s*$/.exec(token.body);
		if (!close) return;
		const name = close[1]!.toLocaleLowerCase();
		for (let openIndex = closeIndex - 1; openIndex >= 0; openIndex -= 1) {
			if (consumed.has(openIndex)) continue;
			if (macroName(tokens[openIndex]!.body) !== name) continue;
			const tokenIndexes = Array.from(
				{ length: closeIndex - openIndex + 1 },
				(_, offset) => openIndex + offset,
			);
			tokenIndexes.forEach((index) => consumed.add(index));
			ranges.push({ openIndex, closeIndex, tokenIndexes });
			break;
		}
	});
	return ranges;
}

function parseMacro(body: string) {
	const doubleColon = body.split(/\s*::\s*/);
	if (doubleColon.length > 1) {
		const [name, ...args] = doubleColon;
		return validMacroName(name) ? { name: name!.trim(), args } : null;
	}
	const legacy = /^([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/.exec(body);
	if (legacy) return { name: legacy[1]!, args: [legacy[2]!] };
	const spaced = /^([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(body.trim());
	return spaced
		? { name: spaced[1]!, args: spaced[2] == null ? [] : [spaced[2]] }
		: null;
}

function macroName(body: string) {
	return (
		/^\s*[#?!~>]*\s*\/?\s*([A-Za-z][\w-]*)/.exec(body)?.[1] ?? "unknown"
	).toLocaleLowerCase();
}

function validMacroName(value?: string) {
	return Boolean(value && /^[A-Za-z][\w-]*$/.test(value.trim()));
}

function unsupportedExpression(label: string, reason: string) {
	const comment = `${label}: ${reason}`
		.replace(/\*\//g, "* /")
		.replace(/[\r\n]+/g, " ");
	return `{{("" /* ${comment} */)}}`;
}

function applyReplacements(
	input: string,
	replacements: Array<{ start: number; end: number; value: string }>,
) {
	return [...replacements]
		.sort((left, right) => right.start - left.start)
		.reduce(
			(text, replacement) =>
				text.slice(0, replacement.start) +
				replacement.value +
				text.slice(replacement.end),
			input,
		);
}

function uniqueIssues(issues: ExternalTemplateIssue[]) {
	const seen = new Set<string>();
	return issues.filter((issue) => {
		const key = `${issue.syntax}:${issue.name}:${issue.reason}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


src/features/Migrations/SillyTavern/convert/migration-artifact.ts

import type {
	MigrationDiagnostic,
	MigrationSourceReference,
} from "./migration-diagnostic";
import type { SillyTavernPresetKind } from "./source-types";

export interface MigrationArtifactBase {
	id: string;
	source: MigrationSourceReference;
	diagnostics: MigrationDiagnostic[];
	unconsumedFields: string[];
}

export interface MigratedRegexRule {
	find_regex: string;
	replace_regex: string;
	range: "user_input" | "ai_output" | "all";
	depth_min: number | "INF";
	depth_max: number | "INF";
	applyOnRendering: boolean;
}

export interface MigratedLorebookEntry {
	id: string;
	name: string;
	content: string;
	enabled: boolean;
	order: number;
	insertionTarget: string;
	condition?: string;
	source: MigrationSourceReference;
}

export interface LocalPluginMigrationArtifact extends MigrationArtifactBase {
	kind: "character-package";
	name: string;
	nickname: string;
	description: string;
	avatarPath?: string;
	characterMarkdown: string;
	firstMessage: string;
	alternateGreetings: string[];
	embeddedLorebooks: MigratedLorebookEntry[];
	regexRules: MigratedRegexRule[];
	boundWorldbookNames: string[];
}

export interface WorldbookMigrationArtifact extends MigrationArtifactBase {
	kind: "worldbook";
	name: string;
	entries: MigratedLorebookEntry[];
	embeddedInCharacterId?: string;
}

export interface ConversationMigrationMessage {
	role: "assistant" | "user" | "system";
	versions: Array<{
		content: string;
		createdAt: string;
		modelName?: string;
	}>;
	activeVersion: number;
}

export interface ConversationMigrationArtifact extends MigrationArtifactBase {
	kind: "conversation";
	title: string;
	characterName: string;
	userName: string;
	createdAt: string;
	messages: ConversationMigrationMessage[];
}

export interface PresetMigrationArtifact extends MigrationArtifactBase {
	kind: "preset";
	name: string;
	presetKind: SillyTavernPresetKind;
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
	depthDocuments: Array<{
		identifier: string;
		name: string;
		role: "system" | "user" | "assistant";
		content: string;
		depth: number;
		order: number;
		enabled: boolean;
	}>;
	regexRules: MigratedRegexRule[];
	rawConfiguration: Record<string, unknown>;
}

export interface BackgroundMigrationArtifact extends MigrationArtifactBase {
	kind: "background";
	name: string;
	path: string;
	selected: boolean;
}

export interface UserPersonaMigrationArtifact extends MigrationArtifactBase {
	kind: "user-persona";
	name: string;
	markdown: string;
	avatarPath?: string;
}

export interface QuickReplyMigrationArtifact extends MigrationArtifactBase {
	kind: "quick-reply";
	name: string;
	content: string;
	setName: string;
}

export interface ProviderMigrationArtifact extends MigrationArtifactBase {
	kind: "provider";
	providerId: string;
	name: string;
	baseUrl: string;
	modelIds: string[];
	secretValue?: string;
}

export interface IgnoredMigrationArtifact extends MigrationArtifactBase {
	kind: "ignored";
	reason: string;
	originalKind: string;
}

export type SillyTavernMigrationArtifact =
	| LocalPluginMigrationArtifact
	| WorldbookMigrationArtifact
	| ConversationMigrationArtifact
	| PresetMigrationArtifact
	| BackgroundMigrationArtifact
	| UserPersonaMigrationArtifact
	| QuickReplyMigrationArtifact
	| ProviderMigrationArtifact
	| IgnoredMigrationArtifact;

export interface SillyTavernConversionResult {
	artifacts: SillyTavernMigrationArtifact[];
	diagnostics: MigrationDiagnostic[];
	globallySelectedWorldbookNames: string[];
}


src/features/Migrations/SillyTavern/convert/migration-diagnostic.ts

export type MigrationDiagnosticSeverity = "info" | "warning" | "error";

export interface MigrationSourceReference {
	path: string;
	relativePath: string;
	resourceKind?: string;
	fieldPath?: string;
}

export interface MigrationDiagnostic {
	code: string;
	severity: MigrationDiagnosticSeverity;
	message: string;
	source?: MigrationSourceReference;
	details?: Record<string, unknown>;
}

export function migrationDiagnostic(
	code: string,
	severity: MigrationDiagnosticSeverity,
	message: string,
	source?: MigrationSourceReference,
	details?: Record<string, unknown>,
): MigrationDiagnostic {
	return { code, severity, message, source, details };
}


src/features/Migrations/SillyTavern/convert/placement-plan.ts

import type {
	BackgroundMigrationArtifact,
	ConversationMigrationArtifact,
	LocalPluginMigrationArtifact,
	PresetMigrationArtifact,
	ProviderMigrationArtifact,
	QuickReplyMigrationArtifact,
	UserPersonaMigrationArtifact,
	WorldbookMigrationArtifact,
} from "./migration-artifact";
import type { MigrationDiagnostic } from "./migration-diagnostic";

export interface LocalPluginPlacement {
	id: string;
	pluginId: string;
	artifact: LocalPluginMigrationArtifact;
	conversations: ConversationMigrationArtifact[];
	claimedWorldbooks: WorldbookMigrationArtifact[];
	personas: UserPersonaMigrationArtifact[];
}

export interface GlobalPluginPlacement {
	id: string;
	name: string;
	existing: boolean;
	worldbook?: WorldbookMigrationArtifact;
	presets?: PresetMigrationArtifact[];
	backgrounds?: BackgroundMigrationArtifact[];
	quickReplies?: QuickReplyMigrationArtifact[];
	enabledPackageIds?: string[];
}

export interface SillyTavernPlacementPlan {
	id: string;
	sourceRoot: string;
	createdAt: string;
	packages: LocalPluginPlacement[];
	globalPlugins: GlobalPluginPlacement[];
	providers: ProviderMigrationArtifact[];
	diagnostics: MigrationDiagnostic[];
	conflicts: MigrationDiagnostic[];
	counts: {
		packages: number;
		conversations: number;
		localWorldbooks: number;
		globalWorldbooks: number;
		presets: number;
		backgrounds: number;
		quickReplies: number;
		providers: number;
	};
}


src/features/Migrations/SillyTavern/convert/pulsar-migration-writer.ts

// @ts-nocheck
// This legacy writer is retained for the forthcoming World migration pass.
import type { Pinia } from "pinia";
import {
	createChat,
	persistChat,
} from "@/features/Conversation/chats/chat-service";
import { persistContainer } from "@/features/Conversation/messages/message-service";
import type {
	ChatMessage,
	ChatMessageContainer,
} from "@/features/Conversation/messages/message-types";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import {
	findPluginNodeByPath,
	type Plugin,
	type PluginFile,
	pluginConventions,
	pluginParentPath,
} from "@/features/Plugin/tree/plugin-types";
import { useRequestStore } from "@/features/Request/request-store";
import type {
	ConversationMigrationArtifact,
	MigratedLorebookEntry,
} from "./migration-artifact";
import type {
	GlobalPluginPlacement,
	LocalPluginPlacement,
	SillyTavernPlacementPlan,
} from "./placement-plan";
import type { SillyTavernReaderTransport } from "./source-types";

export interface SillyTavernImportCommitResult {
	planId: string;
	localPluginIds: string[];
	globalPluginIds: string[];
	providerIds: string[];
}

export class PulsarSillyTavernMigrationWriter {
	constructor(
		private readonly pinia: Pinia,
		private readonly transport: SillyTavernReaderTransport,
	) {}

	async commit(
		plan: SillyTavernPlacementPlan,
	): Promise<SillyTavernImportCommitResult> {
		if (
			[...plan.conflicts, ...plan.diagnostics].some(
				(diagnostic) => diagnostic.severity === "error",
			)
		) {
			throw new Error("迁移计划仍有阻断错误，请先修复来源或资源对应关系。");
		}
		const packages = useLocalPluginStore(this.pinia) as any;
		const plugins = usePluginStore(this.pinia);
		const models = useRequestStore(this.pinia);
		await Promise.all([
			packages.initialize(),
			plugins.initialize(),
			models.initialize(),
		]);
		this.assertNoExistingConflicts(
			plan,
			packages.packages.map((item) => item.id),
			plugins.plugins.map((item) => item.id),
			models.providers.map((item) => item.id),
		);

		const createdPackageIds: string[] = [];
		const createdGlobalPluginIds: string[] = [];
		const createdProviderIds: string[] = [];
		const builtinSnapshots = new Map<string, Plugin>();
		for (const placement of plan.globalPlugins.filter(
			(item) => item.existing,
		)) {
			const plugin = plugins.plugins.find((item) => item.id === placement.id);
			if (plugin) builtinSnapshots.set(plugin.id, structuredClone(plugin));
		}
		try {
			for (const placement of plan.packages) {
				createdPackageIds.push(placement.id);
				await this.writePackage(placement);
			}
			for (const placement of plan.globalPlugins) {
				if (placement.existing) {
					await this.extendExistingPlugin(placement);
				} else {
					createdGlobalPluginIds.push(placement.id);
					await this.writeGlobalPlugin(placement);
				}
			}
			for (const provider of plan.providers) {
				createdProviderIds.push(provider.providerId);
				await models.addProvider({
					id: provider.providerId,
					name: provider.name,
					enabled: true,
					params: {
						basic: [
							requestParam("baseURL", provider.baseUrl),
							requestParam("apiKeyName", `${provider.providerId}_API_KEY`),
						],
						text: [],
						image: [],
						video: [],
						speech: [],
						transcribe: [],
						provider: [],
					},
					models: {
						text: [],
						image: [],
						video: [],
						speech: [],
						transcribe: [],
					},
					hydrator: "openai-compatible",
					requestOverride: {},
				});
				for (const modelId of provider.modelIds) {
					await models.addModel(provider.providerId, "text", {
						id: modelId,
						displayName: modelId,
						enabled: true,
					});
				}
			}
			return {
				planId: plan.id,
				localPluginIds: createdPackageIds,
				globalPluginIds: createdGlobalPluginIds,
				providerIds: createdProviderIds,
			};
		} catch (error) {
			for (const providerId of createdProviderIds.reverse()) {
				await models.deleteProvider(providerId).catch(() => undefined);
			}
			for (const pluginId of createdGlobalPluginIds.reverse()) {
				await plugins.deletePlugin(pluginId).catch(() => undefined);
			}
			for (const localPluginId of createdPackageIds.reverse()) {
				await conversation
					.removeLocalPlugin(localPluginId)
					.catch(() => undefined);
			}
			for (const snapshot of builtinSnapshots.values()) {
				const index = plugins.plugins.findIndex(
					(item) => item.id === snapshot.id,
				);
				if (index >= 0)
					plugins.plugins.splice(index, 1, structuredClone(snapshot));
				await plugins.persistPlugin(snapshot).catch(() => undefined);
			}
			throw error;
		}
	}

	private assertNoExistingConflicts(
		plan: SillyTavernPlacementPlan,
		localPluginIds: string[],
		pluginIds: string[],
		providerIds: string[],
	) {
		const conflicts = [
			...plan.packages
				.filter((item) => localPluginIds.includes(item.id))
				.map((item) => `角色包 ${item.id}`),
			...plan.packages
				.filter((item) => pluginIds.includes(item.pluginId))
				.map((item) => `插件 ${item.pluginId}`),
			...plan.globalPlugins
				.filter((item) => !item.existing && pluginIds.includes(item.id))
				.map((item) => `插件 ${item.id}`),
			...plan.providers
				.filter((item) => providerIds.includes(item.providerId))
				.map((item) => `服务商 ${item.providerId}`),
		];
		if (conflicts.length)
			throw new Error(`目标已存在，迁移不会覆盖：${conflicts.join("、")}`);
	}

	private async writePackage(placement: LocalPluginPlacement) {
		const packages = useLocalPluginStore(this.pinia) as any;
		const plugins = usePluginStore(this.pinia);
		const icon = placement.artifact.avatarPath
			? await this.readDataUrl(placement.artifact.avatarPath)
			: "";
		const packageItem = await packages.createPackage(
			{
				id: placement.id,
				pluginId: placement.pluginId,
				name: placement.artifact.name,
				nickname: placement.artifact.nickname,
				description: placement.artifact.description,
				icon,
			},
			{ activate: false },
		);
		const plugin = plugins.plugins.find(
			(item) => item.id === packageItem.pluginId,
		);
		if (!plugin)
			throw new Error(`迁移创建的角色插件不存在：${packageItem.pluginId}`);
		plugin.name = placement.artifact.name;
		plugin.shortDescription = `从 SillyTavern 角色卡 ${placement.artifact.nickname} 导入`;
		plugin.icon = icon;
		configureLocalPlugin(plugin, placement);
		await plugins.persistPlugin(plugin);
		const worldConfig = structuredClone(packageItem.worldConfig);
		worldConfig.disabled = [
			...new Set([
				...worldConfig.disabled.filter(
					(path: string) => path !== "/self/generate.js",
				),
				"/global/core/generate.js",
			]),
		];
		await packages.updatePackage(packageItem.id, { worldConfig });

		for (const chat of placement.conversations) {
			await writeConversation(placement.id, chat, false);
		}
		const greetings = [
			placement.artifact.firstMessage,
			...placement.artifact.alternateGreetings,
		].filter(Boolean);
		if (greetings.length) {
			const template: ConversationMigrationArtifact = {
				id: `${placement.artifact.id}:template`,
				kind: "conversation",
				source: placement.artifact.source,
				diagnostics: [],
				unconsumedFields: [],
				title: "模板会话",
				characterName: placement.artifact.name,
				userName: "",
				createdAt: new Date().toISOString(),
				messages: [
					{
						role: "assistant",
						activeVersion: 0,
						versions: greetings.map((content) => ({
							content,
							createdAt: new Date().toISOString(),
						})),
					},
				],
			};
			await writeConversation(placement.id, template, true);
		}
	}

	private async writeGlobalPlugin(placement: GlobalPluginPlacement) {
		const plugins = usePluginStore(this.pinia);
		const packages = useLocalPluginStore(this.pinia) as any;
		let plugin = await plugins.createGlobalPlugin();
		plugin = (await plugins.renamePluginId(plugin.id, placement.id)) ?? plugin;
		plugin.name = placement.name;
		plugin.shortDescription =
			"从未被角色认领的 SillyTavern 世界书导入；由角色包单独启用。";
		configureGlobalPlugin(plugin, placement);
		await plugins.persistPlugin(plugin);
		const enabledPackages = new Set(placement.enabledPackageIds ?? []);
		for (const packageItem of packages.packages) {
			if (enabledPackages.has(packageItem.id)) continue;
			const worldConfig = structuredClone(packageItem.worldConfig);
			worldConfig.disabled = [
				...new Set([...worldConfig.disabled, `/global/${plugin.id}`]),
			];
			await packages.updatePackage(packageItem.id, {
				worldConfig,
			});
		}
	}

	private async extendExistingPlugin(placement: GlobalPluginPlacement) {
		const plugins = usePluginStore(this.pinia);
		const plugin = plugins.plugins.find((item) => item.id === placement.id);
		if (!plugin) throw new Error(`目标内置插件不存在：${placement.id}`);
		const entryFolder = ensureFolder(plugin, "", "entry");
		for (const preset of placement.presets ?? []) {
			const folder = ensureFolder(plugin, entryFolder, safeName(preset.name));
			upsertFile(plugin, folder, `${safeName(preset.name)}.chat.json`, {
				message: preset.messages,
			});
			for (const [index, document] of preset.depthDocuments.entries()) {
				upsertFile(
					plugin,
					folder,
					`depth-${document.depth}-${String(index + 1).padStart(3, "0")}-${safeName(document.name)}.md`,
					document.content,
					{
						order: document.order,
						insertion: { slot: `depth:${document.depth}`, condition: "false" },
					},
				);
			}
			upsertFile(
				plugin,
				folder,
				`${safeName(preset.name)}.regex.json`,
				preset.regexRules,
			);
			upsertFile(plugin, folder, "configuration.json", preset.rawConfiguration);
		}
		const backgroundFolder = ensureFolder(
			plugin,
			"",
			pluginConventions.backgroundFolder,
		);
		for (const background of placement.backgrounds ?? []) {
			const dataUrl = await this.readDataUrl(background.path);
			const name = safeName(background.name);
			upsertFile(
				plugin,
				backgroundFolder,
				name,
				{
					kind: "media",
					url: dataUrl,
					mediaType: dataUrl.startsWith("data:video/") ? "video" : "image",
				},
				{
					insertion: { slot: "background" },
				},
			);
		}
		const actionsFolder = ensureFolder(
			plugin,
			"",
			pluginConventions.actionFolder,
		);
		const quickRepliesFolder = ensureFolder(
			plugin,
			actionsFolder,
			"quick-replies",
		);
		for (const quickReply of placement.quickReplies ?? []) {
			upsertFile(
				plugin,
				quickRepliesFolder,
				uniqueFileName(
					plugin,
					quickRepliesFolder,
					safeName(quickReply.name),
					"md",
				),
				quickReply.content,
				{ insertion: { slot: "COMMAND" } },
			);
		}
		const migrationFolder = ensureFolder(plugin, "", "migration");
		upsertFile(
			plugin,
			migrationFolder,
			`sillytavern-public-${Date.now()}.json`,
			{
				source: "SillyTavern",
				presets:
					placement.presets?.map((item) => ({
						name: item.name,
						source: item.source,
						diagnostics: item.diagnostics,
					})) ?? [],
				backgrounds:
					placement.backgrounds?.map((item) => ({
						name: item.name,
						source: item.source,
					})) ?? [],
				quickReplies:
					placement.quickReplies?.map((item) => ({
						name: item.name,
						setName: item.setName,
						source: item.source,
					})) ?? [],
				note: "预设入口已保留为普通资源；文本内的单纯宏和同步 EJS 已在导入期转换为 JavaScript。",
			},
		);
		await plugins.persistPlugin(plugin);
	}

	private async readDataUrl(path: string) {
		const binary = await this.transport.readBinary(path);
		return `data:${binary.mediaType};base64,${binary.base64}`;
	}
}

function requestParam(paramName: string, value: unknown) {
	return {
		paramName,
		enableInDefault: false,
		paramComponent: { component: "input", componentParam: {} },
		defaultValue: value,
		value,
	};
}

function configureLocalPlugin(plugin: Plugin, placement: LocalPluginPlacement) {
	const characterFolder = ensureFolder(plugin, "", "character");
	upsertFile(
		plugin,
		characterFolder,
		"main.md",
		placement.artifact.characterMarkdown,
		{
			insertion: { slot: "context" },
		},
	);
	const userFolder = ensureFolder(plugin, characterFolder, "user");
	for (const persona of placement.personas) {
		upsertFile(
			plugin,
			userFolder,
			`${safeName(persona.name)}.md`,
			persona.markdown || `# ${persona.name}`,
			{
				insertion: { slot: "user" },
			},
		);
	}
	const lorebooksFolder = ensureFolder(plugin, "", "lorebooks");
	const embeddedFolder = ensureFolder(plugin, lorebooksFolder, "embedded");
	writeLorebookEntries(
		plugin,
		embeddedFolder,
		placement.artifact.name,
		placement.artifact.embeddedLorebooks,
	);
	for (const worldbook of placement.claimedWorldbooks) {
		writeLorebookEntries(
			plugin,
			lorebooksFolder,
			worldbook.name,
			worldbook.entries,
		);
	}
	const regexFile = findPluginNodeByPath(plugin, pluginConventions.regex);
	if (regexFile?.kind === "file")
		regexFile.content = placement.artifact.regexRules;
	const defaultChat = findPluginNodeByPath(plugin, "default.chat.json");
	if (defaultChat?.kind === "file") {
		defaultChat.content = {
			message: [{ role: "system", content: "[[ chat ]]" }],
		};
	}
	const generate = findPluginNodeByPath(plugin, "generate.js");
	if (generate?.kind === "file") generate.content = sillyTavernGenerateSource();
	const migrationFolder = ensureFolder(plugin, "", "migration");
	upsertFile(plugin, migrationFolder, "sillytavern-import-report.json", {
		source: placement.artifact.source,
		character: {
			name: placement.artifact.name,
			nickname: placement.artifact.nickname,
			unconsumedFields: placement.artifact.unconsumedFields,
		},
		claimedWorldbooks: placement.claimedWorldbooks.map((item) => ({
			name: item.name,
			source: item.source,
		})),
		conversations: placement.conversations.map((item) => ({
			title: item.title,
			source: item.source,
		})),
		diagnostics: placement.artifact.diagnostics,
		unsupportedTemplateSyntax: placement.artifact.diagnostics.filter(
			(item) =>
				item.code === "sillytavern.macro.unsupported" ||
				item.code === "sillytavern.ejs.unsupported",
		),
	});
}

function configureGlobalPlugin(
	plugin: Plugin,
	placement: GlobalPluginPlacement,
) {
	const slots = findPluginNodeByPath(plugin, pluginConventions.slots);
	if (slots?.kind === "file") {
		slots.content = {
			slots: [
				{
					id: "context",
					title: "世界书上下文",
					parent: "document",
					description: "从 SillyTavern 世界书导入的上下文条目。",
					contentSuffixes: ["md"],
					selectionMode: "none",
				},
			],
		};
	}
	const lorebooks = ensureFolder(plugin, "", "lorebooks");
	if (placement.worldbook) {
		writeLorebookEntries(
			plugin,
			lorebooks,
			placement.worldbook.name,
			placement.worldbook.entries,
		);
	}
	const migrationFolder = ensureFolder(plugin, "", "migration");
	upsertFile(plugin, migrationFolder, "sillytavern-import-report.json", {
		source: placement.worldbook?.source,
		unconsumedFields: placement.worldbook?.unconsumedFields ?? [],
		diagnostics: placement.worldbook?.diagnostics ?? [],
	});
}

function writeLorebookEntries(
	plugin: Plugin,
	parentPath: string,
	bookName: string,
	entries: MigratedLorebookEntry[],
) {
	const folder = ensureFolder(plugin, parentPath, safeName(bookName));
	for (const [index, entry] of entries.entries()) {
		upsertFile(
			plugin,
			folder,
			`${String(index + 1).padStart(3, "0")}-${safeName(entry.name)}.md`,
			entry.content,
			{
				order: entry.order,
				...(entry.enabled
					? {
							insertion: {
								slot: entry.insertionTarget,
								...(entry.condition ? { condition: entry.condition } : {}),
							},
						}
					: {}),
			},
		);
	}
}

async function writeConversation(
	localPluginId: string,
	artifact: ConversationMigrationArtifact,
	template: boolean,
) {
	const conversation = await createChat({
		localPluginId,
		title: artifact.title,
		isTemplate: template,
		createdAt: artifact.createdAt,
		updatedAt: artifact.createdAt,
	});
	const logicalMessages = artifact.messages;
	if (!logicalMessages.length) {
		return;
	}
	const containers: ChatMessageContainer[] = logicalMessages.map((message) => ({
		id: crypto.randomUUID(),
		role: message.role,
		conversationid: conversation.id,
		currentindex: message.activeVersion,
		content: message.versions.map(
			(version): ChatMessage => ({
				id: crypto.randomUUID(),
				type: "message",
				content: version.content,
				createdAt: version.createdAt,
				meta: {
					...(version.modelName
						? {
								generateInfo: {
									modelName: version.modelName,
									startTime: version.createdAt,
								},
							}
						: {}),
					steps: [],
				},
			}),
		),
		availablenextcontainer: [],
		activenextcontainer: null,
		previouscontainer: null,
	}));
	containers.forEach((container, index) => {
		const previous = containers[index - 1];
		const next = containers[index + 1];
		container.previouscontainer = previous?.id ?? null;
		container.activenextcontainer = next?.id ?? null;
	});
	for (const container of containers) {
		await persistContainer(container);
	}
	conversation.rootcontainerid = containers[0]!.id;
	conversation.lastcontainerid = containers[containers.length - 1]!.id;
	await persistChat(conversation);
}

function siblingCount(plugin: Plugin, parentPath: string) {
	return plugin.files.filter(
		(file) => pluginParentPath(file.path) === parentPath,
	).length;
}

function ensureFolder(
	plugin: Plugin,
	parentPath: string,
	name: string,
): string {
	const path = parentPath ? `${parentPath}/${name}` : name;
	if (!plugin.files.some((file) => file.path.startsWith(`${path}/`))) {
		plugin.emptyFolders = plugin.emptyFolders.filter(
			(folder) => !path.startsWith(`${folder}/`),
		);
		if (!plugin.emptyFolders.includes(path)) plugin.emptyFolders.push(path);
	}
	return path;
}

function upsertFile(
	plugin: Plugin,
	parentPath: string,
	name: string,
	content: unknown,
	input:
		| Pick<PluginFile, "order" | "insertion">
		| { order?: number; insertion?: PluginFile["insertion"] } = {},
) {
	const path = parentPath ? `${parentPath}/${name}` : name;
	const existing = plugin.files.find((node) => node.path === path);
	if (existing) {
		existing.content = structuredClone(content);
		existing.order = input.order ?? existing.order;
		if (input.insertion) existing.insertion = structuredClone(input.insertion);
		else delete existing.insertion;
		return existing;
	}
	const file: PluginFile = {
		id: crypto.randomUUID(),
		path,
		name,
		icon: "",
		treeOrder: siblingCount(plugin, parentPath),
		kind: "file",
		content: structuredClone(content),
		order: input.order ?? 100,
		...(input.insertion ? { insertion: structuredClone(input.insertion) } : {}),
	};
	plugin.files.push(file);
	plugin.emptyFolders = plugin.emptyFolders.filter(
		(folder) => path !== folder && !path.startsWith(`${folder}/`),
	);
	return file;
}

function safeName(value: string) {
	const normalized = value
		.trim()
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
		.replace(/\s+/g, " ");
	return normalized || "untitled";
}

function uniqueFileName(
	plugin: Plugin,
	parentPath: string,
	base: string,
	extension: string,
) {
	const existing = new Set(
		plugin.files
			.filter((node) => pluginParentPath(node.path) === parentPath)
			.map((node) => node.name.toLocaleLowerCase()),
	);
	for (let index = 1; ; index += 1) {
		const suffix = index === 1 ? "" : `-${index}`;
		const candidate = `${base}${suffix}.${extension}`;
		if (!existing.has(candidate.toLocaleLowerCase())) return candidate;
	}
}

function sillyTavernGenerateSource() {
	const source = [
		'const localContext = await slot.import("context", "local");',
		'const globalContext = await slot.import("context", "global");',
		'const depth0 = await slot.import("depth:0", "global");',
		'const depth1 = await slot.import("depth:1", "global");',
		'const depth2 = await slot.import("depth:2", "global");',
		'const depth3 = await slot.import("depth:3", "global");',
		'const depth4 = await slot.import("depth:4", "global");',
		'const depth5 = await slot.import("depth:5", "global");',
		'const depth6 = await slot.import("depth:6", "global");',
		'const regexRules = await slot.import("REGEX", "global").then((items) => items.flatMap((value) => Array.isArray(value) ? value : []));',
		"const applyRules = (text, role, depth) => regexRules.reduce((current, rule) => {",
		"  if (!rule || rule.applyOnRendering) return current;",
		'  if (rule.range !== "all" && !(rule.range === "user_input" && role === "user") && !(rule.range === "ai_output" && role === "assistant")) return current;',
		'  const min = rule.depth_min === "INF" ? 1 : Number(rule.depth_min || 1);',
		'  const max = rule.depth_max === "INF" ? Infinity : Number(rule.depth_max || Infinity);',
		"  if (depth < Math.min(min, max) || depth > Math.max(min, max)) return current;",
		"  try { const match = /^\\/(.*)\\/([a-z]*)$/.exec(rule.find_regex); return current.replace(match ? new RegExp(match[1], match[2]) : new RegExp(rule.find_regex, 'g'), rule.replace_regex || ''); } catch { return current; }",
		"}, text);",
		'const config = await imports("@/config.json");',
		"const prepared = (await memory.prepare({ compressionThreshold: Number(config.compressionThreshold?.value) || 0 })).messages.map((message, index, all) => ({ ...message, content: typeof message.content === 'string' ? applyRules(message.content, message.role, all.length - index) : message.content }));",
		"const history = [...prepared];",
		"const depthBlocks = [depth0, depth1, depth2, depth3, depth4, depth5, depth6];",
		"depthBlocks.forEach((blocks, depth) => { if (blocks.length) history.splice(Math.max(0, history.length - depth), 0, { role: 'system', content: blocks.map(String).join('\\n\\n') }); });",
		"const context = [...localContext, ...globalContext].filter(Boolean).map(String).join('\\n\\n');",
		"const messages = [...bootstrapMessages, ...(context ? [{ role: 'system', content: context }] : []), ...await parse('./default.chat.json', { chat: history, CHAT: history })];",
		"const runner = new agent.ToolLoopAgent({ container: reply });",
		"await runner.stream({ messages });",
		"  const complete = reply.read().message.content;",
		"  await reply.setContent(applyRules(complete, 'assistant', 1));",
	];
	return source.join("\n");
}


src/features/Migrations/SillyTavern/convert/sillytavern-converter.ts

import {
	convertExternalTemplateText,
	type ExternalTemplateContext,
} from "./external-template-converter";
import type {
	BackgroundMigrationArtifact,
	ConversationMigrationArtifact,
	ConversationMigrationMessage,
	IgnoredMigrationArtifact,
	LocalPluginMigrationArtifact,
	MigratedLorebookEntry,
	MigratedRegexRule,
	PresetMigrationArtifact,
	ProviderMigrationArtifact,
	QuickReplyMigrationArtifact,
	SillyTavernConversionResult,
	SillyTavernMigrationArtifact,
	UserPersonaMigrationArtifact,
	WorldbookMigrationArtifact,
} from "./migration-artifact";
import {
	type MigrationDiagnostic,
	type MigrationSourceReference,
	migrationDiagnostic,
} from "./migration-diagnostic";
import type {
	SillyTavernCharacterSource,
	SillyTavernParsedResource,
	SillyTavernPresetSource,
	SillyTavernSourceSnapshot,
	SillyTavernWorldbookSource,
} from "./source-types";

export function convertSillyTavernSnapshot(
	snapshot: SillyTavernSourceSnapshot,
): SillyTavernConversionResult {
	const artifacts: SillyTavernMigrationArtifact[] = [];
	const diagnostics = [...snapshot.diagnostics];
	const lorebookDefaults = worldbookDefaults(snapshot.settings);
	const selectedBackground = selectedBackgroundName(snapshot.settings);
	const globalRegexRules = convertGlobalRegex(snapshot, diagnostics);

	for (const character of snapshot.characters) {
		const artifact = convertCharacter(character, lorebookDefaults);
		artifact.regexRules.push(...structuredClone(globalRegexRules));
		artifacts.push(artifact);
		diagnostics.push(...artifact.diagnostics);
	}
	for (const worldbook of snapshot.worldbooks) {
		const artifact = convertWorldbook(
			worldbook,
			Boolean(worldbook.embeddedInCharacterId),
			lorebookDefaults,
		);
		artifacts.push(artifact);
		diagnostics.push(...artifact.diagnostics);
	}
	for (const chat of snapshot.chats) {
		const artifact = convertConversation(chat);
		artifacts.push(artifact);
		diagnostics.push(...artifact.diagnostics);
	}
	for (const preset of snapshot.presets) {
		if (preset.presetKind !== "openai") continue;
		const artifact = convertPreset(preset);
		artifacts.push(artifact);
		diagnostics.push(...artifact.diagnostics);
	}
	appendArtifacts(artifacts, diagnostics, convertPersonas(snapshot));
	appendArtifacts(artifacts, diagnostics, convertQuickReplies(snapshot));
	appendArtifacts(artifacts, diagnostics, convertProviders(snapshot));

	for (const resource of snapshot.resources) {
		if (resource.discrimination.kind === "background") {
			appendArtifacts(artifacts, diagnostics, [
				backgroundArtifact(
					resource,
					normalizedResourceName(resource.entry.name) ===
						normalizedResourceName(selectedBackground),
				),
			]);
		} else if (["theme", "macro"].includes(resource.discrimination.kind)) {
			const artifact = ignoredArtifact(
				resource,
				resource.discrimination.kind === "theme"
					? "SillyTavern 主题 CSS 和 PulsarAI 主题结构不同，不自动迁移。"
					: "宏/脚本资源不执行；文本字段内的单纯宏由公共模板转换器处理。",
			);
			artifacts.push(artifact);
			diagnostics.push(...artifact.diagnostics);
		}
	}
	if (
		selectedBackground &&
		!artifacts.some(
			(artifact) => artifact.kind === "background" && artifact.selected,
		)
	) {
		diagnostics.push(
			migrationDiagnostic(
				"sillytavern.background.selected-missing",
				"warning",
				`当前背景“${selectedBackground}”未在 backgrounds 资源中找到，保留 PulsarAI 现有背景选择。`,
				{
					...(snapshot.resources.find(
						(resource) => resource.discrimination.kind === "settings",
					)?.source ?? {
						path: "settings.json",
						relativePath: "settings.json",
						resourceKind: "settings",
					}),
					fieldPath: "background.name",
				},
			),
		);
	}

	return {
		artifacts,
		diagnostics,
		globallySelectedWorldbookNames: globallySelectedWorldbooks(
			snapshot.settings,
		),
	};
}

interface WorldbookDefaults {
	scanDepth: number;
	caseSensitive: boolean;
	matchWholeWords: boolean;
}

function worldbookDefaults(
	settings?: Record<string, unknown> | null,
): WorldbookDefaults {
	const worldInfo =
		settings && isRecord(settings.world_info_settings)
			? settings.world_info_settings
			: {};
	return {
		scanDepth: Math.max(
			1,
			Math.round(numberValue(worldInfo.world_info_depth, 2)),
		),
		caseSensitive: booleanValue(worldInfo.world_info_case_sensitive, false),
		matchWholeWords: booleanValue(
			worldInfo.world_info_match_whole_words,
			false,
		),
	};
}

function selectedBackgroundName(settings?: Record<string, unknown> | null) {
	const background =
		settings && isRecord(settings.background) ? settings.background : {};
	return stringValue(background.name);
}

function appendArtifacts(
	target: SillyTavernMigrationArtifact[],
	diagnostics: MigrationDiagnostic[],
	artifacts: SillyTavernMigrationArtifact[],
) {
	target.push(...artifacts);
	artifacts.forEach((artifact) => diagnostics.push(...artifact.diagnostics));
}

export function convertGlobalRegex(
	snapshot: SillyTavernSourceSnapshot,
	diagnostics: MigrationDiagnostic[],
) {
	const rules: MigratedRegexRule[] = [];
	if (snapshot.settings) {
		const extensionSettings = isRecord(snapshot.settings.extension_settings)
			? snapshot.settings.extension_settings
			: {};
		const source = snapshot.resources.find(
			(item) => item.discrimination.kind === "settings",
		)?.source ?? {
			path: "settings.json",
			relativePath: "settings.json",
			resourceKind: "settings",
		};
		rules.push(
			...convertRegexCollection(
				extensionSettings.regex ?? snapshot.settings.regex,
				source,
				diagnostics,
				{ characterFileName: "" },
			),
		);
	}
	for (const resource of snapshot.resources) {
		if (resource.discrimination.kind !== "regex" || !resource.value) continue;
		rules.push(
			...convertRegexCollection(resource.value, resource.source, diagnostics, {
				characterFileName: "",
			}),
		);
	}
	return rules;
}

function globallySelectedWorldbooks(settings?: Record<string, unknown> | null) {
	if (!settings) return [];
	const worldInfoSettings = isRecord(settings.world_info_settings)
		? settings.world_info_settings
		: {};
	const nested = isRecord(worldInfoSettings.world_info)
		? worldInfoSettings.world_info
		: {};
	return [
		...new Set([
			...stringArray(worldInfoSettings.globalSelect),
			...stringArray(worldInfoSettings.global_select),
			...stringArray(nested.globalSelect),
			...stringArray(nested.global_select),
		]),
	];
}

function convertCharacter(
	source: SillyTavernCharacterSource,
	lorebookDefaults: WorldbookDefaults,
): LocalPluginMigrationArtifact {
	const card = source.value;
	const data = isRecord(card.data) ? card.data : card;
	const extensions = isRecord(data.extensions) ? data.extensions : {};
	const diagnostics: MigrationDiagnostic[] = [];
	const templateContext = characterTemplateContext(data, source.nickname);
	const embedded = isRecord(data.character_book)
		? convertWorldbookValue(
				data.character_book,
				`${source.characterName} 内嵌世界书`,
				source.source,
				true,
				diagnostics,
				templateContext,
				lorebookDefaults,
			)
		: [];
	const regexRules = convertRegexCollection(
		extensions.regex_scripts ?? extensions.regexScripts,
		source.source,
		diagnostics,
		templateContext,
	);
	const description = stringValue(data.description);
	const markdownSections: Array<[string, string, string]> = [
		["角色描述", "description", description],
		["性格", "personality", stringValue(data.personality)],
		["场景", "scenario", stringValue(data.scenario)],
		["系统提示", "system_prompt", stringValue(data.system_prompt)],
		[
			"历史后指令",
			"post_history_instructions",
			stringValue(data.post_history_instructions),
		],
		["对话示例", "mes_example", stringValue(data.mes_example)],
		["创作者说明", "creator_notes", stringValue(data.creator_notes)],
	];
	const tags = stringArray(data.tags);
	if (tags.length) markdownSections.push(["标签", "tags", tags.join("、")]);
	const creator = stringValue(data.creator);
	if (creator) markdownSections.push(["创作者", "creator", creator]);

	return {
		id: `character:${source.id}`,
		kind: "character-package",
		source: source.source,
		diagnostics,
		unconsumedFields: unconsumedKeys(data, [
			"name",
			"description",
			"personality",
			"scenario",
			"first_mes",
			"mes_example",
			"creator_notes",
			"system_prompt",
			"post_history_instructions",
			"alternate_greetings",
			"group_only_greetings",
			"tags",
			"creator",
			"character_version",
			"extensions",
			"character_book",
		]),
		name: source.characterName,
		nickname: source.nickname,
		description,
		avatarPath: source.avatarPath,
		characterMarkdown: markdownSections
			.filter(([, , content]) => content.trim())
			.map(
				([title, field, content]) =>
					`## ${title}\n\n${convertExternalText(
						content.trim(),
						source.source,
						diagnostics,
						templateContext,
						`data.${field}`,
					)}`,
			)
			.join("\n\n"),
		firstMessage: convertExternalText(
			stringValue(data.first_mes),
			source.source,
			diagnostics,
			templateContext,
			"data.first_mes",
		),
		alternateGreetings: stringArray(data.alternate_greetings).map(
			(content, index) =>
				convertExternalText(
					content,
					source.source,
					diagnostics,
					templateContext,
					`data.alternate_greetings.${index}`,
				),
		),
		embeddedLorebooks: embedded,
		regexRules,
		boundWorldbookNames: source.boundWorldbookNames,
	};
}

function convertWorldbook(
	source: SillyTavernWorldbookSource,
	embedded: boolean,
	lorebookDefaults: WorldbookDefaults,
): WorldbookMigrationArtifact {
	const diagnostics: MigrationDiagnostic[] = [];
	return {
		id: `worldbook:${source.id}`,
		kind: "worldbook",
		source: source.source,
		diagnostics,
		unconsumedFields: unconsumedKeys(source.value, [
			"name",
			"description",
			"entries",
			"extensions",
		]),
		name: source.name,
		entries: convertWorldbookValue(
			source.value,
			source.name,
			source.source,
			embedded,
			diagnostics,
			{ characterFileName: "" },
			lorebookDefaults,
		),
		embeddedInCharacterId: source.embeddedInCharacterId,
	};
}

function convertWorldbookValue(
	value: Record<string, unknown>,
	bookName: string,
	source: MigrationSourceReference,
	_embedded: boolean,
	diagnostics: MigrationDiagnostic[],
	templateContext: ExternalTemplateContext,
	defaults: WorldbookDefaults,
) {
	const rawEntries = Array.isArray(value.entries)
		? value.entries
		: isRecord(value.entries)
			? Object.values(value.entries)
			: [];
	return rawEntries.flatMap((raw, index): MigratedLorebookEntry[] => {
		if (!isRecord(raw)) {
			diagnostics.push(
				migrationDiagnostic(
					"sillytavern.worldbook.entry-invalid",
					"warning",
					`${bookName} 的第 ${index + 1} 个条目不是对象。`,
					{ ...source, fieldPath: `entries.${index}` },
				),
			);
			return [];
		}
		const content = convertExternalText(
			stringValue(raw.content),
			source,
			diagnostics,
			templateContext,
			`entries.${index}.content`,
		);
		if (!content.trim()) {
			diagnostics.push(
				migrationDiagnostic(
					"sillytavern.worldbook.entry-empty",
					"warning",
					`${bookName} 的第 ${index + 1} 个条目内容为空。`,
					{ ...source, fieldPath: `entries.${index}.content` },
				),
			);
		}
		const position = numberValue(raw.position, 0);
		const depth = clamp(Math.round(numberValue(raw.depth, 4)), 0, 6);
		const enabled = raw.disable !== true && raw.enabled !== false;
		const condition = lorebookCondition(raw, defaults, diagnostics, {
			...source,
			fieldPath: `entries.${index}`,
		});
		let insertionTarget = "context";
		if (position === 0) {
			insertionTarget = "before_char";
		} else if (position === 1) {
			insertionTarget = "after_char";
		} else if (position === 4) {
			insertionTarget = `depth:${depth}`;
		} else {
			diagnostics.push(
				migrationDiagnostic(
					"sillytavern.worldbook.position-approximated",
					"warning",
					`世界书位置 ${position} 没有直接对应项，已放入 context 容器。`,
					{ ...source, fieldPath: `entries.${index}.position` },
				),
			);
		}
		return [
			{
				id: String(raw.uid ?? raw.id ?? index),
				name:
					stringValue(raw.comment) ||
					stringValue(raw.name) ||
					`条目 ${index + 1}`,
				content,
				enabled,
				order: Math.round(numberValue(raw.order, 100)),
				insertionTarget,
				condition,
				source: { ...source, fieldPath: `entries.${index}` },
			},
		];
	});
}

function lorebookCondition(
	entry: Record<string, unknown>,
	defaults: WorldbookDefaults,
	diagnostics: MigrationDiagnostic[],
	source: MigrationSourceReference,
) {
	if (entry.constant === true) {
		return entry.useProbability === true &&
			numberValue(entry.probability, 100) < 100
			? `probability(${clamp(numberValue(entry.probability, 100), 0, 100)})`
			: undefined;
	}
	const depth = Math.max(
		1,
		Math.round(
			numberValue(entry.scanDepth ?? entry.scan_depth, defaults.scanDepth),
		),
	);
	const caseSensitive = booleanValue(
		entry.caseSensitive ?? entry.case_sensitive,
		defaults.caseSensitive,
	);
	const matchWholeWords = booleanValue(
		entry.matchWholeWords ?? entry.match_whole_words,
		defaults.matchWholeWords,
	);
	const primary = stringArray(entry.key).map(
		(key) =>
			`include(${JSON.stringify(worldbookKeyword(key, caseSensitive, matchWholeWords))}, ${depth})`,
	);
	const secondary = stringArray(entry.keysecondary ?? entry.secondary_key).map(
		(key) =>
			`include(${JSON.stringify(worldbookKeyword(key, caseSensitive, matchWholeWords))}, ${depth})`,
	);
	if (!primary.length) {
		diagnostics.push(
			migrationDiagnostic(
				"sillytavern.worldbook.no-activation-key",
				"warning",
				"非恒定世界书条目没有主关键词，保持关闭条件。",
				source,
			),
		);
		return "false";
	}
	const primaryExpression = `(${primary.join(" || ")})`;
	let expression = primaryExpression;
	if (secondary.length) {
		const anySecondary = `(${secondary.join(" || ")})`;
		const allSecondary = `(${secondary.join(" && ")})`;
		switch (
			Math.round(numberValue(entry.selectiveLogic ?? entry.selective_logic, 0))
		) {
			case 1:
				expression = `${primaryExpression} && !${allSecondary}`;
				break;
			case 2:
				expression = `${primaryExpression} && !${anySecondary}`;
				break;
			case 3:
				expression = `${primaryExpression} && ${allSecondary}`;
				break;
			default:
				expression = `${primaryExpression} && ${anySecondary}`;
		}
	}
	if (
		entry.useProbability === true &&
		numberValue(entry.probability, 100) < 100
	) {
		expression = `(${expression}) && probability(${clamp(numberValue(entry.probability, 100), 0, 100)})`;
	}
	return expression;
}

function convertConversation(
	source: SillyTavernSourceSnapshot["chats"][number],
): ConversationMigrationArtifact {
	const header = source.value.header;
	const diagnostics: MigrationDiagnostic[] = [];
	const characterName =
		stringValue(header.character_name) || source.characterFolderName;
	const templateContext: ExternalTemplateContext = {
		characterFileName: source.characterFolderName || characterName,
		userName: stringValue(header.user_name),
	};
	const messages = source.value.messages.flatMap(
		(message, index): ConversationMigrationMessage[] => {
			const content = convertExternalText(
				stringValue(message.mes),
				source.source,
				diagnostics,
				templateContext,
				`messages.${index}.mes`,
			);
			const extra = isRecord(message.extra) ? message.extra : {};
			const swipes = stringArray(message.swipes ?? extra.swipes).map(
				(content, swipeIndex) =>
					convertExternalText(
						content,
						source.source,
						diagnostics,
						templateContext,
						`messages.${index}.swipes.${swipeIndex}`,
					),
			);
			const versions = [content, ...swipes]
				.filter((item, itemIndex, values) => values.indexOf(item) === itemIndex)
				.map((text, versionIndex) => ({
					content: text,
					createdAt: parseDate(
						stringValue(message.send_date),
						source.entry.modifiedAt,
					),
					...(versionIndex === 0 && stringValue(extra.model)
						? { modelName: stringValue(extra.model) }
						: {}),
				}));
			if (!versions.length) {
				diagnostics.push(
					migrationDiagnostic(
						"sillytavern.chat.empty-message",
						"warning",
						`会话第 ${index + 1} 条消息没有正文或 swipe。`,
						{ ...source.source, fieldPath: `messages.${index}` },
					),
				);
				return [];
			}
			const requestedActive = Math.round(
				numberValue(message.swipe_id ?? extra.swipe_id, 0),
			);
			return [
				{
					role:
						message.is_system === true
							? "system"
							: message.is_user === true
								? "user"
								: "assistant",
					versions,
					activeVersion: clamp(requestedActive, 0, versions.length - 1),
				},
			];
		},
	);
	return {
		id: `conversation:${source.id}`,
		kind: "conversation",
		source: source.source,
		diagnostics,
		unconsumedFields: unconsumedKeys(header, [
			"character_name",
			"user_name",
			"create_date",
			"chat_metadata",
		]),
		title: source.entry.name.replace(/\.jsonl$/, ""),
		characterName,
		userName: stringValue(header.user_name),
		createdAt: parseDate(
			stringValue(header.create_date),
			source.entry.modifiedAt,
		),
		messages,
	};
}

function convertPreset(
	source: SillyTavernPresetSource,
): PresetMigrationArtifact {
	const diagnostics: MigrationDiagnostic[] = [];
	const templateContext: ExternalTemplateContext = { characterFileName: "" };
	const rawConfiguration = convertExternalJsonValue(
		source.value,
		source.source,
		diagnostics,
		templateContext,
	) as Record<string, unknown>;
	const messages: PresetMigrationArtifact["messages"] = [];
	const depthDocuments: PresetMigrationArtifact["depthDocuments"] = [];
	const prompts = Array.isArray(rawConfiguration.prompts)
		? rawConfiguration.prompts
		: [];
	for (const [index, prompt] of prompts.entries()) {
		if (!isRecord(prompt)) continue;
		const content = stringValue(prompt.content);
		if (!content.trim()) continue;
		if (Math.round(numberValue(prompt.injection_position, 0)) === 1) {
			depthDocuments.push({
				identifier: stringValue(prompt.identifier) || `depth-${index + 1}`,
				name: stringValue(prompt.name) || `深度提示 ${index + 1}`,
				role: messageRole(prompt.role),
				content,
				depth: clamp(Math.round(numberValue(prompt.injection_depth, 4)), 0, 6),
				order: Math.round(numberValue(prompt.injection_order, 100)),
				enabled: prompt.enabled !== false,
			});
			continue;
		}
		if (prompt.enabled === false) continue;
		messages.push({ role: messageRole(prompt.role), content });
	}
	const storyString = stringValue(rawConfiguration.story_string);
	const systemPrompt = stringValue(
		rawConfiguration.content ?? rawConfiguration.system_prompt,
	);
	if (storyString) messages.push({ role: "system", content: storyString });
	if (
		systemPrompt &&
		!messages.some((message) => message.content === systemPrompt)
	) {
		messages.push({ role: "system", content: systemPrompt });
	}
	if (
		!messages.length &&
		["context", "instruct", "reasoning"].includes(source.presetKind)
	) {
		diagnostics.push(
			migrationDiagnostic(
				"sillytavern.preset.configuration-only",
				"info",
				"该预设主要包含格式化/采样配置，已保留原始配置但没有虚构上下文消息。",
				source.source,
			),
		);
	}
	return {
		id: `preset:${source.id}`,
		kind: "preset",
		source: source.source,
		diagnostics,
		unconsumedFields: [],
		name: source.name,
		presetKind: source.presetKind,
		messages,
		depthDocuments,
		regexRules: convertRegexCollection(
			source.value.regex_scripts ??
				(isRecord(source.value.extensions)
					? source.value.extensions.regex_scripts
					: undefined),
			source.source,
			diagnostics,
			templateContext,
		),
		rawConfiguration,
	};
}

function convertRegexCollection(
	value: unknown,
	source: MigrationSourceReference,
	diagnostics: MigrationDiagnostic[],
	templateContext: ExternalTemplateContext,
): MigratedRegexRule[] {
	const rawRules = Array.isArray(value)
		? value
		: isRecord(value)
			? Object.values(value)
			: [];
	return rawRules.flatMap((raw, index): MigratedRegexRule[] => {
		if (!isRecord(raw) || raw.disabled === true) return [];
		const find = stringValue(raw.findRegex ?? raw.find_regex ?? raw.regex);
		if (!find) return [];
		const placements = Array.isArray(raw.placement)
			? raw.placement.map(Number)
			: [];
		const supportsUser = !placements.length || placements.includes(1);
		const supportsAssistant = !placements.length || placements.includes(2);
		if (placements.some((placement) => ![0, 1, 2].includes(placement))) {
			diagnostics.push(
				migrationDiagnostic(
					"sillytavern.regex.unsupported-placement",
					"warning",
					"正则包含斜杠命令、世界书或 reasoning 等专用时机，仅迁移用户/AI/显示范围。",
					{ ...source, fieldPath: `regex.${index}.placement` },
				),
			);
		}
		return [
			{
				find_regex: find,
				replace_regex: convertExternalText(
					stringValue(
						raw.replaceString ?? raw.replace_with ?? raw.replace_regex,
					).replace(/{{match}}/gi, "$0"),
					source,
					diagnostics,
					templateContext,
					`regex.${index}.replace`,
				),
				range:
					supportsUser && supportsAssistant
						? "all"
						: supportsUser
							? "user_input"
							: "ai_output",
				depth_min: depthValue(raw.minDepth ?? raw.min_depth, 1),
				depth_max: depthValue(raw.maxDepth ?? raw.max_depth, "INF"),
				applyOnRendering:
					raw.markdownOnly === true || raw.only_format_display === true,
			},
		];
	});
}

export function convertPersonas(
	snapshot: SillyTavernSourceSnapshot,
): UserPersonaMigrationArtifact[] {
	if (!snapshot.settings) return [];
	const powerUser = isRecord(snapshot.settings.power_user)
		? snapshot.settings.power_user
		: {};
	const names = isRecord(powerUser.personas) ? powerUser.personas : {};
	const descriptions = isRecord(powerUser.persona_descriptions)
		? powerUser.persona_descriptions
		: {};
	return Object.entries(names).map(([avatar, name]) => {
		const detail = isRecord(descriptions[avatar]) ? descriptions[avatar] : {};
		const diagnostics: MigrationDiagnostic[] = [];
		const source: MigrationSourceReference = {
			path: "settings.json",
			relativePath: "settings.json",
			resourceKind: "user-persona",
			fieldPath: `power_user.personas.${avatar}`,
		};
		return {
			id: `persona:${avatar}`,
			kind: "user-persona",
			source,
			diagnostics,
			unconsumedFields: unconsumedKeys(detail, [
				"description",
				"position",
				"depth",
				"role",
				"lorebook",
			]),
			name: stringValue(name) || avatar.replace(/\.[^.]+$/, ""),
			markdown: convertExternalText(
				stringValue(detail.description),
				source,
				diagnostics,
				{ characterFileName: "", userName: stringValue(name) },
				`power_user.persona_descriptions.${avatar}.description`,
			),
			avatarPath: snapshot.resources.find(
				(resource) => resource.entry.name === avatar,
			)?.entry.path,
		};
	});
}

function convertQuickReplies(
	snapshot: SillyTavernSourceSnapshot,
): QuickReplyMigrationArtifact[] {
	const artifacts: QuickReplyMigrationArtifact[] = [];
	const settingsSource = snapshot.resources.find(
		(resource) => resource.discrimination.kind === "settings",
	)?.source;
	if (snapshot.settings) {
		const extensionSettings = isRecord(snapshot.settings.extension_settings)
			? snapshot.settings.extension_settings
			: {};
		const quickReplySettings = isRecord(extensionSettings.quickReply)
			? extensionSettings.quickReply
			: isRecord(extensionSettings.quick_replies)
				? extensionSettings.quick_replies
				: null;
		if (quickReplySettings) {
			artifacts.push(
				...convertQuickReplyValue(
					quickReplySettings,
					settingsSource ?? {
						path: "settings.json",
						relativePath: "settings.json",
						resourceKind: "quick-reply",
					},
					"settings",
				),
			);
		}
	}
	for (const resource of snapshot.resources) {
		if (
			resource.discrimination.kind !== "quick-reply" ||
			!isRecord(resource.value)
		)
			continue;
		artifacts.push(
			...convertQuickReplyValue(
				resource.value,
				resource.source,
				resource.entry.name,
			),
		);
	}
	return artifacts;
}

function convertQuickReplyValue(
	value: Record<string, unknown>,
	source: MigrationSourceReference,
	fallbackSetName: string,
): QuickReplyMigrationArtifact[] {
	return quickReplySets(value, fallbackSetName).flatMap(
		({ name: setName, replies }) =>
			replies.flatMap((reply, index): QuickReplyMigrationArtifact[] => {
				if (!isRecord(reply)) return [];
				const diagnostics: MigrationDiagnostic[] = [];
				const content = stringValue(
					reply.mes ?? reply.message ?? reply.content,
				);
				const name =
					stringValue(reply.label ?? reply.title ?? reply.name) ||
					`快速回复 ${index + 1}`;
				if (!content.trim()) {
					diagnostics.push(
						migrationDiagnostic(
							"sillytavern.quick-reply.empty",
							"warning",
							`快速回复“${name}”没有可填入输入框的文本，未导入。`,
							{ ...source, fieldPath: `qrList.${index}` },
						),
					);
					return [];
				}
				const templateContext: ExternalTemplateContext = {
					characterFileName: "",
					userName: stringValue(reply.userName),
				};
				return [
					{
						id: `quick-reply:${source.relativePath}:${setName}:${index}`,
						kind: "quick-reply",
						source: { ...source, fieldPath: `qrList.${index}` },
						diagnostics,
						unconsumedFields: unconsumedKeys(reply, [
							"id",
							"label",
							"title",
							"name",
							"mes",
							"message",
							"content",
							"hidden",
						]),
						name,
						content: convertExternalText(
							content,
							source,
							diagnostics,
							templateContext,
							`qrList.${index}.mes`,
						),
						setName,
					},
				];
			}),
	);
}

function quickReplySets(value: Record<string, unknown>, fallbackName: string) {
	const candidates = [
		value,
		...[value.quickReplySets, value.quickReplies, value.sets].flatMap((item) =>
			Array.isArray(item) ? item : [],
		),
	].filter(isRecord);
	return candidates.flatMap((candidate, index) => {
		const replies = Array.isArray(candidate.qrList)
			? candidate.qrList
			: Array.isArray(candidate.replies)
				? candidate.replies
				: Array.isArray(candidate.quickReplies)
					? candidate.quickReplies
					: [];
		if (!replies.length) return [];
		return [
			{
				name:
					stringValue(candidate.name ?? candidate.title) ||
					(index ? `${fallbackName}-${index + 1}` : fallbackName),
				replies,
			},
		];
	});
}

function characterTemplateContext(
	data: Record<string, unknown>,
	characterFileName: string,
): ExternalTemplateContext {
	const extensions = isRecord(data.extensions) ? data.extensions : {};
	const depthPrompt = isRecord(extensions.depth_prompt)
		? stringValue(extensions.depth_prompt.prompt)
		: stringValue(extensions.depth_prompt);
	return {
		characterFileName,
		character: {
			description: stringValue(data.description),
			personality: stringValue(data.personality),
			scenario: stringValue(data.scenario),
			systemPrompt: stringValue(data.system_prompt),
			instruction: stringValue(data.post_history_instructions),
			depthPrompt,
			creatorNotes: stringValue(data.creator_notes),
			version: stringValue(data.character_version),
			messageExamples: stringValue(data.mes_example),
			greetings: [
				stringValue(data.first_mes),
				...stringArray(data.alternate_greetings),
			],
		},
	};
}

function convertExternalText(
	text: string,
	source: MigrationSourceReference,
	diagnostics: MigrationDiagnostic[],
	context: ExternalTemplateContext,
	fieldPath: string,
) {
	if (!text || (!text.includes("{{") && !text.includes("<%"))) return text;
	const converted = convertExternalTemplateText(text, context);
	for (const issue of converted.issues) {
		diagnostics.push(
			migrationDiagnostic(
				issue.syntax === "sillytavern-macro"
					? "sillytavern.macro.unsupported"
					: "sillytavern.ejs.unsupported",
				"warning",
				`${issue.name} 未自动迁移：${issue.reason}`,
				{ ...source, fieldPath },
				{ syntax: issue.syntax, name: issue.name },
			),
		);
	}
	return converted.text;
}

function convertExternalJsonValue(
	value: unknown,
	source: MigrationSourceReference,
	diagnostics: MigrationDiagnostic[],
	context: ExternalTemplateContext,
	fieldPath = "",
): unknown {
	if (typeof value === "string") {
		return convertExternalText(
			value,
			source,
			diagnostics,
			context,
			fieldPath || "$",
		);
	}
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			convertExternalJsonValue(
				item,
				source,
				diagnostics,
				context,
				fieldPath ? `${fieldPath}.${index}` : String(index),
			),
		);
	}
	if (!isRecord(value)) return structuredClone(value);
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			key,
			convertExternalJsonValue(
				item,
				source,
				diagnostics,
				context,
				fieldPath ? `${fieldPath}.${key}` : key,
			),
		]),
	);
}

function convertProviders(
	snapshot: SillyTavernSourceSnapshot,
): ProviderMigrationArtifact[] {
	if (!snapshot.settings) return [];
	const oai = isRecord(snapshot.settings.oai_settings)
		? snapshot.settings.oai_settings
		: {};
	const baseUrl = stringValue(oai.custom_url) || stringValue(oai.reverse_proxy);
	if (!baseUrl) return [];
	const source = snapshot.resources.find(
		(resource) => resource.discrimination.kind === "settings",
	)?.source ?? {
		path: "settings.json",
		relativePath: "settings.json",
		resourceKind: "settings",
	};
	const providerId = `sillytavern-${slug(stringValue(oai.chat_completion_source) || "custom")}`;
	const modelIds = [
		stringValue(oai.custom_model),
		stringValue(oai.openai_model),
		stringValue(oai.openrouter_model),
	].filter(Boolean);
	return [
		{
			id: `provider:${providerId}`,
			kind: "provider",
			source,
			diagnostics: [
				migrationDiagnostic(
					"sillytavern.provider.secret-not-copied",
					"info",
					"连接地址已转换；密钥不会从 secrets.json 自动复制，请在模型设置中确认。",
					source,
				),
			],
			unconsumedFields: [],
			providerId,
			name: `SillyTavern · ${stringValue(oai.chat_completion_source) || "Custom"}`,
			baseUrl,
			modelIds: [...new Set(modelIds)],
		},
	];
}

function backgroundArtifact(
	resource: SillyTavernParsedResource,
	selected: boolean,
): BackgroundMigrationArtifact {
	return {
		id: `background:${resource.id}`,
		kind: "background",
		source: resource.source,
		diagnostics: [],
		unconsumedFields: [],
		name: resource.entry.name,
		path: resource.entry.path,
		selected,
	};
}

function ignoredArtifact(
	resource: SillyTavernParsedResource,
	reason: string,
): IgnoredMigrationArtifact {
	return {
		id: `ignored:${resource.id}`,
		kind: "ignored",
		source: resource.source,
		diagnostics: [
			migrationDiagnostic(
				resource.discrimination.kind === "macro"
					? "sillytavern.macro-resource.unsupported"
					: "sillytavern.resource.unsupported",
				"info",
				reason,
				resource.source,
			),
		],
		unconsumedFields: [],
		reason,
		originalKind: resource.discrimination.kind,
	};
}

function messageRole(value: unknown): "system" | "user" | "assistant" {
	return value === "user" || value === "assistant" ? value : "system";
}

function depthValue(value: unknown, fallback: number | "INF"): number | "INF" {
	if (
		typeof value === "string" &&
		["inf", "infinity", "-1"].includes(value.toLocaleLowerCase())
	)
		return "INF";
	const number = Number(value);
	return Number.isFinite(number) && number >= 0
		? Math.max(1, Math.round(number))
		: fallback;
}

function parseDate(value: string, fallbackMillis: number | null) {
	const parsed = Date.parse(value);
	if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
	return new Date(fallbackMillis ?? Date.now()).toISOString();
}

function stringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
	if (typeof value === "string")
		return value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
	return [];
}

function stringValue(value: unknown) {
	return typeof value === "string"
		? value
		: value === null || value === undefined
			? ""
			: String(value);
}

function numberValue(value: unknown, fallback: number) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
	return typeof value === "boolean" ? value : fallback;
}

function worldbookKeyword(
	value: string,
	caseSensitive: boolean,
	matchWholeWords: boolean,
) {
	if (/^\/(?:[^/\\]|\\.)+\/[a-z]*$/i.test(value)) return value;
	const needsBoundary = matchWholeWords && !/\s/.test(value.trim());
	if (!caseSensitive && !needsBoundary) return value;
	const escaped = value
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\//g, "\\/");
	const source = needsBoundary ? `(?:^|\\W)(?:${escaped})(?:$|\\W)` : escaped;
	return `/${source}/${caseSensitive ? "" : "i"}`;
}

function normalizedResourceName(value: string) {
	return value
		.trim()
		.replace(/\.[^.]+$/, "")
		.toLocaleLowerCase();
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(Math.max(value, minimum), maximum);
}

function slug(value: string) {
	const normalized = value
		.toLocaleLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "custom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unconsumedKeys(value: Record<string, unknown>, consumed: string[]) {
	const claimed = new Set(consumed);
	return Object.keys(value).filter((key) => !claimed.has(key));
}


src/features/Migrations/SillyTavern/convert/sillytavern-discriminator.ts

import type {
	MigrationSourceEntry,
	SillyTavernDiscrimination,
	SillyTavernPresetKind,
	SillyTavernResourceKind,
} from "./source-types";

const presetDirectories: Record<string, SillyTavernPresetKind> = {
	"openai settings": "openai",
	"textgen settings": "textgen",
	"koboldai settings": "kobold",
	"novelai settings": "novel",
	context: "context",
	instruct: "instruct",
	sysprompt: "sysprompt",
	reasoning: "reasoning",
};

export function discriminateSillyTavernResource(
	entry: MigrationSourceEntry,
	value?: unknown,
): SillyTavernDiscrimination {
	const path = normalizedPath(entry.relativePath);
	const segments = path.split("/");
	const evidence: string[] = [];
	const candidates = new Map<SillyTavernResourceKind, number>();
	const add = (
		kind: SillyTavernResourceKind,
		score: number,
		reason: string,
	) => {
		candidates.set(kind, Math.max(candidates.get(kind) ?? 0, score));
		evidence.push(reason);
	};

	if (entry.extension === "jsonl") add("chat", 1, "文件扩展名为 .jsonl");
	if (segments.includes("chats")) add("chat", 0.99, "位于 chats 目录");
	const charactersIndex = segments.lastIndexOf("characters");
	if (
		charactersIndex >= 0 &&
		charactersIndex === segments.length - 2 &&
		["png", "json"].includes(entry.extension)
	) {
		add("character", 0.97, "位于 characters 目录");
	}
	if (segments.includes("worlds") && entry.extension === "json") {
		add("worldbook", 0.98, "位于 worlds 目录");
	}
	if (segments.includes("backgrounds") && isMediaExtension(entry.extension)) {
		add("background", 1, "位于 backgrounds 目录");
	}
	if (segments.includes("themes") && entry.extension === "json") {
		add("theme", 1, "位于 themes 目录");
	}
	if (segments.includes("user avatars") && isImageExtension(entry.extension)) {
		add("user-persona", 0.95, "位于 User Avatars 目录");
	}
	if (
		segments.some((segment) =>
			["quickreplies", "quick replies", "quick-replies"].includes(segment),
		) &&
		entry.extension === "json"
	) {
		add("quick-reply", 0.98, "位于 Quick Replies 目录");
	}
	if (entry.name.toLocaleLowerCase() === "settings.json") {
		add("settings", 1, "文件名为 settings.json");
	}
	const presetKind = segments
		.map((segment) => presetDirectories[segment])
		.find((value): value is SillyTavernPresetKind => Boolean(value));
	if (presetKind && entry.extension === "json") {
		add("preset", 0.97, `位于 ${presetKind} 预设目录`);
	}

	if (isRecord(value)) {
		const spec = stringValue(value.spec);
		const data = isRecord(value.data) ? value.data : value;
		if (/^chara_card_v[23]$/i.test(spec) || characterShape(data)) {
			add(
				"character",
				spec ? 1 : 0.86,
				spec ? `角色卡 spec=${spec}` : "包含角色卡核心字段",
			);
		}
		if (worldbookShape(value)) add("worldbook", 0.91, "包含世界书 entries");
		if (settingsShape(value))
			add("settings", 0.94, "包含酒馆 settings 核心字段");
		if (regexShape(value)) add("regex", 0.9, "包含正则脚本字段");
		if (quickReplyShape(value))
			add("quick-reply", 0.96, "包含 Quick Reply 列表");
		if (presetShape(value)) add("preset", 0.78, "包含预设字段");
		if (macroShape(value))
			add("macro", 0.72, "包含脚本或宏字段；仅记录，不转换");
	} else if (Array.isArray(value) && value.some(regexShape)) {
		add("regex", 0.92, "JSON 数组包含正则脚本");
	}

	const sorted = [...candidates.entries()].sort(
		(left, right) => right[1] - left[1],
	);
	const [bestKind = "unknown", confidence = 0] = sorted[0] ?? [];
	return {
		kind: bestKind,
		confidence,
		evidence,
		alternatives: sorted
			.slice(1)
			.filter(([, score]) => score >= confidence - 0.12)
			.map(([kind]) => kind),
		...(bestKind === "preset"
			? { presetKind: presetKind ?? inferPresetKind(value) }
			: {}),
	};
}

export function inferPresetKind(value: unknown): SillyTavernPresetKind {
	if (!isRecord(value)) return "unknown";
	if ("story_string" in value || "chat_start" in value) return "context";
	if ("input_sequence" in value || "output_sequence" in value)
		return "instruct";
	if ("chat_completion_source" in value || "prompts" in value) return "openai";
	if ("rep_pen" in value || "repetition_penalty" in value) return "textgen";
	if ("min_length" in value && "max_length" in value) return "novel";
	if ("content" in value && Object.keys(value).length < 8) return "sysprompt";
	return "unknown";
}

function normalizedPath(path: string) {
	return path.replace(/\\/g, "/").toLocaleLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
	return typeof value === "string" ? value : "";
}

function characterShape(value: Record<string, unknown>) {
	return (
		typeof value.name === "string" &&
		["description", "first_mes", "personality", "scenario"].filter(
			(key) => key in value,
		).length >= 2
	);
}

function worldbookShape(value: Record<string, unknown>) {
	if (!("entries" in value)) return false;
	const entries = value.entries;
	return Array.isArray(entries) || isRecord(entries);
}

function regexShape(value: unknown) {
	if (!isRecord(value)) return false;
	return (
		[
			"findRegex",
			"find_regex",
			"regex",
			"replaceString",
			"replace_with",
			"replace_regex",
		].filter((key) => key in value).length >= 2
	);
}

function settingsShape(value: Record<string, unknown>) {
	return (
		"main_api" in value && ("power_user" in value || "oai_settings" in value)
	);
}

function presetShape(value: Record<string, unknown>) {
	return (
		[
			"temperature",
			"prompts",
			"story_string",
			"input_sequence",
			"max_context_unlocked",
		].filter((key) => key in value).length >= 2
	);
}

function macroShape(value: Record<string, unknown>) {
	return (
		typeof value.content === "string" &&
		("button" in value || "export_with" in value || "script" in value)
	);
}

function quickReplyShape(value: Record<string, unknown>) {
	return (
		Array.isArray(value.qrList) ||
		Array.isArray(value.quickReplySets) ||
		Array.isArray(value.quickReplies)
	);
}

function isImageExtension(extension: string) {
	return ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(
		extension,
	);
}

function isMediaExtension(extension: string) {
	return (
		isImageExtension(extension) ||
		["mp4", "webm", "ogg", "mov", "m4v"].includes(extension)
	);
}


src/features/Migrations/SillyTavern/convert/sillytavern-importer.ts

import type { Pinia } from "pinia";
import type { SillyTavernPlacementPlan } from "./placement-plan";
import {
	PulsarSillyTavernMigrationWriter,
	type SillyTavernImportCommitResult,
} from "./pulsar-migration-writer";
import { convertSillyTavernSnapshot } from "./sillytavern-converter";
import { placeSillyTavernArtifacts } from "./sillytavern-placer";
import { SillyTavernReader } from "./sillytavern-reader";
import type {
	SillyTavernReaderTransport,
	SillyTavernSourceSnapshot,
} from "./source-types";

export interface SillyTavernMigrationPreview {
	snapshot: SillyTavernSourceSnapshot;
	plan: SillyTavernPlacementPlan;
}

export class SillyTavernImporter {
	private readonly reader: SillyTavernReader;
	private readonly writer: PulsarSillyTavernMigrationWriter;
	private previews = new Map<string, SillyTavernMigrationPreview>();

	constructor(pinia: Pinia, transport: SillyTavernReaderTransport) {
		this.reader = new SillyTavernReader(transport);
		this.writer = new PulsarSillyTavernMigrationWriter(pinia, transport);
	}

	async preview(path: string): Promise<SillyTavernMigrationPreview> {
		const snapshot = await this.reader.read(path);
		const conversion = convertSillyTavernSnapshot(snapshot);
		const plan = placeSillyTavernArtifacts(snapshot.rootPath, conversion);
		const preview = { snapshot, plan };
		this.previews.clear();
		this.previews.set(plan.id, preview);
		return preview;
	}

	async commit(planId: string): Promise<SillyTavernImportCommitResult> {
		const preview = this.previews.get(planId);
		if (!preview) throw new Error("迁移预览已失效，请重新扫描后再导入。");
		const result = await this.writer.commit(preview.plan);
		this.previews.delete(planId);
		return result;
	}
}


src/features/Migrations/SillyTavern/convert/sillytavern-placer.ts

import type {
	LocalPluginMigrationArtifact,
	SillyTavernConversionResult,
	SillyTavernMigrationArtifact,
} from "./migration-artifact";
import {
	type MigrationDiagnostic,
	migrationDiagnostic,
} from "./migration-diagnostic";
import type {
	GlobalPluginPlacement,
	LocalPluginPlacement,
	SillyTavernPlacementPlan,
} from "./placement-plan";

const builtinCorePluginId = "builtin-core-plugin";

export function placeSillyTavernArtifacts(
	sourceRoot: string,
	conversion: SillyTavernConversionResult,
): SillyTavernPlacementPlan {
	const diagnostics = [...conversion.diagnostics];
	const conflicts: MigrationDiagnostic[] = [];
	const characters = ofKind(conversion, "character-package");
	const conversations = ofKind(conversion, "conversation");
	const worldbooks = ofKind(conversion, "worldbook");
	const personas = ofKind(conversion, "user-persona");
	const presets = ofKind(conversion, "preset");
	const backgrounds = ofKind(conversion, "background");
	const quickReplies = ofKind(conversion, "quick-reply");
	const providers = ofKind(conversion, "provider");
	const usedIds = new Set<string>();

	const packages = characters.map(
		(character): LocalPluginPlacement => ({
			id: uniqueId(
				`st-package-${slug(character.nickname || character.name)}`,
				usedIds,
			),
			pluginId: uniqueId(
				`st-character-${slug(character.nickname || character.name)}`,
				usedIds,
			),
			artifact: character,
			conversations: [],
			claimedWorldbooks: [],
			personas: [],
		}),
	);

	reportDuplicateCharacterNames(packages, conflicts);
	for (const conversation of conversations) {
		const candidates = packages.filter((placement) =>
			characterMatches(placement.artifact, conversation.characterName),
		);
		if (candidates.length === 1) {
			candidates[0]?.conversations.push(conversation);
		} else {
			conflicts.push(
				migrationDiagnostic(
					candidates.length
						? "sillytavern.placement.chat-character-ambiguous"
						: "sillytavern.placement.chat-character-missing",
					"error",
					candidates.length
						? `会话“${conversation.title}”对应到多个角色包。`
						: `会话“${conversation.title}”找不到角色“${conversation.characterName}”。`,
					conversation.source,
					{ candidatePackageIds: candidates.map((candidate) => candidate.id) },
				),
			);
		}
	}

	const claimedWorldbookIds = new Set<string>();
	for (const worldbook of worldbooks) {
		if (worldbook.embeddedInCharacterId) {
			claimedWorldbookIds.add(worldbook.id);
			continue;
		}
		const candidates = packages.filter((placement) =>
			placement.artifact.boundWorldbookNames.some(
				(name) => normalizedName(name) === normalizedName(worldbook.name),
			),
		);
		for (const placement of candidates) {
			placement.claimedWorldbooks.push(worldbook);
			claimedWorldbookIds.add(worldbook.id);
		}
	}

	for (const persona of personas) {
		const candidates = packages.filter((placement) =>
			placement.conversations.some(
				(conversation) =>
					normalizedName(conversation.userName) ===
					normalizedName(persona.name),
			),
		);
		if (candidates.length) {
			candidates.forEach((placement) => placement.personas.push(persona));
		} else {
			diagnostics.push(
				migrationDiagnostic(
					"sillytavern.placement.persona-unclaimed",
					"warning",
					`用户角色“${persona.name}”没有被任何已导入会话使用，暂不复制到角色包。`,
					persona.source,
				),
			);
		}
	}

	const globallySelectedNames = new Set(
		conversion.globallySelectedWorldbookNames.map(normalizedName),
	);
	const globalPlugins: GlobalPluginPlacement[] = worldbooks
		.filter(
			(worldbook) =>
				!claimedWorldbookIds.has(worldbook.id) ||
				globallySelectedNames.has(normalizedName(worldbook.name)),
		)
		.map((worldbook) => ({
			id: uniqueId(`st-lorebook-${slug(worldbook.name)}`, usedIds),
			name: `世界书 · ${worldbook.name}`,
			existing: false,
			worldbook,
			enabledPackageIds: globallySelectedNames.has(
				normalizedName(worldbook.name),
			)
				? packages
						.filter(
							(placement) =>
								!placement.claimedWorldbooks.some(
									(item) => item.id === worldbook.id,
								),
						)
						.map((placement) => placement.id)
				: [],
		}));
	if (presets.length || backgrounds.length || quickReplies.length) {
		globalPlugins.unshift({
			id: builtinCorePluginId,
			name: "内置核心插件",
			existing: true,
			presets,
			backgrounds,
			quickReplies,
		});
	}

	return {
		id: crypto.randomUUID(),
		sourceRoot,
		createdAt: new Date().toISOString(),
		packages,
		globalPlugins,
		providers,
		diagnostics,
		conflicts,
		counts: {
			packages: packages.length,
			conversations: packages.reduce(
				(count, placement) => count + placement.conversations.length,
				0,
			),
			localWorldbooks: packages.reduce(
				(count, placement) =>
					count +
					placement.claimedWorldbooks.length +
					(placement.artifact.embeddedLorebooks.length ? 1 : 0),
				0,
			),
			globalWorldbooks: globalPlugins.filter((plugin) => plugin.worldbook)
				.length,
			presets: presets.length,
			backgrounds: backgrounds.length,
			quickReplies: quickReplies.length,
			providers: providers.length,
		},
	};
}

function ofKind<K extends SillyTavernMigrationArtifact["kind"]>(
	conversion: SillyTavernConversionResult,
	kind: K,
): Array<Extract<SillyTavernMigrationArtifact, { kind: K }>> {
	return conversion.artifacts.filter(
		(
			artifact,
		): artifact is Extract<SillyTavernMigrationArtifact, { kind: K }> =>
			artifact.kind === kind,
	);
}

function reportDuplicateCharacterNames(
	packages: LocalPluginPlacement[],
	conflicts: MigrationDiagnostic[],
) {
	const names = new Map<string, LocalPluginPlacement[]>();
	for (const placement of packages) {
		const key = normalizedName(placement.artifact.name);
		names.set(key, [...(names.get(key) ?? []), placement]);
	}
	for (const duplicates of names.values()) {
		if (duplicates.length < 2) continue;
		conflicts.push(
			migrationDiagnostic(
				"sillytavern.placement.character-name-duplicate",
				"error",
				`多个角色卡使用名称“${duplicates[0]?.artifact.name}”，会话关系无法可靠判断。`,
				duplicates[0]?.artifact.source,
				{ localPluginIds: duplicates.map((item) => item.id) },
			),
		);
	}
}

function characterMatches(
	character: LocalPluginMigrationArtifact,
	name: string,
) {
	const normalized = normalizedName(name);
	return (
		normalizedName(character.name) === normalized ||
		normalizedName(character.nickname) === normalized
	);
}

function uniqueId(base: string, used: Set<string>) {
	if (!used.has(base)) {
		used.add(base);
		return base;
	}
	for (let index = 2; ; index += 1) {
		const candidate = `${base}-${index}`;
		if (!used.has(candidate)) {
			used.add(candidate);
			return candidate;
		}
	}
}

function slug(value: string) {
	const normalized = value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || crypto.randomUUID().slice(0, 8);
}

function normalizedName(value: string) {
	return value
		.normalize("NFKC")
		.trim()
		.toLocaleLowerCase()
		.replace(/\.[^.]+$/, "");
}


src/features/Migrations/SillyTavern/convert/sillytavern-reader.ts

import {
	type MigrationDiagnostic,
	migrationDiagnostic,
} from "./migration-diagnostic";
import { discriminateSillyTavernResource } from "./sillytavern-discriminator";
import type {
	MigrationSourceEntry,
	SillyTavernCharacterSource,
	SillyTavernChatPayload,
	SillyTavernChatSource,
	SillyTavernParsedResource,
	SillyTavernPresetSource,
	SillyTavernReaderTransport,
	SillyTavernSourceSnapshot,
	SillyTavernWorldbookSource,
} from "./source-types";

const ignoredDirectorySegments = new Set([
	"backups",
	"thumbnails",
	"cache",
	"vectors",
	"node_modules",
	".git",
]);
const ignoredTextCompletionPresetSegments = new Set([
	"textgen settings",
	"koboldai settings",
	"novelai settings",
	"context",
	"instruct",
	"sysprompt",
	"reasoning",
]);

export class SillyTavernReader {
	constructor(private readonly transport: SillyTavernReaderTransport) {}

	async read(path: string): Promise<SillyTavernSourceSnapshot> {
		const scan = await this.transport.scan(path);
		const diagnostics: MigrationDiagnostic[] = [];
		const resources: SillyTavernParsedResource[] = [];
		const characters: SillyTavernCharacterSource[] = [];
		const chats: SillyTavernChatSource[] = [];
		const worldbooks: SillyTavernWorldbookSource[] = [];
		const presets: SillyTavernPresetSource[] = [];
		let settings: Record<string, unknown> | null = null;

		const entries = scan.entries.filter((entry) => {
			const segments = normalizedSegments(entry.relativePath);
			const ignored = segments.some(
				(segment) =>
					segment.startsWith("_") || ignoredDirectorySegments.has(segment),
			);
			const nestedCharacterAsset = isNestedCharacterAsset(entry.relativePath);
			const textCompletionPreset = segments.some((segment) =>
				ignoredTextCompletionPresetSegments.has(segment),
			);
			if (ignored) {
				diagnostics.push(
					migrationDiagnostic(
						"sillytavern.source.ignored-directory",
						"info",
						"备份、缩略图、向量索引或酒馆内部缓存文件不参与资源迁移。",
						sourceReference(entry),
					),
				);
			}
			if (nestedCharacterAsset) {
				diagnostics.push(
					migrationDiagnostic(
						"sillytavern.source.ignored-character-asset",
						"info",
						"角色表情或辅助图片不作为独立角色卡迁移。",
						sourceReference(entry),
					),
				);
			}
			return !ignored && !nestedCharacterAsset && !textCompletionPreset;
		});

		await forEachConcurrent(entries, 12, async (entry) => {
			try {
				const parsed = await this.parseEntry(entry, scan.isFile);
				const kind = parsed.discrimination.kind;
				if (kind === "preset" && parsed.discrimination.presetKind !== "openai")
					return;
				resources.push(parsed);
				if (kind === "settings" && isRecord(parsed.value)) {
					settings = parsed.value;
				} else if (kind === "character" && isRecord(parsed.value)) {
					const character = toCharacterSource(parsed);
					characters.push(character);
					const embedded = embeddedWorldbook(character);
					if (embedded) worldbooks.push(embedded);
				} else if (kind === "worldbook" && isRecord(parsed.value)) {
					worldbooks.push({
						...parsed,
						discrimination: { ...parsed.discrimination, kind: "worldbook" },
						value: parsed.value,
						name: fileStem(entry.name),
					});
				} else if (kind === "preset" && isRecord(parsed.value)) {
					presets.push({
						...parsed,
						discrimination: { ...parsed.discrimination, kind: "preset" },
						value: parsed.value,
						name: fileStem(entry.name),
						presetKind: parsed.discrimination.presetKind ?? "unknown",
					});
				} else if (kind === "chat" && isChatPayload(parsed.value)) {
					chats.push({
						...parsed,
						discrimination: { ...parsed.discrimination, kind: "chat" },
						value: parsed.value,
						characterFolderName: chatCharacterFolder(entry.relativePath),
					});
				}
				if (parsed.discrimination.alternatives.length) {
					diagnostics.push(
						migrationDiagnostic(
							"sillytavern.discriminator.ambiguous",
							"warning",
							`资源判别存在备选类型：${parsed.discrimination.alternatives.join("、")}`,
							parsed.source,
							{ selected: kind, confidence: parsed.discrimination.confidence },
						),
					);
				}
				if (kind === "unknown") {
					diagnostics.push(
						migrationDiagnostic(
							"sillytavern.discriminator.unknown",
							"warning",
							"无法判断该文件对应的酒馆资源类型。",
							parsed.source,
						),
					);
				}
				if (kind === "macro") {
					diagnostics.push(
						migrationDiagnostic(
							"sillytavern.macro-resource.unsupported",
							"info",
							"该文件是宏/脚本资源；当前只转换文本字段内的单纯宏，不执行脚本资源。",
							parsed.source,
						),
					);
				}
			} catch (error) {
				diagnostics.push(
					migrationDiagnostic(
						"sillytavern.source.parse-failed",
						"error",
						error instanceof Error ? error.message : String(error),
						sourceReference(entry),
					),
				);
			}
		});

		characters.sort(
			(left, right) =>
				(right.entry.modifiedAt ?? 0) - (left.entry.modifiedAt ?? 0),
		);
		chats.sort(
			(left, right) =>
				(right.entry.modifiedAt ?? 0) - (left.entry.modifiedAt ?? 0),
		);
		resources.sort((left, right) =>
			left.entry.relativePath.localeCompare(
				right.entry.relativePath,
				"zh-Hans",
			),
		);
		worldbooks.sort((left, right) =>
			left.name.localeCompare(right.name, "zh-Hans"),
		);
		presets.sort((left, right) =>
			left.name.localeCompare(right.name, "zh-Hans"),
		);

		return {
			rootPath: scan.rootPath,
			scannedAt: new Date().toISOString(),
			characters,
			chats,
			worldbooks,
			presets,
			resources,
			settings,
			diagnostics,
		};
	}

	private async parseEntry(
		entry: MigrationSourceEntry,
		singleFile: boolean,
	): Promise<SillyTavernParsedResource> {
		let text: string | undefined;
		let value: unknown;
		if (entry.extension === "json") {
			text = await this.transport.readText(entry.path);
			value = JSON.parse(text) as unknown;
		} else if (entry.extension === "jsonl") {
			text = await this.transport.readText(entry.path);
			value = parseChatPayload(text, entry);
		} else if (
			entry.extension === "png" &&
			(singleFile || isDirectCharacterCard(entry.relativePath))
		) {
			text = await this.transport.readPngCharacter(entry.path);
			value = JSON.parse(text) as unknown;
		}
		const discrimination = discriminateSillyTavernResource(entry, value);
		return {
			id: entry.relativePath,
			source: sourceReference(entry, discrimination.kind),
			entry,
			discrimination,
			value,
			text,
		};
	}
}

function isDirectCharacterCard(relativePath: string) {
	const segments = normalizedSegments(relativePath);
	const characterIndex = segments.lastIndexOf("characters");
	return characterIndex >= 0 && characterIndex === segments.length - 2;
}

function isNestedCharacterAsset(relativePath: string) {
	const segments = normalizedSegments(relativePath);
	const characterIndex = segments.lastIndexOf("characters");
	return (
		characterIndex >= 0 &&
		characterIndex < segments.length - 2 &&
		["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].some((extension) =>
			segments[segments.length - 1]?.endsWith(`.${extension}`),
		)
	);
}

function parseChatPayload(
	text: string,
	entry: MigrationSourceEntry,
): SillyTavernChatPayload {
	const lines = text.split(/\r?\n/).filter((line) => line.trim());
	if (!lines.length) throw new Error(`会话文件为空：${entry.relativePath}`);
	const values = lines.map((line, index) => {
		try {
			const value = JSON.parse(line) as unknown;
			if (!isRecord(value)) throw new Error("行根节点不是对象");
			return value;
		} catch (error) {
			throw new Error(
				`会话第 ${index + 1} 行不是有效 JSON：${entry.relativePath}：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	});
	const [header, ...messages] = values;
	return { header: header ?? {}, messages };
}

function toCharacterSource(
	parsed: SillyTavernParsedResource,
): SillyTavernCharacterSource {
	const card = parsed.value as Record<string, unknown>;
	const data = isRecord(card.data) ? card.data : card;
	const extensions = isRecord(data.extensions) ? data.extensions : {};
	const name =
		stringValue(data.name) ||
		stringValue(card.name) ||
		fileStem(parsed.entry.name);
	const worldNames = [
		stringValue(extensions.world),
		stringValue(extensions.worldbook),
		stringValue(extensions.worldbook_id),
		stringValue(card.world),
	]
		.map((value) => value.trim())
		.filter(Boolean);
	return {
		...parsed,
		discrimination: { ...parsed.discrimination, kind: "character" },
		value: card,
		nickname: fileStem(parsed.entry.name),
		characterName: name,
		...(parsed.entry.extension === "png"
			? { avatarPath: parsed.entry.path }
			: {}),
		boundWorldbookNames: [...new Set(worldNames)],
	};
}

function embeddedWorldbook(
	character: SillyTavernCharacterSource,
): SillyTavernWorldbookSource | null {
	const data = isRecord(character.value.data)
		? character.value.data
		: character.value;
	if (!isRecord(data.character_book)) return null;
	const value = data.character_book;
	const name =
		stringValue(value.name) || `${character.characterName} 内嵌世界书`;
	const entry: MigrationSourceEntry = {
		...character.entry,
		relativePath: `${character.entry.relativePath}#data.character_book`,
		name,
		extension: "json",
		size: 0,
	};
	return {
		id: `${character.id}#character_book`,
		source: {
			...character.source,
			relativePath: entry.relativePath,
			resourceKind: "worldbook",
			fieldPath: "data.character_book",
		},
		entry,
		discrimination: {
			kind: "worldbook",
			confidence: 1,
			evidence: ["角色卡 data.character_book"],
			alternatives: [],
		},
		value,
		name,
		embeddedInCharacterId: character.id,
	};
}

function chatCharacterFolder(relativePath: string) {
	const segments = relativePath.replace(/\\/g, "/").split("/");
	const index = segments.findIndex(
		(segment) => segment.toLocaleLowerCase() === "chats",
	);
	return index >= 0 ? (segments[index + 1] ?? "") : "";
}

function sourceReference(entry: MigrationSourceEntry, resourceKind?: string) {
	return {
		path: entry.path,
		relativePath: entry.relativePath,
		...(resourceKind ? { resourceKind } : {}),
	};
}

function normalizedSegments(path: string) {
	return path
		.replace(/\\/g, "/")
		.split("/")
		.map((segment) => segment.toLocaleLowerCase());
}

function fileStem(name: string) {
	return name.replace(/\.[^.]+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChatPayload(value: unknown): value is SillyTavernChatPayload {
	return (
		isRecord(value) && isRecord(value.header) && Array.isArray(value.messages)
	);
}

function stringValue(value: unknown) {
	return typeof value === "string" ? value : "";
}

async function forEachConcurrent<T>(
	values: T[],
	concurrency: number,
	task: (value: T) => Promise<void>,
) {
	let index = 0;
	const workers = Array.from(
		{ length: Math.min(concurrency, values.length) },
		async () => {
			while (index < values.length) {
				const current = values[index];
				index += 1;
				if (current !== undefined) await task(current);
			}
		},
	);
	await Promise.all(workers);
}


src/features/Migrations/SillyTavern/convert/source-types.ts

import type {
	MigrationDiagnostic,
	MigrationSourceReference,
} from "./migration-diagnostic";

export type SillyTavernResourceKind =
	| "character"
	| "chat"
	| "worldbook"
	| "preset"
	| "regex"
	| "settings"
	| "user-persona"
	| "quick-reply"
	| "background"
	| "theme"
	| "macro"
	| "unknown";

export type SillyTavernPresetKind =
	| "openai"
	| "textgen"
	| "kobold"
	| "novel"
	| "context"
	| "instruct"
	| "sysprompt"
	| "reasoning"
	| "unknown";

export interface MigrationSourceEntry {
	path: string;
	relativePath: string;
	name: string;
	extension: string;
	size: number;
	modifiedAt: number | null;
}

export interface MigrationScanResult {
	rootPath: string;
	isFile: boolean;
	entries: MigrationSourceEntry[];
}

export interface SillyTavernDiscrimination {
	kind: SillyTavernResourceKind;
	confidence: number;
	evidence: string[];
	alternatives: SillyTavernResourceKind[];
	presetKind?: SillyTavernPresetKind;
}

export interface SillyTavernParsedResource {
	id: string;
	source: MigrationSourceReference;
	entry: MigrationSourceEntry;
	discrimination: SillyTavernDiscrimination;
	value?: unknown;
	text?: string;
	mediaType?: string;
}

export interface SillyTavernCharacterSource extends SillyTavernParsedResource {
	discrimination: SillyTavernDiscrimination & { kind: "character" };
	value: Record<string, unknown>;
	nickname: string;
	characterName: string;
	avatarPath?: string;
	boundWorldbookNames: string[];
}

export interface SillyTavernChatSource extends SillyTavernParsedResource {
	discrimination: SillyTavernDiscrimination & { kind: "chat" };
	value: SillyTavernChatPayload;
	characterFolderName: string;
}

export interface SillyTavernChatPayload {
	header: Record<string, unknown>;
	messages: Record<string, unknown>[];
}

export interface SillyTavernWorldbookSource extends SillyTavernParsedResource {
	discrimination: SillyTavernDiscrimination & { kind: "worldbook" };
	value: Record<string, unknown>;
	name: string;
	embeddedInCharacterId?: string;
}

export interface SillyTavernPresetSource extends SillyTavernParsedResource {
	discrimination: SillyTavernDiscrimination & { kind: "preset" };
	value: Record<string, unknown>;
	name: string;
	presetKind: SillyTavernPresetKind;
}

export interface SillyTavernSourceSnapshot {
	rootPath: string;
	scannedAt: string;
	characters: SillyTavernCharacterSource[];
	chats: SillyTavernChatSource[];
	worldbooks: SillyTavernWorldbookSource[];
	presets: SillyTavernPresetSource[];
	resources: SillyTavernParsedResource[];
	settings: Record<string, unknown> | null;
	diagnostics: MigrationDiagnostic[];
}

export interface SillyTavernReaderTransport {
	scan(path: string): Promise<MigrationScanResult>;
	readText(path: string): Promise<string>;
	readBinary(path: string): Promise<{ mediaType: string; base64: string }>;
	readPngCharacter(path: string): Promise<string>;
}


src/features/Migrations/SillyTavern/convert/tauri-migration-source.ts

import { host } from "@/host";
import type {
	MigrationScanResult,
	SillyTavernReaderTransport,
} from "./source-types";

export const hostSillyTavernReaderTransport: SillyTavernReaderTransport = {
	scan(path) {
		return host.migration.invoke<MigrationScanResult>("scan", { path });
	},
	readText(path) {
		return host.migration.invoke<string>("readText", { path });
	},
	readBinary(path) {
		return host.migration.invoke<{ mediaType: string; base64: string }>(
			"readBinary",
			{ path },
		);
	},
	readPngCharacter(path) {
		return host.migration.invoke<string>("readPngCharacter", { path });
	},
};


src/features/Migrations/SillyTavern/import/DevStImportExperiment.vue

<script setup lang="ts">
import { computed, ref } from "vue";
import { Button, TabItem, Tabs, TabsList } from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSyncStore } from "@/features/Database/dbsync-store";
import FileTree, {
	type FileTreeNode,
} from "@/features/Plugin/components/FileTree.vue";
import { useFileApi } from "@/features/Plugin/dataflow/use-file-api";
import { useEditablePluginData } from "@/features/Plugin/dataflow/use-plugin-data";
import { host } from "@/host";
import { Code, Eye, FilePlus2, Play, Upload } from "@/lib/phosphor-icons";
import StPresetRenderer from "../renderers/StPresetRenderer.vue";
import StWorldbookRenderer from "../renderers/StWorldbookRenderer.vue";
import { applyStImportPlan } from "./st-import-apply";
import {
	buildStImportPlan,
	readStResourceFile,
	type StImportPlan,
	type StResourceFile,
	tryBuildStImportPlan,
} from "./st-import-plan";
import { stTestRenderers } from "./st-test-renderers";

const sync = useSyncStore();
void sync.init();
const localPluginId = computed(() => [...sync.characters][0]?.id ?? "");
const workspace = useEditablePluginData(localPluginId);
const world = useFileApi(workspace);
const source = ref<StResourceFile | null>(null);
const plan = ref<StImportPlan | null>(null);
const error = ref("");
const applied = ref("");
const viewMode = ref<"render" | "source">("render");
const expandedPaths = ref<string[]>([]);

const raw = computed(
	() =>
		source.value?.text ??
		(source.value?.base64 ? `[${source.value.mediaType ?? "binary"}]` : ""),
);

const sourceKind = computed<"worldbook" | "preset" | "other">(() => {
	if (!source.value?.text) return "other";
	try {
		const obj = JSON.parse(source.value.text);
		if (obj && typeof obj === "object") {
			if ("entries" in obj) return "worldbook";
			if ("prompts" in obj || "prompt_order" in obj) return "preset";
		}
	} catch {}
	return "other";
});

async function choose() {
	const selected = await host.dialog.open({
		title: "选择 SillyTavern 资源",
		multiple: false,
		directory: false,
		properties: ["openFile"],
		filters: [
			{
				name: "SillyTavern 资源",
				extensions: ["png", "json", "md", "markdown", "txt"],
			},
		],
	});
	if (typeof selected !== "string") return;
	error.value = "";
	applied.value = "";
	source.value = await readStResourceFile(selected);
	plan.value = null;
}

function renderFixture(kind: string) {
	const renderer = stTestRenderers.find((item) => item.kind === kind);
	if (!renderer) return;
	const rendered = renderer.render();
	source.value = rendered.source;
	plan.value = rendered.plan;
	error.value = "";
	applied.value = "";
	syncExpanded(rendered.plan);
}

function convert() {
	if (!source.value) return;
	error.value = "";
	applied.value = "";
	try {
		const built =
			tryBuildStImportPlan(source.value.fileName, source.value) ??
			buildStImportPlan(source.value.fileName, source.value);
		plan.value = built;
		syncExpanded(built);
	} catch (cause) {
		plan.value = null;
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
}

async function apply() {
	if (!plan.value) return;
	try {
		const result = await applyStImportPlan(world, plan.value, "/");
		applied.value = `已写入测试 World：${result.createdPaths.length} 个节点`;
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
}

function syncExpanded(targetPlan: StImportPlan | null) {
	if (!targetPlan) return;
	const paths = new Set<string>();
	for (const f of targetPlan.files) {
		const parts = f.path.replace(/^\/+/, "").split("/");
		let current = "";
		for (let i = 0; i < parts.length - 1; i++) {
			current = current ? `${current}/${parts[i]}` : parts[i]!;
			paths.add(`folder:${current}`);
		}
	}
	expandedPaths.value = Array.from(paths);
}

// Convert flat plan.files into a full folder/file tree structure
const planTreeNodes = computed<FileTreeNode[]>(() => {
	if (!plan.value) return [];
	const files = plan.value.files;
	const rootMap = new Map<string, any>();

	for (const f of files) {
		const cleanPath = f.path.replace(/^\/+/, "");
		const parts = cleanPath.split("/");
		let currentMap = rootMap;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!;
			const isLast = i === parts.length - 1;
			if (!currentMap.has(part)) {
				currentMap.set(part, {
					name: part,
					isDir: !isLast,
					file: isLast ? f : null,
					children: new Map<string, any>(),
				});
			}
			currentMap = currentMap.get(part).children;
		}
	}

	function mapToNodes(map: Map<string, any>, prefix = ""): FileTreeNode[] {
		const list: FileTreeNode[] = [];
		for (const [name, item] of map.entries()) {
			const fullPath = prefix ? `${prefix}/${name}` : name;
			if (item.isDir) {
				list.push({
					id: `folder:${fullPath}`,
					name,
					type: "folder",
					children: mapToNodes(item.children, fullPath),
					data: { path: fullPath },
				});
			} else {
				const ext = name.split(".").pop() || "";
				const icon =
					ext === "md"
						? "file-text"
						: ext === "json"
							? "file-code"
							: ext === "vue"
								? "file-code-2"
								: "file";
				list.push({
					id: `file:${fullPath}`,
					name,
					type: "file",
					icon,
					suffix: item.file.slotId ? `slot: ${item.file.slotId}` : undefined,
					data: { file: item.file, path: `/${fullPath}` },
				});
			}
		}
		return list.sort((a, b) =>
			a.type === b.type
				? a.name.localeCompare(b.name)
				: a.type === "folder"
					? -1
					: 1,
		);
	}

	return mapToNodes(rootMap);
});

function handleSelectTreeNode(node: FileTreeNode) {
	if (node.type !== "file" || !node.data?.file) return;
	applied.value = `计划文件：${node.data.path}`;
}
</script>

<template>
  <div class="grid h-full min-h-0 gap-3 p-3 md:grid-cols-[minmax(0,1.2fr)_14rem_minmax(0,1fr)]">
    <!-- Left Column: Source Resource -->
    <section class="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
      <div class="mb-2.5 flex items-center justify-between border-b pb-2">
        <div class="flex items-center gap-2">
          <h2 class="text-xs font-semibold text-foreground">原始资源</h2>
          <Tabs v-if="sourceKind !== 'other'" v-model="viewMode" size="compact">
            <TabsList>
              <TabItem value="render" class="h-6 px-2 text-[11px]"><Eye class="mr-1 size-3" />渲染</TabItem>
              <TabItem value="source" class="h-6 px-2 text-[11px]"><Code class="mr-1 size-3" />源码</TabItem>
            </TabsList>
          </Tabs>
        </div>
        <Button size="sm" class="h-7 gap-1 px-2.5 text-xs" @click="choose">
          <Upload class="size-3.5" />上传
        </Button>
      </div>

      <!-- Quick Fixtures Bar -->
      <div class="mb-2 flex flex-wrap gap-1">
        <Button
          v-for="renderer in stTestRenderers"
          :key="renderer.kind"
          size="sm"
          variant="outline"
          class="h-6 px-2 text-[11px]"
          @click="renderFixture(renderer.kind)"
        >
          {{ renderer.label }}
        </Button>
      </div>
      <p class="mb-2 text-[11px] text-muted-foreground truncate">
        {{ source?.fileName ?? "选择测试类型或上传资源" }}
      </p>

      <!-- Source Display: Rendered Accordion vs Raw JSON -->
      <div class="min-h-0 flex-1 overflow-hidden rounded-xl border bg-muted/20">
        <StWorldbookRenderer
          v-if="sourceKind === 'worldbook' && viewMode === 'render' && source?.text"
          :model-value="source.text"
          class="h-full"
          @update:model-value="source && (source.text = $event)"
        />
        <StPresetRenderer
          v-else-if="sourceKind === 'preset' && viewMode === 'render' && source?.text"
          :model-value="source.text"
          class="h-full"
          @update:model-value="source && (source.text = $event)"
        />
        <ScrollArea v-else class="h-full p-3">
          <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{{ raw || '暂无资源数据' }}</pre>
        </ScrollArea>
      </div>
    </section>

    <!-- Center Column: Operations -->
    <section class="flex min-h-0 flex-col justify-center gap-3 rounded-2xl border border-border/80 bg-muted/20 p-4 shadow-xs">
      <Button :disabled="!source" class="h-9 gap-1.5 text-xs" @click="convert">
        <Play class="size-4" />转换为内存计划
      </Button>
      <Button :disabled="!plan" variant="outline" class="h-9 gap-1.5 text-xs" @click="apply">
        <FilePlus2 class="size-4" />应用到测试 World
      </Button>
      <div class="text-[11px] text-muted-foreground leading-relaxed">
        转换与应用会立即追加到当前 Plugin 版本，并由数据库同步队列持久化。
      </div>
      <div v-if="error" class="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
        {{ error }}
      </div>
      <div v-if="applied" class="rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-600 dark:text-emerald-400">
        {{ applied }}
      </div>
      <div v-if="plan" class="rounded-xl border bg-background/80 p-3 text-xs space-y-1">
        <div class="font-medium text-foreground capitalize">{{ plan.kind }} 计划</div>
        <div class="text-muted-foreground">生成文件: {{ plan.files.length }} 个</div>
        <div class="text-muted-foreground">诊断消息: {{ plan.diagnostics.length }} 条</div>
      </div>
    </section>

    <!-- Right Column: Hierarchical File Tree with Floating Editor -->
    <section class="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
      <div class="mb-2.5 flex items-center justify-between border-b pb-2">
        <h2 class="text-xs font-semibold text-foreground">目标树</h2>
        <span v-if="plan" class="text-[10px] text-muted-foreground">点击节点查看路径</span>
      </div>
      <div class="min-h-0 flex-1 overflow-hidden">
        <FileTree
          v-if="plan && planTreeNodes.length"
          :nodes="planTreeNodes"
          :expanded="expandedPaths"
          class="h-full text-xs"
          @select="handleSelectTreeNode"
        />
        <div v-else class="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
          转换后显示层级文件树，点击具体文件可在浮窗中预览与编辑。
        </div>
      </div>
      <!-- Diagnostics footer -->
      <div v-if="plan?.diagnostics?.length" class="mt-2 border-t pt-2 max-h-24 overflow-y-auto text-[11px] text-muted-foreground space-y-1">
        <div v-for="(diag, idx) in plan.diagnostics" :key="idx" class="truncate">• {{ diag }}</div>
      </div>
    </section>
  </div>
</template>



src/features/Migrations/SillyTavern/import/st-import-apply.ts

import { builtinSlotRegistry } from "@/features/Plugin/utils/import-converter";
import type { StImportFile, StImportPlan } from "./st-import-plan";

export interface StImportWorldWriter {
	exists(path: string): boolean;
	ls(path?: string): string[];
	mkdir(path: string): void;
	write(path: string, content: string): void;
	updateFolderMeta(path: string, patch: { parent?: string }): void;
	updateFileMeta(
		path: string,
		patch: {
			slot?: string;
			condition?: string;
			priority?: number;
			resourceSelected?: boolean;
		},
	): void;
}

export interface StImportApplyResult {
	rootPath: string;
	createdPaths: string[];
	diagnostics: string[];
}

export async function applyStImportPlan(
	writer: StImportWorldWriter,
	plan: StImportPlan,
	targetFolderPath: string,
): Promise<StImportApplyResult> {
	const createdPaths: string[] = [];
	const diagnostics = [...plan.diagnostics];
	if (plan.mode === "file") {
		const file = plan.files[0];
		if (!file) throw new Error("导入计划没有可写入的文件。");
		const path = uniquePath(writer, targetFolderPath, file.path, true);
		writeFile(writer, path, file);
		createdPaths.push(path);
		return { rootPath: path, createdPaths, diagnostics };
	}

	const rootPath = uniquePath(writer, targetFolderPath, plan.name, false);
	writer.mkdir(rootPath);
	createdPaths.push(rootPath);
	for (const file of plan.files) {
		const parts = file.path.split("/").filter(Boolean);
		const name = parts.pop();
		if (!name) continue;
		let parent = rootPath;
		for (const part of parts) {
			parent = join(parent, part);
			if (!writer.exists(parent)) {
				writer.mkdir(parent);
				createdPaths.push(parent);
			}
		}
		const path = join(parent, name);
		writeFile(writer, path, file);
		createdPaths.push(path);
	}
	return { rootPath, createdPaths, diagnostics };
}

function writeFile(
	writer: StImportWorldWriter,
	path: string,
	file: StImportFile,
) {
	writer.write(
		path,
		typeof file.content === "string"
			? file.content
			: JSON.stringify(file.content, null, 2),
	);
	const slot = file.slotId ? ensureLocalSlot(writer, file.slotId) : undefined;
	writer.updateFileMeta(path, {
		...(slot ? { slot } : {}),
		...(file.condition ? { condition: file.condition } : {}),
		...(file.priority !== undefined ? { priority: file.priority } : {}),
		resourceSelected: file.resourceSelected !== false,
	});
}

function ensureLocalSlot(writer: StImportWorldWriter, slotId: string) {
	const root = "/localSlot";
	if (!writer.exists(root)) writer.mkdir(root);
	const path = join(root, slotId);
	if (!writer.exists(path)) writer.mkdir(path);
	const contract = slotContractPath(slotId);
	if (contract) writer.updateFolderMeta(path, { parent: contract });
	return path;
}

function slotContractPath(id: string) {
	const slot = builtinSlotRegistry.find((item) => item.id === id);
	if (!slot) return undefined;
	const parts = [slot.name];
	let parentId = slot.parentId;
	while (parentId) {
		const parent = builtinSlotRegistry.find((item) => item.id === parentId);
		if (!parent) break;
		parts.unshift(parent.name);
		parentId = parent.parentId;
	}
	return `/slot/${parts.join("/")}`;
}

function uniquePath(
	writer: StImportWorldWriter,
	parent: string,
	name: string,
	isFile: boolean,
) {
	const dot = isFile ? name.lastIndexOf(".") : -1;
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const suffix = dot > 0 ? name.slice(dot) : "";
	let path = join(parent, name);
	for (let index = 2; writer.exists(path); index += 1)
		path = join(parent, `${stem}-${index}${suffix}`);
	return path;
}

function join(parent: string, name: string) {
	return parent === "/" ? `/${name}` : `${parent}/${name}`;
}


src/features/Migrations/SillyTavern/import/st-import-plan.ts

import type {
	LocalPluginMigrationArtifact,
	MigratedLorebookEntry,
	MigratedRegexRule,
	PresetMigrationArtifact,
} from "../convert/migration-artifact";
import type {
	MigrationDiagnostic,
	MigrationSourceReference,
} from "../convert/migration-diagnostic";
import {
	convertGlobalRegex,
	convertPersonas,
	convertSillyTavernSnapshot,
} from "../convert/sillytavern-converter";
import { discriminateSillyTavernResource } from "../convert/sillytavern-discriminator";
import type {
	MigrationSourceEntry,
	SillyTavernCharacterSource,
	SillyTavernPresetSource,
	SillyTavernSourceSnapshot,
	SillyTavernWorldbookSource,
} from "../convert/source-types";

export type StImportKind =
	| "character"
	| "worldbook"
	| "preset"
	| "conversation"
	| "persona"
	| "regex";

/** One file the import produces; `path` is relative to the generated folder. */
export interface StImportFile {
	path: string;
	content: unknown;
	/** Builtin global slot the file contributes through (character, user, before_char, after_char, document, depth:N, REGEX, chat). */
	slotId?: string;
	condition?: string;
	priority?: number;
	resourceSelected?: boolean;
}

export interface StImportPlan {
	kind: StImportKind;
	/** Generated folder base name; the original filename without its extension. */
	name: string;
	/** "folder" creates `<name>/…`; "file" writes the single file into the target folder. */
	mode: "file" | "folder";
	files: StImportFile[];
	diagnostics: string[];
	/** Character card extras consumed by the package import flow. */
	character?: { name: string; description: string; iconDataUrl?: string };
}

export interface StResourceFileInput {
	base64?: string;
	mediaType?: string;
	text?: string;
}

export interface StResourceFile extends StResourceFileInput {
	fileName: string;
}

/** Reads a SillyTavern resource file through the migration bridge. */
export async function readStResourceFile(
	path: string,
): Promise<StResourceFile> {
	const { host } = await import("@/host");
	const fileName = path.replace(/\\/g, "/").split("/").pop() ?? path;
	const extension = fileExtension(fileName);
	if (extension === "png") {
		const binary = await host.migration.invoke<{
			mediaType: string;
			base64: string;
		}>("readBinary", { path });
		return { fileName, base64: binary.base64, mediaType: binary.mediaType };
	}
	const text = await host.migration.invoke<string>("readText", { path });
	return { fileName, text };
}

/** Classifies one SillyTavern file and converts it into World file specs. */
export function buildStImportPlan(
	fileName: string,
	input: StResourceFileInput,
): StImportPlan {
	const extension = fileExtension(fileName);
	const baseName = safeName(fileName.replace(/\.[^.]+$/, ""));
	const source: MigrationSourceReference = {
		path: fileName,
		relativePath: fileName,
		resourceKind: "st-import",
	};
	const entry: MigrationSourceEntry = {
		path: fileName,
		relativePath: fileName,
		name: fileName,
		extension,
		size: 0,
		modifiedAt: null,
	};

	if (extension === "png") {
		if (!input.base64) throw new Error("缺少 PNG 文件内容。");
		const value = extractPngCharacterJson(input.base64);
		return planFromValue(value, baseName, source, entry, pngDataUrl(input));
	}
	if (extension === "json") {
		if (typeof input.text !== "string") throw new Error("缺少 JSON 文件内容。");
		let value: unknown;
		try {
			value = JSON.parse(input.text);
		} catch {
			throw new Error("JSON 文件解析失败。");
		}
		return planFromValue(value, baseName, source, entry);
	}
	if (["md", "markdown", "txt"].includes(extension)) {
		if (typeof input.text !== "string") throw new Error("缺少文本内容。");
		return personaPlan(baseName, baseName, input.text, source);
	}
	throw new Error(
		`暂不支持导入 ${extension || "未知"} 类型的文件；请选择 PNG、JSON 或 Markdown。`,
	);
}

/** Returns a conversion plan only for files that positively identify as ST. */
export function tryBuildStImportPlan(
	fileName: string,
	input: StResourceFileInput,
): StImportPlan | undefined {
	const extension = fileExtension(fileName);
	if (extension === "png") {
		try {
			return buildStImportPlan(fileName, input);
		} catch {
			return undefined;
		}
	}
	if (extension !== "json" || typeof input.text !== "string") return undefined;

	let value: unknown;
	try {
		value = JSON.parse(input.text);
	} catch {
		return undefined;
	}
	const kind = discriminateSillyTavernResource(
		{
			path: fileName,
			relativePath: fileName,
			name: fileName,
			extension,
			size: 0,
			modifiedAt: null,
		},
		value,
	).kind;
	if (
		kind !== "character" &&
		kind !== "worldbook" &&
		kind !== "preset" &&
		kind !== "regex"
	)
		return undefined;
	if (!isClearlyStResource(value, kind)) return undefined;
	return buildStImportPlan(fileName, input);
}

function isClearlyStResource(value: unknown, kind: StImportKind) {
	if (kind === "regex") {
		const rules = Array.isArray(value) ? value : [value];
		return rules.some(
			(rule) =>
				isRecord(rule) &&
				("findRegex" in rule || "find_regex" in rule) &&
				("replaceString" in rule || "replace_with" in rule),
		);
	}
	if (!isRecord(value)) return false;
	if (kind === "character") {
		const data = isRecord(value.data) ? value.data : value;
		return (
			/^chara_card_v[23]$/i.test(String(value.spec ?? "")) ||
			(typeof data.name === "string" &&
				"first_mes" in data &&
				"description" in data)
		);
	}
	if (kind === "worldbook") {
		const entries = value.entries;
		const values = Array.isArray(entries)
			? entries
			: isRecord(entries)
				? Object.values(entries)
				: [];
		return values.some(
			(entry) =>
				isRecord(entry) &&
				"content" in entry &&
				("key" in entry || "keysecondary" in entry),
		);
	}
	return Array.isArray(value.prompts)
		? value.prompts.some((prompt) => isRecord(prompt) && "identifier" in prompt)
		: "chat_completion_source" in value;
}

function planFromValue(
	value: unknown,
	baseName: string,
	source: MigrationSourceReference,
	entry: MigrationSourceEntry,
	iconDataUrl?: string,
): StImportPlan {
	const discrimination = discriminateSillyTavernResource(entry, value);
	switch (discrimination.kind) {
		case "character":
			return characterPlan(
				value as Record<string, unknown>,
				baseName,
				source,
				entry,
				iconDataUrl,
			);
		case "worldbook":
			return worldbookPlan(
				value as Record<string, unknown>,
				baseName,
				source,
				entry,
			);
		case "preset":
			return presetPlan(
				value as Record<string, unknown>,
				baseName,
				source,
				entry,
			);
		case "regex":
			return regexPlan(value, baseName, source, entry);
		default:
			break;
	}
	if (isRecord(value) && typeof value.description === "string") {
		return personaPlan(
			baseName,
			typeof value.name === "string" && value.name.trim()
				? value.name.trim()
				: baseName,
			value.description,
			source,
		);
	}
	throw new Error(
		`无法识别的 SillyTavern 资源类型（${discrimination.kind}）；支持角色卡、世界书、预设、正则与 persona。`,
	);
}

function characterPlan(
	value: Record<string, unknown>,
	baseName: string,
	source: MigrationSourceReference,
	entry: MigrationSourceEntry,
	iconDataUrl?: string,
): StImportPlan {
	const data = isRecord(value.data) ? value.data : value;
	const snapshot = singleSnapshot();
	const character: SillyTavernCharacterSource = {
		id: "st-import-character",
		source,
		entry,
		discrimination: {
			kind: "character",
			confidence: 1,
			evidence: [],
			alternatives: [],
		},
		value,
		nickname: baseName,
		characterName:
			typeof data.name === "string" && data.name.trim()
				? data.name.trim()
				: baseName,
		boundWorldbookNames: [],
	};
	snapshot.characters = [character];
	const conversion = convertSillyTavernSnapshot(snapshot);
	const artifact = conversion.artifacts.find(
		(item): item is LocalPluginMigrationArtifact =>
			item.kind === "character-package",
	);
	if (!artifact) throw new Error("角色卡转换失败。");

	const files: StImportFile[] = [];
	let markdown = artifact.characterMarkdown;
	const greetings = [artifact.firstMessage, ...artifact.alternateGreetings];
	if (greetings.some((text) => text.trim())) {
		markdown = `${markdown}\n\n## 开场白\n\n${greetings
			.filter((text) => text.trim())
			.join("\n\n---\n\n")}`;
	}
	files.push({
		path: "info.md",
		content: markdown.trim(),
		slotId: "character",
	});
	appendLorebookFiles(files, artifact.embeddedLorebooks);
	if (artifact.regexRules.length) files.push(regexFile(artifact.regexRules));

	return {
		kind: "character",
		name: baseName,
		mode: "folder",
		files,
		diagnostics: artifact.diagnostics.map((item) => item.message),
		character: {
			name: artifact.name,
			description: artifact.description,
			iconDataUrl,
		},
	};
}

function worldbookPlan(
	value: Record<string, unknown>,
	baseName: string,
	source: MigrationSourceReference,
	entry: MigrationSourceEntry,
): StImportPlan {
	const snapshot = singleSnapshot();
	const worldbook: SillyTavernWorldbookSource = {
		id: "st-import-worldbook",
		source,
		entry,
		discrimination: {
			kind: "worldbook",
			confidence: 1,
			evidence: [],
			alternatives: [],
		},
		value,
		name: baseName,
	};
	snapshot.worldbooks = [worldbook];
	const conversion = convertSillyTavernSnapshot(snapshot);
	const artifact = conversion.artifacts.find(
		(item) => item.kind === "worldbook",
	);
	if (!artifact || artifact.kind !== "worldbook") {
		throw new Error("世界书转换失败。");
	}
	const files: StImportFile[] = [];
	appendLorebookFiles(files, artifact.entries);
	if (!files.length) throw new Error("世界书没有可导入的条目。");
	return {
		kind: "worldbook",
		name: baseName,
		mode: "folder",
		files,
		diagnostics: artifact.diagnostics.map((item) => item.message),
	};
}

function presetPlan(
	value: Record<string, unknown>,
	baseName: string,
	source: MigrationSourceReference,
	entry: MigrationSourceEntry,
): StImportPlan {
	const snapshot = singleSnapshot();
	const preset: SillyTavernPresetSource = {
		id: "st-import-preset",
		source,
		entry,
		discrimination: {
			kind: "preset",
			confidence: 1,
			evidence: [],
			alternatives: [],
			presetKind: "openai",
		},
		value,
		name: baseName,
		presetKind: "openai",
	};
	snapshot.presets = [preset];
	const conversion = convertSillyTavernSnapshot(snapshot);
	const artifact = conversion.artifacts.find(
		(item): item is PresetMigrationArtifact => item.kind === "preset",
	);
	if (!artifact) throw new Error("预设转换失败。");

	const files: StImportFile[] = [
		{
			path: "entry.chat.json",
			content: {
				message: artifact.messages.map((message) => ({
					role: message.role,
					content: message.content,
				})),
			},
			slotId: "chat",
		},
	];
	for (const [index, document] of artifact.depthDocuments.entries()) {
		files.push({
			path: `depth/${String(index + 1).padStart(3, "0")}-${safeName(document.name)}.md`,
			content: document.content,
			slotId: `depth:${Math.min(document.depth, 4)}`,
			priority: document.order,
			resourceSelected: document.enabled,
		});
	}
	if (artifact.regexRules.length) files.push(regexFile(artifact.regexRules));
	return {
		kind: "preset",
		name: baseName,
		mode: "folder",
		files,
		diagnostics: artifact.diagnostics.map((item) => item.message),
	};
}

function regexPlan(
	value: unknown,
	baseName: string,
	source: MigrationSourceReference,
	entry: MigrationSourceEntry,
): StImportPlan {
	const snapshot = singleSnapshot();
	snapshot.resources = [
		{
			id: "st-import-regex",
			source,
			entry,
			discrimination: {
				kind: "regex",
				confidence: 1,
				evidence: [],
				alternatives: [],
			},
			value,
		},
	];
	const diagnostics: MigrationDiagnostic[] = [];
	const rules = convertGlobalRegex(snapshot, diagnostics);
	if (!rules.length) throw new Error("没有可导入的正则规则。");
	return {
		kind: "regex",
		name: baseName,
		mode: "file",
		files: [regexFile(rules)],
		diagnostics: diagnostics.map((item) => item.message),
	};
}

function personaPlan(
	baseName: string,
	name: string,
	description: string,
	_source: MigrationSourceReference,
): StImportPlan {
	const snapshot = singleSnapshot();
	snapshot.settings = {
		power_user: {
			personas: { [baseName]: name },
			persona_descriptions: { [baseName]: { description } },
		},
	};
	const artifacts = convertPersonas(snapshot);
	const artifact = artifacts[0];
	const markdown = artifact?.markdown?.trim() || `# ${name}`;
	return {
		kind: "persona",
		name: baseName,
		mode: "file",
		files: [
			{
				path: `${safeName(name)}.md`,
				content: markdown,
				slotId: "user",
			},
		],
		diagnostics: artifact?.diagnostics.map((item) => item.message) ?? [],
	};
}

function appendLorebookFiles(
	files: StImportFile[],
	entries: MigratedLorebookEntry[],
) {
	for (const [index, lorebookEntry] of entries.entries()) {
		files.push({
			path: `lorebooks/${String(index + 1).padStart(3, "0")}-${safeName(lorebookEntry.name)}.md`,
			content: lorebookEntry.content,
			slotId: clampDepthSlot(lorebookEntry.insertionTarget),
			condition: lorebookEntry.condition,
			priority: lorebookEntry.order,
			resourceSelected: lorebookEntry.enabled,
		});
	}
}

function regexFile(rules: MigratedRegexRule[]): StImportFile {
	return { path: "regex.json", content: rules, slotId: "REGEX" };
}

/** 内置深度插槽只有 0-4，更深的条目收敛到 depth:4。 */
function clampDepthSlot(insertionTarget: string) {
	const match = /^depth:(\d+)$/.exec(insertionTarget);
	if (!match) return insertionTarget;
	return `depth:${Math.min(Number(match[1]), 4)}`;
}

function singleSnapshot(): SillyTavernSourceSnapshot {
	return {
		rootPath: "",
		scannedAt: new Date().toISOString(),
		characters: [],
		chats: [],
		worldbooks: [],
		presets: [],
		resources: [],
		settings: null,
		diagnostics: [],
	};
}

function pngDataUrl(input: StResourceFileInput) {
	if (!input.base64) return undefined;
	const mediaType =
		input.mediaType && input.mediaType !== "application/octet-stream"
			? input.mediaType
			: "image/png";
	return `data:${mediaType};base64,${input.base64}`;
}

/** Extracts the embedded character card JSON (ccv3 preferred, then chara). */
function extractPngCharacterJson(base64: string): unknown {
	const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (
		binary.length < signature.length ||
		signature.some((byte, index) => binary[index] !== byte)
	) {
		throw new Error("不是有效的 PNG 文件。");
	}
	const view = new DataView(
		binary.buffer,
		binary.byteOffset,
		binary.byteLength,
	);
	const decodeLatin1 = (bytes: Uint8Array) =>
		Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
	let ccv3: string | null = null;
	let chara: string | null = null;
	let offset = signature.length;
	while (offset + 12 <= binary.length) {
		const length = view.getUint32(offset);
		const type = decodeLatin1(binary.slice(offset + 4, offset + 8));
		const dataStart = offset + 8;
		if (type === "tEXt") {
			const data = binary.slice(dataStart, dataStart + length);
			const separator = data.indexOf(0);
			const keyword =
				separator >= 0 ? decodeLatin1(data.slice(0, separator)) : "";
			const payload =
				separator >= 0 ? decodeLatin1(data.slice(separator + 1)) : "";
			if (keyword === "ccv3") ccv3 = payload;
			else if (keyword === "chara") chara = payload;
		}
		if (type === "IEND") break;
		offset = dataStart + length + 4;
	}
	const payloadBase64 = (ccv3 ?? chara)?.trim();
	if (!payloadBase64) {
		throw new Error("PNG 中没有找到角色卡数据（chara/ccv3 文本块）。");
	}
	try {
		const json = new TextDecoder().decode(
			Uint8Array.from(atob(payloadBase64), (char) => char.charCodeAt(0)),
		);
		return JSON.parse(json);
	} catch {
		throw new Error("PNG 角色卡数据解析失败。");
	}
}

function fileExtension(fileName: string) {
	const dot = fileName.lastIndexOf(".");
	return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

function safeName(value: string) {
	const normalized = value
		.trim()
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
		.replace(/^\$+/, "")
		.replace(/\s+/g, " ");
	return normalized || "untitled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


src/features/Migrations/SillyTavern/import/st-test-renderers.ts

import {
	buildStImportPlan,
	type StImportPlan,
	type StResourceFile,
} from "./st-import-plan";

export type StTestRendererKind =
	| "worldbook"
	| "regex"
	| "character"
	| "preset"
	| "conversation";

export interface StTestRenderer {
	kind: StTestRendererKind;
	label: string;
	render(): { source: StResourceFile; plan: StImportPlan };
}

function jsonRenderer(
	kind: Exclude<StTestRendererKind, "conversation">,
	label: string,
	value: unknown,
): StTestRenderer {
	return {
		kind,
		label,
		render() {
			const source = {
				fileName: `test-${kind}.json`,
				text: JSON.stringify(value, null, 2),
			};
			return { source, plan: buildStImportPlan(source.fileName, source) };
		},
	};
}

export const stTestRenderers: StTestRenderer[] = [
	jsonRenderer("worldbook", "世界书", {
		entries: [
			{
				uid: 1,
				comment: "测试条目",
				key: ["Pulsar"],
				content: "Pulsar 是测试关键词。",
				enabled: true,
				position: 0,
			},
		],
	}),
	jsonRenderer("regex", "正则", [
		{
			scriptName: "测试正则",
			findRegex: "/foo/g",
			replaceString: "bar",
			placement: [1, 2],
			disabled: false,
		},
	]),
	jsonRenderer("character", "角色", {
		spec: "chara_card_v3",
		data: {
			name: "测试角色",
			description: "用于验证角色转换渲染。",
			first_mes: "你好。",
			alternate_greetings: [],
		},
	}),
	jsonRenderer("preset", "预设", {
		chat_completion_source: "openai",
		temperature: 1,
		prompts: [
			{
				identifier: "main",
				name: "主提示",
				role: "system",
				content: "你是测试助手。",
				enabled: true,
			},
		],
		prompt_order: [{ order: [{ identifier: "main", enabled: true }] }],
	}),
	{
		kind: "conversation",
		label: "对话",
		render() {
			const source = {
				fileName: "test-conversation.json",
				text: JSON.stringify(
					[
						{ name: "User", is_user: true, mes: "你好" },
						{
							name: "Assistant",
							is_user: false,
							mes: "你好，有什么可以帮你？",
						},
					],
					null,
					2,
				),
			};
			return {
				source,
				plan: {
					kind: "conversation",
					name: "test-conversation",
					mode: "file",
					files: [
						{
							path: "conversation.chat.json",
							content: {
								message: [
									{ role: "user", content: "你好" },
									{ role: "assistant", content: "你好，有什么可以帮你？" },
								],
							},
						},
					],
					diagnostics: [],
				},
			};
		},
	},
];


src/features/Migrations/SillyTavern/renderers/StPresetRenderer.vue

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Badge,
	Button,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	FileText,
	ListOrdered,
	Plus,
	Settings,
	Sliders,
	Trash2,
} from "@/lib/phosphor-icons";

const props = defineProps<{
	modelValue: string | Record<string, any>;
	editable?: boolean;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const internalData = ref<Record<string, any>>({});

watch(
	() => props.modelValue,
	(val) => {
		try {
			if (typeof val === "string") {
				internalData.value = JSON.parse(val || "{}");
			} else if (val && typeof val === "object") {
				internalData.value = JSON.parse(JSON.stringify(val));
			}
		} catch {
			internalData.value = {};
		}
	},
	{ immediate: true },
);

function notifyUpdate() {
	emit("update:modelValue", JSON.stringify(internalData.value, null, 2));
}

const prompts = computed<any[]>({
	get: () => {
		if (Array.isArray(internalData.value.prompts))
			return internalData.value.prompts;
		return [];
	},
	set: (val) => {
		internalData.value.prompts = val;
		notifyUpdate();
	},
});

function addPrompt() {
	const newPrompt = {
		identifier: `custom_${Date.now()}`,
		name: "自定义提示词",
		role: "system",
		content: "",
		enabled: true,
	};
	if (!Array.isArray(internalData.value.prompts)) {
		internalData.value.prompts = [];
	}
	internalData.value.prompts.push(newPrompt);
	notifyUpdate();
}

function removePrompt(index: number) {
	if (Array.isArray(internalData.value.prompts)) {
		internalData.value.prompts.splice(index, 1);
		notifyUpdate();
	}
}

function updateParam(key: string, val: any) {
	internalData.value[key] = val;
	notifyUpdate();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2 p-3">
    <!-- Top summary bar -->
    <div class="flex items-center justify-between gap-3 border-b pb-2.5">
      <div class="flex items-center gap-2">
        <span class="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <Sliders class="size-4" />
        </span>
        <div>
          <h3 class="text-xs font-semibold leading-none text-foreground">
            {{ internalData.name || 'SillyTavern 预设 (Preset)' }}
          </h3>
          <p class="mt-1 text-[10px] text-muted-foreground">
            {{ prompts.length }} 个提示词模板 · 采样配置已就绪
          </p>
        </div>
      </div>
    </div>

    <!-- Main Accordion Sections -->
    <ScrollArea class="min-h-0 flex-1 pr-2">
      <Accordion type="multiple" :default-value="['prompts', 'samplers']" class="space-y-2.5">
        <!-- Prompts Section -->
        <AccordionItem value="prompts" class="rounded-xl border border-border/70 bg-card/80 transition shadow-xs">
          <AccordionTrigger class="px-3.5 py-2.5 hover:no-underline">
            <div class="flex items-center gap-2">
              <FileText class="size-4 text-primary" />
              <span class="text-xs font-semibold text-foreground">提示词模板列表 (Prompts)</span>
              <Badge variant="secondary" class="h-4.5 px-1.5 text-[10px]">{{ prompts.length }}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent class="border-t border-border/50 px-3.5 pb-3 pt-2.5 space-y-3 bg-muted/15 rounded-b-xl">
            <div class="flex items-center justify-end">
              <Button size="sm" class="h-6 gap-1 px-2 text-[11px]" @click="addPrompt">
                <Plus class="size-3" />添加提示词
              </Button>
            </div>

            <div v-for="(p, idx) in prompts" :key="p.identifier || idx" class="rounded-lg border bg-background/90 p-2.5 space-y-2 shadow-2xs">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <Switch
                    size="sm"
                    :model-value="p.enabled !== false"
                    @update:model-value="p.enabled = $event; notifyUpdate()"
                  />
                  <Input
                    :model-value="p.name ?? p.identifier ?? `提示词 #${idx + 1}`"
                    class="h-6 max-w-48 text-xs font-medium shadow-none"
                    @update:model-value="p.name = $event; notifyUpdate()"
                  />
                  <Badge variant="outline" class="font-mono text-[10px]">{{ p.role ?? 'system' }}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="size-6 text-muted-foreground hover:text-destructive"
                  title="删除提示词"
                  @click="removePrompt(idx)"
                >
                  <Trash2 class="size-3" />
                </Button>
              </div>
              <textarea
                :value="p.content ?? ''"
                rows="3"
                placeholder="输入提示词内容..."
                class="w-full resize-y rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed outline-none focus:border-primary shadow-none"
                @input="p.content = ($event.target as HTMLTextAreaElement).value; notifyUpdate()"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <!-- Samplers / Parameters Section -->
        <AccordionItem value="samplers" class="rounded-xl border border-border/70 bg-card/80 transition shadow-xs">
          <AccordionTrigger class="px-3.5 py-2.5 hover:no-underline">
            <div class="flex items-center gap-2">
              <Settings class="size-4 text-primary" />
              <span class="text-xs font-semibold text-foreground">模型与采样参数 (Samplers)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent class="border-t border-border/50 px-3.5 pb-3.5 pt-3 space-y-3 bg-muted/15 rounded-b-xl text-xs">
            <div class="grid grid-cols-2 gap-3">
              <!-- Temperature -->
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-medium text-muted-foreground">温度 (Temperature)</label>
                  <span class="font-mono tabular-nums text-[11px]">{{ internalData.temperature ?? 1 }}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  :value="internalData.temperature ?? 1"
                  class="w-full accent-primary"
                  @input="updateParam('temperature', ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </div>

              <!-- Top P -->
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-medium text-muted-foreground">Top P</label>
                  <span class="font-mono tabular-nums text-[11px]">{{ internalData.top_p ?? 1 }}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="internalData.top_p ?? 1"
                  class="w-full accent-primary"
                  @input="updateParam('top_p', ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </div>

              <!-- Repetition Penalty -->
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted-foreground">重复惩罚 (Repetition Penalty)</label>
                <Input
                  type="number"
                  step="0.05"
                  :model-value="internalData.repetition_penalty ?? 1"
                  class="h-7 text-xs bg-background shadow-none font-mono"
                  @update:model-value="updateParam('repetition_penalty', Number($event))"
                />
              </div>

              <!-- Max Context Length -->
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted-foreground">最大上下文长度 (Max Context)</label>
                <Input
                  type="number"
                  :model-value="internalData.max_context_length ?? 4096"
                  class="h-7 text-xs bg-background shadow-none font-mono"
                  @update:model-value="updateParam('max_context_length', Number($event))"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <!-- Prompt Order Section -->
        <AccordionItem value="order" class="rounded-xl border border-border/70 bg-card/80 transition shadow-xs">
          <AccordionTrigger class="px-3.5 py-2.5 hover:no-underline">
            <div class="flex items-center gap-2">
              <ListOrdered class="size-4 text-primary" />
              <span class="text-xs font-semibold text-foreground">提示词排序 (Prompt Order)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent class="border-t border-border/50 px-3.5 pb-3 pt-2.5 space-y-2 bg-muted/15 rounded-b-xl text-xs">
            <p class="text-[11px] text-muted-foreground">按顺序执行并注入上下文：</p>
            <div class="flex flex-wrap gap-1.5">
              <Badge
                v-for="(p, i) in prompts"
                :key="p.identifier || i"
                variant="outline"
                class="gap-1 px-2 py-1 font-mono text-[11px]"
              >
                <span class="text-muted-foreground">{{ i + 1 }}.</span>
                {{ p.name || p.identifier }}
              </Badge>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </ScrollArea>
  </div>
</template>


src/features/Migrations/SillyTavern/renderers/StWorldbookRenderer.vue

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Badge,
	Button,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Plus, Search, Tag, Trash2 } from "@/lib/phosphor-icons";

export interface StWorldbookEntry {
	uid?: number | string;
	key?: string[];
	secondary_keys?: string[];
	comment?: string;
	content?: string;
	constant?: boolean;
	selective?: boolean;
	order?: number;
	position?: number;
	enabled?: boolean;
	[key: string]: any;
}

const props = defineProps<{
	modelValue: string | Record<string, any>;
	editable?: boolean;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const search = ref("");
const internalData = ref<Record<string, any>>({});

watch(
	() => props.modelValue,
	(val) => {
		try {
			if (typeof val === "string") {
				internalData.value = JSON.parse(val || "{}");
			} else if (val && typeof val === "object") {
				internalData.value = JSON.parse(JSON.stringify(val));
			}
		} catch {
			internalData.value = {};
		}
	},
	{ immediate: true },
);

function notifyUpdate() {
	emit("update:modelValue", JSON.stringify(internalData.value, null, 2));
}

const rawEntries = computed<StWorldbookEntry[]>(() => {
	const entries = internalData.value.entries;
	if (Array.isArray(entries)) return entries;
	if (entries && typeof entries === "object") return Object.values(entries);
	return [];
});

const filteredEntries = computed(() => {
	const q = search.value.trim().toLowerCase();
	if (!q) return rawEntries.value;
	return rawEntries.value.filter((entry) => {
		const matchComment = entry.comment?.toLowerCase().includes(q);
		const matchKeys = entry.key?.some((k) => k.toLowerCase().includes(q));
		const matchContent = entry.content?.toLowerCase().includes(q);
		return matchComment || matchKeys || matchContent;
	});
});

const enabledCount = computed(
	() => rawEntries.value.filter((e) => e.enabled !== false).length,
);

function addEntry() {
	const newUid = Date.now();
	const newEntry: StWorldbookEntry = {
		uid: newUid,
		comment: "新世界书条目",
		key: ["关键词"],
		content: "",
		enabled: true,
		order: 100,
		position: 0,
	};
	if (Array.isArray(internalData.value.entries)) {
		internalData.value.entries.unshift(newEntry);
	} else if (
		internalData.value.entries &&
		typeof internalData.value.entries === "object"
	) {
		internalData.value.entries[String(newUid)] = newEntry;
	} else {
		internalData.value.entries = [newEntry];
	}
	notifyUpdate();
}

function removeEntry(index: number, uid?: string | number) {
	if (Array.isArray(internalData.value.entries)) {
		internalData.value.entries.splice(index, 1);
	} else if (
		internalData.value.entries &&
		typeof internalData.value.entries === "object" &&
		uid !== undefined
	) {
		delete internalData.value.entries[String(uid)];
	}
	notifyUpdate();
}

function updateKeys(entry: StWorldbookEntry, text: string) {
	entry.key = text
		.split(/[,，\n]/)
		.map((k) => k.trim())
		.filter(Boolean);
	notifyUpdate();
}

function updateSecondaryKeys(entry: StWorldbookEntry, text: string) {
	entry.secondary_keys = text
		.split(/[,，\n]/)
		.map((k) => k.trim())
		.filter(Boolean);
	notifyUpdate();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2 p-3">
    <!-- Top toolbar -->
    <div class="flex items-center justify-between gap-3 border-b pb-2.5">
      <div class="flex items-center gap-2">
        <span class="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <BookOpen class="size-4" />
        </span>
        <div>
          <h3 class="text-xs font-semibold leading-none text-foreground">
            {{ internalData.name || 'SillyTavern 世界书 / Lorebook' }}
          </h3>
          <p class="mt-1 text-[10px] text-muted-foreground">
            共 {{ rawEntries.length }} 个条目 · {{ enabledCount }} 个已启用
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative w-40">
          <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" placeholder="过滤条目…" class="h-7 pl-7 text-xs shadow-none" />
        </div>
        <Button size="sm" class="h-7 gap-1 px-2 text-xs" @click="addEntry">
          <Plus class="size-3.5" />添加条目
        </Button>
      </div>
    </div>

    <!-- Accordion List -->
    <ScrollArea class="min-h-0 flex-1 pr-2">
      <div v-if="filteredEntries.length === 0" class="py-16 text-center text-xs text-muted-foreground">
        暂无匹配的世界书条目
      </div>
      <Accordion v-else type="multiple" class="space-y-2">
        <AccordionItem
          v-for="(entry, index) in filteredEntries"
          :key="String(entry.uid ?? index)"
          :value="String(entry.uid ?? index)"
          class="rounded-xl border border-border/70 bg-card/80 transition shadow-xs hover:border-border"
        >
          <AccordionTrigger class="px-3 py-2 text-left hover:no-underline">
            <div class="flex min-w-0 flex-1 items-center gap-2 pr-2">
              <Switch
                size="sm"
                :model-value="entry.enabled !== false"
                class="shrink-0"
                @click.stop
                @update:model-value="entry.enabled = $event; notifyUpdate()"
              />
              <span class="truncate font-medium text-xs text-foreground">
                {{ entry.comment || `条目 #${index + 1}` }}
              </span>
              <div class="flex flex-wrap items-center gap-1">
                <Badge
                  v-for="k in (entry.key || []).slice(0, 3)"
                  :key="k"
                  variant="secondary"
                  class="h-4.5 px-1.5 text-[10px] font-mono"
                >
                  <Tag class="mr-0.5 size-2.5 opacity-60" />{{ k }}
                </Badge>
                <span v-if="(entry.key?.length ?? 0) > 3" class="text-[10px] text-muted-foreground">
                  +{{ (entry.key?.length ?? 0) - 3 }}
                </span>
              </div>
              <span class="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                优先级: {{ entry.order ?? 100 }}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent class="border-t border-border/50 px-3 pb-3 pt-2 text-xs space-y-2.5 bg-muted/15 rounded-b-xl">
            <!-- 备注名与权重 -->
            <div class="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted-foreground">条目注释 / 标题</label>
                <Input
                  :model-value="entry.comment ?? ''"
                  placeholder="例如：主要角色设定"
                  class="h-7 text-xs bg-background shadow-none"
                  @update:model-value="entry.comment = String($event); notifyUpdate()"
                />
              </div>
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted-foreground">插入权重 / Order</label>
                <Input
                  type="number"
                  :model-value="entry.order ?? 100"
                  class="h-7 text-xs bg-background shadow-none tabular-nums"
                  @update:model-value="entry.order = Number($event); notifyUpdate()"
                />
              </div>
            </div>

            <!-- 触发关键词 -->
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-muted-foreground">触发关键词 (主键，逗号分隔)</label>
              <Input
                :model-value="(entry.key || []).join(', ')"
                placeholder="例如：Pulsar, 助手, 飞船"
                class="h-7 text-xs bg-background shadow-none font-mono"
                @update:model-value="updateKeys(entry, String($event))"
              />
            </div>

            <!-- 次要关键词 / 排除策略 -->
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-muted-foreground">次要关键词 / 逻辑与 (Secondary Keys)</label>
              <Input
                :model-value="(entry.secondary_keys || []).join(', ')"
                placeholder="可选，仅当主键与次要键均匹配时激活"
                class="h-7 text-xs bg-background shadow-none font-mono"
                @update:model-value="updateSecondaryKeys(entry, String($event))"
              />
            </div>

            <!-- 内容 -->
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-muted-foreground">提示词条目正文 (Prompt Content)</label>
              <textarea
                :value="entry.content ?? ''"
                rows="4"
                placeholder="输入该条目要注入上下文的提示词文本..."
                class="w-full resize-y rounded-lg border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus:border-primary shadow-none"
                @input="entry.content = ($event.target as HTMLTextAreaElement).value; notifyUpdate()"
              />
            </div>

            <!-- Footer: Delete action -->
            <div class="flex items-center justify-between pt-1 border-t border-border/40">
              <span class="text-[10px] text-muted-foreground">UID: {{ entry.uid ?? '自动分配' }}</span>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                @click="removeEntry(index, entry.uid)"
              >
                <Trash2 class="size-3" />删除条目
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </ScrollArea>
  </div>
</template>


src/features/Migrations/SillyTavern/SillyTavern.md

# SillyTavern 迁移事实与排错手册

本文记录当前导入器实际支持的数据格式、关系来源、目标资源和失败诊断。事实优先级为 TauriTavern Rust domain/repository 与契约测试、最新 SillyTavern 前端字段消费、真实 `data/default-user` 样本；旧的手写类型只用于发现待核对字段。

## 1. 数据目录

导入器接受 SillyTavern 根目录、`data/`、`data/default-user/` 或单个文件。Reader 递归列出普通文件但不跟随符号链接。`backups`、`thumbnails`、`cache`、`.git` 和 `node_modules` 会出现在诊断中，但不参与资源转换。

常见目录：

| 来源 | 类型 | 目标 |
| --- | --- | --- |
| `characters/*.png` | PNG `tEXt` 中的 `chara`/`ccv3` Base64 JSON | 本地 Plugin |
| `characters/*.json` | V1/V2/V3 角色 JSON | 本地 Plugin |
| `chats/<角色目录>/*.jsonl` | header + 每行一条消息 | Conversation + message-version 分支 |
| `worlds/*.json` | 世界书，`entries` 可为对象或数组 | 已认领时复制到角色本地 Plugin，否则独立全局 Plugin |
| `User Avatars/*` 与 `power_user.personas` | 用户角色头像、名称和描述 | 使用该 persona 的角色包本地 `character/user/*.md` |
| `OpenAI Settings/*.json` | Chat Completion 上下文、深度提示和采样配置 | 内置 Plugin `entry/<preset>/` |
| `backgrounds/*` | 图片或视频 | 内置 Plugin `background/` 媒体节点 |
| `settings.json` | 全局设置聚合 | persona、世界书关系和可支持连接的来源 |
| `themes/*.json` | 酒馆主题 | 不迁移，保留诊断 |

## 2. 角色卡

角色卡优先读取 `data`，没有 `data` 时读取顶层兼容字段。支持的核心字段：

- `name` -> 角色包 `name`；
- 原文件名去扩展名 -> 角色包 `nickname`；
- PNG 原图 -> 角色包 `icon`；
- `description/personality/scenario/system_prompt/post_history_instructions/mes_example/creator_notes/tags/creator` -> `character/main.md` 的分节内容；
- `first_mes` 和 `alternate_greetings` -> 角色包模板会话的一条 assistant 消息及其版本；
- `data.character_book` -> `lorebooks/embedded/`，默认没有 insertion；
- `data.extensions.regex_scripts` -> 本地根 `regex.json`；
- `data.extensions.world` 等名称字段 -> 独立世界书认领候选。

未消费字段不会删除或伪造含义，其字段名写入导入报告。

## 3. 会话

JSONL 第一行必须是对象 header，后续每个非空行必须是消息对象。`is_system` 优先映射 system，随后 `is_user` 映射 user，其余映射 assistant。`mes`、`swipes` 和 `swipe_id` 转成同一 `ChatMessageContainer` 内的多个具体 `ChatMessage` 版本和 `activeMessage`。

会话通过 header `character_name` 与角色包 `name`/`nickname` 规范化匹配。目录名只在 header 缺失时使用。零候选产生 `chat-character-missing`，多候选产生 `chat-character-ambiguous`；两者都会阻止提交。

## 4. 世界书

条目读取 `uid/id`、`comment/name`、`content`、`disable/enabled`、`constant`、`key`、`keysecondary`、`selectiveLogic`、`scanDepth`、`probability`、`useProbability`、`position`、`depth` 和 `order`。

- `position = 4` -> `depth:0` 至 `depth:6`；
- `position = 0/1` -> `context`；
- AN/EM/outlet 等没有直接对应容器的位置近似为 `context` 并报告诊断；
- `constant` 条目不需要关键词条件；
- 主关键词转换为 `include(keyword, scanDepth)` 的 OR；
- 条目未声明 `scanDepth`、`caseSensitive` 或 `matchWholeWords` 时，物化 `settings.json/world_info_settings` 的全局默认值；大小写或整词语义通过关键词正则保留；
- 次关键词按 AND_ANY、NOT_ALL、NOT_ANY、AND_ALL 转为显式布尔表达式；
- 概率转换为 `probability(percentage)`；
- 嵌入世界书无论原开关如何都默认关闭；
- 角色明确绑定的独立世界书保留原条目开关；
- 未认领世界书成为独立全局 Plugin；`world_info_settings.world_info.globalSelect` 中的次要世界书会加入适用角色包的启用集合。若同一本书也是某个角色的主要世界书，该角色只使用本地副本，避免重复注入。

同名世界书不会按“最后一个覆盖前一个”处理。无法唯一认领时应在预览中人工修正来源数据或后续增加显式映射界面。

## 5. 预设与正则

只有 `OpenAI Settings` 下的 Chat Completion 预设参与迁移。`KoboldAI Settings`、`TextGen Settings`、`NovelAI Settings`、`context`、`instruct`、`sysprompt` 和 `reasoning` 都属于文本补全链路，Reader 直接忽略，不进入资源列表、转换结果或计数。

OpenAI prompt 中 `injection_position != 1` 的启用正文按角色写入 `*.chat.json`。`injection_position = 1` 的绝对深度提示不混入消息数组，而是在同一入口目录拆成 `depth-<depth>-<index>-<name>.md`；文件保留 `injection_order`，并记录 `depth:0` 至 `depth:6` 的 insertion。因为导入预设尚未被用户选择，condition 固定为 `false`，避免多个预设同时注入；原启用状态和完整字段仍保存在 `configuration.json`，后续入口选择逻辑负责激活对应文件。

预设资源写入内置 Plugin 的 `entry/<name>/`：

- `<name>.chat.json`；
- `depth-<depth>-<index>-<name>.md`（仅绝对深度提示）；
- `<name>.regex.json`；
- `configuration.json`。

这些文件是明确的入口资源，不新增系统级“主上下文入口”。具体选择和执行由 Plugin 生成流程或后续入口选择配置决定。

角色卡正则、`extension_settings.regex` 系统正则和独立正则资源的 USER_INPUT/AI_OUTPUT、深度、prompt/display 范围映射到每个角色本地 Plugin 的根 `regex.json`。斜杠命令、WORLD_INFO、REASONING 等专用触发时机只报告，不猜测执行位置。

## 6. 用户角色、背景和连接

`power_user.personas` 提供头像文件到展示名映射，`persona_descriptions` 提供描述。只有被已认领会话 `user_name` 使用的 persona 才复制到对应角色包；未认领 persona 保留 warning。

背景以媒体 data URL 写入内置 Plugin 的 `background` 容器，不依赖酒馆原路径继续存在。背景的可用资源与选择状态由 `background` 插槽自身管理，不再额外写入 Plugin 配置项。

当前只把 `oai_settings.custom_url/reverse_proxy` 转为自定义 ModelConnection，并导入明确的 model ID。`secrets.json` 不会自动复制，也不会出现在日志或报告中；用户必须在模型设置中确认密钥。

## 7. 两阶段提交与恢复

`preview()` 只扫描、判别、转换和放置。`commit(planId)` 只接受最后一次仍有效的预览。任何 error 级解析诊断、关系冲突或已有 local-plugin/plugin/provider ID 都会阻止覆盖。提交失败时，Importer 尝试按反序删除本次新建的 provider、全局 Plugin 和本地 Plugin，并恢复本次修改前的内置 Plugin 快照。数据库和媒体写入目前不具备跨仓储原子事务，因此恢复失败会保留原始异常供人工排查。

## 8. 宏与 EJS 边界

文本字段中的非嵌套简单宏和同步 ST-Prompt-Template EJS 由公共导入期转换器改写成现有 `{{ JavaScript }}`。`char` 在运行时通过 Conversation 只读 API 查找当前角色包的来源 `nickname`；简单局部/全局变量使用带命名空间的 `localStorage`。Sandbox 和生成流程不新增酒馆宏引擎、EJS runtime、API mock 或通用事件总线。

`if/else`、作用域、标志、变量简写、嵌套宏、异步 EJS、include、酒馆 API、DOM/UI 和扩展事件调用会被置换为返回空字符串的 JavaScript 注释，并产生带文件/字段来源的 warning。独立 Quick Reply、STScript 和扩展脚本资源仍不执行。完整清单见 [`模板转换.md`](./模板转换.md)。

## 9. 常见诊断

- `source.parse-failed`：检查 UTF-8、JSON/JSONL 行和 PNG `chara`/`ccv3` 块。
- `discriminator.ambiguous`：文件路径提示与 JSON 形状冲突，检查是否放错目录。
- `chat-character-missing`：核对 header `character_name`、角色卡 `name` 和文件名。
- `character-name-duplicate`：多个角色卡同名，先改名或等待显式对应界面。
- `worldbook.position-approximated`：原位置没有 PulsarAI 容器语义，检查导入报告后手工选择容器。
- `regex.unsupported-placement`：原正则依赖当前未支持的专用酒馆事件。
- `provider.secret-not-copied`：地址已导入，密钥仍需人工确认。
- `macro.unsupported`：复杂宏已注释；查看字段路径和 `模板转换.md`。
- `ejs.unsupported`：EJS 依赖异步、include、酒馆 API、UI/事件或结束符冲突，动态标签已注释。
- `macro-resource.unsupported`：这是独立脚本资源，不属于文本内简单宏转换。


src/features/Migrations/SillyTavern/SillyTavernMigrationSettingsPage.vue

<script setup lang="ts">
import { getActivePinia } from "pinia";
import { computed, ref } from "vue";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import SettingForm from "@/features/Environment/setting/SettingForm.vue";
import SettingFormField from "@/features/Environment/setting/SettingFormField.vue";
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { host } from "@/host";
import {
	AlertCircle,
	CheckCircle2,
	FolderOpen,
	LoaderCircle,
	ScanSearch,
	Upload,
} from "@/lib/phosphor-icons";
import {
	SillyTavernImporter,
	type SillyTavernMigrationPreview,
} from "./convert/sillytavern-importer";
import { hostSillyTavernReaderTransport } from "./convert/tauri-migration-source";

const pinia = getActivePinia();
if (!pinia)
	throw new Error("SillyTavern migration requires an active Pinia instance.");
const importer = new SillyTavernImporter(pinia, hostSillyTavernReaderTransport);
const sourcePath = ref("");
const preview = ref<SillyTavernMigrationPreview | null>(null);
const busy = ref(false);
const error = ref("");
const result = ref("");
const confirmOpen = ref(false);

const blockingConflictCount = computed(() =>
	preview.value
		? [
				...preview.value.plan.conflicts,
				...preview.value.plan.diagnostics,
			].filter((item) => item.severity === "error").length
		: 0,
);
const warningCount = computed(
	() =>
		preview.value?.plan.diagnostics.filter(
			(item) => item.severity === "warning",
		).length ?? 0,
);

async function chooseDirectory() {
	const selected = await host.dialog.open({ directory: true, multiple: false });
	if (typeof selected === "string") sourcePath.value = selected;
}

async function scan() {
	if (!sourcePath.value.trim()) return;
	busy.value = true;
	error.value = "";
	result.value = "";
	preview.value = null;
	try {
		preview.value = await importer.preview(sourcePath.value.trim());
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause);
	} finally {
		busy.value = false;
	}
}

async function commit() {
	if (!preview.value) return;
	busy.value = true;
	error.value = "";
	try {
		const committed = await importer.commit(preview.value.plan.id);
		result.value = `已导入 ${committed.localPluginIds.length} 个角色、${committed.globalPluginIds.length} 个独立世界书插件和 ${committed.providerIds.length} 个连接。`;
		confirmOpen.value = false;
		preview.value = null;
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause);
	} finally {
		busy.value = false;
	}
}
</script>

<template>
  <SettingPage title="数据迁移">
    <SettingGroup title="SillyTavern">
      <SettingForm>
        <SettingFormField
          title="数据路径"
          description="可选择 SillyTavern 根目录、data、data/default-user，或手工填写单个资源路径。扫描不会写入数据库。"
        >
          <div class="flex w-full flex-col gap-2 sm:flex-row">
            <Input v-model="sourcePath" class="min-w-0 flex-1" placeholder="选择或输入 SillyTavern 数据路径" />
            <Button variant="outline" size="icon" title="选择目录" @click="chooseDirectory">
              <FolderOpen class="size-4" />
            </Button>
            <Button :disabled="busy || !sourcePath.trim()" @click="scan">
              <LoaderCircle v-if="busy" class="mr-2 size-4 animate-spin" />
              <ScanSearch v-else class="mr-2 size-4" />
              扫描
            </Button>
          </div>
        </SettingFormField>
      </SettingForm>
    </SettingGroup>

    <div v-if="error" class="flex gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertCircle class="mt-0.5 size-4 shrink-0" />
      <span class="break-words">{{ error }}</span>
    </div>
    <div v-if="result" class="flex gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 class="mt-0.5 size-4 shrink-0" />
      <span>{{ result }}</span>
    </div>

    <SettingGroup v-if="preview" title="预解析结果">
      <div class="grid grid-cols-2 gap-3 py-2 sm:grid-cols-4">
        <div v-for="item in [
          ['角色包', preview.plan.counts.packages],
          ['会话', preview.plan.counts.conversations],
          ['本地世界书', preview.plan.counts.localWorldbooks],
          ['独立世界书', preview.plan.counts.globalWorldbooks],
          ['预设', preview.plan.counts.presets],
          ['背景', preview.plan.counts.backgrounds],
          ['连接', preview.plan.counts.providers],
          ['警告', warningCount],
        ]" :key="String(item[0])" class="rounded-xl bg-muted/45 px-3 py-2.5">
          <div class="text-xs text-muted-foreground">{{ item[0] }}</div>
          <div class="mt-1 text-lg font-semibold tabular-nums">{{ item[1] }}</div>
        </div>
      </div>

      <div class="divide-y">
        <details v-for="item in preview.plan.packages" :key="item.id" class="group py-3">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
            <span class="min-w-0 truncate font-medium">{{ item.artifact.name }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ item.conversations.length }} 会话 · {{ item.claimedWorldbooks.length + item.artifact.embeddedLorebooks.length }} 世界书
            </span>
          </summary>
          <div class="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground">
            <div>nickname：{{ item.artifact.nickname }}</div>
            <div>插件：{{ item.pluginId }}</div>
            <div v-if="item.artifact.boundWorldbookNames.length">绑定世界书：{{ item.artifact.boundWorldbookNames.join('、') }}</div>
            <div v-if="item.artifact.unconsumedFields.length">保留但未消费字段：{{ item.artifact.unconsumedFields.join('、') }}</div>
          </div>
        </details>
      </div>
    </SettingGroup>

    <SettingGroup v-if="preview && (preview.plan.conflicts.length || preview.plan.diagnostics.length)" title="诊断">
      <ScrollArea class="h-72">
        <div class="space-y-2 py-2 pr-3">
          <div
            v-for="(diagnostic, index) in [...preview.plan.conflicts, ...preview.plan.diagnostics]"
            :key="`${diagnostic.code}-${index}`"
            class="rounded-lg bg-muted/45 px-3 py-2 text-xs leading-5"
            :class="diagnostic.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'"
          >
            <div class="font-medium">{{ diagnostic.message }}</div>
            <div v-if="diagnostic.source" class="truncate opacity-75">{{ diagnostic.source.relativePath }}</div>
          </div>
        </div>
      </ScrollArea>
    </SettingGroup>

    <div v-if="preview" class="flex justify-end pb-2">
      <Button :disabled="busy || blockingConflictCount > 0" @click="confirmOpen = true">
        <Upload class="mr-2 size-4" />
        确认导入
      </Button>
    </div>

    <Dialog v-model:open="confirmOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>提交 SillyTavern 迁移</DialogTitle>
          <DialogDescription>
            将按预览创建资源，不覆盖已有角色包、插件或连接。宏只保留诊断，等待后续动态宏迁移。
          </DialogDescription>
        </DialogHeader>
        <div v-if="preview" class="text-sm leading-6 text-muted-foreground">
          将创建 {{ preview.plan.counts.packages }} 个角色包和 {{ preview.plan.counts.conversations }} 个会话。
        </div>
        <DialogFooter>
          <Button variant="outline" @click="confirmOpen = false">取消</Button>
          <Button :disabled="busy" @click="commit">
            <LoaderCircle v-if="busy" class="mr-2 size-4 animate-spin" />
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SettingPage>
</template>


src/features/Migrations/test/st-import-apply.test.ts

import { describe, expect, it } from "vitest";
import {
	applyStImportPlan,
	type StImportWorldWriter,
} from "@/features/Migrations/SillyTavern/import/st-import-apply";
import type { StImportPlan } from "@/features/Migrations/SillyTavern/import/st-import-plan";

function createMockWriter() {
	const files = new Map<
		string,
		{
			content: string;
			slot?: string;
			condition?: string;
			priority?: number;
			selected?: boolean;
		}
	>();
	const folders = new Set<string>(["/", "/localSlot"]);
	const writer: StImportWorldWriter = {
		exists: (path) => folders.has(path) || files.has(path),
		ls: (path = "/") =>
			[...folders, ...files.keys()]
				.filter((item) => item !== path && item.startsWith(path))
				.map((item) => item.slice(path.length).replace(/^\//, ""))
				.filter((item) => item && !item.includes("/")),
		mkdir: (path) => void folders.add(path),
		write: (path, content) => void files.set(path, { content }),
		updateFolderMeta: () => {},
		updateFileMeta(path, patch) {
			const file = files.get(path);
			if (!file) return;
			if (patch.slot !== undefined) file.slot = patch.slot;
			if (patch.condition !== undefined) file.condition = patch.condition;
			if (patch.priority !== undefined) file.priority = patch.priority;
			if (patch.resourceSelected !== undefined)
				file.selected = patch.resourceSelected;
		},
	};
	return { writer, files, folders };
}

describe("applyStImportPlan", () => {
	it("applies a folder plan into the local source", async () => {
		const { writer, files, folders } = createMockWriter();
		const plan: StImportPlan = {
			kind: "character",
			name: "hero",
			mode: "folder",
			files: [
				{ path: "info.md", content: "# Hero", slotId: "character" },
				{
					path: "lorebooks/001-secret.md",
					content: "Secret lore",
					slotId: "depth:2",
					condition: "include(chat, 'secret')",
					priority: 50,
				},
			],
			diagnostics: [],
		};
		const result = await applyStImportPlan(writer, plan, "/");
		expect(result.rootPath).toBe("/hero");
		expect(folders.has("/hero/lorebooks")).toBe(true);
		expect(files.get("/hero/info.md")?.slot).toContain("character");
		expect(files.get("/hero/lorebooks/001-secret.md")?.priority).toBe(50);
	});

	it("applies a single JSON file as authored text", async () => {
		const { writer, files } = createMockWriter();
		const plan: StImportPlan = {
			kind: "regex",
			name: "rules",
			mode: "file",
			files: [
				{
					path: "regex.json",
					content: [{ findRegex: "a", replaceString: "b" }],
					slotId: "REGEX",
				},
			],
			diagnostics: [],
		};
		await applyStImportPlan(writer, plan, "/");
		expect(files.get("/regex.json")?.content).toContain("findRegex");
	});
});


src/features/Migrations/test/st-import-plan.test.ts

import { describe, expect, it } from "vitest";
import {
	buildStImportPlan,
	tryBuildStImportPlan,
} from "@/features/Migrations/SillyTavern/import/st-import-plan";

/** 构造一个带 chara tEXt 文本块的最小 PNG（解析器不校验 CRC）。 */
function pngWithChara(json: string): string {
	const chunk = (type: string, data: number[]) => {
		const length = data.length;
		return [
			(length >>> 24) & 0xff,
			(length >>> 16) & 0xff,
			(length >>> 8) & 0xff,
			length & 0xff,
			...Array.from(type, (char) => char.charCodeAt(0)),
			...data,
			0,
			0,
			0,
			0,
		];
	};
	const payload = Buffer.from(json).toString("base64");
	const textData = [
		...Array.from("chara", (char) => char.charCodeAt(0)),
		0,
		...Array.from(payload, (char) => char.charCodeAt(0)),
	];
	const png = [
		0x89,
		0x50,
		0x4e,
		0x47,
		0x0d,
		0x0a,
		0x1a,
		0x0a,
		...chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
		...chunk("tEXt", textData),
		...chunk("IEND", []),
	];
	return Buffer.from(png).toString("base64");
}

describe("buildStImportPlan", () => {
	it("only converts positively identified ST files", () => {
		expect(
			tryBuildStImportPlan("notes.md", { text: "普通 Markdown" }),
		).toBeUndefined();
		expect(
			tryBuildStImportPlan("config.json", {
				text: JSON.stringify({ description: "普通 JSON" }),
			}),
		).toBeUndefined();
	});

	it("classifies a worldbook json into per-entry markdown files", () => {
		const plan = buildStImportPlan(" demo-book.json", {
			text: JSON.stringify({
				entries: {
					"0": {
						uid: 0,
						comment: "设定：城市",
						content: "这座城市建立在废墟之上。",
						key: ["城市"],
						position: 0,
						order: 42,
						disable: false,
					},
					"1": {
						uid: 1,
						comment: "恒定条目",
						content: "世界的底层规则。",
						constant: true,
						position: 1,
						disable: true,
					},
				},
			}),
		});

		expect(plan.kind).toBe("worldbook");
		expect(plan.name).toBe("demo-book");
		expect(plan.mode).toBe("folder");
		expect(plan.files).toHaveLength(2);
		const [first, second] = plan.files;
		expect(first?.path).toBe("lorebooks/001-设定：城市.md");
		expect(first?.slotId).toBe("before_char");
		expect(first?.condition).toContain("include(");
		expect(first?.resourceSelected).toBe(true);
		expect(first?.priority).toBe(42);
		expect(second?.resourceSelected).toBe(false);
		expect(second?.slotId).toBe("after_char");
	});

	it("classifies a character card and produces info/lorebooks/regex files", () => {
		const plan = buildStImportPlan("azure-sky.png", {
			base64: pngWithChara(
				JSON.stringify({
					spec: "chara_card_v2",
					data: {
						name: "蔚空",
						description: "一个测试角色 {{char}}。",
						personality: "冷静",
						first_mes: "你好。",
						character_book: {
							entries: [
								{
									uid: 0,
									comment: "秘密",
									content: "她藏着一个秘密。",
									key: ["秘密"],
									position: 4,
									depth: 2,
								},
							],
						},
					},
				}),
			),
			mediaType: "image/png",
		});

		expect(plan.kind).toBe("character");
		expect(plan.name).toBe("azure-sky");
		expect(plan.character?.name).toBe("蔚空");
		expect(plan.character?.description).toBe("一个测试角色 {{char}}。");
		expect(plan.character?.iconDataUrl).toContain("data:image/png;base64,");
		const info = plan.files.find((file) => file.path === "info.md");
		expect(info?.slotId).toBe("character");
		expect(String(info?.content)).toContain("## 开场白");
		expect(String(info?.content)).toContain("你好。");
		const lorebook = plan.files.find((file) =>
			file.path.startsWith("lorebooks/"),
		);
		expect(lorebook?.slotId).toBe("depth:2");
		expect(lorebook?.resourceSelected).toBe(true);
	});

	it("classifies a regex json into a single regex.json file", () => {
		const plan = buildStImportPlan("my-regex.json", {
			text: JSON.stringify([
				{
					findRegex: "/foo/g",
					replaceString: "bar",
					placement: [1, 2],
					disabled: false,
				},
			]),
		});
		expect(plan.kind).toBe("regex");
		expect(plan.mode).toBe("file");
		expect(plan.files[0]?.path).toBe("regex.json");
		expect(plan.files[0]?.slotId).toBe("REGEX");
	});

	it("treats a markdown file as a user persona", () => {
		const plan = buildStImportPlan("我的Persona.md", {
			text: "我是测试用户 {{user}}。",
		});
		expect(plan.kind).toBe("persona");
		expect(plan.mode).toBe("file");
		expect(plan.files[0]?.path).toBe("我的Persona.md");
		expect(plan.files[0]?.slotId).toBe("user");
	});

	it("classifies an openai preset into entry.chat.json", () => {
		const plan = buildStImportPlan("alpha-preset.json", {
			text: JSON.stringify({
				temperature: 0.7,
				prompts: [
					{
						identifier: "main",
						name: "主提示",
						role: "system",
						content: "你是一个助手。",
						injection_position: 0,
					},
				],
				story_string: "历史背景：{{description}}",
			}),
		});
		expect(plan.kind).toBe("preset");
		const entry = plan.files.find((file) => file.path === "entry.chat.json");
		expect(entry?.slotId).toBe("chat");
		expect(
			(entry?.content as { message: unknown[] }).message.length,
		).toBeGreaterThan(0);
	});
});


src/features/Migrations/test/st-test-renderers.test.ts

import { describe, expect, it } from "vitest";
import { stTestRenderers } from "@/features/Migrations/SillyTavern/import/st-test-renderers";

describe("SillyTavern test renderers", () => {
	it("provides a file-tree plan for every supported fixture", () => {
		expect(stTestRenderers.map((renderer) => renderer.kind)).toEqual([
			"worldbook",
			"regex",
			"character",
			"preset",
			"conversation",
		]);
		for (const renderer of stTestRenderers) {
			const result = renderer.render();
			expect(result.source.text).toBeTruthy();
			expect(result.plan.files.length).toBeGreaterThan(0);
		}
	});
});


src/features/Plugin/agent/components/AskUserComponent.vue

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
	AskUserQuestions,
	Dialog,
	DialogContent,
	type AskUserAnswer as FluidAskUserAnswer,
	type AskUserQuestion as FluidAskUserQuestion,
} from "@/components/fluid";
import {
	type AskUserAnswer,
	type AskUserInput,
	type AskUserResult,
	askUserSchema,
	registerAskUser,
} from "../runtime/ask-user";

const open = ref(false);
const request = ref<AskUserInput | null>(null);
let settle: ((value: AskUserResult) => void) | null = null;
let unregister: (() => void) | null = null;

const mappedQuestions = computed<FluidAskUserQuestion[]>(() => {
	if (!request.value) return [];
	return request.value.questions.map((q) => {
		if (q.kind === "text") {
			return {
				id: q.id,
				title: q.question,
				freeText: true,
				freeTextPlaceholder: q.placeholder || "输入回答…",
				skippable: false,
			};
		}
		if (q.kind === "boolean") {
			return {
				id: q.id,
				title: q.question,
				options: [
					{ id: "true", title: "接受" },
					{ id: "false", title: "拒绝" },
				],
				multiSelect: false,
				skippable: false,
			};
		}
		const opts = q.options.map((opt) => {
			const id = typeof opt === "string" ? opt : opt.value || opt.label;
			const title = typeof opt === "string" ? opt : opt.label;
			return { id, title };
		});
		return {
			id: q.id,
			title: q.question,
			options: opts,
			multiSelect: q.kind === "multi-select",
			skippable: false,
		};
	});
});

onMounted(() => {
	unregister = registerAskUser(
		(input) =>
			new Promise((resolve) => {
				settle?.({ cancelled: true });
				request.value = askUserSchema.parse(input);
				settle = resolve;
				open.value = true;
			}),
	);
});

onBeforeUnmount(() => {
	unregister?.();
	finish({ cancelled: true });
});

function finish(value: AskUserResult) {
	settle?.(value);
	settle = null;
	open.value = false;
	request.value = null;
}

function handleComplete(answersMap: Record<string, FluidAskUserAnswer>) {
	if (!request.value) return;
	const resultAnswers: Record<string, AskUserAnswer> = {};
	for (const q of request.value.questions) {
		const ans = answersMap[q.id];
		if (q.kind === "boolean") {
			resultAnswers[q.id] = ans?.selectedIds?.includes("true") ?? false;
		} else if (q.kind === "text") {
			resultAnswers[q.id] = ans?.otherText ?? "";
		} else if (q.kind === "multi-select") {
			resultAnswers[q.id] = ans?.selectedIds ?? [];
		} else {
			resultAnswers[q.id] = ans?.selectedIds?.[0] ?? ans?.otherText ?? "";
		}
	}
	finish({ answers: resultAnswers, cancelled: false });
}

function handleSkip() {
	finish({ cancelled: true });
}
</script>

<template>
  <Dialog :open="open" @update:open="value => !value && finish({ cancelled: true })">
    <DialogContent
      :show-close-button="false"
      class="flex w-auto max-w-none items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none"
    >
      <AskUserQuestions
        v-if="request && mappedQuestions.length"
        :questions="mappedQuestions"
        @complete="handleComplete"
        @skip="handleSkip"
        @close="finish({ cancelled: true })"
      />
    </DialogContent>
  </Dialog>
</template>


src/features/Plugin/agent/runtime/ask-user.ts

import { z } from "zod";

const optionSchema = z.object({
	label: z.string().min(1),
	value: z.string().optional(),
});

const askUserQuestionSchema = z
	.object({
		id: z.string().min(1),
		question: z.string().min(1),
		kind: z.enum(["text", "select", "multi-select", "boolean"]).default("text"),
		options: z.array(z.union([optionSchema, z.string()])).default([]),
		placeholder: z.string().optional(),
	})
	.superRefine((question, context) => {
		if (
			(question.kind === "select" || question.kind === "multi-select") &&
			question.options.length === 0
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: `${question.kind} 问题必须提供 options。`,
				path: ["options"],
			});
		}
	});

export const askUserSchema = z.object({
	questions: z.array(askUserQuestionSchema).min(1),
});
export type AskUserInput = z.infer<typeof askUserSchema>;
export type AskUserAnswer = string | string[] | boolean;
export type AskUserResult =
	| { answers: Record<string, AskUserAnswer>; cancelled: false }
	| { cancelled: true };

let requester: ((input: AskUserInput) => Promise<AskUserResult>) | null = null;

export function registerAskUser(
	request: (input: AskUserInput) => Promise<AskUserResult>,
) {
	requester = request;
	return () => {
		if (requester === request) requester = null;
	};
}

export async function askUser(input: unknown): Promise<AskUserResult> {
	const parsed = askUserSchema.safeParse(input);
	if (!parsed.success) throw new Error("askUser 参数无效。");
	return requester ? requester(parsed.data) : { cancelled: true };
}


src/features/Plugin/agent/runtime/code-act.ts

import {
	executeSandboxCodeAsync,
	type SandboxEnvironment,
} from "@/features/Plugin/runtime/sandbox";

interface CodeActSuccess {
	ok: true;
	value: unknown;
}

interface CodeActFailure {
	ok: false;
	error: string;
}

export type CodeActResult = CodeActSuccess | CodeActFailure;

function validateCodeActFunction(source: string) {
	const code = source.trim();
	const isFunction =
		/^(async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{[\s\S]*\}\s*$/.test(
			code,
		) ||
		/^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{[\s\S]*\}\s*$/.test(
			code,
		);
	if (!isFunction) {
		throw new Error(
			"CodeAct 只接受一个函数。请返回 `async function () { ... return value; }`。",
		);
	}
	if (
		!/(?:^|[;{}]\s*|\)\s*)return\b/m.test(maskCodeActLiteralsAndComments(code))
	) {
		throw new Error("CodeAct 函数必须显式包含 return，并返回本次执行结果。");
	}
	return code;
}

export async function executeCodeAct(
	source: string,
	environment: SandboxEnvironment,
): Promise<CodeActResult> {
	try {
		const code = validateCodeActFunction(source);
		const value = await executeSandboxCodeAsync(code, [environment]);
		return {
			ok: true,
			value: normalizeCodeActValue(value),
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function normalizeCodeActValue(
	value: unknown,
	seen = new WeakSet<object>(),
): unknown {
	if (
		value == null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return value ?? null;
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : String(value);
	}
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "function" || typeof value === "symbol") {
		return String(value);
	}
	if (value instanceof Date) return value.toISOString();
	if (typeof value !== "object") return String(value);
	if (seen.has(value)) return "[Circular]";
	seen.add(value);
	if (Array.isArray(value)) {
		return value.map((item) => normalizeCodeActValue(item, seen));
	}
	return Object.fromEntries(
		Object.entries(value)
			.filter(
				([, item]) => typeof item !== "function" && typeof item !== "symbol",
			)
			.map(([key, item]) => [key, normalizeCodeActValue(item, seen)]),
	);
}

function maskCodeActLiteralsAndComments(source: string) {
	let result = "";
	let index = 0;
	let mode: "code" | "line" | "block" | "single" | "double" | "template" =
		"code";

	while (index < source.length) {
		const char = source[index] ?? "";
		const next = source[index + 1] ?? "";

		if (mode === "code") {
			if (char === "/" && next === "/") {
				result += "  ";
				index += 2;
				mode = "line";
				continue;
			}
			if (char === "/" && next === "*") {
				result += "  ";
				index += 2;
				mode = "block";
				continue;
			}
			if (char === "'" || char === '"' || char === "`") {
				result += " ";
				index += 1;
				mode = char === "'" ? "single" : char === '"' ? "double" : "template";
				continue;
			}
			result += char;
			index += 1;
			continue;
		}

		if (mode === "line") {
			if (char === "\n") {
				result += "\n";
				mode = "code";
			} else {
				result += " ";
			}
			index += 1;
			continue;
		}

		if (mode === "block") {
			if (char === "*" && next === "/") {
				result += "  ";
				index += 2;
				mode = "code";
			} else {
				result += char === "\n" ? "\n" : " ";
				index += 1;
			}
			continue;
		}

		if (char === "\\") {
			result += "  ";
			index += 2;
			continue;
		}
		result += char === "\n" ? "\n" : " ";
		if (
			(mode === "single" && char === "'") ||
			(mode === "double" && char === '"') ||
			(mode === "template" && char === "`")
		) {
			mode = "code";
		}
		index += 1;
	}

	return result;
}


src/features/Plugin/agent/runtime/default-agent.ts

import {
	isStepCount,
	type ModelMessage,
	ToolLoopAgent,
	type ToolSet,
	tool,
} from "ai";
import { z } from "zod";
import type { ChatMessage } from "@/features/Conversation/dataflow/types";
import type { SandboxEnvironment } from "@/features/Plugin/runtime/sandbox";
import { createToolLoopAgent, streamText } from "@/features/Request/ai-sdk";
import { useRequestDefaults } from "@/features/Request/defaults";
import {
	parseModelReference,
	type ReasoningEffort,
} from "@/features/Request/provider/shared/model-reference";
import { useRequestStore } from "@/features/Request/request-store";
import type { ModelSelection } from "@/features/Request/types";
import { askUser } from "./ask-user";
import { executeCodeAct } from "./code-act";

export interface CreateDefaultAgentResourcesInput {
	environment?: SandboxEnvironment;
	modelName?: string | ModelSelection;
	onCodeAct?: () => void;
}

interface DefaultAgentResources {
	model: ModelSelection;
	modelName: string;
	reasoning?: ReasoningEffort;
	instructions: string;
	tools: ToolSet;
	stopWhen: ReturnType<typeof isStepCount>;
	finish: () => Promise<void>;
}

/**
 * The persisted reply target supplied by Conversation generation. Plugins pass
 * this as `container` when constructing the sandbox ToolLoopAgent wrapper.
 */
type AgentOutputContainer = ChatMessage;

interface ContainerToolLoopAgent {
	stream: (input: { messages: ModelMessage[] }) => Promise<void>;
}

export interface AgentResourceProvider {
	ToolLoopAgent: new (input: {
		container: AgentOutputContainer;
	}) => ContainerToolLoopAgent;
	streamText: (input: {
		container: AgentOutputContainer;
		messages: ModelMessage[];
	}) => Promise<void>;
	askUser: typeof askUser;
}

const jsInputSchema = z.object({
	code: z
		.string()
		.describe(
			"One JavaScript function with an explicit return, for example `async function () { return await plugin.listContainers(); }`.",
		),
});

const codeActInstructions = [
	"Use the single codeAct tool for every API operation.",
	"When user input is needed to continue, call await agent.askUser({ questions: [{ id, question, kind: 'text' | 'select' | 'multi-select' | 'boolean', options?, placeholder? }] }) inside codeAct and handle its { answers, cancelled } result. Boolean questions use true for accept and false for reject.",
	"Never narrate private planning, tool selection, or tool execution in the final text. Those are recorded separately by the runtime.",
	"Use normal text only for the final user-facing answer after the necessary tool calls are complete.",
	"Submit one JavaScript function in the form `async function () { ... return value; }`.",
	"The function must contain an explicit return. Use only APIs documented in the current context.",
	"Return plain serializable data. Preserve resource paths when later calls may need to follow the result.",
	"To delegate a bounded task, call `await generate({ plugin?, environment?, prompt })` inside the function. The plugin is a global source folder name; it defaults to blank, and an omitted environment uses an in-memory temporary conversation.",
	"Plugin tool functions, when their prompt is present in the compiled context, are ordinary functions directly on ctx. Call the documented function name inside codeAct.",
	"Inspect slot contracts with `slot.list()` / `get()`. `slot.paths('<name>')` returns selected resource paths; pass them to `await parse(...)` for recursive macro expansion. A chat resource returns pure message[] without authoring labels or disabled entries.",
	"World write/edit/mkdir/move/remove and writable .data wrapper operations update the current message-bound World immediately. A resource contributes to its referenced slot only when it is selected; files stay directly readable either way.",
	"Resource paths beginning with `/` address the local tree; `/global/<source-folder>/path` addresses a shared source. In source code, `@/path` remains local to the source folder. Use open(path), close(path), or toggle(path) only for resources, never folders or slots.",
	"Read and update .data through its documented wrapper facade when possible. Persisted data values must remain pure JSON.",
	"The tool result contains either `{ ok: true, value }` or `{ ok: false, error }`; inspect errors and correct the next function.",
].join("\n");

function createCodeActTool(
	environment: SandboxEnvironment,
	onCodeAct?: () => void,
) {
	return {
		codeAct: tool({
			description: codeActInstructions,
			inputSchema: jsInputSchema,
			execute: async (input) => {
				onCodeAct?.();
				return executeCodeAct(input.code, environment);
			},
		}),
	};
}

async function createDefaultAgentResources(
	input: CreateDefaultAgentResourcesInput,
): Promise<DefaultAgentResources> {
	const configuredModel =
		input.modelName || useRequestDefaults().defaults.defaultChatModel;
	const parsedModel =
		typeof configuredModel === "string"
			? parseModelReference(configuredModel)
			: {
					providerId: configuredModel.providerId,
					modelId: configuredModel.modelId,
					reasoning: undefined,
				};
	const modelName = `${parsedModel.providerId}/${parsedModel.modelId}`;
	const reasoning = parsedModel.reasoning;
	const tools = createCodeActTool(input.environment ?? {}, input.onCodeAct);
	await useRequestStore().initialize();

	return {
		model: {
			providerId: parsedModel.providerId,
			modelId: parsedModel.modelId,
			kind: "text",
		},
		modelName,
		reasoning,
		instructions: codeActInstructions,
		tools,
		stopWhen: isStepCount(8),
		finish: async () => {},
	};
}

export function createAgentResourceProvider(
	input: CreateDefaultAgentResourcesInput,
): AgentResourceProvider {
	let prepared: Promise<DefaultAgentResources> | null = null;
	const prepare = () => {
		prepared ??= createDefaultAgentResources(input);
		return prepared;
	};
	const ContainerBoundToolLoopAgent = class implements ContainerToolLoopAgent {
		constructor(private readonly input: { container: AgentOutputContainer }) {
			if (!input?.container)
				throw new Error("ToolLoopAgent 需要输出 container。");
		}

		async stream({ messages }: { messages: ModelMessage[] }) {
			const runtime = await prepare();
			const output = this.input.container;
			const runner = createToolLoopAgent(
				{
					providerId: runtime.model.providerId,
					modelId: runtime.model.modelId,
					kind: "text",
				},
				{
					model: runtime.model,
					reasoning: runtime.reasoning,
					allowSystemInMessages: true,
					instructions: runtime.instructions,
					tools: runtime.tools,
					activeTools: ["codeAct"],
					stopWhen: runtime.stopWhen,
				},
				(options) =>
					new ToolLoopAgent(
						options as ConstructorParameters<typeof ToolLoopAgent>[0],
					),
			) as ToolLoopAgent<never, ToolSet, any>;
			const thinkingById = new Map<string, string>();
			const generateInfo = (output.meta.generateInfo ??= {
				startTime: new Date().toISOString(),
			});
			try {
				generateInfo.modelName = runtime.modelName;
				const result = await runner.stream({ messages });
				for await (const part of result.fullStream) {
					if (part.type === "text-delta") {
						output.content += part.text;
					} else if (part.type === "reasoning-start") {
						thinkingById.set(part.id, "");
						output.meta.steps.push({
							type: "thinking",
							id: part.id,
							message: "",
						});
					} else if (part.type === "reasoning-delta") {
						const thinking = (thinkingById.get(part.id) ?? "") + part.text;
						thinkingById.set(part.id, thinking);
						const step = output.meta.steps.find(
							(candidate) =>
								candidate.type === "thinking" && candidate.id === part.id,
						);
						if (step?.type === "thinking") step.message = thinking;
					} else if (part.type === "tool-call") {
						output.meta.steps.push({
							type: "tool-call",
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							input: part.input,
						});
					} else if (part.type === "tool-result") {
						const step = {
							type: "tool-result",
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							input: part.input,
							output: part.output,
						} as const;
						const index = output.meta.steps.findIndex(
							(candidate) =>
								candidate.type === "tool-call" &&
								candidate.toolCallId === part.toolCallId,
						);
						if (index < 0) output.meta.steps.push(step);
						else output.meta.steps.splice(index, 1, step);
					} else if (part.type === "tool-error") {
						const step = {
							type: "tool-result",
							toolCallId: part.toolCallId,
							toolName: part.toolName,
							input: part.input,
							output: {
								ok: false,
								error:
									part.error instanceof Error
										? part.error.message
										: String(part.error),
							},
						} as const;
						const index = output.meta.steps.findIndex(
							(candidate) =>
								candidate.type === "tool-call" &&
								candidate.toolCallId === part.toolCallId,
						);
						if (index < 0) output.meta.steps.push(step);
						else output.meta.steps.splice(index, 1, step);
					} else if (part.type === "error") {
						throw part.error instanceof Error
							? part.error
							: new Error(String(part.error));
					} else if (part.type === "abort") {
						throw new Error(part.reason || "生成已中止。");
					}
				}
				generateInfo.usage = await result.usage;
				generateInfo.finishTime = new Date().toISOString();
			} finally {
				await runtime.finish();
			}
		}
	};

	const streamTextFn = async ({
		container,
		messages,
	}: {
		container: AgentOutputContainer;
		messages: ModelMessage[];
	}) => {
		if (!container) throw new Error("streamText 需要输出 container。");
		const runtime = await prepare();
		const thinkingById = new Map<string, string>();
		const generateInfo = (container.meta.generateInfo ??= {
			startTime: new Date().toISOString(),
		});
		try {
			generateInfo.modelName = runtime.modelName;
			const result = streamText({
				model: {
					providerId: runtime.model.providerId,
					modelId: runtime.model.modelId,
					kind: "text",
				},
				messages,
				system: runtime.instructions,
				allowSystemInMessages: true,
				...(runtime.reasoning
					? { reasoning: runtime.reasoning }
					: { reasoningEffort: "auto" }),
			});
			for await (const part of result.fullStream) {
				if (part.type === "text-delta") {
					container.content += part.text;
				} else if (part.type === "reasoning-start") {
					thinkingById.set(part.id, "");
					container.meta.steps.push({
						type: "thinking",
						id: part.id,
						message: "",
					});
				} else if (part.type === "reasoning-delta") {
					const thinking = (thinkingById.get(part.id) ?? "") + part.text;
					thinkingById.set(part.id, thinking);
					const step = container.meta.steps.find(
						(candidate) =>
							candidate.type === "thinking" && candidate.id === part.id,
					);
					if (step?.type === "thinking") step.message = thinking;
				} else if (part.type === "error") {
					throw part.error instanceof Error
						? part.error
						: new Error(String(part.error));
				} else if (part.type === "abort") {
					throw new Error(part.reason || "生成已中止。");
				}
			}
			generateInfo.usage = await result.usage;
			generateInfo.finishTime = new Date().toISOString();
		} finally {
			await runtime.finish();
		}
	};

	return {
		ToolLoopAgent: ContainerBoundToolLoopAgent,
		streamText: streamTextFn,
		askUser,
	};
}


src/features/Plugin/builtIn/blank/.pulsar-plugin.json

{
	"version": 1,
	"plugin": {
		"id": "builtin-blank-plugin",
		"packageId": null,
		"name": "空白流程",
		"icon": "",
		"shortDescription": "不注入角色或模板上下文的最小子代理流程",
		"builtIn": true
	},
	"ignore": [".pulsar-plugin.json"],
	"nodes": {
		"/": { "id": "builtin-blank-root", "icon": "", "treeOrder": 0 },
		"config.json": {
			"id": "builtin-blank-config",
			"icon": "",
			"treeOrder": 0,
			"order": 100
		},
		"generate.js": {
			"id": "builtin-blank-generate",
			"icon": "",
			"treeOrder": 1,
			"order": 100,
			"insertion": { "slot": "generatePath" }
		}
	}
}


src/features/Plugin/builtIn/blank/config.json

{
	"generatePath": {
		"renderer": {
			"name": "Input",
			"title": "生成流程",
			"description": "用于验证流程执行，不注册任何 slot。"
		},
		"value": "generate.js"
	},
	"useMock": {
		"renderer": {
			"name": "Switch",
			"title": "使用 Mock 测试数据",
			"description": "开启时使用内置的 Markdown 模拟流式回复，关闭时调用真实 AI 模型。"
		},
		"value": true
	},
	"useStreamText": {
		"renderer": {
			"name": "Switch",
			"title": "使用 streamText 模式",
			"description": "开启时使用单次 streamText 生成正文，关闭时使用 ToolLoopAgent 支持多步工具循环。"
		},
		"value": false
	}
}


src/features/Plugin/builtIn/blank/generate.js

const config = await imports("@/config.json");
const useMock = config.useMock?.value !== false;
const useStreamText = Boolean(config.useStreamText?.value);

if (useMock) {
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	reply.meta.generateInfo ??= { startTime: new Date().toISOString() };
	reply.meta.generateInfo.modelName = "mock-deepseek-v4";

	const thinkingText = `The user wants me to output some markdown text for testing rendering. They want various markdown elements. Let me create a nice test markdown output. This is a simple request - I don't need to use any tools, just output markdown text directly.

Let me include various markdown elements: headings, bold, italic, links, images, code blocks, tables, lists, blockquotes, etc. Maybe also include a widget reference? The user just wants to test rendering. I could just output plain markdown. Let me keep it fun with the cat theme (喵).`;

	const outputText = `好的喵~ 这里是一份 Markdown 渲染测试样例，各种元素都覆盖了喵，直接复制或查看渲染效果即可～

## 标题层级

# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题

## 文本样式

- **粗体文字** 加粗喵
- *斜体文字* 倾斜喵
- ***粗斜体*** 又粗又斜喵
- ~~删除线~~ 划掉喵
- \`行内代码\` 是这样的喵
- <mark>高亮标记</mark>
- 下标 H~2~O，上标 E=mc^2^

## 引用

> 这是一条引用喵。
>
> > 嵌套引用也是可以的喵~
>
> —— 某只猫

## 列表

无序列表：
- 猫粮
- 猫砂
- 逗猫棒
  - 带羽毛的
  - 带铃铛的
- 猫抓板

有序列表：
1. 起床
2. 伸懒腰
3. 吃早饭
4. 晒太阳
5. 睡午觉

任务列表：
- [x] 已经做完的事
- [ ] 还没做的事
- [ ] 永远不想做的事

## 链接

[这是链接喵](https://example.com)

[带标题的链接](https://example.com "标题：喵呜")

自动链接：<https://example.com>

## 图片

![占位图片](https://picsum.photos/seed/cat/400/200 "喵喵图")

## 代码

行内代码：\`npm install catnip\`

\`\`\`js
// JavaScript 代码块喵
const cat = {
  name: "咪咪",
  meow() {
    console.log("喵~");
  },
};
cat.meow();
\`\`\`

\`\`\`python
# Python 代码块
def meow(times: int) -> str:
    return "喵" * times

print(meow(3))  # 喵喵喵
\`\`\`

\`\`\`bash
$ echo "喵喵喵" | lolcat
\`\`\`

## 表格

| 项目   | 数量 | 备注         |
| ------ | ---- | ------------ |
| 猫粮   | 3kg  | 三文鱼口味   |
| 猫砂   | 2袋  | 豆腐砂       |
| 零食   | 10包 | 冻干鸡肉     |
| 玩具   | 5个  | 逗猫棒*2     |

右对齐表格：

| 名字   | 年龄 | 体重(kg) |
| ------: | ----: | ------: |
| 咪咪   | 3    | 4.5     |
| 团子   | 1    | 3.2     |

## 分割线

---

## 其他元素

脚注：喵星人是最可爱的生物[^1]。

[^1]: 这是脚注内容喵。

HTML 元素：<kbd>Ctrl</kbd> + <kbd>C</kbd> 复制，<kbd>Ctrl</kbd> + <kbd>V</kbd> 粘贴。

转义字符：\\*不是斜体\\*、\\\`不是代码\\\`、\\# 不是标题

Emoji：🐱 🐾 🐟 🧶 ☀️ 😺

> [!NOTE]
> 这是提示块喵。

> [!WARNING]
> 小心猫毛过敏喵。

## 长段落测试

这是一段很长很长的文字，用来测试换行和段落排版效果喵。Markdown 渲染器通常会把连续的文字自动折行，而两个换行之间才会形成新的段落。所以这段文字即使写得很长，也应该被当作一个段落来渲染喵。

第二段文字用来测试段落间距是否正常。正常情况下，段落之间应该有一定的垂直间距，让阅读更舒适。如果间距太小或者没有间距，那说明渲染器可能有问题喵。

## 数学公式（如果支持）

行内公式：$E = mc^2$

块级公式：

$$
\\int_0^\\infty e^{-\\x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

---

以上就是全部测试内容喵~ 辛苦你检查渲染效果了，有任何问题随时叫我喵！🐾`;

	// 1. 流式输出思考过程
	const thinking = { type: "thinking", id: "think-mock-1", message: "" };
	reply.meta.steps.push(thinking);
	let currentThinking = "";
	for (let i = 0; i < thinkingText.length; i += 8) {
		const chunk = thinkingText.slice(i, i + 8);
		currentThinking += chunk;
		thinking.message = currentThinking;
		await sleep(15);
	}

	await sleep(250);

	// 2. 流式输出 Markdown 正文
	for (let i = 0; i < outputText.length; i += 6) {
		const chunk = outputText.slice(i, i + 6);
		reply.content += chunk;
		await sleep(12);
	}
} else {
	const messages = ctx.chat;
	if (useStreamText) {
		await agent.streamText({ container: reply, messages });
	} else {
		const runner = new agent.ToolLoopAgent({ container: reply });
		await runner.stream({ messages });
	}
}


src/features/Plugin/builtIn/core/.pulsar-plugin.json

{
	"version": 1,
	"plugin": {
		"id": "builtin-core-plugin",
		"packageId": null,
		"name": "内置插件",
		"icon": "",
		"shortDescription": "PulsarAI 默认生成流程与资源",
		"builtIn": true
	},
	"ignore": [".pulsar-plugin.json", "**/.gitkeep"],
	"nodes": {
		"/": { "id": "builtin-root", "icon": "", "treeOrder": 0 },
		"AGENTS.md": {
			"id": "builtin-agents",
			"icon": "",
			"treeOrder": 1,
			"order": 100
		},
		"config.json": {
			"id": "builtin-config",
			"icon": "",
			"treeOrder": 2,
			"order": 100
		},
		"default.chat.json": {
			"id": "builtin-default-chat",
			"icon": "",
			"treeOrder": 4,
			"order": 100,
			"insertion": { "slot": "chat" }
		},
		"prompt.md": {
			"id": "builtin-prompt",
			"icon": "",
			"treeOrder": 5,
			"order": 100
		},
		"docs/package.md": {
			"id": "builtin-docs-package",
			"icon": "",
			"treeOrder": 0,
			"order": 100
		},
		"docs/plugin.md": {
			"id": "builtin-docs-plugin",
			"icon": "",
			"treeOrder": 1,
			"order": 100
		},
		"docs/conversation.md": {
			"id": "builtin-docs-conversation",
			"icon": "",
			"treeOrder": 2,
			"order": 100
		},
		"generate.js": {
			"id": "builtin-generate",
			"icon": "",
			"treeOrder": 6,
			"order": 100,
			"insertion": { "slot": "generatePath" }
		},
		"regex.json": {
			"id": "builtin-regex",
			"icon": "",
			"treeOrder": 7,
			"order": 100,
			"insertion": { "slot": "REGEX" }
		},
		"context": { "id": "builtin-context", "icon": "", "treeOrder": 8 },
		"context/build.js": {
			"id": "builtin-context-build",
			"icon": "",
			"treeOrder": 0,
			"order": 100,
			"insertion": { "slot": "CTX_BUILD" }
		},
		"context/before-regex.js": {
			"id": "builtin-context-before-regex",
			"icon": "",
			"treeOrder": 1,
			"order": 100,
			"insertion": { "slot": "CTX_PROCESS_BEFORE_REGEX" }
		},
		"context/data.data.json": {
			"id": "builtin-context-data",
			"icon": "",
			"treeOrder": 2,
			"order": 100,
			"insertion": { "slot": "DATA_INJECT" }
		},
		"context/data.chat.json": {
			"id": "builtin-context-data-prompt",
			"icon": "",
			"treeOrder": 3,
			"order": 100,
			"insertion": { "slot": "data_prompt" }
		},
		"components": { "id": "builtin-components", "icon": "", "treeOrder": 8 },
		"background": { "id": "builtin-background", "icon": "", "treeOrder": 9 },
		"background/classroom.png": {
			"id": "builtin-background-classroom",
			"icon": "",
			"treeOrder": 0,
			"order": 100,
			"insertion": { "slot": "background" }
		},
		"tools": { "id": "builtin-tools", "icon": "", "treeOrder": 10 },
		"action": { "id": "builtin-action", "icon": "", "treeOrder": 11 },
		"action/goal.js": {
			"id": "builtin-action-goal",
			"icon": "",
			"treeOrder": 0,
			"order": 100,
			"insertion": { "slot": "COMMAND" }
		},
		"action/process.js": {
			"id": "builtin-action-process",
			"icon": "",
			"treeOrder": 1,
			"order": 100,
			"insertion": { "slot": "COMMAND" }
		},
		"goal": { "id": "builtin-goal", "icon": "", "treeOrder": 12 },
		"goal/goal.data": {
			"id": "builtin-goal-data",
			"icon": "",
			"treeOrder": 0,
			"order": 100
		},
		"temp": { "id": "builtin-temp", "icon": "", "treeOrder": 13 },
		"cache": { "id": "builtin-cache", "icon": "", "treeOrder": 14 },
		"skill": { "id": "builtin-skill", "icon": "", "treeOrder": 15 }
	}
}


src/features/Plugin/builtIn/core/action/goal.js

const goalState = read("@/goal/goal.data");
const context = await parse(slot.paths("CTX_BUILD", "global"), ctx);
const messages = [
	...context,
	{
		role: "system",
		content: [
			"你正在执行 /goal。这个命令用于把用户目标转化为可编辑、可重放的 Markdown 任务状态。",
			"先读取 @/goal/goal.data。然后通过 edit('@/goal/goal.data', read('@/goal/goal.data'), nextMarkdown) 把它整体改写为简洁 Markdown：目标、约束、待办、已知事实和下一步。",
			"不要把任务状态写进 ctx.draft；ctx.draft 仅是本次命令的临时草稿。goal.data 才是后续 /process 的持久化输入。",
			"角色扮演时不得替玩家做选择、行动、内心或不可逆结果；把这些保留为选项或等待条件。",
			"完成状态编辑后，向用户简短说明 /process 将依据该文件推进一小步。",
			`当前 goal.data：\n${goalState || "(empty)"}`,
		].join("\n\n"),
	},
];
const runner = new agent.ToolLoopAgent({ container: reply });
await runner.stream({ messages });


src/features/Plugin/builtIn/core/action/process.js

const goalState = read("@/goal/goal.data");
if (!String(goalState || "").trim()) {
	reply.content = "当前没有可执行的 goal。先使用 /goal 设置目标和待办。";
} else {
	const context = await parse(slot.paths("CTX_BUILD", "global"), ctx);
	const messages = [
		...context,
		{
			role: "system",
			content: [
				"依据下面的 goal.data 执行一个最小、可见、可回应的下一步。",
				"完成后用 edit 更新完成项、事实和下一步；保持 Markdown 清晰。",
				"不得替玩家做选择、行动、内心或不可逆结果。若下一步需要玩家决定，给出场景状态或选项并在 goal.data 标明等待。",
				`goal.data：\n${goalState}`,
			].join("\n\n"),
		},
	];
	const runner = new agent.ToolLoopAgent({ container: reply });
	await runner.stream({ messages });
}


src/features/Plugin/builtIn/core/AGENTS.md

# 内置插件

`generate.js` 是默认生成入口，并由 `generatePath` 插槽中的已选资源确定。`runWorld()` 总是以具体消息版本的重放树组装 `ctx`；Conversation 不复制资源环境。`ctx` 包含 `conversationId`、`chat`、`conversation`、`input`、绑定的 `container`/`message`、`reply`、来源作用域的文件 API、插槽和 Agent。`reply` 就是当前 `ChatMessage`，读取或后处理时直接访问、赋值其字段。本地文件位于 `/`，共享来源位于 `/global/<source-folder>/`；脚本中的 `@/`、`./`、`../` 都相对当前来源文件解析。`tools/<name>/tool.js` 直接提供 `ctx[name]`。通过 `await parse(slot.paths("CTX_BUILD"), ctx)` 构建上下文，再创建 `new agent.ToolLoopAgent({ container: reply })`。调用 `await runner.stream({ messages })` 后，Agent 包装器自动准备模型，并直接写入模型名、流式正文与 thinking 步骤。

`action/goal.js` 与 `action/process.js` 也必须使用同一包装器。前者维护无提示词的 `goal/goal.data`，后者读取并推进它；不得手写 AI SDK 流循环或调用 `agent.prepare()`。


src/features/Plugin/builtIn/core/config.json

{
	"generation/model": {
		"renderer": {
			"name": "ModelSelect",
			"title": "模型",
			"description": "留空时继承全局默认模型；引用可附带思考强度。"
		},
		"value": null
	},
	"generatePath": {
		"renderer": {
			"name": "Input",
			"title": "生成流程",
			"description": "主插件执行的 JavaScript 文件路径。"
		},
		"value": "generate.js"
	},
	"useStreamText": {
		"renderer": {
			"name": "Switch",
			"title": "使用 streamText 模式",
			"description": "开启时使用单次 streamText 生成正文，关闭时使用 ToolLoopAgent 支持多步工具循环。"
		},
		"value": false
	},
	"compressionThreshold": {
		"renderer": {
			"name": "Slider",
			"title": "上下文保留比例",
			"description": "压缩时保留最近原文上下文的比例；0% 关闭压缩。",
			"min": 0,
			"max": 100,
			"step": 5,
			"suffix": "%"
		},
		"value": 25
	}
}


src/features/Plugin/builtIn/core/context/before-regex.js

return messages;


src/features/Plugin/builtIn/core/context/build.js

async () => {
	async function messagesForSlot(id) {
		const values = await Promise.all(
			slot.paths(id, "global").map((path) => parse(path)),
		);
		return values.flatMap((value) =>
			Array.isArray(value)
				? value
				: typeof value === "string" && value.trim()
					? [{ role: "system", content: value }]
					: [],
		);
	}

	let messages = [];
	for (const id of [
		"before_char",
		"character",
		"after_char",
		"user",
		"document",
		"data_prompt",
		"toolFunction",
		"chat",
	])
		messages.push(...(await messagesForSlot(id)));

	for (let depth = 6; depth >= 0; depth -= 1) {
		const injected = await messagesForSlot(`depth:${depth}`);
		messages.splice(Math.max(0, messages.length - depth), 0, ...injected);
	}

	for (const path of slot.paths("CTX_PROCESS_BEFORE_REGEX", "global")) {
		const next = await imports(path, { messages });
		if (Array.isArray(next)) messages = next;
	}

	const rules = (
		await Promise.all(
			slot.paths("REGEX", "global").map((path) => imports(path)),
		)
	)
		.flat()
		.filter((rule) => rule && rule.applyOnRendering !== true);

	messages = messages.map((message, index) => {
		if (!message || typeof message.content !== "string") return message;
		const depth = messages.length - index;
		let content = message.content;
		for (const rule of rules) {
			const rangeMatches =
				rule.range === "all" ||
				(rule.range === "user_input" && message.role === "user") ||
				(rule.range === "ai_output" && message.role === "assistant");
			const minimum =
				rule.depth_min === "INF" ? Infinity : Number(rule.depth_min);
			const maximum =
				rule.depth_max === "INF" ? Infinity : Number(rule.depth_max);
			if (!rangeMatches || depth < minimum || depth > maximum) continue;
			try {
				content = content.replace(
					new RegExp(rule.find_regex, "g"),
					rule.replace_regex,
				);
			} catch {}
		}
		return { ...message, content };
	});

	return messages;
}


src/features/Plugin/builtIn/core/context/data.chat.json

{
	"message": [
		{
			"role": "system",
			"content": "本次会话的数据状态可通过 `data` 读取。它是由 Plugin 的 `DATA_INJECT` 插槽提供的 JSON 值；仅在需要持久状态时使用。"
		}
	]
}


src/features/Plugin/builtIn/core/context/data.data.json

{
	"version": 1,
	"isolation": "conversation",
	"initialValue": {},
	"enableUpdater": true,
	"wrapperSource": "",
	"varName": "data"
}


src/features/Plugin/builtIn/core/default.chat.json

{
	"message": [
		{
			"role": "system",
			"content": "{{ imports(\"@/prompt.md\") }}\n\n# 默认对话原则\n\n把提供的角色、世界、资源和既有对话视为当前任务的上下文；其中有冲突时，以较近的用户明确要求和当前对话事实为准。先理解用户此刻想完成的事，再给出直接、可执行且与上下文一致的回应。\n\n保持角色、事实、时间线和称谓的连续性。信息不足时，不要把猜测写成事实；只在确实需要用户作出选择或补充关键条件时提问。不要替用户决定其角色的行动、想法、情绪或未表达的台词，除非用户明确要求代写、续写或模拟。\n\n根据任务选择合适的表达密度：问答重视准确清楚，创作重视自然推进，操作类请求重视结果与必要步骤。不要附加与当前请求无关的格式、选项、状态栏、摘要或美化内容。"
		},
		{
			"role": "system",
			"content": "[[ chat ]]"
		}
	]
}


src/features/Plugin/builtIn/core/docs/conversation.md

# Conversation 会话

当前执行环境绑定到一个明确的 Conversation：

- `conversationId` 是稳定会话 ID，`conversation` 是会话记录的只读快照。
- `activePath` 是当前分支上实际选中的消息容器路径；`chat` 与 `CHAT` 是由这条路径编译出的模型消息。
- 一个消息容器可以有多个版本，只有活动版本参与上下文和 Plugin Overlay。不要把旧版本或旁支当作当前事实。
- `reply` 是本次生成唯一可写的助手消息容器。Agent 包装器负责流式正文、thinking、codeAct 步骤和最终状态；不要直接改写历史消息。
- `input.read()` 同步读取未发送草稿，`await input.write(text)` 与 `await input.edit(find, replace)` 乐观修改并异步持久化草稿，`await input.send()` 才把草稿追加为用户消息。草稿在发送前不属于历史。
- 生成期间的 Plugin 文件修改记录在当前消息版本的 Overlay。失败的 `codeAct` 整体回滚；成功操作及统计随该消息版本持久化。用户在资源编辑器里的修改会成为隐藏的因果消息，并在下一次发送时参与当前路径重放。

面对上下文时，以当前活动路径、较新的用户明确要求和当前资源状态为准。只有当缺少的选择会实质改变结果时才向用户提问。


src/features/Plugin/builtIn/core/docs/package.md

# 角色包

角色包是一次长期角色体验的身份与资源边界，不是聊天记录本身。

- `localPlugin` 是当前本地 Plugin 的只读计算视图，`localPluginId` 是稳定 ID。名称、昵称和图标可能变化，不要用它们代替 ID 建立关系。
- 每个角色拥有一棵运行时 World：本地资源位于 `/self/`，共享来源映射到 `/global/<source-folder>/`；`definition.package.json.globalPlugins` 按文件夹名声明当前启用的多个共享来源。
- World config 的 `disabled` 路径决定哪些文件或 Plugin 挂载不参与插槽。`generatePath` 单选插槽使用排序最前的启用入口。
- Conversation 必须属于一个角色包。同一角色包可以有多个普通会话和测试会话，它们共享基础资源，但消息路径及其 Overlay 相互独立。
- 当前 Agent 没有直接修改角色包元数据的 API。需要查看或修改资料时操作 World；需要用户决定生成入口时应当询问用户。


src/features/Plugin/builtIn/core/docs/plugin.md

# Plugin 资源

World 是当前 Agent 的文件、上下文和可调用能力来源。本地资源位于 `/self/`，共享来源位于 `/global/<source-folder>/`，角色通过 `/self/definition.package.json` 的 `globalPlugins` 文件夹名称数组决定启用哪些共享来源及其合并顺序。每个来源先独立重放属于自己的 Pulse，再进行合并。资源源码中的 `@/path` 始终指向其所属来源根，并会按来源挂载规范化。

## 读取和导入

- `read(path)` 同步返回文件原始内容：文本资源为字符串，非文本资源为 `ArrayBuffer`。
- `imports(pathOrPaths, environment?)` 导入并包装一个或一组资源。它只处理各资源自身，不负责递归展开返回内容。
- `parse(pathOrPaths, environment?)` 导入选中资源后递归解析其宏；文本返回字符串，`.chat.json` 返回纯 `message[]`。它处理循环、轮次和日志，并且是异步的，因为宏内 JavaScript 可以产生 Promise。
- `slot.paths(id, scope?)` 同步返回插槽选中资源的显式路径数组；聊天上下文由选中的 `CTX_BUILD` 脚本构建。
- `.data.json` 只保存隔离、初始值与 facade。它们放进 `DATA_INJECT` 后由生成流程读取；给模型的数据说明使用独立 `.chat.json`，放进只供上下文构建读取的 `data_prompt`。
- 从多个挂载的容器取得资源时，每份文本里的 `@/` 已按其文件来源规范化，不会错误指向生成入口所在挂载。

## 文件操作

`fs.readMeta`、`ls`、`exists`、`write`、`edit`、`mkdir`、`move`、`remove` 操作当前 World。插槽属性由 `/self/slot/` 下的契约文件夹维护，资源选择直接写入资源节点。生成中的修改只在当前 Conversation 的消息路径上生效，并以整个 `codeAct` 为事务提交或回滚。

`open(path)`、`close(path)`、`toggle(path)` 打开、关闭或切换统一资产面板及资源编辑器。

不要直接修改返回对象来假装写入；使用文件 API。不要自行递归实现 import，也不要把 `imports` 当作 Sandbox 递归解析器。


src/features/Plugin/builtIn/core/generate.js

const config = await imports("@/config.json");
const useStreamText = Boolean(config.useStreamText?.value);
const messages = await parse(slot.paths("CTX_BUILD", "global"), ctx);

if (useStreamText) {
	await agent.streamText({ container: reply, messages });
} else {
	const runner = new agent.ToolLoopAgent({ container: reply });
	await runner.stream({ messages });
}

// 流结束后可直接读取和覆盖完整正文，执行正则或其它后处理。
// reply.content = process(reply.content);


src/features/Plugin/builtIn/core/prompt.md

You are Pulsar's conversation agent.

Use the single codeAct tool for API work. `read_docs()` synchronously lists the built-in documentation IDs; `read_docs("package")`, `read_docs("plugin")`, and `read_docs("conversation")` synchronously return the corresponding raw Markdown. Read only the documentation needed for the current operation. Tool prompts in the compiled context document ordinary function names directly available on `ctx`; call those names only after reading their prompt. Ask the user when a real decision is required.

When an interactive visual is useful, you may write a `.vue` file directly under this Plugin's `temp/` folder. Dynamic Plugin Vue components support a `<template>` only; do not rely on `<script>` execution. In a later Markdown reply, reference that direct filename on its own line as `<MyWidget.vue />`. Milkdown resolves this filename against the generating Plugin's `temp/` folder and renders it in the message.

For delegated work, call `await generate({ plugin?, environment?, prompt })`. `plugin` is a global Plugin folder name and defaults to `blank`, the minimal no-template sub-agent. `environment` is an existing conversation ID to use as read-only context; omit it to create an in-memory temporary conversation. `generate` resolves to the sub-agent's final text. Do not delegate a task unless its result will help the current reply.


src/features/Plugin/builtIn/core/regex.json

[]


src/features/Plugin/builtIn/default/.pulsar-plugin.json

{
	"version": 1,
	"plugin": {
		"id": "builtin-default-plugin",
		"packageId": null,
		"name": "默认插件模板",
		"icon": "",
		"shortDescription": "创建新插件时的默认模板（在 UI 中隐藏）",
		"builtIn": true,
		"hidden": true
	},
	"ignore": [".pulsar-plugin.json"],
	"nodes": {
		"/": { "id": "builtin-default-root", "icon": "", "treeOrder": 0 },
		"config.json": {
			"id": "builtin-default-config",
			"icon": "",
			"treeOrder": 0,
			"order": 100
		},
		"prompt.md": {
			"id": "builtin-default-prompt",
			"icon": "",
			"treeOrder": 3,
			"order": 100
		},
		"default.chat.json": {
			"id": "builtin-default-template-chat",
			"icon": "",
			"treeOrder": 4,
			"order": 100,
			"insertion": { "slot": "chat" }
		}
	}
}


src/features/Plugin/builtIn/default/config.json

{
	"generation/model": {
		"renderer": {
			"name": "ModelSelect",
			"title": "模型",
			"description": "留空时继承全局默认模型；引用可附带思考强度。"
		},
		"value": null
	},
	"temperature": 0.7,
	"maxTokens": 2048,
	"debugMode": false,
	"promptPrefix": ""
}


src/features/Plugin/builtIn/default/default.chat.json

{
	"message": [
		{
			"role": "system",
			"content": "[[ chat ]]"
		}
	]
}


src/features/Plugin/builtIn/default/prompt.md

# Instructions
You are Pulsar's conversation agent.


src/features/Plugin/components/FileTree.vue

<script setup lang="ts">
import { computed, ref } from "vue";
import { FluidHoverHighlight } from "@/components/fluid";
import { useFluidHover } from "@/components/fluid/hooks/use-fluid-hover";
import { ScrollArea } from "@/components/ui/scroll-area";
import FileTreeBranch from "./FileTreeBranch.vue";

type FileTreeActionTarget =
	| "file"
	| "folder"
	| ((node: FileTreeNode) => boolean);

export interface FileTreeAction {
	id: string;
	icon?: string;
	name: string;
	separatorBefore?: boolean;
	type?: FileTreeActionTarget;
	subActions?: FileTreeAction[];
	input?: {
		placeholder?: string;
		value?: (node: FileTreeNode) => string;
		submitLabel?: string;
	};
	choices?: Array<{ value: string; name: string; icon?: string }>;
	selected?: (node: FileTreeNode, value: string) => boolean;
}

export interface FileTreeActions {
	rename?: FileTreeAction;
	add?: FileTreeAction;
	[key: string]: FileTreeAction | undefined;
}

export interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	icon?: string;
	openIcon?: string;
	prefix?: string;
	suffix?: string;
	selectableResource?: boolean;
	resourceSelected?: boolean;
	selectionMode?: "none" | "single" | "multiple";
	disableRowOpen?: boolean;
	action?: FileTreeActions;
	children?: FileTreeNode[];
	/** Opaque feature data; the tree itself never interprets it. */
	data: any;
}

const props = withDefaults(
	defineProps<{
		nodes: FileTreeNode[];
		modelValue?: string;
		expanded?: string[];
		minWidth?: number;
	}>(),
	{ expanded: () => [], minWidth: 260 },
);
const emit = defineEmits<{
	"update:modelValue": [value: string];
	"update:expanded": [value: string[]];
	select: [node: FileTreeNode];
	open: [node: FileTreeNode];
	toggle: [node: FileTreeNode, expanded: boolean];
	"toggle-resource": [node: FileTreeNode, selected: boolean];
	action: [node: FileTreeNode, action: FileTreeAction, value?: string];
}>();

const expandedSet = computed(() => new Set(props.expanded));
const treeRef = ref<HTMLElement | null>(null);
let nextHoverIndex = 0;
const claimHoverIndex = () => nextHoverIndex++;
const {
	activeIndex: hoverIndex,
	itemRects: hoverRects,
	session: hoverSession,
	handlers: hoverHandlers,
	registerItem: registerHoverItem,
} = useFluidHover(treeRef, {
	isItemDisabled: (element) =>
		Boolean(element.closest(".file-tree-children:not(.is-open)")),
});
const hoverRect = computed(() =>
	hoverIndex.value === null
		? null
		: (hoverRects.value[hoverIndex.value] ?? null),
);

function select(node: FileTreeNode) {
	emit("update:modelValue", node.id);
	emit("select", node);
}

function toggle(node: FileTreeNode) {
	const expanded = !expandedSet.value.has(node.id);
	emit(
		"update:expanded",
		expanded
			? [...props.expanded, node.id]
			: props.expanded.filter((id) => id !== node.id),
	);
	emit("toggle", node, expanded);
}

function toggleResource(node: FileTreeNode, selected: boolean) {
	emit("toggle-resource", node, selected);
}

function runAction(node: FileTreeNode, action: FileTreeAction, value?: string) {
	emit("action", node, action, value);
}
</script>

<template>
  <ScrollArea class="min-h-0 max-h-full">
    <div
      ref="treeRef"
      class="file-tree relative min-h-0 p-1.5"
      :style="{ minWidth: `${minWidth}px` }"
      @mouseenter="hoverHandlers.onMouseEnter"
      @mousemove="hoverHandlers.onMouseMove"
      @mouseleave="hoverHandlers.onMouseLeave"
    >
      <FluidHoverHighlight :rect="hoverRect" :session="hoverSession" class="rounded-md" />
      <FileTreeBranch
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        :selected-id="modelValue"
        :expanded="expandedSet"
        :claim-hover-index="claimHoverIndex"
        :register-hover-item="registerHoverItem"
        @select="select"
        @open="emit('open', $event)"
        @toggle="toggle"
        @toggle-resource="toggleResource"
        @action="runAction"
      />
    </div>
  </ScrollArea>
</template>


src/features/Plugin/components/FileTreeBranch.vue

<script setup lang="ts">
import {
	type Component,
	type ComponentPublicInstance,
	computed,
	nextTick,
	ref,
} from "vue";
import {
	Button,
	CheckboxGroup,
	CheckboxItem,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	RadioGroup,
	RadioItem,
} from "@/components/fluid";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import * as PhosphorIcons from "@/lib/phosphor-icons";
import {
	Check,
	ChevronRight,
	ExternalLink,
	File,
	Folder,
	FolderOpen,
	MoreHorizontal,
	Plus,
} from "@/lib/phosphor-icons";
import type { FileTreeAction, FileTreeNode } from "./FileTree.vue";
import FileTreeBranch from "./FileTreeBranch.vue";

const props = defineProps<{
	node: FileTreeNode;
	selectedId?: string;
	expanded: Set<string>;
	claimHoverIndex?: () => number;
	registerHoverItem?: (index: number, element: HTMLElement | null) => void;
}>();
const emit = defineEmits<{
	select: [node: FileTreeNode];
	open: [node: FileTreeNode];
	toggle: [node: FileTreeNode];
	"toggle-resource": [node: FileTreeNode, selected: boolean];
	action: [node: FileTreeNode, action: FileTreeAction, value?: string];
}>();

const isFolder = computed(() => props.node.type === "folder");
const isExpanded = computed(() => props.expanded.has(props.node.id));
const children = computed(() => props.node.children ?? []);
const actions = computed(() =>
	Object.values(props.node.action ?? {}).filter(isVisibleAction),
);
const resourceMeta = computed(() => {
	if (!isFolder.value) return null;
	const selectionMode = props.node.data?.selectionMode;
	if (!selectionMode || selectionMode === "none") return "";
	const selected = children.value.filter((child) => child.resourceSelected);
	if (selectionMode === "multiple")
		return selected.length ? `${selected.length} 已选` : "";
	const selectedNode = selected[0];
	if (!selectedNode) return "";
	const duplicateName = children.value.some(
		(child) => child !== selectedNode && child.name === selectedNode.name,
	);
	return duplicateName && selectedNode.prefix
		? `${selectedNode.prefix} · ${selectedNode.name}`
		: selectedNode.name;
});
const hoverElements = new Map<string, HTMLElement>();
const registeredHoverIndices = new Map<string, number>();
const ownHoverIndex = props.claimHoverIndex?.();
const childHoverIndices = new Map<string, number>();

function childHoverIndex(id: string) {
	let index = childHoverIndices.get(id);
	if (index === undefined) {
		index = props.claimHoverIndex?.();
		if (index !== undefined) childHoverIndices.set(id, index);
	}
	return index;
}

function setHoverRow(
	key: string,
	index: number | undefined,
	value: Element | ComponentPublicInstance | null,
) {
	const element =
		value instanceof Element
			? (value as HTMLElement)
			: value?.$el instanceof Element
				? (value.$el as HTMLElement)
				: null;
	const previous = registeredHoverIndices.get(key);
	const previousElement = hoverElements.get(key);
	if (
		previous !== undefined &&
		(element === null || previous !== index || previousElement !== element)
	) {
		props.registerHoverItem?.(previous, null);
		registeredHoverIndices.delete(key);
	}
	if (element) hoverElements.set(key, element);
	else hoverElements.delete(key);
	if (
		element &&
		index !== undefined &&
		registeredHoverIndices.get(key) !== index
	) {
		props.registerHoverItem?.(index, element);
		registeredHoverIndices.set(key, index);
	}
}

const isRenaming = ref(false);
const renameDraft = ref("");
const renameInputRef = ref<HTMLInputElement | null>(null);

function startRename() {
	renameDraft.value = props.node.name;
	isRenaming.value = true;
	nextTick(() => {
		if (renameInputRef.value) {
			renameInputRef.value.focus();
			const dot =
				props.node.type === "file" ? props.node.name.lastIndexOf(".") : -1;
			if (dot > 0) renameInputRef.value.setSelectionRange(0, dot);
			else renameInputRef.value.select();
		}
	});
}

function commitRename() {
	if (!isRenaming.value) return;
	isRenaming.value = false;
	const name = renameDraft.value.trim();
	if (name && name !== props.node.name) {
		const renameAct = props.node.action?.rename ?? {
			id: "rename",
			name: "重命名",
		};
		emit("action", props.node, renameAct, name);
	}
}

function cancelRename() {
	isRenaming.value = false;
}

function activate() {
	if (isRenaming.value) return;
	emit("select", props.node);
	if (isFolder.value) {
		emit("toggle", props.node);
	} else if (props.node.selectableResource) {
		toggleResource(props.node, !props.node.resourceSelected);
	} else if (!props.node.disableRowOpen) {
		emit("open", props.node);
	}
}

function handleRowClick(e: MouseEvent) {
	if (isRenaming.value) return;
	const target = e.target as HTMLElement | null;
	if (
		target?.closest(
			".file-tree-actions, .file-tree-resource-toggle, .file-tree-open-button, input, button",
		)
	) {
		return;
	}
	activate();
}

function iconFor(name: string | undefined, fallback: Component) {
	if (!name) return fallback;
	const key = name.replace(/(^|[-_\s])(\w)/g, (_, __, letter) =>
		letter.toUpperCase(),
	);
	return (
		(PhosphorIcons as unknown as Record<string, Component>)[key] ?? fallback
	);
}

function toggleResource(node: FileTreeNode, selected: boolean) {
	emit("toggle-resource", node, selected);
}

function matchesAction(action: FileTreeAction) {
	if (!action.type) return true;
	if (typeof action.type === "function") return action.type(props.node);
	return action.type === props.node.type;
}

function isVisibleAction(
	action: FileTreeAction | undefined,
): action is FileTreeAction {
	return action !== undefined && matchesAction(action);
}

const inputValues = ref<Record<string, string>>({});
function inputKey(action: FileTreeAction) {
	return `${props.node.id}:${action.id}`;
}
function inputValue(action: FileTreeAction) {
	return (
		inputValues.value[inputKey(action)] ??
		action.input?.value?.(props.node) ??
		""
	);
}
function setInputValue(action: FileTreeAction, value: string) {
	inputValues.value[inputKey(action)] = value;
}

function runAction(action: FileTreeAction, value?: string) {
	if (action.id === "rename") {
		startRename();
		return;
	}
	if (action.input) delete inputValues.value[inputKey(action)];
	emit("action", props.node, action, value);
}

function forwardAction(
	node: FileTreeNode,
	action: FileTreeAction,
	value?: string,
) {
	emit("action", node, action, value);
}

const folderSelectionMode = computed<"none" | "single" | "multiple">(
	() => props.node.selectionMode ?? props.node.data?.selectionMode ?? "none",
);

const subFolderChildren = computed(() =>
	children.value.filter((child) => child.type === "folder"),
);
const fileChildren = computed(() =>
	children.value.filter((child) => child.type === "file"),
);

const isSlotFolder = computed(
	() =>
		isFolder.value &&
		folderSelectionMode.value !== "none" &&
		fileChildren.value.length > 0 &&
		fileChildren.value.some((child) => child.selectableResource),
);

const selectedRadioChildId = computed(() => {
	const selected = fileChildren.value.find((c) => c.resourceSelected);
	return selected?.id ?? "";
});

const checkedIndices = computed(() => {
	const set = new Set<number>();
	fileChildren.value.forEach((child, idx) => {
		if (child.resourceSelected) set.add(idx);
	});
	return set;
});

function handleRadioSelect(childId: string) {
	const target = fileChildren.value.find((c) => c.id === childId);
	if (target) {
		emit("select", target);
		toggleResource(target, true);
	}
}

function handleCheckboxToggle(child: FileTreeNode) {
	emit("select", child);
	toggleResource(child, !child.resourceSelected);
}

function matchesActionFor(node: FileTreeNode, action: FileTreeAction) {
	if (!action.type) return true;
	if (typeof action.type === "function") return action.type(node);
	return action.type === node.type;
}

function actionsFor(node: FileTreeNode): FileTreeAction[] {
	return Object.values(node.action ?? {}).filter(
		(act): act is FileTreeAction =>
			act !== undefined && matchesActionFor(node, act),
	);
}

function childInputKey(node: FileTreeNode, action: FileTreeAction) {
	return `${node.id}:${action.id}`;
}
function childInputValue(node: FileTreeNode, action: FileTreeAction) {
	return (
		inputValues.value[childInputKey(node, action)] ??
		action.input?.value?.(node) ??
		""
	);
}
function setChildInputValue(
	node: FileTreeNode,
	action: FileTreeAction,
	value: string,
) {
	inputValues.value[childInputKey(node, action)] = value;
}
function runChildAction(
	node: FileTreeNode,
	action: FileTreeAction,
	value?: string,
) {
	if (action.id === "rename") {
		emit("action", node, action, value);
		return;
	}
	if (action.input) delete inputValues.value[childInputKey(node, action)];
	emit("action", node, action, value);
}
</script>

<template>
  <div class="file-tree-branch">
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <div
          :ref="(element) => setHoverRow('self', ownHoverIndex, element)"
          class="file-tree-row group/tree-row cursor-pointer select-none"
          :class="{
            'is-selected': selectedId === node.id,
            'is-resource-selected': node.resourceSelected,
            'is-open': isExpanded,
          }"
          @click="handleRowClick"
        >
          <!-- Inline Rename Input -->
          <div v-if="isRenaming" class="flex h-full min-w-0 flex-1 items-center gap-1.5 py-0.5" @click.stop>
            <input
              ref="renameInputRef"
              v-model="renameDraft"
              class="h-7 w-full rounded border border-primary/60 bg-background px-2 font-mono text-xs text-foreground outline-none ring-1 ring-primary/40"
              @blur="commitRename"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="cancelRename"
            />
          </div>

          <!-- Normal Row Content -->
          <div
            v-else
            class="flex h-full min-w-0 flex-1 self-stretch items-center gap-1.5 text-left"
            role="button"
            tabindex="0"
            @keydown.enter="activate"
            @keydown.space.prevent="activate"
          >
            <ChevronRight v-if="isFolder" class="size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200" :class="{ 'rotate-90': isExpanded }" />
            <span v-else class="w-3.5 shrink-0" />

            <!-- Folder Icon -->
            <component
              v-if="isFolder"
              :is="iconFor(isExpanded ? (node.openIcon ?? node.icon) : node.icon, isExpanded ? FolderOpen : Folder)"
              class="size-4 shrink-0 text-muted-foreground/80"
            />

            <!-- Selectable Resource (Slot File): Radio or Checkbox -->
            <template v-else-if="node.selectableResource">
              <!-- Single selection: Radio Item style -->
              <button
                v-if="node.selectionMode === 'single'"
                type="button"
                class="file-tree-resource-toggle relative grid size-4 shrink-0 place-items-center cursor-pointer outline-none"
                :aria-label="node.resourceSelected ? `已选中 ${node.name}` : `选择 ${node.name}`"
                @click.stop="toggleResource(node, !node.resourceSelected)"
              >
                <div
                  class="size-3.5 rounded-full border transition-all duration-100"
                  :class="node.resourceSelected ? 'border-primary' : 'border-muted-foreground/50 group-hover/tree-row:border-foreground/70'"
                />
                <div
                  v-if="node.resourceSelected"
                  class="absolute size-2 rounded-full bg-primary"
                />
              </button>

              <!-- Multiple selection: Checkbox Item style -->
              <button
                v-else
                type="button"
                class="file-tree-resource-toggle relative grid size-4 shrink-0 place-items-center cursor-pointer outline-none"
                :aria-label="node.resourceSelected ? `已选中 ${node.name}` : `选择 ${node.name}`"
                @click.stop="toggleResource(node, !node.resourceSelected)"
              >
                <div
                  class="size-3.5 rounded-[4px] border transition-all duration-100 flex items-center justify-center"
                  :class="node.resourceSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50 group-hover/tree-row:border-foreground/70'"
                >
                  <Check v-if="node.resourceSelected" class="size-2.5 stroke-[3]" />
                </div>
              </button>
            </template>

            <!-- Regular File (Local / Global Tab): File Icon -->
            <component v-else :is="iconFor(node.icon, File)" class="size-4 shrink-0 text-muted-foreground/80" />

            <!-- Resource Prefix (e.g. Source Name) -->
            <span v-if="node.prefix" class="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{{ node.prefix }}</span>
            <span class="min-w-0 truncate">{{ node.name }}</span>
            <span v-if="node.suffix" class="shrink-0 text-[10px] text-muted-foreground">· {{ node.suffix }}</span>
          </div>

          <!-- Resource Meta / Badge -->
          <span v-if="resourceMeta" class="file-tree-resource-meta" :title="resourceMeta">{{ resourceMeta }}</span>

          <!-- Folder Items Count -->
          <span
            v-if="isFolder && children.length"
            class="file-tree-count text-[10px] tabular-nums font-mono text-muted-foreground/60 rounded bg-muted/50 px-1 py-0.5 shrink-0"
          >
            {{ children.length }}
          </span>

          <!-- Open file button for slot items -->
          <button
            v-if="node.selectableResource || node.disableRowOpen"
            type="button"
            class="file-tree-open-button shrink-0 grid size-5 place-items-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
            title="在编辑器中打开"
            aria-label="在编辑器中打开"
            @click.stop="emit('open', node)"
          >
            <ExternalLink class="size-3.5" />
          </button>

          <!-- Ellipsis Actions Menu -->
          <div v-if="actions.length" class="file-tree-actions shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button type="button" class="file-tree-action-button" aria-label="更多操作" title="更多操作" @click.stop><MoreHorizontal class="size-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <template v-for="(action, index) in actions" :key="action.id">
                  <DropdownMenuSeparator v-if="action.separatorBefore && index" />
                  <DropdownMenuSub v-if="action.subActions?.length">
                    <DropdownMenuSubTrigger :icon="iconFor(action.icon, Plus)" :label="action.name" />
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        v-for="subAction in action.subActions.filter(matchesAction)"
                        :key="subAction.id"
                        :icon="iconFor(subAction.icon, Plus)"
                        :label="subAction.name"
                        @select="runAction(subAction)"
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub v-else-if="action.input">
                    <DropdownMenuSubTrigger :icon="iconFor(action.icon, MoreHorizontal)" :label="action.name" />
                    <DropdownMenuSubContent class="w-60 p-2">
                      <div class="grid gap-2" @click.stop @keydown.stop>
                        <Input :model-value="inputValue(action)" :placeholder="action.input.placeholder" @update:model-value="setInputValue(action, String($event))" @keydown.enter.prevent="runAction(action, inputValue(action))" />
                        <Button size="sm" class="justify-center" @click="runAction(action, inputValue(action))">{{ action.input.submitLabel ?? '保存' }}</Button>
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub v-else-if="action.choices?.length">
                    <DropdownMenuSubTrigger :icon="iconFor(action.icon, MoreHorizontal)" :label="action.name" />
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        v-for="choice in action.choices"
                        :key="choice.value"
                        :icon="iconFor(choice.icon, MoreHorizontal)"
                        :label="choice.name"
                        :checked="action.selected?.(node, choice.value)"
                        @select="runAction(action, choice.value)"
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    v-else
                    :class="action.id === 'delete' ? 'text-destructive focus:text-destructive' : ''"
                    :icon="iconFor(action.icon, MoreHorizontal)"
                    :label="action.name"
                    @select="runAction(action)"
                  />
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent v-if="actions.length">
        <template v-for="(action, index) in actions" :key="action.id">
          <ContextMenuSeparator v-if="action.separatorBefore && index" />
          <ContextMenuSub v-if="action.subActions?.length">
            <ContextMenuSubTrigger><component :is="iconFor(action.icon, Plus)" class="mr-2 size-4" />{{ action.name }}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem v-for="subAction in action.subActions.filter(matchesAction)" :key="subAction.id" @select="runAction(subAction)"><component :is="iconFor(subAction.icon, Plus)" class="mr-2 size-4" />{{ subAction.name }}</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub v-else-if="action.input">
            <ContextMenuSubTrigger><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</ContextMenuSubTrigger>
            <ContextMenuSubContent class="w-60 p-2">
              <div class="grid gap-2" @click.stop @keydown.stop>
                <Input :model-value="inputValue(action)" :placeholder="action.input.placeholder" @update:model-value="setInputValue(action, String($event))" @keydown.enter.prevent="runAction(action, inputValue(action))" />
                <Button size="sm" class="justify-center" @click="runAction(action, inputValue(action))">{{ action.input.submitLabel ?? '保存' }}</Button>
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub v-else-if="action.choices?.length">
            <ContextMenuSubTrigger><component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />{{ action.name }}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem v-for="choice in action.choices" :key="choice.value" @select="runAction(action, choice.value)"><component :is="iconFor(choice.icon, MoreHorizontal)" class="mr-2 size-4" />{{ choice.name }}<Check v-if="action.selected?.(node, choice.value)" class="ml-auto size-4" /></ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem v-else :class="action.id === 'delete' ? 'text-destructive focus:text-destructive' : ''" @select="runAction(action)">
            <component :is="iconFor(action.icon, MoreHorizontal)" class="mr-2 size-4" />
            <span class="truncate">{{ action.name }}</span>
          </ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenu>
    <div v-if="isFolder" class="file-tree-children" :class="{ 'is-open': isExpanded }">
      <div class="file-tree-children-wrap">
        <!-- If it's a slot folder with single or multiple selection -->
        <template v-if="isSlotFolder">
          <!-- Any sub-folders in this slot -->
          <FileTreeBranch
            v-for="subFolder in subFolderChildren"
            :key="subFolder.id"
            :node="subFolder"
            :selected-id="selectedId"
            :expanded="expanded"
            :claim-hover-index="claimHoverIndex"
            :register-hover-item="registerHoverItem"
            @select="emit('select', $event)"
            @open="emit('open', $event)"
            @toggle="emit('toggle', $event)"
            @toggle-resource="toggleResource"
            @action="forwardAction"
          />

          <!-- Single Selection: Fluid RadioGroup & RadioItem -->
          <RadioGroup
            v-if="folderSelectionMode === 'single'"
            :model-value="selectedRadioChildId"
            class="w-full gap-0.5"
            size="compact"
            :hover-highlight="false"
            @update:model-value="handleRadioSelect"
          >
            <RadioItem
              :ref="(element) => setHoverRow(`child:${child.id}`, childHoverIndex(child.id), element)"
              v-for="(child, idx) in fileChildren"
              :key="child.id"
              :value="child.id"
              :index="idx"
              :selected="child.resourceSelected"
              class="file-tree-row file-tree-slot-file group/tree-row w-full cursor-pointer select-none"
              :class="{
                'is-selected': selectedId === child.id,
                'is-resource-selected': child.resourceSelected,
              }"
              @click="emit('select', child)"
              @dblclick="emit('open', child)"
            >
              <ContextMenu>
                <ContextMenuTrigger as-child>
                  <div class="flex h-full min-w-0 flex-1 items-center justify-between gap-1.5 text-left">
                    <div class="flex min-w-0 flex-1 items-center gap-1.5">
                      <span v-if="child.prefix" class="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{{ child.prefix }}</span>
                      <span class="min-w-0 truncate text-xs">{{ child.name }}</span>
                      <span v-if="child.suffix" class="shrink-0 text-[10px] text-muted-foreground">· {{ child.suffix }}</span>
                    </div>

                    <div class="flex items-center gap-0.5 shrink-0" @click.stop>
                      <button
                        v-if="child.selectableResource || child.disableRowOpen"
                        type="button"
                        class="file-tree-open-button shrink-0 grid size-5 place-items-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                        title="在编辑器中打开"
                        aria-label="在编辑器中打开"
                        @click.stop="emit('open', child)"
                      >
                        <ExternalLink class="size-3.5" />
                      </button>

                      <div v-if="actionsFor(child).length" class="file-tree-actions shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger as-child>
                            <button type="button" class="file-tree-action-button" aria-label="更多操作" title="更多操作" @click.stop><MoreHorizontal class="size-4" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <template v-for="(act, aIdx) in actionsFor(child)" :key="act.id">
                              <DropdownMenuSeparator v-if="act.separatorBefore && aIdx" />
                              <DropdownMenuSub v-if="act.subActions?.length">
                                <DropdownMenuSubTrigger :icon="iconFor(act.icon, Plus)" :label="act.name" />
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    v-for="subAction in act.subActions.filter((sa) => matchesActionFor(child, sa))"
                                    :key="subAction.id"
                                    :icon="iconFor(subAction.icon, Plus)"
                                    :label="subAction.name"
                                    @select="runChildAction(child, subAction)"
                                  />
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSub v-else-if="act.input">
                                <DropdownMenuSubTrigger :icon="iconFor(act.icon, MoreHorizontal)" :label="act.name" />
                                <DropdownMenuSubContent class="w-60 p-2">
                                  <div class="grid gap-2" @click.stop @keydown.stop>
                                    <Input :model-value="childInputValue(child, act)" :placeholder="act.input.placeholder" @update:model-value="setChildInputValue(child, act, String($event))" @keydown.enter.prevent="runChildAction(child, act, childInputValue(child, act))" />
                                    <Button size="sm" class="justify-center" @click="runChildAction(child, act, childInputValue(child, act))">{{ act.input.submitLabel ?? '保存' }}</Button>
                                  </div>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSub v-else-if="act.choices?.length">
                                <DropdownMenuSubTrigger :icon="iconFor(act.icon, MoreHorizontal)" :label="act.name" />
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    v-for="choice in act.choices"
                                    :key="choice.value"
                                    :icon="iconFor(choice.icon, MoreHorizontal)"
                                    :label="choice.name"
                                    :checked="act.selected?.(child, choice.value)"
                                    @select="runChildAction(child, act, choice.value)"
                                  />
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem
                                v-else
                                :class="act.id === 'delete' ? 'text-destructive focus:text-destructive' : ''"
                                :icon="iconFor(act.icon, MoreHorizontal)"
                                :label="act.name"
                                @select="runChildAction(child, act)"
                              />
                            </template>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent v-if="actionsFor(child).length">
                  <template v-for="(act, aIdx) in actionsFor(child)" :key="act.id">
                    <ContextMenuSeparator v-if="act.separatorBefore && aIdx" />
                    <ContextMenuSub v-if="act.subActions?.length">
                      <ContextMenuSubTrigger><component :is="iconFor(act.icon, Plus)" class="mr-2 size-4" />{{ act.name }}</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        <ContextMenuItem v-for="subAction in act.subActions.filter((sa) => matchesActionFor(child, sa))" :key="subAction.id" @select="runChildAction(child, subAction)"><component :is="iconFor(subAction.icon, Plus)" class="mr-2 size-4" />{{ subAction.name }}</ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub v-else-if="act.input">
                      <ContextMenuSubTrigger><component :is="iconFor(act.icon, MoreHorizontal)" class="mr-2 size-4" />{{ act.name }}</ContextMenuSubTrigger>
                      <ContextMenuSubContent class="w-60 p-2">
                        <div class="grid gap-2" @click.stop @keydown.stop>
                          <Input :model-value="childInputValue(child, act)" :placeholder="act.input.placeholder" @update:model-value="setChildInputValue(child, act, String($event))" @keydown.enter.prevent="runChildAction(child, act, childInputValue(child, act))" />
                          <Button size="sm" class="justify-center" @click="runChildAction(child, act, childInputValue(child, act))">{{ act.input.submitLabel ?? '保存' }}</Button>
                        </div>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub v-else-if="act.choices?.length">
                      <ContextMenuSubTrigger><component :is="iconFor(act.icon, MoreHorizontal)" class="mr-2 size-4" />{{ act.name }}</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        <ContextMenuItem v-for="choice in act.choices" :key="choice.value" @select="runChildAction(child, act, choice.value)"><component :is="iconFor(choice.icon, MoreHorizontal)" class="mr-2 size-4" />{{ choice.name }}<Check v-if="act.selected?.(child, choice.value)" class="ml-auto size-4" /></ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem v-else :class="act.id === 'delete' ? 'text-destructive focus:text-destructive' : ''" @select="runChildAction(child, act)">
                      <component :is="iconFor(act.icon, MoreHorizontal)" class="mr-2 size-4" />
                      <span class="truncate">{{ act.name }}</span>
                    </ContextMenuItem>
                  </template>
                </ContextMenuContent>
              </ContextMenu>
            </RadioItem>
          </RadioGroup>

          <!-- Multiple Selection: Fluid CheckboxGroup & CheckboxItem -->
          <CheckboxGroup
            v-else-if="folderSelectionMode === 'multiple'"
            :checked-indices="checkedIndices"
            class="w-full gap-0.5"
            size="compact"
            :hover-highlight="false"
          >
            <CheckboxItem
			  :ref="(element) => setHoverRow(`child:${child.id}`, childHoverIndex(child.id), element)"
              v-for="(child, idx) in fileChildren"
              :key="child.id"
              :index="idx"
              :checked="!!child.resourceSelected"
              class="file-tree-row file-tree-slot-file group/tree-row w-full cursor-pointer select-none"
              :class="{
                'is-selected': selectedId === child.id,
                'is-resource-selected': child.resourceSelected,
              }"
              @toggle="handleCheckboxToggle(child)"
              @click="emit('select', child)"
              @dblclick="emit('open', child)"
            >
              <ContextMenu>
                <ContextMenuTrigger as-child>
                  <div class="flex h-full min-w-0 flex-1 items-center justify-between gap-1.5 text-left">
                    <div class="flex min-w-0 flex-1 items-center gap-1.5">
                      <span v-if="child.prefix" class="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{{ child.prefix }}</span>
                      <span class="min-w-0 truncate text-xs">{{ child.name }}</span>
                      <span v-if="child.suffix" class="shrink-0 text-[10px] text-muted-foreground">· {{ child.suffix }}</span>
                    </div>

                    <div class="flex items-center gap-0.5 shrink-0" @click.stop>
                      <button
                        v-if="child.selectableResource || child.disableRowOpen"
                        type="button"
                        class="file-tree-open-button shrink-0 grid size-5 place-items-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                        title="在编辑器中打开"
                        aria-label="在编辑器中打开"
                        @click.stop="emit('open', child)"
                      >
                        <ExternalLink class="size-3.5" />
                      </button>

                      <div v-if="actionsFor(child).length" class="file-tree-actions shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger as-child>
                            <button type="button" class="file-tree-action-button" aria-label="更多操作" title="更多操作" @click.stop><MoreHorizontal class="size-4" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <template v-for="(act, aIdx) in actionsFor(child)" :key="act.id">
                              <DropdownMenuSeparator v-if="act.separatorBefore && aIdx" />
                              <DropdownMenuSub v-if="act.subActions?.length">
                                <DropdownMenuSubTrigger :icon="iconFor(act.icon, Plus)" :label="act.name" />
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    v-for="subAction in act.subActions.filter((sa) => matchesActionFor(child, sa))"
                                    :key="subAction.id"
                                    :icon="iconFor(subAction.icon, Plus)"
                                    :label="subAction.name"
                                    @select="runChildAction(child, subAction)"
                                  />
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSub v-else-if="act.input">
                                <DropdownMenuSubTrigger :icon="iconFor(act.icon, MoreHorizontal)" :label="act.name" />
                                <DropdownMenuSubContent class="w-60 p-2">
                                  <div class="grid gap-2" @click.stop @keydown.stop>
                                    <Input :model-value="childInputValue(child, act)" :placeholder="act.input.placeholder" @update:model-value="setChildInputValue(child, act, String($event))" @keydown.enter.prevent="runChildAction(child, act, childInputValue(child, act))" />
                                    <Button size="sm" class="justify-center" @click="runChildAction(child, act, childInputValue(child, act))">{{ act.input.submitLabel ?? '保存' }}</Button>
                                  </div>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSub v-else-if="act.choices?.length">
                                <DropdownMenuSubTrigger :icon="iconFor(act.icon, MoreHorizontal)" :label="act.name" />
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    v-for="choice in act.choices"
                                    :key="choice.value"
                                    :icon="iconFor(choice.icon, MoreHorizontal)"
                                    :label="choice.name"
                                    :checked="act.selected?.(child, choice.value)"
                                    @select="runChildAction(child, act, choice.value)"
                                  />
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem
                                v-else
                                :class="act.id === 'delete' ? 'text-destructive focus:text-destructive' : ''"
                                :icon="iconFor(act.icon, MoreHorizontal)"
                                :label="act.name"
                                @select="runChildAction(child, act)"
                              />
                            </template>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent v-if="actionsFor(child).length">
                  <template v-for="(act, aIdx) in actionsFor(child)" :key="act.id">
                    <ContextMenuSeparator v-if="act.separatorBefore && aIdx" />
                    <ContextMenuSub v-if="act.subActions?.length">
                      <ContextMenuSubTrigger><component :is="iconFor(act.icon, Plus)" class="mr-2 size-4" />{{ act.name }}</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        <ContextMenuItem v-for="subAction in act.subActions.filter((sa) => matchesActionFor(child, sa))" :key="subAction.id" @select="runChildAction(child, subAction)"><component :is="iconFor(subAction.icon, Plus)" class="mr-2 size-4" />{{ subAction.name }}</ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub v-else-if="act.input">
                      <ContextMenuSubTrigger><component :is="iconFor(act.icon, MoreHorizontal)" class="mr-2 size-4" />{{ act.name }}</ContextMenuSubTrigger>
                      <ContextMenuSubContent class="w-60 p-2">
                        <div class="grid gap-2" @click.stop @keydown.stop>
                          <Input :model-value="childInputValue(child, act)" :placeholder="act.input.placeholder" @update:model-value="setChildInputValue(child, act, String($event))" @keydown.enter.prevent="runChildAction(child, act, childInputValue(child, act))" />
                          <Button size="sm" class="justify-center" @click="runChildAction(child, act, childInputValue(child, act))">{{ act.input.submitLabel ?? '保存' }}</Button>
                        </div>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub v-else-if="act.choices?.length">
                      <ContextMenuSubTrigger><component :is="iconFor(act.icon, MoreHorizontal)" class="mr-2 size-4" />{{ act.name }}</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        <ContextMenuItem v-for="choice in act.choices" :key="choice.value" @select="runChildAction(child, act, choice.value)"><component :is="iconFor(choice.icon, MoreHorizontal)" class="mr-2 size-4" />{{ choice.name }}<Check v-if="act.selected?.(child, choice.value)" class="ml-auto size-4" /></ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem v-else :class="act.id === 'delete' ? 'text-destructive focus:text-destructive' : ''" @select="runChildAction(child, act)">
                      <component :is="iconFor(act.icon, MoreHorizontal)" class="mr-2 size-4" />
                      <span class="truncate">{{ act.name }}</span>
                    </ContextMenuItem>
                  </template>
                </ContextMenuContent>
              </ContextMenu>
            </CheckboxItem>
          </CheckboxGroup>
        </template>

        <!-- Standard / fallback children -->
        <template v-else>
          <FileTreeBranch
            v-for="child in children"
            :key="child.id"
            :node="child"
            :selected-id="selectedId"
            :expanded="expanded"
            :claim-hover-index="claimHoverIndex"
            :register-hover-item="registerHoverItem"
            @select="emit('select', $event)"
            @open="emit('open', $event)"
            @toggle="emit('toggle', $event)"
            @toggle-resource="toggleResource"
            @action="forwardAction"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree-branch {
	min-width: 0;
}

:deep(.file-tree-slot-file > span) {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: center;
}

.file-tree-row {
	position: relative;
	display: flex;
	width: auto;
	min-width: 0;
	height: 34px;
	margin: 1px 6px;
	padding: 0 6px;
	align-items: center;
	gap: 7px;
	border-radius: 6px;
	color: var(--muted-foreground);
	font-size: 12px;
	line-height: 1.25;
	text-align: start;
	transition: background-color 130ms ease, color 130ms ease;
}

.file-tree-row:hover {
	color: var(--foreground);
}

.file-tree-row.is-selected {
	background: color-mix(in oklab, var(--primary) 13%, transparent);
	color: var(--foreground);
}

.file-tree-row.is-selected::before {
	position: absolute;
	left: 0;
	top: 4px;
	bottom: 4px;
	width: 2px;
	border-radius: 999px;
	background: var(--primary);
	content: "";
}

.file-tree-row.is-selected :deep(.file-tree-resource-meta) {
	color: color-mix(in oklab, var(--foreground) 62%, transparent);
}

.file-tree-resource-toggle {
	position: relative;
	z-index: 1;
}

.file-tree-resource-toggle .file-tree-select-indicator {
	display: none;
}

.file-tree-row.is-resource-selected .file-tree-resource-toggle {
	color: var(--primary);
}

.file-tree-row.is-resource-selected .file-tree-resource-toggle .file-tree-file-icon {
	display: none;
}

.file-tree-row.is-resource-selected .file-tree-resource-toggle .file-tree-select-indicator {
	display: block;
	fill: var(--primary);
	stroke: var(--primary-foreground);
}

.file-tree-resource-meta {
	max-width: 8rem;
	overflow: hidden;
	color: color-mix(in oklab, var(--foreground) 44%, transparent);
	font-size: 10px;
	line-height: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.file-tree-actions {
	display: flex;
	align-items: center;
	gap: 2px;
}

.file-tree-open-button {
	pointer-events: none;
	opacity: 0;
	transition: opacity 130ms ease, color 130ms ease, background-color 130ms ease;
}

.file-tree-action-button {
	display: grid;
	width: 20px;
	height: 22px;
	place-items: center;
	border-radius: 5px;
	color: color-mix(in oklab, var(--foreground) 54%, transparent);
	transition: background-color 130ms ease, color 130ms ease, opacity 150ms ease,
		transform 150ms ease;
}

.file-tree-action-button:hover,
.file-tree-action-button:focus-visible {
	background: color-mix(in oklab, var(--foreground) 8%, transparent);
	color: var(--foreground);
	outline: none;
}

.file-tree-children {
	display: grid;
	grid-template-rows: 0fr;
	opacity: 0;
	transition: grid-template-rows 260ms cubic-bezier(0.4, 0, 0.2, 1),
		opacity 180ms ease;
}

.file-tree-children.is-open {
	grid-template-rows: 1fr;
	opacity: 1;
}

.file-tree-children-wrap {
	position: relative;
	min-height: 0;
	overflow: hidden;
	padding-left: 14px;
}

.file-tree-children-wrap::before {
	position: absolute;
	left: 12px;
	top: 0;
	bottom: 0;
	width: 1px;
	background: color-mix(in oklab, var(--foreground) 10%, transparent);
	content: "";
}

@media (hover: hover) and (pointer: fine) {
	.file-tree-row:hover .file-tree-resource-meta {
		display: none;
	}

	.file-tree-actions,
	.file-tree-open-button {
		pointer-events: none;
		opacity: 0;
	}

	.file-tree-row:hover .file-tree-actions,
	.file-tree-actions:focus-within,
	.file-tree-row:hover .file-tree-open-button {
		pointer-events: auto;
		opacity: 1;
	}

	.file-tree-row:hover:not(.is-resource-selected)
		.file-tree-resource-toggle
		.file-tree-file-icon {
		display: none;
	}

	.file-tree-row:hover:not(.is-resource-selected)
		.file-tree-resource-toggle
		.file-tree-select-indicator {
		display: block;
	}
}

@media (hover: none) {
	.file-tree-resource-toggle .file-tree-file-icon {
		display: none;
	}

	.file-tree-resource-toggle .file-tree-select-indicator {
		display: block;
	}
}

@media (prefers-reduced-motion: reduce) {
	.file-tree-children,
	.file-tree-action-button {
		transition: none;
	}
}
</style>


src/features/Plugin/components/index.ts

export type {
	FileTreeAction,
	FileTreeActions,
	FileTreeNode,
} from "./FileTree.vue";
export { default as FileTree } from "./FileTree.vue";


src/features/Plugin/dataflow/index.ts

export * from "./plugin-version";
export * from "./pulse";
export * from "./types";
export * from "./use-file-api";
export * from "./use-plugin-data";
export * from "./use-slot";


src/features/Plugin/dataflow/plugin-version.ts

import { toRaw } from "vue";
import { compactPulses, replayPluginData } from "./pulse";
import type { PluginData, PluginDocument, PluginVersion, Pulse } from "./types";

export function latestPluginVersion(document: PluginDocument) {
	return document.versions.at(-1) ?? null;
}

/** Establish the initial version at creation/import, never during loading. */
export function preparePluginDocument(
	source: PluginData & { versions?: PluginVersion[] },
): PluginDocument {
	return {
		...source,
		versions: source.versions?.length
			? source.versions
			: [
					createPluginVersion(
						{ id: source.id, tree: source.tree, meta: source.meta },
						[],
					),
				],
	};
}

export function replayPluginVersion(
	document: PluginDocument,
	versionId: string,
	additionalPulses: readonly Pulse[] = [],
): PluginData {
	const version = document.versions.find((item) => item.id === versionId);
	if (!version) throw new Error(`Plugin 版本不存在：${versionId}`);
	const original = toRaw(document);
	return replayPluginData(
		{ id: original.id, tree: original.tree, meta: original.meta },
		[version.pulses, additionalPulses],
	);
}

function versionId() {
	return `${crypto.randomUUID().replaceAll("-", "")}${Date.now()
		.toString(16)
		.padStart(8, "0")}`.slice(-40);
}

/** Creates a new mutable head. Referenced heads are never changed again. */
export function createPluginVersion(
	document: PluginData | PluginDocument,
	pending: readonly Pulse[],
): PluginVersion {
	const previous =
		"versions" in document ? latestPluginVersion(document) : null;
	const createdAt = new Date().toISOString();
	const pulses = compactPulses([...(previous?.pulses ?? []), ...pending]).map(
		(pulse) => structuredClone(toRaw(pulse)),
	);
	const parentId = previous?.id ?? null;
	return { id: versionId(), parentId, createdAt, pulses };
}

/** Appends and compacts one unreferenced head without changing its identity. */
export function appendPluginVersion(version: PluginVersion, pulse: Pulse) {
	return {
		...version,
		pulses: compactPulses([...version.pulses, pulse]).map((item) =>
			structuredClone(toRaw(item)),
		),
	};
}


src/features/Plugin/dataflow/pulse.ts

import { toRaw } from "vue";
import {
	defaultFileMeta,
	defaultFolderMeta,
	type FileMeta,
	type FolderMeta,
	type PluginData,
	type Pulse,
	type ResourceMeta,
	type ResourceNode,
	type ResourcePath,
	type ResourceTree,
} from "./types";

type ResolvedNode = {
	node: ResourceNode;
	parent: ResourceTree | null;
	name: string | null;
	path: ResourcePath;
};

function own<T extends object>(value: T, key: PropertyKey) {
	return Object.hasOwn(value, key);
}

function set(target: object, key: string, value: unknown) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}

export function normalizeResourcePath(path: string): ResourcePath {
	const source = path.trim();
	if (!source.startsWith("/"))
		throw new Error(`资源路径必须以 / 开头：${path}`);
	const parts = source.split("/").filter(Boolean);
	if (parts.some((part) => part === "." || part === ".."))
		throw new Error(`资源路径不能包含 . 或 ..：${path}`);
	return parts.length ? `/${parts.join("/")}` : "/";
}

export type PluginPath =
	| { scope: "local"; path: ResourcePath }
	| { scope: "global"; folder: string; path: ResourcePath };

/** `/x` belongs to the local source; `/global/<folder>/x` addresses one global source. */
export function parsePluginPath(path: string): PluginPath {
	const normalized = normalizeResourcePath(path);
	const parts = normalized.slice(1).split("/").filter(Boolean);
	if (parts[0] !== "global") return { scope: "local", path: normalized };
	const folder = parts[1];
	if (!folder) throw new Error(`全局资源路径缺少 Plugin 文件夹：${path}`);
	return {
		scope: "global",
		folder,
		path: parts.length > 2 ? `/${parts.slice(2).join("/")}` : "/",
	};
}

/** Resolves authored `@/` and relative references without leaking global mount prefixes into source text. */
export function resolveResourcePath(sourcePath: ResourcePath, request: string) {
	if (request.startsWith("/")) return normalizeResourcePath(request);
	const source = parsePluginPath(sourcePath);
	const root = source.scope === "local" ? "" : `/global/${source.folder}`;
	if (request.startsWith("@/"))
		return normalizeResourcePath(`${root}/${request.slice(2)}`);
	const parent = sourcePath.split("/").slice(0, -1);
	const rootLength = source.scope === "local" ? 1 : 3;
	for (const part of request.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			if (parent.length <= rootLength)
				throw new Error(`资源引用不能越过来源根目录：${request}`);
			parent.pop();
		} else parent.push(part);
	}
	return normalizeResourcePath(parent.join("/") || "/");
}

export function parentPath(path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") return null;
	const index = normalized.lastIndexOf("/");
	return index === 0 ? "/" : normalized.slice(0, index);
}

function basename(path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") throw new Error("资源根目录没有名称。");
	return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function isResourceTree(
	node: ResourceNode | null | undefined,
): node is ResourceTree {
	return typeof node === "object" && node !== null && !Array.isArray(node);
}

export function resolveNode(
	tree: ResourceTree,
	path: ResourcePath,
): ResolvedNode {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/")
		return { node: tree, parent: null, name: null, path: normalized };
	let parent: ResourceTree | null = null;
	let node: ResourceNode = tree;
	let name: string | null = null;
	for (const part of normalized.slice(1).split("/")) {
		if (!isResourceTree(node)) throw new Error(`资源父节点不是文件夹：${path}`);
		if (!own(node, part)) throw new Error(`资源不存在：${path}`);
		parent = node;
		name = part;
		node = node[part]!;
	}
	return { node, parent, name, path: normalized };
}

function resolveFolder(tree: ResourceTree, path: ResourcePath) {
	const resolved = resolveNode(tree, path);
	if (!isResourceTree(resolved.node)) throw new Error(`不是文件夹：${path}`);
	return resolved.node;
}

function sameOrChild(path: ResourcePath, prefix: ResourcePath) {
	return path === prefix || path.startsWith(`${prefix}/`);
}

function moveMeta(
	meta: PluginData["meta"],
	from: ResourcePath,
	to: ResourcePath,
	copy = false,
) {
	const entries = Object.entries(meta).filter(([path]) =>
		sameOrChild(path, from),
	);
	if (!copy) for (const [path] of entries) delete meta[path];
	for (const [path, value] of entries) {
		const nextPath = `${to}${path.slice(from.length)}`;
		const next = structuredClone(value) as ResourceMeta;
		if ("slot" in next && next.slot && sameOrChild(next.slot, from))
			next.slot = `${to}${next.slot.slice(from.length)}`;
		if ("parent" in next && next.parent && sameOrChild(next.parent, from))
			next.parent = `${to}${next.parent.slice(from.length)}`;
		set(meta, nextPath, next);
	}
}

/** Rewrites references owned by resources outside a moved subtree. */
function rewriteMetaReferences(
	meta: PluginData["meta"],
	from: ResourcePath,
	to: ResourcePath,
) {
	for (const [path, value] of Object.entries(meta)) {
		const next = structuredClone(value) as ResourceMeta;
		let changed = false;
		if ("slot" in next && next.slot && sameOrChild(next.slot, from)) {
			next.slot = `${to}${next.slot.slice(from.length)}`;
			changed = true;
		}
		if ("parent" in next && next.parent && sameOrChild(next.parent, from)) {
			next.parent = `${to}${next.parent.slice(from.length)}`;
			changed = true;
		}
		if (changed) set(meta, path, next);
	}
}

function deleteMeta(meta: PluginData["meta"], path: ResourcePath) {
	for (const key of Object.keys(meta))
		if (sameOrChild(key, path)) delete meta[key];
}

function requireFileMeta(data: PluginData, path: ResourcePath) {
	const current = data.meta[path];
	return {
		...defaultFileMeta(),
		...(current && "priority" in current ? current : {}),
	} as FileMeta;
}

function requireFolderMeta(data: PluginData, path: ResourcePath) {
	const current = data.meta[path];
	return {
		...defaultFolderMeta(),
		...(current && "selectionMode" in current ? current : {}),
	} as FolderMeta;
}

function createFolders(data: PluginData, path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") return;
	let current = data.tree;
	let currentPath = "";
	for (const part of normalized.slice(1).split("/")) {
		currentPath += `/${part}`;
		const existing = current[part];
		if (existing === undefined) {
			const next: ResourceTree = {};
			set(current, part, next);
			set(data.meta, currentPath, defaultFolderMeta());
			current = next;
			continue;
		}
		if (!isResourceTree(existing))
			throw new Error(`文件不能作为文件夹：${currentPath}`);
		current = existing;
		if (!data.meta[currentPath])
			set(data.meta, currentPath, defaultFolderMeta());
	}
}

export function clonePluginData(data: PluginData): PluginData {
	return structuredClone(toRaw(data));
}

/** Mutates one in-memory tree. Persistence belongs to the caller that owns the Pulse. */
export function applyPulse(data: PluginData, pulse: Pulse): PluginData {
	switch (pulse.kind) {
		case "folder.mkdir": {
			createFolders(data, pulse.path);
			return data;
		}
		case "file.write": {
			const path = normalizeResourcePath(pulse.path);
			if (path === "/") throw new Error("不能写入资源根目录。");
			const parent = resolveFolder(data.tree, parentPath(path)!);
			const name = basename(path);
			if (isResourceTree(parent[name]!))
				throw new Error(`不能写入文件夹：${path}`);
			set(parent, name, pulse.content);
			if (!data.meta[path]) set(data.meta, path, defaultFileMeta());
			return data;
		}
		case "file.replace": {
			const resolved = resolveNode(data.tree, pulse.path);
			if (typeof resolved.node !== "string")
				throw new Error(`edit 只支持文件：${pulse.path}`);
			if (!pulse.find || !resolved.node.includes(pulse.find))
				throw new Error(`文件中未找到待替换文本：${pulse.path}`);
			if (!resolved.parent || !resolved.name)
				throw new Error("不能修改资源根目录。");
			set(
				resolved.parent,
				resolved.name,
				resolved.node.replace(pulse.find, pulse.replace),
			);
			return data;
		}
		case "file.meta.patch": {
			const resolved = resolveNode(data.tree, pulse.path);
			if (typeof resolved.node !== "string")
				throw new Error(`不是文件：${pulse.path}`);
			set(data.meta, resolved.path, {
				...requireFileMeta(data, resolved.path),
				...pulse.patch,
			});
			return data;
		}
		case "folder.meta.patch": {
			const resolved = resolveNode(data.tree, pulse.path);
			if (!isResourceTree(resolved.node))
				throw new Error(`不是文件夹：${pulse.path}`);
			if (resolved.path === "/")
				throw new Error("资源根目录没有可编辑元数据。");
			set(data.meta, resolved.path, {
				...requireFolderMeta(data, resolved.path),
				...pulse.patch,
			});
			return data;
		}
		case "node.remove": {
			const resolved = resolveNode(data.tree, pulse.path);
			if (!resolved.parent || !resolved.name)
				throw new Error("不能删除资源根目录。");
			delete resolved.parent[resolved.name];
			deleteMeta(data.meta, resolved.path);
			return data;
		}
		case "node.move": {
			const from = normalizeResourcePath(pulse.from);
			const to = normalizeResourcePath(pulse.to);
			if (from === "/" || to === "/") throw new Error("不能移动资源根目录。");
			if (sameOrChild(to, from))
				throw new Error("不能把文件夹移动到自身或子级。");
			const source = resolveNode(data.tree, from);
			const targetParent = resolveFolder(data.tree, parentPath(to)!);
			const targetName = basename(to);
			if (own(targetParent, targetName) && to !== from)
				throw new Error(`目标路径已存在：${to}`);
			if (!source.parent || !source.name)
				throw new Error("不能移动资源根目录。");
			delete source.parent[source.name];
			set(targetParent, targetName, source.node);
			moveMeta(data.meta, from, to);
			rewriteMetaReferences(data.meta, from, to);
			return data;
		}
		case "node.copy": {
			const from = normalizeResourcePath(pulse.from);
			const to = normalizeResourcePath(pulse.to);
			if (from === "/" || to === "/") throw new Error("不能复制资源根目录。");
			const source = resolveNode(data.tree, from);
			const targetParent = resolveFolder(data.tree, parentPath(to)!);
			const targetName = basename(to);
			if (own(targetParent, targetName))
				throw new Error(`目标路径已存在：${to}`);
			set(targetParent, targetName, structuredClone(source.node));
			moveMeta(data.meta, from, to, true);
			return data;
		}
	}
}

function applyPulses(data: PluginData, pulses: readonly Pulse[]) {
	for (const pulse of pulses) applyPulse(data, pulse);
	return data;
}

function compactPulseSegment(segment: readonly Pulse[]): Pulse[] {
	const result: Array<Pulse | null> = [...segment];
	const patches = new Map<
		string,
		{
			index: number;
			pulse: Extract<Pulse, { kind: "file.meta.patch" | "folder.meta.patch" }>;
		}
	>();
	const contents = new Map<
		string,
		{ first: number; lastWrite: number; pulse: Pulse }
	>();
	for (const [index, pulse] of segment.entries()) {
		if (pulse.kind === "file.write" || pulse.kind === "file.replace") {
			const path = normalizeResourcePath(pulse.path);
			const previous = contents.get(path);
			if (!previous)
				contents.set(path, {
					first: index,
					lastWrite: pulse.kind === "file.write" ? index : -1,
					pulse,
				});
			else if (pulse.kind === "file.write") {
				previous.lastWrite = index;
				previous.pulse = pulse;
			}
		}
		if (pulse.kind !== "file.meta.patch" && pulse.kind !== "folder.meta.patch")
			continue;
		const key = `${pulse.kind}:${normalizeResourcePath(pulse.path)}`;
		const previous = patches.get(key);
		if (!previous) {
			patches.set(key, { index, pulse });
			continue;
		}
		previous.pulse = {
			...previous.pulse,
			patch: { ...previous.pulse.patch, ...pulse.patch },
		} as typeof previous.pulse;
		result[previous.index] = previous.pulse;
		result[index] = null;
	}
	for (const [index, pulse] of segment.entries()) {
		if (pulse.kind !== "file.write" && pulse.kind !== "file.replace") continue;
		const content = contents.get(normalizeResourcePath(pulse.path))!;
		if (content.lastWrite < 0 || index > content.lastWrite) continue;
		result[index] = index === content.first ? content.pulse : null;
	}
	return result.filter((pulse): pulse is Pulse => pulse !== null);
}

/** Compacts one replay group without moving writes across dependent tree mutations. */
export function compactPulses(pulses: readonly Pulse[]): Pulse[] {
	const result: Pulse[] = [];
	let segment: Pulse[] = [];
	const flush = () => {
		result.push(...compactPulseSegment(segment));
		segment = [];
	};
	for (const pulse of pulses) {
		// ponytail: O(n²) dependency scans for large groups; index paths only if measured.
		const affected =
			pulse.kind === "node.remove"
				? [pulse.path]
				: pulse.kind === "node.copy"
					? [pulse.from, pulse.to]
					: [];
		if (
			pulse.kind === "node.move" ||
			affected.some((path) =>
				segment.some(
					(item) =>
						(item.kind === "file.write" ||
							item.kind === "file.replace" ||
							item.kind === "file.meta.patch" ||
							item.kind === "folder.meta.patch") &&
						sameOrChild(
							normalizeResourcePath(item.path),
							normalizeResourcePath(path),
						),
				),
			)
		)
			flush();
		segment.push(pulse);
	}
	flush();
	return result;
}

export function replayPluginData(
	base: PluginData,
	groups: readonly (readonly Pulse[])[],
) {
	const data = clonePluginData(base);
	for (const group of groups) applyPulses(data, group);
	return data;
}

export function readFile(data: PluginData, path: ResourcePath) {
	const resolved = resolveNode(data.tree, path);
	if (typeof resolved.node !== "string") throw new Error(`不是文件：${path}`);
	return resolved.node;
}

export function listFolder(data: PluginData, path: ResourcePath = "/") {
	return Object.keys(resolveFolder(data.tree, path)).sort((left, right) =>
		left.localeCompare(right),
	);
}


src/features/Plugin/dataflow/types.ts

export type ResourcePath = string;

/** Directories are objects; every file is its exact authored string. */
export interface ResourceTree {
	[name: string]: ResourceNode;
}

export type ResourceNode = ResourceTree | string;

export interface FolderMeta {
	selectionMode: "none" | "single" | "multiple";
	/** Optional source-local global-slot path for a local slot folder. */
	parent?: ResourcePath;
}

export interface FileMeta {
	resourceSelected: boolean;
	/** Stable source-local path of a slot below localSlot/. */
	slot?: ResourcePath;
	priority: number;
	condition?: string;
	/** Defaults to enabled; false keeps the authored condition without applying it. */
	conditionEnabled?: boolean;
}

export type ResourceMeta = FolderMeta | FileMeta;
type MetaMap = Record<ResourcePath, ResourceMeta>;

/** Original source or replayed in-memory projection, without version history. */
export interface PluginData {
	id: string;
	tree: ResourceTree;
	meta: MetaMap;
}

/** A saved projection from the original Plugin source. It stays mutable until a chat uses it. */
export interface PluginVersion {
	id: string;
	parentId: string | null;
	createdAt: string;
	/** Compacted cumulative Pulses replayed directly over the original source. */
	pulses: Pulse[];
}

/** The on-disk Plugin record: immutable original content plus saved versions. */
export interface PluginDocument extends PluginData {
	versions: PluginVersion[];
}

/** A single replayable filesystem primitive. */
type Atom =
	| { kind: "file.write"; path: ResourcePath; content: string }
	| { kind: "file.replace"; path: ResourcePath; find: string; replace: string }
	| { kind: "file.meta.patch"; path: ResourcePath; patch: Partial<FileMeta> }
	| {
			kind: "folder.meta.patch";
			path: ResourcePath;
			patch: Partial<FolderMeta>;
	  }
	| { kind: "folder.mkdir"; path: ResourcePath }
	| { kind: "node.remove"; path: ResourcePath }
	| { kind: "node.move"; from: ResourcePath; to: ResourcePath }
	| { kind: "node.copy"; from: ResourcePath; to: ResourcePath };

/** A Pulse is intentionally one primitive; a message version owns Pulse[]. */
export type Pulse = Atom;
export type ReplayGroups = Pulse[][];

export type PluginResourceType =
	| "markdown"
	| "chat"
	| "data"
	| "javascript"
	| "json"
	| "media"
	| "component"
	| "text";

export function resourceType(path: string): PluginResourceType {
	const normalized = path.trim().toLowerCase();
	if (normalized.endsWith(".chat.json")) return "chat";
	if (normalized.endsWith(".data.json")) return "data";
	if (/\.(md|markdown)$/i.test(normalized)) return "markdown";
	if (/\.(js|mjs|cjs|ts)$/i.test(normalized)) return "javascript";
	if (/\.json$/i.test(normalized)) return "json";
	if (/\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|ogg|mov|m4v)$/i.test(normalized))
		return "media";
	if (/\.(vue|jsx|tsx)$/i.test(normalized)) return "component";
	return "text";
}

export function defaultFileMeta(): FileMeta {
	return { resourceSelected: true, priority: 100 };
}

export function defaultFolderMeta(): FolderMeta {
	return { selectionMode: "none" };
}


src/features/Plugin/dataflow/use-file-api.ts

import { type MaybeRefOrGetter, toValue } from "vue";
import { listFolder, parentPath, readFile, resolveNode } from "./pulse";
import type {
	FileMeta,
	FolderMeta,
	PluginData,
	Pulse,
	ResourcePath,
} from "./types";

export interface FileApiOptions {
	filetree: MaybeRefOrGetter<PluginData | null>;
	/** Must synchronously make the Pulse observable to filetree before it returns. */
	applyPulse: (pulse: Pulse) => void;
}

export function useFileApi(options: FileApiOptions) {
	function current() {
		const data = toValue(options.filetree);
		if (!data) throw new Error("Plugin 资源尚未加载。");
		return data;
	}
	function apply(pulse: Pulse) {
		options.applyPulse(pulse);
	}
	function exists(path: ResourcePath) {
		try {
			resolveNode(current().tree, path);
			return true;
		} catch {
			return false;
		}
	}
	function ensureParent(path: ResourcePath) {
		const parent = parentPath(path);
		if (parent && parent !== "/" && !exists(parent))
			apply({ kind: "folder.mkdir", path: parent });
	}
	return {
		read: (path: ResourcePath) => readFile(current(), path),
		ls: (path: ResourcePath = "/") => listFolder(current(), path),
		exists,
		write(path: ResourcePath, content: string) {
			ensureParent(path);
			apply({ kind: "file.write", path, content });
		},
		edit(path: ResourcePath, find: string, replace: string) {
			const content = readFile(current(), path);
			if (!find || !content.includes(find))
				throw new Error(`文件中未找到待替换文本：${path}`);
			// Persist the resulting field value so repeated edits can be compacted.
			apply({
				kind: "file.write",
				path,
				content: content.replace(find, replace),
			});
		},
		mkdir(path: ResourcePath) {
			apply({ kind: "folder.mkdir", path });
		},
		remove(path: ResourcePath) {
			apply({ kind: "node.remove", path });
		},
		move(from: ResourcePath, to: ResourcePath) {
			ensureParent(to);
			apply({ kind: "node.move", from, to });
		},
		copy(from: ResourcePath, to: ResourcePath) {
			ensureParent(to);
			apply({ kind: "node.copy", from, to });
		},
		updateFileMeta(path: ResourcePath, patch: Partial<FileMeta>) {
			apply({ kind: "file.meta.patch", path, patch });
		},
		updateFolderMeta(path: ResourcePath, patch: Partial<FolderMeta>) {
			apply({ kind: "folder.meta.patch", path, patch });
		},
	};
}


src/features/Plugin/dataflow/use-plugin-data.ts

import { computed, type MaybeRefOrGetter, readonly, toValue } from "vue";
import {
	registerSyncHandler,
	useSyncStore,
} from "@/features/Database/dbsync-store";
import { parseCharacterDefinition } from "../resources/types/character/plugin-character";
import {
	createLocalPluginData,
	importBuiltinPlugins,
} from "../utils/import-converter";
import {
	appendPluginVersion,
	createPluginVersion,
	latestPluginVersion,
	preparePluginDocument,
	replayPluginVersion,
} from "./plugin-version";
import { applyPulse, parsePluginPath, replayPluginData } from "./pulse";
import type { PluginData, PluginDocument, Pulse, ReplayGroups } from "./types";
import { type GlobalPluginData, mergePluginData } from "./use-tree-merge";

const builtinPlugins = importBuiltinPlugins();

function findPlugin(pluginId: string): PluginDocument | undefined {
	return useSyncStore().plugins.get(pluginId) as PluginDocument | undefined;
}

registerSyncHandler<PluginDocument>("plugin", {
	table: "resource_worlds",
	value: findPlugin,
	recordId: (id) => `local:${id}`,
});

/** Replays one saved version, plus unsaved edits only when no version is pinned. */
export function usePurePluginData(
	pluginId: MaybeRefOrGetter<string>,
	versionId?: MaybeRefOrGetter<string | undefined>,
) {
	return computed(() => {
		const id = toValue(pluginId);
		const document = findPlugin(id);
		if (!document) return null;
		const requestedVersion = versionId ? toValue(versionId) : undefined;
		const version =
			requestedVersion !== undefined
				? document.versions.find((item) => item.id === requestedVersion)
				: latestPluginVersion(document);
		if (!version)
			throw new Error(
				requestedVersion !== undefined
					? `Plugin 版本不存在：${requestedVersion}`
					: `Plugin 没有可加载的版本：${id}`,
			);
		return replayPluginVersion(document, version.id);
	});
}

/** Static built-ins are ordinary global source trees; callers may provide a different set later. */
function useGlobalPluginData() {
	return computed<GlobalPluginData>(() => builtinPlugins);
}

function routePulse(pulse: Pulse): { folder: string | null; pulse: Pulse } {
	if (pulse.kind === "node.move" || pulse.kind === "node.copy") {
		const from = parsePluginPath(pulse.from);
		const to = parsePluginPath(pulse.to);
		if (
			from.scope !== to.scope ||
			(from.scope === "global" &&
				to.scope === "global" &&
				from.folder !== to.folder)
		)
			throw new Error("一次 Pulse 不能跨 Plugin 来源移动或复制资源。");
		return {
			folder: from.scope === "global" ? from.folder : null,
			pulse: { ...pulse, from: from.path, to: to.path },
		};
	}
	const parsed = parsePluginPath(pulse.path);
	return {
		folder: parsed.scope === "global" ? parsed.folder : null,
		pulse: { ...pulse, path: parsed.path },
	};
}

/** Replays each source independently, then mounts only the role's enabled folders. */
export function replayAndMergePluginData(
	local: PluginData,
	global: GlobalPluginData,
	groups: ReplayGroups,
) {
	const localGroups: Pulse[][] = groups.map(() => []);
	const globalGroups = new Map<string, Pulse[][]>();
	groups.forEach((group, groupIndex) => {
		for (const pulse of group) {
			const routed = routePulse(pulse);
			if (routed.folder === null) localGroups[groupIndex]!.push(routed.pulse);
			else {
				let target = globalGroups.get(routed.folder);
				if (!target) {
					target = groups.map(() => []);
					globalGroups.set(routed.folder, target);
				}
				target[groupIndex]!.push(routed.pulse);
			}
		}
	});
	const replayedLocal = replayPluginData(local, localGroups);
	const enabled = parseCharacterDefinition(
		replayedLocal.tree["definition.package.json"],
	).globalPlugins;
	const replayedGlobal = Object.fromEntries(
		Object.entries(global).map(([folder, source]) => [
			folder,
			replayPluginData(
				source,
				globalGroups.get(folder) ?? groups.map(() => []),
			),
		]),
	) as GlobalPluginData;
	const selected: GlobalPluginData = {};
	for (const folder of enabled) {
		const source = replayedGlobal[folder];
		if (source) selected[folder] = source;
	}
	return mergePluginData(replayedLocal, selected);
}

/** The current conversation view: source content plus every active-version replay group. */
export function usePluginData(
	pluginId: MaybeRefOrGetter<string>,
	replayGroups: MaybeRefOrGetter<ReplayGroups>,
	versionId?: MaybeRefOrGetter<string | undefined>,
	globalPlugins: MaybeRefOrGetter<GlobalPluginData> = useGlobalPluginData(),
) {
	const source = usePurePluginData(pluginId, versionId);
	return computed(() => {
		const value = source.value;
		return value
			? replayAndMergePluginData(
					value,
					toValue(globalPlugins),
					toValue(replayGroups),
				)
			: null;
	});
}

function applyPluginPulse(id: string, pulse: Pulse) {
	const store = useSyncStore();
	const plugin = findPlugin(id);
	if (!plugin) throw new Error(`Plugin 尚未加载：${id}`);
	const version = latestPluginVersion(plugin);
	if (!version) throw new Error(`Plugin 没有可编辑的版本：${id}`);
	applyPulse(replayPluginVersion(plugin, version.id), pulse);
	if (store.isPluginVersionUsed(id, version.id))
		plugin.versions.push(createPluginVersion(plugin, [pulse]));
	else plugin.versions.splice(-1, 1, appendPluginVersion(version, pulse));
	store.markDirty({ type: "plugin", id });
	store.refreshCharacter(id);
}

/** Editable source-local latest-version projection. Every edit updates the head version. */
export function useEditablePluginData(pluginId: MaybeRefOrGetter<string>) {
	const filetree = usePurePluginData(pluginId);
	return {
		filetree,
		applyPulse: (pulse: Pulse) => applyPluginPulse(toValue(pluginId), pulse),
	};
}

export function useCharacterList() {
	const store = useSyncStore();
	const characters = computed(() => new Set(store.characters));

	async function create() {
		const id = crypto.randomUUID();
		const source = createLocalPluginData(`local:${id}`);
		const document = preparePluginDocument(source);
		store.addPlugin(id, document);
		store.markDirty({ type: "plugin", id });
		await store._sync({ type: "plugin", id });
		return [...store.characters].find((character) => character.id === id)!;
	}

	async function importCharacter() {
		const { useBackupStore } = await import(
			"@/features/Environment/backup/backup-store"
		);
		const id = await useBackupStore().importResourceArchive("update");
		return id
			? ([...store.characters].find((character) => character.id === id) ?? null)
			: null;
	}

	return {
		characters: readonly(characters),
		create,
		import: importCharacter,
	};
}



src/features/Plugin/dataflow/use-slot.ts

import { computed, toValue } from "vue";
import { builtinSlotRegistry } from "../utils/import-converter";
import { isResourceTree, normalizeResourcePath, parentPath } from "./pulse";
import type {
	FileMeta,
	FolderMeta,
	PluginData,
	ResourceMeta,
	ResourcePath,
} from "./types";
import { type FileApiOptions, useFileApi } from "./use-file-api";

export interface SlotResource {
	path: ResourcePath;
	name: string;
	meta: FileMeta;
}

export interface PluginSlot {
	path: ResourcePath;
	name: string;
	icon?: string;
	selectionMode: FolderMeta["selectionMode"];
	resources: SlotResource[];
	selectedResources: SlotResource[];
	children: PluginSlot[];
}

export interface UseSlotOptions extends FileApiOptions {}

function fileName(path: string) {
	return path.slice(path.lastIndexOf("/") + 1);
}

function walkFiles(
	tree: PluginData["tree"],
	path: ResourcePath,
	visit: (path: ResourcePath, meta: FileMeta) => void,
	meta: PluginData["meta"],
) {
	for (const [name, node] of Object.entries(tree)) {
		const childPath = path === "/" ? `/${name}` : `${path}/${name}`;
		if (typeof node === "string") {
			const file = meta[childPath];
			if (file && "priority" in file) visit(childPath, file);
			continue;
		}
		walkFiles(node, childPath, visit, meta);
	}
}

function registryIcon(path: ResourcePath) {
	const name = fileName(path);
	return builtinSlotRegistry.find((slot) => slot.name === name)?.icon;
}

function resolveSlotPath(data: PluginData, input: string) {
	if (input.startsWith("/")) return normalizeResourcePath(input);
	const registered = builtinSlotRegistry.find(
		(slot) => slot.id === input || slot.name === input,
	);
	if (registered) {
		const parts: string[] = [];
		let current: (typeof builtinSlotRegistry)[number] | undefined = registered;
		while (current) {
			parts.unshift(current.name);
			current = current.parentId
				? builtinSlotRegistry.find((slot) => slot.id === current?.parentId)
				: undefined;
		}
		return `/slot/${parts.join("/")}`;
	}
	const matches = Object.keys(data.meta).filter((path) => {
		const meta = data.meta[path];
		return Boolean(meta && "selectionMode" in meta && fileName(path) === input);
	});
	if (matches.length === 1) return matches[0]!;
	if (matches.length > 1) throw new Error(`插槽名称不唯一：${input}`);
	throw new Error(`未知插槽：${input}`);
}

function directSlotPath(data: PluginData, path: ResourcePath) {
	const seen = new Set<string>();
	let current: string | null = path;
	while (current && !seen.has(current)) {
		seen.add(current);
		const meta: ResourceMeta | undefined = data.meta[current];
		if (meta && "selectionMode" in meta && current.startsWith("/slot/"))
			return current;
		if (meta && "parent" in meta && meta.parent) {
			current = meta.parent;
			continue;
		}
		current = parentPath(current);
	}
	return null;
}

/**
 * Resolves the local `/slot/` contract and every source-local `localSlot/`
 * contribution against one replayed file tree.
 */
export function useSlot(options: UseSlotOptions) {
	const fileApi = useFileApi(options);
	const slots = computed<PluginSlot[]>(() => {
		const data = toValue(options.filetree);
		if (!data) return [];
		const resources = new Map<string, SlotResource[]>();
		walkFiles(
			data.tree,
			"/",
			(path, meta) => {
				if (!meta.slot) return;
				const slotPath = directSlotPath(data, meta.slot);
				if (!slotPath) return;
				const current = resources.get(slotPath) ?? [];
				current.push({ path, name: fileName(path), meta });
				resources.set(slotPath, current);
			},
			data.meta,
		);

		const build = (path: ResourcePath): PluginSlot | null => {
			const meta = data.meta[path];
			if (!meta || !("selectionMode" in meta)) return null;
			const children: PluginSlot[] = [];
			const folder =
				path === "/slot"
					? data.tree.slot
					: path
							.slice("/slot/".length)
							.split("/")
							.reduce<PluginData["tree"] | string | undefined>(
								(current, name) =>
									isResourceTree(current) ? current[name] : undefined,
								data.tree.slot,
							);
			if (isResourceTree(folder)) {
				for (const name of Object.keys(folder).sort((left, right) =>
					left.localeCompare(right),
				)) {
					const child = build(`${path}/${name}`);
					if (child) children.push(child);
				}
			}
			const allResources = (resources.get(path) ?? []).sort(
				(left, right) =>
					left.meta.priority - right.meta.priority ||
					left.path.localeCompare(right.path),
			);
			const selected = allResources.filter(
				(resource) => resource.meta.resourceSelected,
			);
			return {
				path,
				name: fileName(path),
				icon: registryIcon(path),
				selectionMode: meta.selectionMode,
				resources: allResources,
				selectedResources:
					meta.selectionMode === "single" ? selected.slice(0, 1) : selected,
				children,
			};
		};
		if (!isResourceTree(data.tree.slot)) return [];
		return Object.keys(data.tree.slot)
			.sort((left, right) => left.localeCompare(right))
			.flatMap((name) => build(`/slot/${name}`) ?? []);
	});
	const flatSlots = computed(() => {
		const result: PluginSlot[] = [];
		const visit = (slot: PluginSlot) => {
			result.push(slot);
			for (const child of slot.children) visit(child);
		};
		for (const slot of slots.value) visit(slot);
		return result;
	});
	function get(input: string) {
		const data = toValue(options.filetree);
		if (!data) return null;
		const path = resolveSlotPath(data, input);
		return flatSlots.value.find((slot) => slot.path === path) ?? null;
	}
	function paths(input: string) {
		return get(input)?.selectedResources.map((resource) => resource.path) ?? [];
	}
	function fileNames(input: string) {
		return get(input)?.selectedResources.map((resource) => resource.name) ?? [];
	}
	function setSelected(path: ResourcePath, selected: boolean) {
		const data = toValue(options.filetree);
		if (!data) throw new Error("Plugin 资源尚未加载。");
		const file = data.meta[path];
		if (!file || !("priority" in file))
			throw new Error(`不是资源文件：${path}`);
		const slotPath = file.slot ? directSlotPath(data, file.slot) : null;
		const slot = slotPath ? get(slotPath) : null;
		if (selected && slot?.selectionMode === "single") {
			for (const other of slot.resources) {
				if (other.path !== path && other.meta.resourceSelected)
					fileApi.updateFileMeta(other.path, { resourceSelected: false });
			}
		}
		fileApi.updateFileMeta(path, { resourceSelected: selected });
	}
	return {
		...fileApi,
		tree: slots,
		slots: flatSlots,
		get,
		paths,
		fileNames,
		select: (path: ResourcePath) => setSelected(path, true),
		unselect: (path: ResourcePath) => setSelected(path, false),
		toggle: (path: ResourcePath) => {
			const data = toValue(options.filetree);
			const file = data?.meta[path];
			if (!file || !("priority" in file))
				throw new Error(`不是资源文件：${path}`);
			setSelected(path, !file.resourceSelected);
		},
		assign: (path: ResourcePath, localSlotPath?: ResourcePath) => {
			if (localSlotPath) {
				const data = toValue(options.filetree);
				if (!data || !directSlotPath(data, localSlotPath))
					throw new Error(`不是已注册的来源插槽：${localSlotPath}`);
			}
			fileApi.updateFileMeta(path, { slot: localSlotPath });
		},
	};
}


src/features/Plugin/dataflow/use-tree-merge.ts

import { clonePluginData } from "./pulse";
import type { PluginData, ResourceMeta } from "./types";
import { defaultFolderMeta } from "./types";

export type GlobalPluginData = Record<string, PluginData>;

function set(target: object, key: string, value: unknown) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}

function mountedPath(mount: string, path: string) {
	return path === "/" ? mount : `${mount}${path}`;
}

function mountMeta(
	target: PluginData["meta"],
	source: PluginData,
	mount: string,
) {
	for (const [path, value] of Object.entries(source.meta)) {
		const meta = structuredClone(value) as ResourceMeta;
		if ("slot" in meta && meta.slot) meta.slot = mountedPath(mount, meta.slot);
		if ("parent" in meta && meta.parent)
			meta.parent = meta.parent.startsWith("/slot/")
				? meta.parent
				: mountedPath(mount, meta.parent);
		set(target, mountedPath(mount, path), meta);
	}
}

/** Merges already-replayed sources into the one tree addressed by File API. */
export function mergePluginData(
	localData: PluginData,
	global: GlobalPluginData,
) {
	const merged = clonePluginData(localData);
	if (Object.hasOwn(merged.tree, "global"))
		throw new Error("本地 Plugin 根目录保留 global 名称给全局资源挂载。");
	const globalTree: PluginData["tree"] = {};
	set(merged.tree, "global", globalTree);
	set(merged.meta, "/global", defaultFolderMeta());
	for (const [folder, data] of Object.entries(global)) {
		if (!folder || folder.includes("/"))
			throw new Error(`无效的全局 Plugin 文件夹名称：${folder}`);
		const mount = `/global/${folder}`;
		const source = clonePluginData(data);
		set(globalTree, folder, source.tree);
		set(merged.meta, mount, defaultFolderMeta());
		mountMeta(merged.meta, source, mount);
	}
	return merged;
}


src/features/Plugin/docs.md

# World resources

World is the resource model. A role owns one local source document at
`resource_worlds:local:<localPluginId>`. Global Plugins are independent source
trees identified at runtime by their source folder names. The role's root
`definition.package.json` stores the enabled folders as `globalPlugins: string[]`;
the array is both the enable set and merge order.

Every document is a folder tree. Folder and file keys are stable node IDs;
`name` is only display text and ordinary sibling files/folders may share it. A
name path is a convenience lookup and must resolve exactly one node; use
`/self/$<id>` or `/global/$<source-id>/$<id>` when a stable reference is
needed. A file owns its content, slot reference, selection
state, priority and optional condition. Folders directly below `/self/slot/`
are global slot contracts. Every source root (`/self/` and each
`/global/<source>/`) owns a `localSlot/` tree; its descendant folders define
local slots and may point at a global contract through their stable `parent`
path. A file stores its local-slot ID path in `slot`, so renaming either folder
does not invalidate membership.

`usePluginData()` routes the active message path's Pulses to their owning local
or global source, replays each source independently, then reads the replayed
role definition and merges only its enabled global folders. Slot and source
views are projections of that result; they are not stored separately.

## Updates and replay

Business calls (`write`, `edit`, `mkdir`, `move`, `copy`, `remove`,
`updateFile`) first translates input into one logical `Pulse`. Each Pulse
stores a target node ID plus a short local path. It either writes a value,
removes a value with `none`, replaces a unique substring, copies from an ID
reference with a deterministic ID map, or moves an ID reference. Persistent
edits update the owning version's replay projection synchronously; their owner
controls persistence. Move and copy reject a destination below the source folder; move
keeps IDs while copy regenerates every copied subtree ID.

The on-disk local Plugin is `PluginDocument { id, tree, meta, versions }`.
`tree/meta` retain the original authored source. Source editing synchronously
appends a Pulse to the latest version and compacts that version before marking
the Plugin dirty for normal database sync. A version is mutable only until a
conversation references its ID; the next edit then creates a child version
with a new Git-style 40-character ID and appends there. Each version keeps a
history-only `parentId` and cumulative Pulses that replay directly over the
original source.

New conversations persist the latest saved `pluginVersionId`. Loading replays
that version over the original source before applying the conversation path;
later Plugin edits do not alter existing conversations.

Conversation edits append updates to the current message version. Replay only
applies those updates to cloned source trees; it never writes the database.
Moves and copies cannot cross source roots because one Pulse has exactly one
replay owner. Editing `definition.package.json.globalPlugins` dynamically adds,
removes, or reorders global mounts in the resulting World.
If the active tail is already a pure Pulse-only system container, later edits
reuse that container instead of extending the conversation path.

`compactPulses()` is shared by Plugin version appends and Conversation message-version
persistence. It keeps the last direct content write and merges metadata fields
within one group, retaining structural dependency order. File API `edit`
records the resulting content as `file.write`. Different versions and message
groups are never compacted together. Database sync vectors remain separate
from these domain version IDs.

## Paths and source scope

`/self/...` addresses the role's local source. `/global/<source-folder>/...`
addresses one global source. In authored resources `@/...` resolves to the
resource's own source root. There is no `@pluginId/...` syntax.

## User interface

`PluginAssetTreePanel` renders the same World through the shared generic file
tree:

- Assets: physical `/global` and `/self` trees, including each `localSlot/`.
- Slots: global contracts with their contributed resources, independent of
  source.
- Sources: source folder → `slot` (the source's global-slot contributions)
  and `localSlot` (its local definitions) → local slot → resource.

Only Slots and Sources resource rows receive a selection switch and its hover
icon treatment; Assets stays a pure filesystem view. Slot icons override the
normal file icon in the slot projection, and source labels precede resource
names.

## Mode resources and reference estimates

The built-in `MODE` slot accepts JSON resources with `id`, `name`, optional
`description`, and optional `enter`/`exit` resource paths. Paths are absolute
World paths. Switching imports the previous mode's exit script before the new
mode's enter script; Conversation continues to own the interval marker.

The file editor estimates text-like resource size locally with tiktoken's
`cl100k_base` encoding. The number is informational: recursive imports,
conditions, slots and runtime macro expansion may change the actual prompt cost.

## Media resources

Non-text World resources retain a `media://<uuid>` link while their bytes stay
in the host media container. `useWorld.remove` remains an ordinary World-file
operation and intentionally does not delete that host file. Agent code receives
`generateImageToPath(options)` alongside its existing Image Generation options:
it writes the first generated image to `options.path` (or `temp` by default) and
returns `Promise<string>` with the media ID. Use `media.link(id)` to emit the
stored result in Markdown or an HTML media tag.


src/features/Plugin/media/media-link.ts

import { host } from "@/host";

const prefix = "media://";

export function mediaLink(id: string) {
	return `${prefix}${id}`;
}

function mediaIdFromLink(value: string) {
	return value.startsWith(prefix) ? value.slice(prefix.length) : "";
}

export function mediaLinks(value: string) {
	return [...value.matchAll(/media:\/\/([0-9a-f-]{36})/gi)].map((match) =>
		mediaLink(match[1]!),
	);
}

export function isTextMediaType(mediaType: string) {
	return (
		/^text\//i.test(mediaType) ||
		/^application\/(json|xml|javascript)$/i.test(mediaType)
	);
}

export async function writeMedia(
	bytes: Uint8Array,
	mediaType: string,
	path?: string,
) {
	return host.media.write({
		bytes: [...bytes],
		mediaType,
		...(path ? { path } : {}),
	});
}

export async function readMediaLink(value: string) {
	const id = mediaIdFromLink(value);
	if (!id) return null;
	const file = await host.media.read(id);
	return { ...file, bytes: Uint8Array.from(file.bytes) };
}

export async function resolveMediaUrl(value: string) {
	const id = mediaIdFromLink(value);
	return id ? host.media.url(id) : value;
}

export async function removeMediaLink(value: string) {
	const id = mediaIdFromLink(value);
	if (id) await host.media.remove(id);
}


src/features/Plugin/resources/import.ts

import { executeSandboxCodeAsync } from "@/features/Plugin/runtime/sandbox";
import { readFile, resolveResourcePath } from "../dataflow/pulse";
import {
	type PluginData,
	type ResourcePath,
	resourceType,
} from "../dataflow/types";
import { evaluateResourceCondition } from "./resource-condition";
import { parsePluginChatContext } from "./types/chat/plugin-chat";
import {
	createDataFacade,
	parsePluginDataDefinition,
} from "./types/data/plugin-data";

export interface ResourceImportEnvironment extends Record<string, unknown> {
	imports?: (path: string | string[]) => unknown | Promise<unknown>;
}

function parseJson(source: string): unknown {
	try {
		return JSON.parse(source);
	} catch {
		return source;
	}
}

/** Imports exactly one source resource. Recursive macro parsing remains the Sandbox caller's job. */
export function importResource(
	data: PluginData,
	path: ResourcePath,
	environment: ResourceImportEnvironment = {},
): unknown | Promise<unknown> {
	const resolvedPath = resolveResourcePath(
		String(environment.sourcePath ?? path),
		path,
	);
	const source = readFile(data, resolvedPath);
	const meta = data.meta[resolvedPath];
	if (
		meta &&
		"condition" in meta &&
		meta.conditionEnabled !== false &&
		meta.condition?.trim() &&
		!evaluateResourceCondition(meta.condition, environment)
	)
		return undefined;
	const type = resourceType(resolvedPath);
	if (type === "markdown" || type === "text" || type === "component")
		return source;
	if (type === "chat") return parsePluginChatContext(source);
	if (type === "data") {
		const definition = parsePluginDataDefinition(source);
		return createDataFacade(
			{
				name: resolvedPath.split("/").at(-1) ?? resolvedPath,
				wrapperSource: definition.wrapperSource,
			},
			definition.initialValue,
			{ readonly: true },
		);
	}
	if (type === "json") return parseJson(source);
	if (type === "javascript")
		return executeSandboxCodeAsync(source, [environment]);
	return source;
}


src/features/Plugin/resources/PluginFileEditorDialog.vue

<script setup lang="ts">
import { computed, ref, toValue, watch } from "vue";
import { Button } from "@/components/fluid";
import { useFloatingSurface } from "@/features/Environment/floating-surface";
import { readFile } from "../dataflow/pulse";
import type { FileMeta, ResourcePath } from "../dataflow/types";
import type { FileApiOptions } from "../dataflow/use-file-api";
import PluginResourceConditionEditor from "./PluginResourceConditionEditor.vue";
import PluginResourceRenderer from "./PluginResourceRenderer.vue";

const props = defineProps<FileApiOptions & { path: ResourcePath | null }>();
const emit = defineEmits<{ close: [] }>();
const element = ref<HTMLElement | null>(null);
const open = computed(() => props.path !== null);
const draft = ref("");
const fileMeta = computed(() => {
	const tree = toValue(props.filetree);
	const meta = props.path && tree ? tree.meta[props.path] : undefined;
	return meta && "resourceSelected" in meta ? (meta as FileMeta) : undefined;
});
const file = computed(() =>
	props.path && fileMeta.value
		? { ...fileMeta.value, path: props.path, content: draft.value }
		: null,
);

watch(
	() => [props.path, toValue(props.filetree)] as const,
	() => {
		const tree = toValue(props.filetree);
		if (!props.path || !tree) return;
		draft.value = readFile(tree, props.path);
	},
	{ immediate: true },
);

const floating = useFloatingSurface({
	surfaceId: "plugin-file-editor",
	open,
	element,
	initialSize: { width: 760, height: 560 },
	minSize: { width: 360, height: 320 },
	persistGeometry: true,
});

function save() {
	if (!props.path) return;
	props.applyPulse({
		kind: "file.write",
		path: props.path,
		content: draft.value,
	});
}
function updateCondition(condition: string) {
	if (!props.path) return;
	props.applyPulse({
		kind: "file.meta.patch",
		path: props.path,
		patch: { condition },
	});
}
function updateConditionEnabled(conditionEnabled: boolean) {
	if (!props.path) return;
	props.applyPulse({
		kind: "file.meta.patch",
		path: props.path,
		patch: { conditionEnabled },
	});
}
</script>

<template>
	<Teleport to="body">
		<section
			v-if="open && path"
			ref="element"
			:style="floating.style.value"
			class="fixed flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
		>
			<header data-floating-drag-handle class="flex h-11 shrink-0 items-center gap-2 border-b px-3">
				<strong class="min-w-0 flex-1 truncate text-sm">{{ path.split('/').at(-1) }}</strong>
				<Button size="sm" :disabled="!path" @click="save">保存</Button>
				<Button size="sm" variant="ghost" @click="emit('close')">关闭</Button>
			</header>
			<PluginResourceConditionEditor
				v-if="fileMeta"
				:model-value="fileMeta.condition ?? ''"
				:enabled="fileMeta.conditionEnabled !== false"
				@update:model-value="updateCondition"
				@update:enabled="updateConditionEnabled"
			/>
			<PluginResourceRenderer
				v-if="file"
				:file="file"
				:model-value="draft"
				:preview="true"
				class="min-h-0 flex-1"
				@update:model-value="draft = $event"
			/>
		</section>
	</Teleport>
</template>


src/features/Plugin/resources/PluginResourceConditionEditor.vue

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
	TabItem,
	Tabs,
	TabsList,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import JavaScriptCodeMirrorEditor from "@/features/Plugin/resources/types/javascript/JavaScriptCodeMirrorEditor.vue";
import { Minus, Plus, Trash2 } from "@/lib/phosphor-icons";
import {
	type ResourceConditionFunction,
	type ResourceConditionRow,
	resourceConditionDefinitions,
} from "./resource-condition";

const props = defineProps<{ modelValue: string; enabled: boolean }>();
const emit = defineEmits<{
	"update:modelValue": [value: string];
	"update:enabled": [value: boolean];
}>();
const logic = ref<"and" | "or">("and");
const depth = ref(4);
const rows = ref<ResourceConditionRow[]>([]);
const expressionPreview = computed(() => {
	const expressions = rows.value.flatMap((row) => {
		const value = row.value.trim();
		if (!value) return [];
		if (row.functionName === "custom") return [value];
		if (row.functionName === "probability")
			return [`概率 ${Number(value) || 0}%`];
		return [`${definition(row.functionName).label}「${value}」`];
	});
	return expressions.length
		? expressions.join(logic.value === "and" ? " · 且 · " : " · 或 · ")
		: "未设置条件，资源会始终导入";
});

watch(
	() => props.modelValue,
	(value) => load(value),
	{ immediate: true },
);

function definition(functionName: ResourceConditionFunction) {
	return resourceConditionDefinitions.find((item) => item.id === functionName)!;
}

function load(source: string) {
	const text = source.trim();
	if (!text) {
		logic.value = "and";
		depth.value = 4;
		rows.value = [];
		return;
	}
	const separator = text.includes("\n||\n") ? "\n||\n" : "\n&&\n";
	logic.value = separator === "\n||\n" ? "or" : "and";
	const parsed: ResourceConditionRow[] = [];
	let parsedDepth = 4;
	for (const expression of text.split(separator)) {
		const call = /^(include|exclude)\((.*),\s*(\d+)\)$/.exec(expression.trim());
		if (call) {
			let value = call[2] ?? "";
			try {
				value = String(JSON.parse(value));
			} catch {}
			parsedDepth = Number(call[3]) || parsedDepth;
			parsed.push({
				id: crypto.randomUUID(),
				functionName: call[1] as "include" | "exclude",
				value,
			});
			continue;
		}
		const probability = /^probability\(([^)]*)\)$/.exec(expression.trim());
		if (probability) {
			parsed.push({
				id: crypto.randomUUID(),
				functionName: "probability",
				value: probability[1] ?? "",
			});
			continue;
		}
		parsed.push({
			id: crypto.randomUUID(),
			functionName: "custom",
			value: expression.trim().replace(/^\((.*)\)$/s, "$1"),
		});
	}
	depth.value = parsedDepth;
	rows.value = parsed;
}

function persist() {
	const expressions = rows.value.flatMap((row) => {
		const value = row.value.trim();
		if (!value) return [];
		if (row.functionName === "custom") return [`(${value})`];
		if (row.functionName === "probability")
			return [`probability(${Number(value) || 0})`];
		return [`${row.functionName}(${JSON.stringify(value)}, ${depth.value})`];
	});
	emit(
		"update:modelValue",
		expressions.join(logic.value === "and" ? "\n&&\n" : "\n||\n"),
	);
}

function addRow() {
	rows.value.push({
		id: crypto.randomUUID(),
		functionName: "include",
		value: "",
	});
}

function changeFunction(row: ResourceConditionRow, value: unknown) {
	row.functionName = String(value) as ResourceConditionFunction;
	row.value = "";
	persist();
}

function updateDepth(value: number | undefined) {
	depth.value =
		Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 4;
	persist();
}
function adjustDepth(delta: number) {
	updateDepth(depth.value + delta);
}
</script>

<template>
  <div class="overflow-hidden bg-popover">
    <div class="flex flex-wrap items-center gap-2 border-b bg-muted/25 px-3 py-2.5">
      <span class="text-xs font-medium text-muted-foreground">当消息满足</span>
      <Tabs
        :model-value="logic"
        size="compact"
        @update:model-value="logic = ($event as 'and' | 'or'); persist()"
      >
        <TabsList>
          <TabItem value="or" class="h-6 px-2.5 text-[11px]">任意</TabItem>
          <TabItem value="and" class="h-6 px-2.5 text-[11px]">全部</TabItem>
        </TabsList>
      </Tabs>
      <span class="text-xs font-medium text-muted-foreground">条件时</span>
      <label class="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">启用<Switch size="sm" :model-value="props.enabled" @update:model-value="emit('update:enabled', Boolean($event))" /></label>
    </div>
    <div class="relative grid gap-2 px-3 py-3">
      <div v-for="(row, index) in rows" :key="row.id" class="relative grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-start gap-2 pl-4 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-px before:bg-border first:before:top-1/2 last:before:bottom-1/2">
        <span class="absolute left-[-4px] top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-popover bg-muted-foreground" />
        <span v-if="index > 0" class="absolute -left-0.5 top-[-0.6rem] rounded bg-popover px-1 text-[9px] tracking-[0.08em] text-muted-foreground">{{ logic.toUpperCase() }}</span>
        <Select :model-value="row.functionName" @update:model-value="changeFunction(row, $event)"><SelectTrigger class="h-8 w-full text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="item in resourceConditionDefinitions" :key="item.id" :value="item.id">{{ item.label }}</SelectItem></SelectContent></Select>
        <div v-if="row.functionName === 'custom'" class="h-20 overflow-hidden rounded-lg border bg-background"><JavaScriptCodeMirrorEditor :model-value="row.value" language="javascript" frameless @update:model-value="row.value = $event; persist()" /></div>
        <Input v-else :model-value="row.value" class="h-8 min-w-0 bg-background text-xs shadow-none" :placeholder="definition(row.functionName).placeholder" @update:model-value="row.value = String($event ?? ''); persist()" />
        <Button size="icon" variant="ghost" class="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="删除条件" @click="rows = rows.filter((item) => item.id !== row.id); persist()"><Trash2 class="size-3.5" /></Button>
      </div>
      <p v-if="!rows.length" class="py-3 text-center text-xs text-muted-foreground">没有条件时始终导入资源。</p>
      <Button variant="ghost" class="h-9 justify-center border border-dashed px-2 text-xs text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/40 hover:text-foreground" @click="addRow"><Plus class="size-3.5" />添加条件</Button>
    </div>
    <div class="flex items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2.5"><div class="min-w-0"><p class="text-[10px] tracking-[0.1em] text-muted-foreground">表达式</p><p class="mt-1 break-all text-xs leading-5 text-primary">{{ expressionPreview }}</p></div><div class="flex shrink-0 items-center gap-1.5"><Button variant="outline" size="icon-sm" class="size-6 rounded-md bg-background" title="减小匹配深度" :disabled="depth <= 1" @click="adjustDepth(-1)"><Minus class="size-3" /></Button><span class="min-w-5 text-center text-xs tabular-nums">{{ depth }}</span><Button variant="outline" size="icon-sm" class="size-6 rounded-md bg-background" title="增加匹配深度" @click="adjustDepth(1)"><Plus class="size-3" /></Button></div></div>
  </div>
</template>



src/features/Plugin/resources/PluginResourceRenderer.vue

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Image } from "@/components/ui/image";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import StPresetRenderer from "@/features/Migrations/SillyTavern/renderers/StPresetRenderer.vue";
import StWorldbookRenderer from "@/features/Migrations/SillyTavern/renderers/StWorldbookRenderer.vue";
import { resolveMediaUrl } from "@/features/Plugin/media/media-link";
import { resourceType } from "../dataflow/types";
import PluginTypeRenderer from "./PluginTypeRenderer.vue";
import type { ResourceFile } from "./resource-types";
import PluginCharacterEditor from "./types/character/PluginCharacterEditor.vue";
import PluginChatEditor from "./types/chat/PluginChatEditor.vue";
import PluginConfigEditor from "./types/config/PluginConfigEditor.vue";
import PluginDataEditor from "./types/data/PluginDataEditor.vue";
import JavaScriptCodeMirrorEditor from "./types/javascript/JavaScriptCodeMirrorEditor.vue";
import { pluginMediaSource, pluginMediaType } from "./types/media/plugin-media";
import PluginRegexEditor from "./types/regex/PluginRegexEditor.vue";

const props = defineProps<{
	file: ResourceFile;
	modelValue: string;
	preview: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const type = computed(() => resourceType(props.file.path));
const mediaSource = computed(() => pluginMediaSource(props.file.content));
const resolvedMediaSource = ref("");
watch(
	mediaSource,
	async (source) => {
		resolvedMediaSource.value = source ? await resolveMediaUrl(source) : "";
	},
	{ immediate: true },
);
const mediaKind = computed(() =>
	pluginMediaType(props.file.content, mediaSource.value),
);
const codeLanguage = computed<
	"javascript" | "json" | "markdown" | "vue" | "text"
>(() => {
	if (type.value === "javascript") return "javascript";
	if (type.value === "markdown") return "markdown";
	if (type.value === "component") return "vue";
	return props.file.path.endsWith(".json") ? "json" : "text";
});
const parsedJson = computed(() => {
	try {
		return props.file.path.endsWith(".json")
			? JSON.parse(props.modelValue)
			: null;
	} catch {
		return null;
	}
});
const isWorldbook = computed(() =>
	Boolean(
		parsedJson.value &&
			typeof parsedJson.value === "object" &&
			"entries" in parsedJson.value,
	),
);
const isPreset = computed(() =>
	Boolean(
		parsedJson.value &&
			typeof parsedJson.value === "object" &&
			("prompts" in parsedJson.value || "prompt_order" in parsedJson.value),
	),
);
</script>

<template>
  <div class="h-full min-h-0 overflow-hidden">
    <ConversationComposerEditor v-if="type === 'markdown' && preview" :model-value="modelValue" placeholder="输入 Markdown 内容" :enable-ai="false" :submit-on-enter="false" full-height class="h-full" @update:model-value="emit('update:modelValue', $event)" />
    <StWorldbookRenderer v-else-if="isWorldbook && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <StPresetRenderer v-else-if="isPreset && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginCharacterEditor v-else-if="file.path === '/definition.package.json' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginConfigEditor v-else-if="file.path.endsWith('/config.json') && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginTypeRenderer v-else-if="type === 'component' && preview" :file="file" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginDataEditor v-else-if="type === 'data' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginRegexEditor v-else-if="(file.path.endsWith('/regex.json') || file.path.endsWith('.regex.json')) && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <PluginChatEditor v-else-if="type === 'chat' && preview" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <div v-else-if="type === 'media'" class="flex h-full items-center justify-center bg-muted/20 p-4"><video v-if="mediaKind === 'video'" :src="resolvedMediaSource" controls class="max-h-full max-w-full rounded-lg" /><audio v-else-if="mediaKind === 'audio'" :src="resolvedMediaSource" controls /><Image v-else :src="resolvedMediaSource" :alt="file.path" :preview="false" object-fit="contain" class="max-h-full max-w-full" /></div>
    <JavaScriptCodeMirrorEditor v-else :model-value="modelValue" :language="codeLanguage" frameless @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>



src/features/Plugin/resources/PluginTypeRenderer.vue

<script setup lang="ts">
import { PhWarningCircle as WarningCircle } from "@phosphor-icons/vue";
import { type Component, computed, onErrorCaptured, ref, watch } from "vue";
import type { ResourceFile } from "./resource-types";
import { compilePluginVueFile } from "./types/vue/plugin-vue-runtime";

const props = defineProps<{ file: ResourceFile; modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const runtimeError = ref<string | null>(null);
onErrorCaptured((error) => {
	runtimeError.value = error instanceof Error ? error.message : String(error);
	return false;
});
watch(
	() => [props.file.path, props.modelValue],
	() => {
		runtimeError.value = null;
	},
);
const compilation = computed<{
	component: Component | null;
	error: string | null;
}>(() => {
	try {
		return compilePluginVueFile({ ...props.file, content: props.modelValue });
	} catch (error) {
		return {
			component: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
});
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-auto">
    <div v-if="runtimeError || compilation.error" class="flex h-full min-h-0 items-center justify-center p-6"><div class="max-w-md rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive"><div class="mb-1.5 flex items-center gap-1.5 font-semibold"><WarningCircle class="size-4 shrink-0" />{{ runtimeError ? '渲染器运行时错误' : '渲染器无法编译' }}</div><pre class="overflow-x-auto whitespace-pre-wrap font-mono leading-5">{{ runtimeError || compilation.error }}</pre></div></div>
    <component :is="compilation.component" v-else-if="compilation.component" :file="file" :path="file.path" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>


src/features/Plugin/resources/resource-condition.ts

import { executeSandboxCode } from "@/features/Plugin/runtime/sandbox";

export type ResourceConditionFunction =
	| "include"
	| "exclude"
	| "probability"
	| "custom";
export type ResourceConditionRow = {
	id: string;
	functionName: ResourceConditionFunction;
	value: string;
};
export const resourceConditionDefinitions = [
	{ id: "include", label: "包含", placeholder: "关键词或 /正则/" },
	{ id: "exclude", label: "不包含", placeholder: "关键词或 /正则/" },
	{ id: "probability", label: "概率", placeholder: "百分比" },
	{ id: "custom", label: "自定义", placeholder: "JavaScript 条件" },
] as const;

function messageText(message: unknown) {
	if (!message || typeof message !== "object") return "";
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part) =>
			part &&
			typeof part === "object" &&
			typeof (part as { text?: unknown }).text === "string"
				? [(part as { text: string }).text]
				: [],
		)
		.join("\n");
}

function parseRegex(value: string) {
	if (!value.startsWith("/")) return null;
	const closingSlash = value.lastIndexOf("/");
	if (closingSlash <= 0) return null;
	try {
		return new RegExp(
			value.slice(1, closingSlash),
			value.slice(closingSlash + 1),
		);
	} catch {
		return null;
	}
}

function createResourceConditionEnvironment(
	chatValue: unknown,
	random: () => number = Math.random,
) {
	const chat = Array.isArray(chatValue) ? chatValue : [];
	const searchableText = (depth?: unknown) => {
		const numericDepth = Number(depth);
		const messages =
			Number.isFinite(numericDepth) && numericDepth > 0
				? chat.slice(-Math.floor(numericDepth))
				: chat;
		return messages.map(messageText).filter(Boolean).join("\n");
	};
	const include = (keywordOrRegex: unknown, depth?: unknown) => {
		const keyword = String(keywordOrRegex ?? "").trim();
		if (!keyword) return false;
		const text = searchableText(depth);
		const pattern = parseRegex(keyword);
		return pattern
			? pattern.test(text)
			: text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
	};
	return {
		include,
		exclude: (keywordOrRegex: unknown, depth?: unknown) =>
			!include(keywordOrRegex, depth),
		probability: (percentage: unknown) => {
			const value = Number(percentage);
			return (
				Number.isFinite(value) &&
				random() * 100 < Math.min(Math.max(value, 0), 100)
			);
		},
		containKeyWord: include,
		excludeKeyWord: (keywordOrRegex: unknown, depth?: unknown) =>
			!include(keywordOrRegex, depth),
	};
}

export function evaluateResourceCondition(
	source: string | undefined,
	environment: Record<string, unknown>,
) {
	if (!source?.trim()) return true;
	return Boolean(
		executeSandboxCode(source, [
			environment,
			createResourceConditionEnvironment(environment.chat),
		]),
	);
}


src/features/Plugin/resources/resource-types.ts

import type { FileMeta, ResourcePath } from "../dataflow/types";

export interface ResourceFile extends FileMeta {
	path: ResourcePath;
	content: string;
}


src/features/Plugin/resources/types/character/plugin-character.ts

import type { PluginData } from "../../../dataflow/types";

export interface CharacterDefinition {
	schemaVersion: number;
	name: string;
	description?: string;
	tags: string[];
	/** Enabled global Plugin source folder names, in merge order. */
	globalPlugins: string[];
}

function strings(value: unknown) {
	return Array.isArray(value)
		? [
				...new Set(
					value
						.filter((item): item is string => typeof item === "string")
						.map((item) => item.trim())
						.filter(Boolean),
				),
			]
		: [];
}

export function parseCharacterDefinition(source: unknown): CharacterDefinition {
	let value: Record<string, unknown> = {};
	try {
		const parsed = typeof source === "string" ? JSON.parse(source) : source;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
			value = parsed as Record<string, unknown>;
	} catch {
		// Invalid authoring JSON still yields a stable UI projection.
	}
	return {
		schemaVersion:
			typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
		name:
			typeof value.name === "string" && value.name.trim()
				? value.name.trim()
				: "未命名角色",
		description:
			typeof value.description === "string" ? value.description : undefined,
		tags: strings(value.tags),
		globalPlugins: strings(value.globalPlugins).filter(
			(folder) => folder !== "." && folder !== ".." && !folder.includes("/"),
		),
	};
}

export interface CharacterData {
	id: string;
	name: string;
	description?: string;
	avatarUrl?: string;
	coverUrl?: string;
}

/** Character is a live UI projection of its owning local Plugin. */
export function characterFromPlugin(
	localPluginId: string,
	plugin: PluginData,
): CharacterData {
	const definition = parseCharacterDefinition(
		plugin.tree["definition.package.json"],
	);
	const avatar = plugin.tree["avatar.png"];
	const cover = plugin.tree["cover.png"];
	return {
		id: localPluginId,
		name: definition.name,
		description: definition.description,
		avatarUrl: typeof avatar === "string" ? avatar : undefined,
		coverUrl: typeof cover === "string" ? cover : undefined,
	};
}


src/features/Plugin/resources/types/character/PluginCharacterEditor.vue

<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingItem from "@/features/Setting/components/SettingItem.vue";
import { ArrowDown, ArrowUp, Plus, X } from "@/lib/phosphor-icons";
import { builtinPluginFolders } from "../../../utils/import-converter";
import { parseCharacterDefinition } from "./plugin-character";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const definition = computed(() => parseCharacterDefinition(props.modelValue));
const newPlugin = ref("");
const availablePlugins = computed(() =>
	builtinPluginFolders().filter(
		(folder) => !definition.value.globalPlugins.includes(folder),
	),
);

function update(key: "name" | "description" | "globalPlugins", value: unknown) {
	let source: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(props.modelValue);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
			source = parsed as Record<string, unknown>;
	} catch {}
	source[key] = value;
	emit("update:modelValue", JSON.stringify(source, null, 2));
}

function addPlugin(value = newPlugin.value) {
	const folder = value.trim();
	if (
		!folder ||
		folder.includes("/") ||
		definition.value.globalPlugins.includes(folder)
	)
		return;
	update("globalPlugins", [...definition.value.globalPlugins, folder]);
	newPlugin.value = "";
}

function movePlugin(index: number, offset: number) {
	const target = index + offset;
	if (target < 0 || target >= definition.value.globalPlugins.length) return;
	const next = [...definition.value.globalPlugins];
	[next[index], next[target]] = [next[target]!, next[index]!];
	update("globalPlugins", next);
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-background">
    <div class="mx-auto w-full max-w-5xl px-4 pb-12 pt-4 mobile:px-3">
      <SettingGroup>
        <SettingItem title="角色名称"><Input class="w-full sm:w-72" :model-value="definition.name" @update:model-value="update('name', String($event))" /></SettingItem>
        <SettingItem title="角色描述"><Textarea class="w-full sm:w-96" :model-value="definition.description ?? ''" @update:model-value="update('description', String($event))" /></SettingItem>
        <SettingItem title="全局插件" description="按文件夹名称启用；列表顺序也是合并顺序。">
          <div class="flex w-full max-w-md flex-col gap-2">
            <div v-for="(folder, index) in definition.globalPlugins" :key="folder" class="flex items-center gap-1 rounded-md border bg-muted/20 px-2 py-1"><code class="min-w-0 flex-1 truncate text-xs">{{ folder }}</code><Button variant="ghost" size="icon-sm" :disabled="index === 0" title="上移" @click="movePlugin(index, -1)"><ArrowUp class="size-3.5" /></Button><Button variant="ghost" size="icon-sm" :disabled="index === definition.globalPlugins.length - 1" title="下移" @click="movePlugin(index, 1)"><ArrowDown class="size-3.5" /></Button><Button variant="ghost" size="icon-sm" title="停用" @click="update('globalPlugins', definition.globalPlugins.filter((item) => item !== folder))"><X class="size-3.5" /></Button></div>
            <div v-if="availablePlugins.length" class="flex flex-wrap gap-1"><Button v-for="folder in availablePlugins" :key="folder" variant="outline" size="sm" @click="addPlugin(folder)"><Plus class="size-3.5" />{{ folder }}</Button></div>
            <div class="flex gap-2"><Input v-model="newPlugin" placeholder="插件文件夹名称" @keydown.enter.prevent="addPlugin()" /><Button variant="outline" size="sm" :disabled="!newPlugin.trim()" @click="addPlugin()"><Plus class="size-4" />启用</Button></div>
          </div>
        </SettingItem>
      </SettingGroup>
    </div>
  </div>
</template>


src/features/Plugin/resources/types/chat/plugin-chat.ts

import type { ModelMessage } from "ai";
import { push } from "notivue";
import { z } from "zod";

const chatSchema = z.object({
	message: z.array(
		z.object({
			role: z.enum(["system", "user", "assistant"]),
			content: z.string(),
			name: z.string().optional(),
			enabled: z.boolean().optional(),
		}),
	),
});
type PluginChatContext = z.infer<typeof chatSchema>;

function createPluginChatContext(): PluginChatContext {
	return { message: [] };
}

/** Read the authoring document; the editor retains optional labels and enabled state. */
function readPluginChatContext(input: unknown): PluginChatContext {
	let value = input;
	if (typeof input === "string") {
		try {
			value = JSON.parse(input);
		} catch {
			push.warning(".chat.json 不是合法 JSON，已忽略。");
			return createPluginChatContext();
		}
	}
	const parsed = chatSchema.safeParse(value);
	if (!parsed.success) {
		push.warning(".chat.json 类型无效，已忽略。");
		return createPluginChatContext();
	}
	return parsed.data;
}

/** Import only runnable model messages; authoring metadata never enters the Sandbox. */
export function parsePluginChatContext(input: unknown): ModelMessage[] {
	return readPluginChatContext(input)
		.message.filter((message) => message.enabled !== false)
		.map(({ role, content }) => ({ role, content }));
}


src/features/Plugin/resources/types/chat/PluginChatEditor.vue

<script setup lang="ts">
import { computed } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "@/lib/phosphor-icons";
import { type PluginChatMessage, readPluginChatContext } from "./plugin-chat";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const parsed = computed(() => {
	try {
		return { value: readPluginChatContext(props.modelValue), error: "" };
	} catch (error) {
		return {
			value: { message: [] as PluginChatMessage[] },
			error: error instanceof Error ? error.message : String(error),
		};
	}
});
function serialize(message: PluginChatMessage[]) {
	return JSON.stringify(
		{
			message: message.map(({ name, enabled, ...item }) => ({
				...item,
				...(name?.trim() ? { name: name.trim() } : {}),
				...(enabled === false ? { enabled } : {}),
			})),
		},
		null,
		2,
	);
}
function update(index: number, patch: Partial<PluginChatMessage>) {
	const message = structuredClone(parsed.value.value.message);
	message[index] = { ...message[index]!, ...patch };
	emit("update:modelValue", serialize(message));
}
function add() {
	emit(
		"update:modelValue",
		serialize([...parsed.value.value.message, { role: "system", content: "" }]),
	);
}
function remove(index: number) {
	emit(
		"update:modelValue",
		serialize(
			parsed.value.value.message.filter((_, itemIndex) => itemIndex !== index),
		),
	);
}
function move(index: number, delta: number) {
	const target = index + delta;
	const message = structuredClone(parsed.value.value.message);
	if (target < 0 || target >= message.length) return;
	[message[index], message[target]] = [message[target]!, message[index]!];
	emit("update:modelValue", serialize(message));
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <div class="flex items-center justify-between border-b bg-muted/10 px-5 py-4"><div><div class="text-sm font-semibold tracking-tight text-foreground/90">对话上下文</div><p class="mt-0.5 text-xs text-muted-foreground">按顺序编辑带角色消息，可命名或停用单条；停用的消息不会进入生成上下文。</p></div><Button size="sm" variant="outline" class="h-8 rounded-lg shadow-sm hover:bg-muted" @click="add"><Plus class="mr-1 size-3.5" />添加消息</Button></div>
    <div v-if="parsed.error" class="m-5 rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive">{{ parsed.error }}；请切换到源码修复。</div>
    <ScrollArea v-else class="min-h-0 flex-1"><div class="space-y-4 p-5"><div v-for="(message, index) in parsed.value.message" :key="index" class="rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200" :class="message.enabled === false ? 'opacity-55 saturate-50' : 'hover:border-border/85'"><div class="flex items-center gap-2 border-b border-border/40 bg-muted/5 px-3.5 py-2.5"><Select :model-value="message.role" @update:model-value="update(index, { role: $event as never })"><SelectTrigger class="h-8 w-28 shrink-0 rounded-lg text-xs"><SelectValue /></SelectTrigger><SelectContent class="rounded-xl"><SelectItem value="system">system</SelectItem><SelectItem value="user">user</SelectItem><SelectItem value="assistant">assistant</SelectItem></SelectContent></Select><Input :value="message.name" placeholder="命名（可选）" class="h-8 min-w-0 flex-1 rounded-lg border-border/40 bg-background/60 text-xs" @input="update(index, { name: ($event.target as HTMLInputElement).value })" /><span v-if="message.enabled === false" class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">已停用</span><span v-else class="shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#{{ index + 1 }}</span><Switch :model-value="message.enabled !== false" class="shrink-0 scale-75" @update:model-value="update(index, { enabled: $event })" /><div class="ml-auto flex shrink-0 items-center gap-0.5"><Button size="icon" variant="ghost" class="size-7 rounded-lg" :disabled="index === 0" @click="move(index, -1)"><ArrowUp class="size-3.5" /></Button><Button size="icon" variant="ghost" class="size-7 rounded-lg" :disabled="index === parsed.value.message.length - 1" @click="move(index, 1)"><ArrowDown class="size-3.5" /></Button><Button size="icon" variant="ghost" class="size-7 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive" @click="remove(index)"><Trash2 class="size-3.5" /></Button></div></div><textarea :value="message.content" class="min-h-32 w-full resize-y rounded-b-xl border-t border-border/40 bg-muted/15 p-3.5 font-mono text-xs leading-5 outline-none transition-colors focus:bg-background" placeholder="输入消息内容..." @input="update(index, { content: ($event.target as HTMLTextAreaElement).value })" /></div><button v-if="!parsed.value.message.length" type="button" class="flex min-h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 text-xs text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:bg-muted/10 hover:text-foreground" @click="add"><Plus class="mb-1.5 size-5 text-muted-foreground/80" /><span>添加第一条消息</span></button></div></ScrollArea>
  </div>
</template>


src/features/Plugin/resources/types/config/plugin-config.ts

import type { ModelSelection, RequestKind } from "@/features/Request/types";

export type PluginConfigValue =
	| null
	| boolean
	| number
	| string
	| ModelSelection
	| PluginConfigValue[]
	| { [key: string]: PluginConfigValue };

interface PluginConfigRendererBase {
	/** Display name in the config editor. The object key is the persistent ID. */
	title?: string;
	description?: string;
}

type PluginConfigRenderer =
	| (PluginConfigRendererBase & { name: "Checkbox" | "Switch" })
	| (PluginConfigRendererBase & {
			name: "Input";
			placeholder?: string;
			type?: string;
			min?: number;
			max?: number;
			step?: number;
	  })
	| (PluginConfigRendererBase & {
			name: "Slider";
			min?: number;
			max?: number;
			step?: number;
			suffix?: string;
	  })
	| (PluginConfigRendererBase & { name: "Textarea"; placeholder?: string })
	| (PluginConfigRendererBase & {
			name: "Select";
			placeholder?: string;
			options: Array<{ label: string; value: PluginConfigValue }>;
	  })
	| (PluginConfigRendererBase & { name: "ModelSelect"; apiType?: RequestKind })
	| (PluginConfigRendererBase & { name: "MediaSelect"; allowEmpty?: boolean })
	| (PluginConfigRendererBase & {
			/** A plugin-provided renderer name; props remain plain JSON. */
			name: "Custom";
			component: string;
			props?: Record<string, PluginConfigValue>;
	  });

export interface PluginConfigEntry {
	renderer: PluginConfigRenderer;
	/** Authoring fallback used when an entry has not been customized. */
	defaultValue?: PluginConfigValue;
	value: PluginConfigValue;
}

export type PluginConfig = Record<string, PluginConfigEntry>;


src/features/Plugin/resources/types/config/PluginConfigEditor.vue

<script setup lang="ts">
import { computed } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Slider,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DefaultPicker from "@/features/Request/components/DefaultPicker.vue";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingItem from "@/features/Setting/components/SettingItem.vue";
import type {
	PluginConfig,
	PluginConfigEntry,
	PluginConfigValue,
} from "./plugin-config";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const parsed = computed(() => {
	try {
		const value = JSON.parse(props.modelValue) as PluginConfig;
		return value && typeof value === "object" && !Array.isArray(value)
			? { value, error: "" }
			: { value: {} as PluginConfig, error: "config.json 根节点必须是对象。" };
	} catch (error) {
		return {
			value: {} as PluginConfig,
			error: error instanceof Error ? error.message : "JSON 语法错误。",
		};
	}
});
const entries = computed(() => Object.entries(parsed.value.value));
function update(key: string, value: PluginConfigValue) {
	const next = structuredClone(parsed.value.value);
	if (!next[key]) return;
	next[key].value = value;
	emit("update:modelValue", JSON.stringify(next, null, 2));
}
function reset(key: string, entry: PluginConfigEntry) {
	if (entry.defaultValue !== undefined) update(key, entry.defaultValue);
}
function title(key: string, entry: PluginConfigEntry) {
	return entry.renderer.title || key;
}
function numberValue(value: PluginConfigValue, fallback = 0) {
	return typeof value === "number" ? value : fallback;
}
function selectOptions(entry: PluginConfigEntry) {
	return entry.renderer.name === "Select" ? entry.renderer.options : [];
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-background">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-12 pt-4 mobile:px-3">
      <div v-if="parsed.error" class="rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive">{{ parsed.error }}；请切换到源码修复。</div>
      <SettingGroup v-else>
        <SettingItem v-for="([key, entry]) in entries" :key="key" :title="title(key, entry)" :description="entry.renderer.description">
          <Switch v-if="entry.renderer.name === 'Switch' || entry.renderer.name === 'Checkbox'" :model-value="Boolean(entry.value)" @update:model-value="update(key, Boolean($event))" />
          <DefaultPicker v-else-if="entry.renderer.name === 'ModelSelect'" :model-value="entry.value && typeof entry.value === 'object' && !Array.isArray(entry.value) ? entry.value as any : null" :kind="entry.renderer.apiType ?? 'text'" allow-empty empty-label="继承全局默认" @update:model-value="update(key, $event)" />
          <div v-else-if="entry.renderer.name === 'Slider'" class="flex w-full max-w-sm items-center gap-3"><Slider class="flex-1" :model-value="[numberValue(entry.value, entry.renderer.min ?? 0)]" :min="entry.renderer.min ?? 0" :max="entry.renderer.max ?? 100" :step="entry.renderer.step ?? 1" @update:model-value="update(key, Array.isArray($event) ? Number($event[0] ?? 0) : Number($event ?? 0))" /><span class="w-14 text-right text-xs text-muted-foreground">{{ numberValue(entry.value) }}{{ entry.renderer.suffix }}</span></div>
          <Select v-else-if="entry.renderer.name === 'Select'" :model-value="JSON.stringify(entry.value)" @update:model-value="value => { const option = selectOptions(entry).find((item) => JSON.stringify(item.value) === value); if (option) update(key, option.value); }"><SelectTrigger class="w-full sm:w-72"><SelectValue :placeholder="entry.renderer.placeholder ?? '请选择'" /></SelectTrigger><SelectContent><SelectItem v-for="option in selectOptions(entry)" :key="JSON.stringify(option.value)" :value="JSON.stringify(option.value)">{{ option.label }}</SelectItem></SelectContent></Select>
          <Textarea v-else-if="entry.renderer.name === 'Textarea'" class="w-full sm:w-96" :model-value="typeof entry.value === 'string' ? entry.value : ''" :placeholder="entry.renderer.placeholder" @update:model-value="update(key, String($event))" />
          <Input v-else :type="entry.renderer.name === 'Input' ? entry.renderer.type ?? 'text' : 'text'" class="w-full sm:w-72" :min="entry.renderer.name === 'Input' ? entry.renderer.min : undefined" :max="entry.renderer.name === 'Input' ? entry.renderer.max : undefined" :step="entry.renderer.name === 'Input' ? entry.renderer.step : undefined" :placeholder="entry.renderer.name === 'Input' ? entry.renderer.placeholder : undefined" :model-value="typeof entry.value === 'string' || typeof entry.value === 'number' ? entry.value : ''" @update:model-value="update(key, entry.renderer.name === 'Input' && entry.renderer.type === 'number' ? Number($event) : String($event))" />
          <Button v-if="entry.defaultValue !== undefined" size="sm" variant="ghost" @click="reset(key, entry)">恢复默认</Button>
        </SettingItem>
      </SettingGroup>
      <p v-if="!parsed.error && !entries.length" class="py-12 text-center text-sm text-muted-foreground">config.json 还没有配置项。</p>
    </div>
  </div>
</template>


src/features/Plugin/resources/types/data/plugin-data.ts

import { push } from "notivue";
import { z } from "zod";
import { createSandboxFunction } from "@/features/Plugin/runtime/sandbox";

export type PluginDataValue =
	| string
	| number
	| boolean
	| null
	| PluginDataValue[]
	| { [key: string]: PluginDataValue };

const valueSchema: z.ZodType<PluginDataValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(valueSchema),
		z.record(z.string(), valueSchema),
	]),
);
const dataSchema = z.object({
	version: z.literal(1).default(1),
	isolation: z.enum(["resource", "conversation"]).default("resource"),
	initialValue: valueSchema.default({}),
	enableUpdater: z.boolean().default(false),
	wrapperSource: z.string().default(""),
	varName: z.string().optional(),
});

export type PluginDataDefinition = z.infer<typeof dataSchema>;

const fallback: PluginDataDefinition = {
	version: 1,
	isolation: "resource",
	initialValue: {},
	enableUpdater: false,
	wrapperSource: "",
};

/** Data is the sole resource type that gains an object facade on import. */
export function parsePluginDataDefinition(
	input: unknown,
): PluginDataDefinition {
	let value = input;
	if (typeof input === "string") {
		try {
			value = JSON.parse(input);
		} catch {
			push.warning(".data.json 不是合法 JSON，已使用空数据。");
			return structuredClone(fallback);
		}
	}
	const parsed = dataSchema.safeParse(value);
	if (!parsed.success) {
		push.warning(".data.json 类型无效，已使用空数据。");
		return structuredClone(fallback);
	}
	return parsed.data;
}

export function createDataFacade(
	definition: Pick<PluginDataDefinition, "wrapperSource"> & { name: string },
	value: PluginDataValue,
	options: {
		readonly?: boolean;
		onReplace?: (value: PluginDataValue) => void;
	} = {},
) {
	let current = options.readonly ? deepFreeze(structuredClone(value)) : value;
	if (!definition.wrapperSource.trim()) return current;
	const facade = createSandboxFunction(definition.wrapperSource, [])(current, {
		get value() {
			return current;
		},
		replace(next: PluginDataValue) {
			if (options.readonly)
				throw new Error(`${definition.name} 在当前上下文中是只读变量。`);
			current = structuredClone(next);
			options.onReplace?.(current);
		},
	});
	if (!facade || typeof facade !== "object")
		throw new Error(`${definition.name} 的 wrapper 必须返回对象。`);
	return options.readonly ? Object.freeze(facade) : facade;
}

function deepFreeze<T extends PluginDataValue>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value))
		return value;
	Object.values(value).forEach((child) => {
		deepFreeze(child as PluginDataValue);
	});
	return Object.freeze(value);
}


src/features/Plugin/resources/types/data/PluginDataEditor.vue

<script setup lang="ts">
import { computed } from "vue";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@/components/fluid";
import { Textarea } from "@/components/ui/textarea";
import { Braces, Code2 } from "@/lib/phosphor-icons";
import {
	type PluginDataDefinition,
	type PluginDataValue,
	parsePluginDataDefinition,
} from "./plugin-data";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const definition = computed(() => parsePluginDataDefinition(props.modelValue));

function write(patch: Partial<PluginDataDefinition>) {
	emit(
		"update:modelValue",
		JSON.stringify({ ...definition.value, ...patch }, null, 2),
	);
}

function updateInitialValue(value: string) {
	try {
		write({ initialValue: JSON.parse(value) as PluginDataValue });
	} catch {
		// Keep the last valid definition while the user finishes an incomplete JSON edit.
	}
}
</script>

<template>
  <div class="h-full min-h-0 bg-background/5">
    <div class="flex items-start justify-between gap-4 border-b bg-muted/10 px-5 py-4">
      <div>
        <div class="text-sm font-semibold">数据定义</div>
        <p class="mt-0.5 text-xs leading-5 text-muted-foreground">声明数据的隔离范围、初始值和可选 facade；值在运行时按定义导入。</p>
      </div>
      <Braces class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>

    <div class="grid gap-5 overflow-y-auto p-5 md:grid-cols-2">
      <label class="grid gap-2 text-sm font-medium">
        隔离范围
        <Select :model-value="definition.isolation" @update:model-value="write({ isolation: $event as PluginDataDefinition['isolation'] })">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="resource">资源共享</SelectItem><SelectItem value="conversation">按会话隔离</SelectItem></SelectContent>
        </Select>
      </label>
      <label class="grid gap-2 text-sm font-medium">
        变量名（可选）
        <Input :model-value="definition.varName ?? ''" placeholder="例如 state" @update:model-value="write({ varName: String($event ?? '').trim() || undefined })" />
      </label>
      <div class="flex items-center justify-between rounded-xl border bg-card px-3.5 py-3">
        <div><div class="text-sm font-medium">启用 updater</div><p class="mt-0.5 text-xs text-muted-foreground">允许运行时包装器替换当前值。</p></div>
        <Switch :model-value="definition.enableUpdater" @update:model-value="write({ enableUpdater: Boolean($event) })" />
      </div>
      <label class="grid gap-2 md:col-span-2">
        <span class="flex items-center gap-2 text-sm font-medium"><Braces class="size-3.5" />初始 JSON 值</span>
        <Textarea class="min-h-36 font-mono text-xs leading-5" :model-value="JSON.stringify(definition.initialValue, null, 2)" @update:model-value="updateInitialValue(String($event ?? ''))" />
      </label>
      <label class="grid gap-2 md:col-span-2">
        <span class="flex items-center gap-2 text-sm font-medium"><Code2 class="size-3.5" />Facade wrapper（可选）</span>
        <Textarea class="min-h-44 font-mono text-xs leading-5" :model-value="definition.wrapperSource" placeholder="return value" @update:model-value="write({ wrapperSource: String($event ?? '') })" />
      </label>
    </div>
  </div>
</template>


src/features/Plugin/resources/types/javascript/JavaScriptCodeMirrorEditor.vue

<script setup lang="ts">
import {
	autocompletion,
	type CompletionContext,
} from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { vue } from "@codemirror/lang-vue";
import { EditorState, type Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
	oneDarkPro,
	oneDarkProColors,
} from "@/features/Plugin/resources/types/javascript/one-dark-pro-theme";

const props = withDefaults(
	defineProps<{
		modelValue: string;
		language?: "javascript" | "json" | "markdown" | "vue" | "text";
		frameless?: boolean;
		readonly?: boolean;
		importSuggestions?: Array<{
			label: string;
			apply: string;
			detail?: string;
			description?: string;
		}>;
	}>(),
	{
		language: "javascript",
		frameless: false,
		readonly: false,
		importSuggestions: () => [],
	},
);

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const editorRoot = ref<HTMLDivElement | null>(null);
const editorView = ref<EditorView | null>(null);

function pluginSyntaxDecorations() {
	const makeDecorations = (view: EditorView) => {
		const ranges: Range<Decoration>[] = [];
		for (const visible of view.visibleRanges) {
			const source = view.state.doc.sliceString(visible.from, visible.to);
			for (const match of source.matchAll(
				/\bimports(?:\s*\.\s*[A-Za-z_$][\w$]*){1,3}\s*\([^\r\n]*?\)|\{\{[\s\S]*?\}\}|\[\[[\s\S]*?\]\]/g,
			)) {
				if (match.index == null) continue;
				const token = match[0];
				const className = token.startsWith("imports")
					? "cm-plugin-import"
					: token.startsWith("{{")
						? "cm-plugin-expression"
						: "cm-plugin-chat";
				ranges.push(
					Decoration.mark({ class: className }).range(
						visible.from + match.index,
						visible.from + match.index + token.length,
					),
				);
			}
		}
		return Decoration.set(ranges, true);
	};
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = makeDecorations(view);
			}
			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = makeDecorations(update.view);
				}
			}
		},
		{ decorations: (instance) => instance.decorations },
	);
}

function pluginSyntaxCompletions(context: CompletionContext) {
	const importCall = context.matchBefore(
		/\b(?:imports|slot)(?:\s*\.\s*[A-Za-z_$][\w$]*){0,2}(?:\s*\(\s*["'][^"'\r\n]*)?$/,
	);
	if (importCall) {
		return {
			from: importCall.from,
			options: [
				{
					label: "imports(path)",
					apply: 'imports("./resource.md")',
					detail: "按资源类型包装并返回内容",
					type: "function",
				},
				{
					label: "slot.import(name)",
					apply: 'slot.import("slot 名")',
					detail: "获取 slot 资源路径数组（paths 的别名）",
					type: "function",
				},
				{
					label: "slot.paths(name)",
					apply: 'slot.paths("slot 名")',
					detail: "获取 slot 资源路径数组，供 imports(path) 使用",
					type: "function",
				},
				...(props.importSuggestions ?? []).map((item) => ({
					label: item.label,
					apply: item.apply,
					detail: item.detail,
					info: item.description,
					type: "variable",
				})),
			],
		};
	}
	const before = context.matchBefore(/(?:\{\{|\[\[)[^\]}\r\n]*$/);
	if (!before) return null;
	return {
		from: before.from,
		options: before.text.startsWith("{{")
			? [{ label: "{{  }}", detail: "Sandbox 表达式" }]
			: [{ label: "[[chat]]", detail: "当前会话消息" }],
	};
}

onMounted(() => {
	if (!editorRoot.value) return;
	editorView.value = new EditorView({
		doc: props.modelValue,
		parent: editorRoot.value,
		extensions: [
			basicSetup,
			...(props.language === "json"
				? [json()]
				: props.language === "javascript"
					? [javascript({ jsx: true })]
					: props.language === "vue"
						? [vue()]
						: []),
			...(props.language === "markdown" || props.language === "javascript"
				? [
						pluginSyntaxDecorations(),
						autocompletion({
							override: [pluginSyntaxCompletions],
							activateOnTyping: true,
						}),
					]
				: []),
			oneDarkPro,
			EditorState.readOnly.of(Boolean(props.readonly)),
			EditorView.editable.of(!props.readonly),
			EditorView.lineWrapping,
			EditorView.updateListener.of((update) => {
				if (!update.docChanged) return;
				emit("update:modelValue", update.state.doc.toString());
			}),
			EditorView.theme({
				"&": {
					height: "100%",
					backgroundColor: props.frameless
						? "transparent !important"
						: oneDarkProColors.background,
					border: props.frameless ? "0" : "1px solid hsl(var(--border))",
					borderRadius: props.frameless ? "0" : "0.375rem",
					fontSize: "0.875rem",
				},
				".cm-scroller": {
					fontFamily: "var(--font-code)",
					fontFeatureSettings: '"calt" 1, "liga" 1, "zero" 1',
					fontVariantLigatures: "common-ligatures contextual",
					fontVariantNumeric: "tabular-nums slashed-zero",
					backgroundColor: props.frameless ? "transparent !important" : null,
				},
				".cm-content": {
					minHeight: "100%",
					padding: "14px 16px !important",
				},
				".cm-gutters": {
					backgroundColor: props.frameless
						? "transparent !important"
						: oneDarkProColors.background,
					borderRight: props.frameless
						? "1px solid color-mix(in oklab, var(--foreground) 8%, transparent)"
						: `1px solid ${oneDarkProColors.activeLine}`,
				},
				"&.cm-focused": {
					outline: props.frameless ? "0" : "1px solid hsl(var(--ring))",
				},
				".cm-plugin-import": {
					color: "hsl(var(--primary))",
					backgroundColor:
						"color-mix(in srgb, hsl(var(--primary)) 14%, transparent)",
					borderRadius: "0.25rem",
				},
				".cm-plugin-expression": {
					color: "#c084fc",
					backgroundColor: "rgb(192 132 252 / 0.12)",
				},
				".cm-plugin-chat": {
					color: "#38bdf8",
					backgroundColor: "rgb(56 189 248 / 0.12)",
				},
			}),
		],
	});
});

onBeforeUnmount(() => {
	editorView.value?.destroy();
	editorView.value = null;
});

watch(
	() => props.modelValue,
	(value) => {
		const view = editorView.value;
		if (!view || value === view.state.doc.toString()) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: value },
		});
	},
);
</script>

<template>
  <div ref="editorRoot" class="h-full min-h-0" />
</template>


src/features/Plugin/resources/types/javascript/one-dark-pro-theme.ts

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

// Adapted from Binaryify/OneDark-Pro (MIT) for CodeMirror's semantic tags.
export const oneDarkProColors = {
	background: "#282c34",
	panel: "#21252b",
	activeLine: "#2c313c",
	selection: "#67769660",
	foreground: "#abb2bf",
	muted: "#5c6370",
	lineNumber: "#495162",
	cursor: "#528bff",
	red: "#e06c75",
	green: "#98c379",
	yellow: "#e5c07b",
	blue: "#61afef",
	purple: "#c678dd",
	cyan: "#56b6c2",
	orange: "#d19a66",
} as const;

const c = oneDarkProColors;

const oneDarkProTheme = EditorView.theme(
	{
		"&": {
			color: c.foreground,
			backgroundColor: c.background,
		},
		".cm-content": { caretColor: c.cursor },
		".cm-cursor, .cm-dropCursor": { borderLeftColor: c.cursor },
		"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
			{
				backgroundColor: c.selection,
			},
		".cm-panels": { backgroundColor: c.panel, color: c.foreground },
		".cm-panels.cm-panels-top": { borderBottom: `1px solid ${c.activeLine}` },
		".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${c.activeLine}` },
		".cm-searchMatch": {
			backgroundColor: "#d19a6644",
			outline: "1px solid #ffffff5a",
		},
		".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ffffff22" },
		".cm-activeLine": { backgroundColor: c.activeLine },
		".cm-selectionMatch": { backgroundColor: "#ffd33d44" },
		"&.cm-focused .cm-matchingBracket": {
			backgroundColor: "#515a6b",
			outline: "1px solid #515a6b",
		},
		"&.cm-focused .cm-nonmatchingBracket": { color: c.red },
		".cm-gutters": {
			backgroundColor: c.background,
			color: c.lineNumber,
			border: "none",
		},
		".cm-activeLineGutter": {
			backgroundColor: c.activeLine,
			color: c.foreground,
		},
		".cm-foldPlaceholder": {
			backgroundColor: "transparent",
			border: "none",
			color: c.muted,
		},
		".cm-tooltip": {
			backgroundColor: c.panel,
			border: "1px solid #181a1f",
			color: c.foreground,
		},
		".cm-tooltip .cm-tooltip-arrow:before": {
			borderTopColor: "transparent",
			borderBottomColor: "transparent",
		},
		".cm-tooltip .cm-tooltip-arrow:after": {
			borderTopColor: c.panel,
			borderBottomColor: c.panel,
		},
		".cm-tooltip-autocomplete > ul > li[aria-selected]": {
			backgroundColor: c.activeLine,
			color: c.foreground,
		},
	},
	{ dark: true },
);

const oneDarkProHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: c.purple },
	{
		tag: [
			tags.name,
			tags.deleted,
			tags.character,
			tags.propertyName,
			tags.macroName,
		],
		color: c.red,
	},
	{ tag: [tags.function(tags.variableName), tags.labelName], color: c.blue },
	{
		tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
		color: c.orange,
	},
	{ tag: [tags.definition(tags.name), tags.separator], color: c.foreground },
	{
		tag: [
			tags.typeName,
			tags.className,
			tags.number,
			tags.changed,
			tags.annotation,
			tags.modifier,
			tags.self,
			tags.namespace,
		],
		color: c.yellow,
	},
	{
		tag: [
			tags.operator,
			tags.operatorKeyword,
			tags.url,
			tags.escape,
			tags.regexp,
			tags.link,
			tags.special(tags.string),
		],
		color: c.cyan,
	},
	{ tag: [tags.meta, tags.comment], color: c.muted, fontStyle: "italic" },
	{ tag: tags.strong, fontWeight: "700" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.link, color: c.muted, textDecoration: "underline" },
	{ tag: tags.heading, color: c.red, fontWeight: "700" },
	{
		tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
		color: c.orange,
	},
	{
		tag: [tags.processingInstruction, tags.string, tags.inserted],
		color: c.green,
	},
	{ tag: tags.invalid, color: "#ffffff", backgroundColor: c.red },
]);

export const oneDarkPro = [
	oneDarkProTheme,
	syntaxHighlighting(oneDarkProHighlightStyle),
];


src/features/Plugin/resources/types/media/plugin-media.ts

export type PluginMediaType = "image" | "video" | "audio";

export interface PluginMediaContent {
	kind: "media";
	url: string;
	mediaType?: PluginMediaType;
}

export function pluginMediaSource(content: unknown) {
	if (typeof content === "string") {
		return content.trim();
	}
	if (!content || typeof content !== "object") {
		return "";
	}
	const source = content as { url?: unknown; src?: unknown; value?: unknown };
	const value = source.url ?? source.src ?? source.value;
	return typeof value === "string" ? value.trim() : "";
}

export function pluginMediaType(
	content: unknown,
	source = pluginMediaSource(content),
): PluginMediaType {
	if (content && typeof content === "object") {
		const explicit = (content as { mediaType?: unknown }).mediaType;
		if (explicit === "video" || explicit === "image" || explicit === "audio") {
			return explicit;
		}
	}

	const normalized = source.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
	if (
		normalized.startsWith("data:audio/") ||
		/\.(mp3|wav|m4a|aac|flac|opus)$/.test(normalized)
	)
		return "audio";
	return normalized.startsWith("data:video/") ||
		/\.(mp4|webm|ogv|ogg|mov|m4v)$/.test(normalized)
		? "video"
		: "image";
}

export function createPluginMediaContent(
	url = "",
	mediaType?: PluginMediaType,
): PluginMediaContent {
	return {
		kind: "media",
		url,
		mediaType: mediaType ?? pluginMediaType(url),
	};
}


src/features/Plugin/resources/types/regex/plugin-regex.ts

import { z } from "zod";

const pluginRegexRuleSchema = z.object({
	find_regex: z.string(),
	replace_regex: z.string(),
	range: z.enum(["user_input", "ai_output", "all"]),
	depth_min: z.union([z.number(), z.literal("INF")]),
	depth_max: z.union([z.number(), z.literal("INF")]),
	applyOnRendering: z.boolean(),
});

const pluginRegexRulesSchema = z.array(pluginRegexRuleSchema);
export type PluginRegexRule = z.infer<typeof pluginRegexRuleSchema>;

export function createPluginRegexRule(): PluginRegexRule {
	return {
		find_regex: "",
		replace_regex: "",
		range: "all",
		depth_min: 1,
		depth_max: "INF",
		applyOnRendering: false,
	};
}

export function parsePluginRegexRules(input: unknown): PluginRegexRule[] {
	let value = input;
	if (typeof input === "string") {
		try {
			value = JSON.parse(input);
		} catch {
			return [];
		}
	}
	const parsed = pluginRegexRulesSchema.safeParse(value);
	return parsed.success ? parsed.data : [];
}


src/features/Plugin/resources/types/regex/PluginRegexEditor.vue

<script setup lang="ts">
import { computed } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "@/lib/phosphor-icons";
import {
	createPluginRegexRule,
	type PluginRegexRule,
	parsePluginRegexRules,
} from "./plugin-regex";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const rules = computed(() => parsePluginRegexRules(props.modelValue));

function write(next: PluginRegexRule[]) {
	emit("update:modelValue", JSON.stringify(next, null, 2));
}

function update(index: number, patch: Partial<PluginRegexRule>) {
	const next = structuredClone(rules.value);
	next[index] = { ...next[index]!, ...patch };
	write(next);
}

function remove(index: number) {
	write(rules.value.filter((_, itemIndex) => itemIndex !== index));
}

function move(index: number, delta: number) {
	const target = index + delta;
	if (target < 0 || target >= rules.value.length) return;
	const next = structuredClone(rules.value);
	[next[index], next[target]] = [next[target]!, next[index]!];
	write(next);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <div class="flex items-center justify-between border-b bg-muted/10 px-5 py-4"><div><div class="text-sm font-semibold">正则规则</div><p class="mt-0.5 text-xs text-muted-foreground">按顺序应用；渲染替换只影响显示，不写回消息。</p></div><Button size="sm" variant="outline" class="h-8 rounded-lg" @click="write([...rules, createPluginRegexRule()])"><Plus class="mr-1 size-3.5" />添加规则</Button></div>
    <div class="min-h-0 flex-1 overflow-y-auto p-5"><div class="space-y-3"><div v-for="(rule, index) in rules" :key="index" class="rounded-xl border bg-card p-3.5 shadow-sm"><div class="mb-3 flex items-center gap-2"><span class="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">#{{ index + 1 }}</span><Select :model-value="rule.range" @update:model-value="update(index, { range: $event as PluginRegexRule['range'] })"><SelectTrigger class="h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部消息</SelectItem><SelectItem value="user_input">用户输入</SelectItem><SelectItem value="ai_output">助手输出</SelectItem></SelectContent></Select><div class="ml-auto flex items-center gap-0.5"><Button size="icon" variant="ghost" class="size-7" :disabled="index === 0" @click="move(index, -1)"><ArrowUp class="size-3.5" /></Button><Button size="icon" variant="ghost" class="size-7" :disabled="index === rules.length - 1" @click="move(index, 1)"><ArrowDown class="size-3.5" /></Button><Button size="icon" variant="ghost" class="size-7 text-destructive hover:bg-destructive/10" @click="remove(index)"><Trash2 class="size-3.5" /></Button></div></div><div class="grid gap-2 md:grid-cols-2"><Input :model-value="rule.find_regex" class="font-mono text-xs" placeholder="查找正则" @update:model-value="update(index, { find_regex: String($event ?? '') })" /><Input :model-value="rule.replace_regex" class="font-mono text-xs" placeholder="替换文本" @update:model-value="update(index, { replace_regex: String($event ?? '') })" /></div><div class="mt-3 flex items-center justify-between rounded-lg bg-muted/45 px-3 py-2"><span class="text-xs text-muted-foreground">仅在渲染时替换</span><Switch :model-value="rule.applyOnRendering" class="scale-75" @update:model-value="update(index, { applyOnRendering: Boolean($event) })" /></div></div><button v-if="!rules.length" type="button" class="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground" @click="write([createPluginRegexRule()])"><Plus class="mb-2 size-5" />添加第一条正则规则</button></div></div>
  </div>
</template>


src/features/Plugin/resources/types/vue/plugin-vue-runtime.ts

import * as Vue from "vue";
import { type Component, defineAsyncComponent, markRaw } from "vue";
import { loadModule } from "vue3-sfc-loader";
import * as FluidComponents from "@/components/fluid";
import * as DatabaseService from "@/features/Database/database-service";
import { host } from "@/host";
import * as PhosphorIcons from "@/lib/phosphor-icons";
import type { ResourceFile } from "../../resource-types";

export interface PluginVueRuntimeResult {
	component: Component | null;
	error: string | null;
}

async function loadPluginVueModule(source: string, filename = "component.vue") {
	return loadModule(filename, {
		moduleCache: {
			vue: Vue,
			"@/lib/phosphor-icons": PhosphorIcons,
			"@/components/fluid": FluidComponents,
			"@/features/Database/database-service": DatabaseService,
			"@/host": { host },
		} as Record<string, unknown>,
		getFile: async (url: string) =>
			url === filename ||
			url === `/${filename}` ||
			url.endsWith(filename) ||
			url.endsWith(".vue")
				? source
				: "",
		addStyle(text: string) {
			if (typeof document === "undefined") return;
			const style = document.createElement("style");
			style.textContent = text;
			style.setAttribute("data-plugin-vue-style", filename);
			document.head.appendChild(style);
		},
		log(type: string, ...args: unknown[]) {
			if (type === "error") console.error("[PluginVueRuntime]", ...args);
		},
	}) as Promise<Component>;
}

export function compilePluginVueFile(
	file: ResourceFile,
): PluginVueRuntimeResult {
	if (!file.content.trim())
		return { component: null, error: "Vue 文件内容为空。" };
	if (!/<template[\s>]/i.test(file.content))
		return { component: null, error: "Vue 文件缺少 <template>。" };
	return {
		component: markRaw(
			defineAsyncComponent(() =>
				loadPluginVueModule(
					file.content,
					file.path.split("/").at(-1) ?? "component.vue",
				),
			),
		),
		error: null,
	};
}


src/features/Plugin/runtime/environment.ts

import type { ModelMessage } from "ai";
import { toValue } from "vue";
import { mediaLink } from "@/features/Plugin/media/media-link";
import {
	createSandboxFunction,
	resolveSandboxMessagesAsync,
	resolveSandboxTextAsync,
	type SandboxEnvironment,
} from "@/features/Plugin/runtime/sandbox";
import { generateImageToPath } from "@/features/Request/ai-sdk";
import { resolveResourcePath } from "../dataflow/pulse";
import type { PluginData, ResourcePath } from "../dataflow/types";
import { type FileApiOptions, useFileApi } from "../dataflow/use-file-api";
import { useSlot } from "../dataflow/use-slot";
import { importResource } from "../resources/import";
import { PluginLogger } from "./logger";
import { extractYAMLFormatter } from "./yaml-formatter";

export interface PluginEnvironmentOptions extends FileApiOptions {
	sourcePath: ResourcePath;
	context?: SandboxEnvironment;
	logger?: PluginLogger;
}

function isModelMessage(value: unknown): value is ModelMessage {
	return Boolean(
		value && typeof value === "object" && "role" in value && "content" in value,
	);
}

function builtinDocs(id?: string) {
	const docs = import.meta.glob("../builtIn/core/docs/*.md", {
		eager: true,
		query: "?raw",
		import: "default",
	}) as Record<string, string>;
	if (!id)
		return Object.keys(docs).map((path) =>
			path.split("/").at(-1)?.replace(/\.md$/, ""),
		);
	return docs[`../builtIn/core/docs/${id}.md`] ?? null;
}

/**
 * Builds the source-scoped Sandbox facade over a replayed Plugin tree. A child
 * import receives its own `sourcePath`, so `@/`, `./`, and `../` never depend
 * on evaluation order or mutate the parent context.
 */
export function createPluginEnvironment(options: PluginEnvironmentOptions) {
	const files = useFileApi(options);
	const slots = useSlot(options);
	const logger = options.logger ?? new PluginLogger();
	const root: SandboxEnvironment = { ...(options.context ?? {}) };
	const sourcePath = options.sourcePath;
	function data() {
		const value = toValue(options.filetree);
		if (!value) throw new Error("Plugin 资源尚未加载。");
		return value;
	}
	function resolve(from: ResourcePath, request: string) {
		return resolveResourcePath(from, request);
	}
	function importAt(
		request: string | string[],
		from: ResourcePath,
	): unknown | Promise<unknown> {
		if (Array.isArray(request)) {
			const values = request.map((path) => importAt(path, from));
			return values.some((value) => value instanceof Promise)
				? Promise.all(values).then((items) => items.flat())
				: values.flat();
		}
		const path = resolve(from, request);
		const child = scoped(path);
		logger.append(`导入文件：${path}`, 0, "import", path);
		return importResource(data(), path, child);
	}
	async function parseAt(
		request: string | string[],
		from: ResourcePath,
		extra: SandboxEnvironment = {},
	) {
		const environment = { ...scoped(from), ...extra };
		const imported = await importAt(request, from);
		if (typeof imported === "string")
			return resolveSandboxTextAsync(imported, [environment], { logger });
		if (Array.isArray(imported)) {
			if (imported.every(isModelMessage))
				return resolveSandboxMessagesAsync(imported, [environment], { logger });
			return Promise.all(
				imported.map((item) =>
					typeof item === "string"
						? resolveSandboxTextAsync(item, [environment], { logger })
						: item,
				),
			);
		}
		return imported;
	}
	function scoped(from: ResourcePath): SandboxEnvironment {
		const absolute = (path: string) => resolve(from, path);
		const fs = Object.freeze({
			read: (path: string) => files.read(absolute(path)),
			write: (path: string, content: string) =>
				files.write(absolute(path), content),
			edit: (path: string, find: string, replace: string) =>
				files.edit(absolute(path), find, replace),
			mkdir: (path: string) => files.mkdir(absolute(path)),
			move: (source: string, target: string) =>
				files.move(absolute(source), absolute(target)),
			copy: (source: string, target: string) =>
				files.copy(absolute(source), absolute(target)),
			remove: (path: string) => files.remove(absolute(path)),
			exists: (path: string) => files.exists(absolute(path)),
			ls: (path = ".") => files.ls(absolute(path)),
			import: (path: string | string[]) => importAt(path, from),
			run: (path: string | string[]) => importAt(path, from),
			parse: (path: string | string[], extra?: SandboxEnvironment) =>
				parseAt(path, from, extra),
		});
		return {
			...root,
			sourcePath: from,
			imports: (path: string | string[]) => importAt(path, from),
			parse: (path: string | string[], extra?: SandboxEnvironment) =>
				parseAt(path, from, extra),
			fs,
			read: fs.read,
			write: fs.write,
			edit: fs.edit,
			mkdir: fs.mkdir,
			move: fs.move,
			copy: fs.copy,
			remove: fs.remove,
			exists: fs.exists,
			ls: fs.ls,
			logger,
			ctx: root,
		};
	}
	const slot = Object.freeze({
		list: () => slots.slots.value,
		get: (path: string) => slots.get(path),
		paths: (path: string) => slots.paths(path),
		fileNames: (path: string) => slots.fileNames(path),
		import: (path: string, extra?: SandboxEnvironment) =>
			parseAt(slots.paths(path), sourcePath, extra),
	});
	Object.assign(root, scoped(sourcePath), {
		slot,
		skills: () =>
			slots.paths("skill").map((path) => ({ path, content: files.read(path) })),
		utils: Object.freeze({ yaml: { extract: extractYAMLFormatter } }),
		read_docs: builtinDocs,
		generateImageToPath,
		media: Object.freeze({ link: mediaLink }),
		now: () => new Date().toISOString(),
	});
	function registerCustomTools() {
		const collisions = new Set(Object.keys(root));
		const paths: ResourcePath[] = [];
		const collect = (tree: PluginData["tree"], prefix = "/") => {
			for (const [name, node] of Object.entries(tree)) {
				const path = prefix === "/" ? `/${name}` : `${prefix}/${name}`;
				if (typeof node === "string") paths.push(path);
				else collect(node, path);
			}
		};
		collect(data().tree);
		const tools = paths
			.flatMap((path) => {
				const match = /\/tools\/([^/]+)\/tool\.js$/i.exec(path);
				if (!match || !files.exists(path.replace(/tool\.js$/i, "prompt.md")))
					return [];
				const meta = data().meta[path];
				return meta && "priority" in meta
					? [{ path, name: match[1]!, priority: meta.priority }]
					: [];
			})
			.sort(
				(left, right) =>
					right.priority - left.priority || left.path.localeCompare(right.path),
			);
		for (const tool of tools) {
			if (collisions.has(tool.name))
				throw new Error(`工具函数名称与 ctx 冲突：${tool.name}`);
			root[tool.name] = createSandboxFunction(files.read(tool.path), [
				scoped(tool.path),
			]);
			collisions.add(tool.name);
		}
		return tools.map(({ name, path }) => ({ name, path }));
	}
	return {
		environment: root,
		files,
		slots,
		slot,
		logger,
		importAt,
		parseAt,
		registerCustomTools,
	};
}


src/features/Plugin/runtime/logger.ts

export type PluginLogKind =
	| "enter"
	| "exit"
	| "import"
	| "read"
	| "condition"
	| "text"
	| "macro"
	| "result"
	| "api"
	| "sandbox"
	| "error"
	| "info";

export interface PluginLogEntry {
	depth: number;
	type: PluginLogKind;
	message: string;
	path?: string;
	timestamp: string;
}

export class PluginLogger {
	readonly logs: PluginLogEntry[] = [];

	append(
		message: string,
		depth = 0,
		type: PluginLogKind = "info",
		path?: string,
	) {
		this.logs.push({
			depth,
			type,
			message,
			path,
			timestamp: new Date().toISOString(),
		});
	}

	child(message: string, path?: string) {
		this.append(message, 0, "info", path);
		return {
			append: (detail: string, type: PluginLogKind = "info") =>
				this.append(detail, 1, type, path),
		};
	}

	toFormattedText() {
		return this.logs
			.map(
				(entry) =>
					`${"  ".repeat(entry.depth)}[${entry.type.toUpperCase()}] ${entry.message}`,
			)
			.join("\n");
	}
}


src/features/Plugin/runtime/run-api.ts

import type { ModelMessage } from "ai";
import type { MaybeRefOrGetter } from "vue";
import type {
	ChatContainer,
	ChatMessage,
} from "@/features/Conversation/dataflow/types";
import type { SandboxEnvironment } from "@/features/Plugin/runtime/sandbox";
import { createAgentResourceProvider } from "../agent/runtime/default-agent";
import type { PluginData, Pulse, ResourcePath } from "../dataflow/types";
import { parsePluginDataDefinition } from "../resources/types/data/plugin-data";
import { createPluginEnvironment } from "./environment";
import type { PluginLogger } from "./logger";

export interface RunWorldInput {
	conversationId: string;
	container: ChatContainer;
	message: ChatMessage;
	prompt: string;
	chat: ModelMessage[];
	filetree: MaybeRefOrGetter<PluginData | null>;
	applyPulse: (pulse: Pulse) => void;
	context?: SandboxEnvironment;
	entryPath?: ResourcePath;
}

export interface RunWorldResult {
	context: SandboxEnvironment;
	entryPath: ResourcePath;
	logger: PluginLogger;
}

/** Runs the selected source against the exact message-version replay projection. */
export async function runWorld(input: RunWorldInput): Promise<RunWorldResult> {
	const reply = input.message;
	const built = createPluginEnvironment({
		filetree: input.filetree,
		applyPulse: input.applyPulse,
		sourcePath: input.entryPath ?? "/",
		context: {
			...input.context,
			conversationId: input.conversationId,
			prompt: input.prompt,
			chat: input.chat,
			CHAT: input.chat,
			container: input.container,
			message: input.message,
			reply,
		},
	});
	const entryPath = input.entryPath ?? built.slots.paths("generatePath")[0];
	if (!entryPath) throw new Error("没有已选中的生成流程。");
	built.environment.sourcePath = entryPath;
	built.registerCustomTools();
	for (const path of built.slots.paths("DATA_INJECT")) {
		const definition = parsePluginDataDefinition(built.files.read(path));
		const name = definition.varName?.trim();
		if (!name) continue;
		if (name in built.environment) throw new Error(`数据变量名冲突：${name}`);
		built.environment[name] = await built.importAt(path, entryPath);
	}
	const agent = createAgentResourceProvider({ environment: built.environment });
	built.environment.agent = agent;
	built.environment.AGENT = agent;
	await built.importAt(entryPath, entryPath);
	return { context: built.environment, entryPath, logger: built.logger };
}


src/features/Plugin/runtime/sandbox.ts

import type { ModelMessage } from "ai";

export type SandboxEnvironment = Record<string | number, unknown>;

export type ResolveTextOptions = {
	keepArraySet2StrDefault?: boolean;
	maxDepth?: number;
	logger?: {
		append(message: string, depth?: number, type?: string, path?: string): void;
	};
};

const defaultMaxDepth = 30;
const inlinePattern = /(\{\{([\s\S]*?)\}\}|\[\[([\s\S]*?)\]\])/g;

function mergeEnvironment(
	environments: SandboxEnvironment[] = [],
): SandboxEnvironment {
	return Object.assign({}, ...environments);
}

export async function executeSandboxCodeAsync(
	code: string,
	environments: SandboxEnvironment[] = [],
): Promise<unknown> {
	try {
		const environment = mergeEnvironment(environments);
		const body = buildExecutableBody(code.trim(), environment);
		const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
		const runner = new AsyncFunction(
			"environment",
			`with (environment) {\n${body}\n}`,
		);
		const result = await runner.call(environment, environment);
		return typeof result === "function"
			? await result.call(environment, environment)
			: result;
	} catch (error) {
		throw sandboxExecutionError(error, code);
	}
}

/** Runs a synchronous expression or statement block against the supplied environment. */
export function executeSandboxCode(
	code: string,
	environments: SandboxEnvironment[] = [],
): unknown {
	try {
		const environment = mergeEnvironment(environments);
		const body = buildExecutableBody(code.trim(), environment);
		const runner = new Function(
			"environment",
			`with (environment) {\n${body}\n}`,
		);
		return runner.call(environment, environment);
	} catch (error) {
		throw sandboxExecutionError(error, code);
	}
}

export function createSandboxFunction(
	code: string,
	environments: SandboxEnvironment[] = [],
): (...args: unknown[]) => unknown {
	try {
		const environment = mergeEnvironment(environments);
		const body = buildExecutableBody(code.trim(), environment);
		const runner = new Function(
			"environment",
			`with (environment) {\n${body}\n}`,
		);
		const value = runner.call(environment, environment);
		if (typeof value !== "function") {
			throw new Error("自定义工具的 tool.js 必须只包含一个函数。");
		}
		return (...args: unknown[]) => {
			try {
				const result = Reflect.apply(value, environment, args);
				return result instanceof Promise
					? result.catch((error) => {
							throw sandboxExecutionError(error, code);
						})
					: result;
			} catch (error) {
				throw sandboxExecutionError(error, code);
			}
		};
	} catch (error) {
		throw sandboxExecutionError(error, code);
	}
}

/** Async counterpart used by Plugin imports.  It shares the exact `{{ }}` / `[[ ]]`
 * semantics with the synchronous helper, but permits nested async imports. */
export async function resolveSandboxTextAsync(
	text: string,
	environments: SandboxEnvironment[] = [],
	options: ResolveTextOptions = {},
): Promise<string> {
	let current = text;
	const seen = new Set<string>();
	const maxDepth = options.maxDepth ?? defaultMaxDepth;
	for (let depth = 0; depth < maxDepth; depth += 1) {
		if (seen.has(current)) {
			options.logger?.append(
				"检测到宏展开循环，保留最后一次结果。",
				depth,
				"error",
			);
			return current;
		}
		seen.add(current);
		const next = await replaceInlineExpressionsAsync(
			current,
			environments,
			options,
		);
		options.logger?.append(`宏展开第 ${depth + 1} 轮。`, depth, "sandbox");
		if (next === current) return next;
		current = next;
	}
	options.logger?.append(`宏展开达到 ${maxDepth} 轮上限。`, maxDepth, "error");
	return current;
}

export async function resolveSandboxMessagesAsync(
	messages: ModelMessage[],
	environments: SandboxEnvironment[] = [],
	options: ResolveTextOptions = {},
): Promise<ModelMessage[]> {
	let current = messages.map((message) => ({ ...message }));
	const seen = new Set<string>();
	const maxDepth = options.maxDepth ?? defaultMaxDepth;
	for (let depth = 0; depth < maxDepth; depth += 1) {
		const serialized = JSON.stringify(current);
		if (seen.has(serialized)) {
			options.logger?.append(
				"检测到消息宏展开循环，保留最后一次结果。",
				depth,
				"error",
			);
			return current;
		}
		seen.add(serialized);
		const next = (
			await Promise.all(
				current.map((message) =>
					resolveMessageOnceAsync(message, environments, options),
				),
			)
		).flat();
		if (JSON.stringify(next) === serialized) return next;
		current = next;
	}
	options.logger?.append(
		`消息宏展开达到 ${maxDepth} 轮上限。`,
		maxDepth,
		"error",
	);
	return current;
}

async function replaceInlineExpressionsAsync(
	text: string,
	environments: SandboxEnvironment[],
	options: ResolveTextOptions,
) {
	const parts = splitInlineExpressions(text);
	let output = "";
	for (const part of parts) {
		if (part.kind === "text") {
			if (part.value)
				options.logger?.append(`纯文本：${part.value}`, 0, "text");
			output += part.value;
			continue;
		}
		options.logger?.append(`宏：${part.value}`, 0, "macro");
		options.logger?.append(`执行宏：${part.value}`, 1, "macro");
		const result = stringifySandboxValue(
			await executeSandboxCodeAsync(part.value, environments),
			options,
		);
		options.logger?.append(`宏结果：${result}`, 1, "result");
		output += result;
	}
	return output;
}

async function resolveMessageOnceAsync(
	message: ModelMessage,
	environments: SandboxEnvironment[],
	options: ResolveTextOptions,
): Promise<ModelMessage[]> {
	if (message.role === "tool" || typeof message.content !== "string")
		return [message];
	const create = (content: string): ModelMessage =>
		({ ...message, content }) as ModelMessage;
	const output: ModelMessage[] = [create("")];
	for (const part of splitInlineExpressions(message.content)) {
		const last = output[output.length - 1]!;
		if (part.kind === "text") {
			(last.content as string) += part.value;
			continue;
		}
		const value = await executeSandboxCodeAsync(part.value, environments);
		if (part.kind === "inline") {
			(last.content as string) += stringifySandboxValue(value, options);
			continue;
		}
		if (isModelMessageArray(value)) {
			output.push(...value, create(""));
			continue;
		}
		if (isStringArrayLike(value)) {
			output.push(
				...Array.from(value, (content) => create(String(content))),
				create(""),
			);
			continue;
		}
		(last.content as string) += stringifySandboxValue(value, options);
	}
	return output.filter(
		(item) => typeof item.content !== "string" || item.content.length > 0,
	);
}

function splitInlineExpressions(text: string) {
	const parts: { kind: "text" | "inline" | "splice"; value: string }[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(inlinePattern)) {
		if (match.index == null) {
			continue;
		}
		if (match.index > lastIndex) {
			parts.push({ kind: "text", value: text.slice(lastIndex, match.index) });
		}
		parts.push({
			kind: match[2] == null ? "splice" : "inline",
			value: match[2] ?? match[3] ?? "",
		});
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		parts.push({ kind: "text", value: text.slice(lastIndex) });
	}

	return parts;
}

function buildExecutableBody(
	code: string,
	environment: SandboxEnvironment,
): string {
	const trimmed = code.trim();
	if (!trimmed || /^(\/\/[^\n]*|\/\*[\s\S]*\*\/)\s*$/.test(trimmed)) {
		return "return undefined;";
	}
	if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
		return typeof environment[trimmed] === "function"
			? `return ${trimmed}();`
			: `return ${trimmed};`;
	}
	const cleaned = trimmed.replace(/;+\s*$/, "");
	if (
		/^(async\s+)?function\b/.test(cleaned) ||
		/^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(cleaned)
	) {
		return `return (${cleaned});`;
	}
	if (/^(if|for|while|switch|try|return|const|let|var)\b/.test(trimmed)) {
		return trimmed;
	}
	return `return (${cleaned});`;
}

function sandboxExecutionError(error: unknown, code: string): Error {
	const marker = "[PulsarAI Sandbox source]";
	if (error instanceof Error && error.message.includes(marker)) return error;
	const message = error instanceof Error ? error.message : String(error);
	const codeFence = String.fromCharCode(96).repeat(3);
	const enriched = new Error(
		message +
			"\n\n" +
			marker +
			"\n\n" +
			codeFence +
			"js\n" +
			sandboxSourceExcerpt(code) +
			"\n" +
			codeFence,
	);
	if (error instanceof Error && error.stack) {
		enriched.stack = `${enriched.stack}\nCaused by: ${error.stack}`;
	}
	return enriched;
}

function sandboxSourceExcerpt(code: string) {
	const lines = code.replace(/\r\n/g, "\n").trim().split("\n");
	const visibleIndexes =
		lines.length > 80
			? [
					...Array.from({ length: 60 }, (_, index) => index),
					...Array.from(
						{ length: 20 },
						(_, index) => lines.length - 20 + index,
					),
				]
			: Array.from({ length: lines.length }, (_, index) => index);
	const width = String(lines.length).length;
	const result: string[] = [];
	let previousIndex = -1;
	for (const index of visibleIndexes) {
		if (index > previousIndex + 1) result.push("… omitted …");
		result.push(`${String(index + 1).padStart(width, " ")} | ${lines[index]}`);
		previousIndex = index;
	}
	return result.join("\n").slice(0, 8_000);
}

function stringifySandboxValue(
	value: unknown,
	options: ResolveTextOptions = {},
): string {
	if (value == null) {
		return "";
	}
	if (
		!options.keepArraySet2StrDefault &&
		(Array.isArray(value) || value instanceof Set)
	) {
		return Array.from(value, (item) => String(item))
			.map((item) => (item.endsWith("\n") ? item : `${item}\n`))
			.join("");
	}
	if (
		typeof value === "object" &&
		"toString" in value &&
		Object.hasOwn(value, "toString")
	) {
		const customToString = (value as { toString: unknown }).toString;
		return typeof customToString === "function"
			? String(customToString.call(value))
			: String(customToString);
	}
	return String(value);
}

function isStringArrayLike(value: unknown): value is string[] | Set<string> {
	if (Array.isArray(value)) {
		return value.every((item) => typeof item === "string");
	}
	return (
		value instanceof Set &&
		Array.from(value).every((item) => typeof item === "string")
	);
}

function isModelMessageArray(value: unknown): value is ModelMessage[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				item && typeof item === "object" && "role" in item && "content" in item,
		)
	);
}


src/features/Plugin/runtime/yaml-formatter.ts

function parseYamlValue(value: string): unknown {
	if (/^true$/i.test(value)) return true;
	if (/^false$/i.test(value)) return false;
	if (/^(null|~)$/i.test(value)) return null;
	if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	)
		return value.slice(1, -1);
	return value;
}

function parseYamlContent(source: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	let currentKey: string | null = null;
	let currentList: unknown[] | null = null;
	for (const rawLine of source.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		if (line.startsWith("- ")) {
			if (currentKey && currentList)
				currentList.push(parseYamlValue(line.slice(2).trim()));
			continue;
		}
		const separator = line.indexOf(":");
		if (separator < 0) continue;
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		currentKey = key;
		currentList = value ? null : [];
		result[key] = currentList ?? parseYamlValue(value);
	}
	return result;
}

function extractItem(text: string) {
	const formatter: object[] = [];
	const strip = (source: string, pattern: RegExp) =>
		source.replace(pattern, (_match, yaml: string) => {
			const value = parseYamlContent(yaml);
			if (Object.keys(value).length) formatter.push(value);
			return "";
		});
	const withoutFrontmatter = strip(
		text,
		/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/g,
	);
	return {
		result: strip(
			withoutFrontmatter,
			/```(?:yaml|yml)\r?\n([\s\S]*?)\r?\n```(?:\r?\n)?/gi,
		).trim(),
		formatter,
	};
}

export function extractYAMLFormatter(input: string | string[]) {
	return (Array.isArray(input) ? input : [input]).map(extractItem);
}


src/features/Plugin/test/sandbox.test.ts

import { describe, expect, it } from "vitest";
import { executeSandboxCodeAsync } from "../runtime/sandbox";

describe("Sandbox", () => {
	it("evaluates async environment capabilities", async () => {
		await expect(executeSandboxCodeAsync("return 1 + 1", [])).resolves.toBe(2);
	});
});


src/features/Plugin/test/use-plugin-data.test.ts

import { describe, expect, it } from "vitest";
import { readFile } from "../dataflow/pulse";
import type { PluginData, ReplayGroups } from "../dataflow/types";
import { replayAndMergePluginData } from "../dataflow/use-plugin-data";
import { importBuiltinPlugins } from "../utils/import-converter";

function plugin(id: string, tree: PluginData["tree"]): PluginData {
	return { id, tree, meta: {} };
}

describe("replayAndMergePluginData", () => {
	it("addresses every built-in Plugin by its source folder name", () => {
		expect(Object.keys(importBuiltinPlugins()).sort()).toEqual([
			"blank",
			"core",
			"default",
		]);
	});

	it("replays each source before merging the enabled global folders", () => {
		const local = plugin("role", {
			"definition.package.json": JSON.stringify({
				name: "角色",
				globalPlugins: ["core", "extra"],
			}),
		});
		const global = {
			core: plugin("builtin-core-plugin", { "value.txt": "core" }),
			extra: plugin("extra-plugin", { "value.txt": "extra" }),
			disabled: plugin("disabled-plugin", { "value.txt": "disabled" }),
		};
		const groups: ReplayGroups = [
			[
				{ kind: "file.write", path: "/global/core/value.txt", content: "C" },
				{ kind: "file.write", path: "/global/extra/value.txt", content: "E" },
				{
					kind: "file.write",
					path: "/global/disabled/value.txt",
					content: "D",
				},
			],
		];

		const result = replayAndMergePluginData(local, global, groups);
		expect(readFile(result, "/global/core/value.txt")).toBe("C");
		expect(readFile(result, "/global/extra/value.txt")).toBe("E");
		expect(() => readFile(result, "/global/disabled/value.txt")).toThrow();
	});

	it("uses a replayed role definition to dynamically enable a source", () => {
		const local = plugin("role", {
			"definition.package.json": JSON.stringify({
				name: "角色",
				globalPlugins: [],
			}),
		});
		const groups: ReplayGroups = [
			[
				{ kind: "file.write", path: "/global/extra/value.txt", content: "new" },
				{
					kind: "file.write",
					path: "/definition.package.json",
					content: JSON.stringify({
						name: "角色",
						globalPlugins: ["extra"],
					}),
				},
			],
		];

		const result = replayAndMergePluginData(
			local,
			{ extra: plugin("extra-plugin", { "value.txt": "old" }) },
			groups,
		);
		expect(readFile(result, "/global/extra/value.txt")).toBe("new");
	});
});


src/features/Plugin/utils/import-converter.ts

import { normalizeResourcePath } from "../dataflow/pulse";
import {
	defaultFileMeta,
	defaultFolderMeta,
	type FileMeta,
	type PluginData,
	type ResourcePath,
	type ResourceTree,
} from "../dataflow/types";
import {
	generateProceduralAvatarDataUrl,
	generateProceduralCoverDataUrl,
} from "./procedural-cover";

type BuiltinManifest = {
	plugin: { id: string };
	nodes: Record<
		string,
		{
			order?: number;
			insertion?: {
				slot: string;
				condition?: string;
				conditionEnabled?: boolean;
			};
		}
	>;
};

export interface SlotRegistration {
	id: string;
	name: string;
	parentId?: string;
	icon?: string;
	selectionMode: "none" | "single" | "multiple";
}

/**
 * The slot registry is materialized as ordinary folders below a local Plugin's
 * `/slot/`. IDs are only import-time shorthand; runtime code addresses the
 * resulting name paths.
 */
export const builtinSlotRegistry: readonly SlotRegistration[] = [
	{ id: "role", name: "角色", icon: "user-round", selectionMode: "none" },
	{ id: "user", name: "用户角色", parentId: "role", selectionMode: "none" },
	{
		id: "character",
		name: "系统角色",
		parentId: "role",
		selectionMode: "none",
	},
	{
		id: "context",
		name: "上下文位置",
		icon: "text-align-left",
		selectionMode: "none",
	},
	{
		id: "before_char",
		name: "角色之前",
		parentId: "context",
		selectionMode: "none",
	},
	{
		id: "after_char",
		name: "角色之后",
		parentId: "context",
		selectionMode: "none",
	},
	{ id: "document", name: "顶部", parentId: "context", selectionMode: "none" },
	{
		id: "generation",
		name: "生成流程",
		icon: "workflow",
		selectionMode: "none",
	},
	{
		id: "generatePath",
		name: "主流程",
		parentId: "generation",
		icon: "play",
		selectionMode: "single",
	},
	{
		id: "CTX_BUILD",
		name: "上下文构建",
		parentId: "generation",
		selectionMode: "single",
	},
	{
		id: "CTX_PROCESS_BEFORE_REGEX",
		name: "上下文处理器",
		parentId: "generation",
		selectionMode: "none",
	},
	{
		id: "REGEX",
		name: "正则",
		parentId: "generation",
		icon: "regex",
		selectionMode: "none",
	},
	{
		id: "DATA_INJECT",
		name: "数据注入",
		parentId: "generation",
		selectionMode: "none",
	},
	{
		id: "data_prompt",
		name: "数据提示",
		parentId: "generation",
		selectionMode: "none",
	},
	{
		id: "chat",
		name: "生成入口",
		parentId: "generation",
		icon: "messages-square",
		selectionMode: "single",
	},
	{ id: "depth", name: "深度", icon: "list-numbers", selectionMode: "none" },
	...Array.from({ length: 5 }, (_, depth) => ({
		id: `depth:${depth}`,
		name: String(depth),
		parentId: "depth",
		selectionMode: "none" as const,
	})),
	{ id: "resource", name: "资源", icon: "files", selectionMode: "none" },
	{
		id: "COMMAND",
		name: "指令",
		parentId: "resource",
		icon: "terminal",
		selectionMode: "none",
	},
	{
		id: "MODE",
		name: "模式",
		parentId: "resource",
		icon: "pencil-line",
		selectionMode: "none",
	},
	{
		id: "background",
		name: "背景图片",
		parentId: "resource",
		icon: "image",
		selectionMode: "single",
	},
	{
		id: "document-library",
		name: "文档",
		icon: "file-text",
		selectionMode: "none",
	},
	{
		id: "toolFunction",
		name: "工具",
		parentId: "document-library",
		icon: "wrench",
		selectionMode: "none",
	},
	{
		id: "skill",
		name: "skill",
		parentId: "document-library",
		icon: "book-open",
		selectionMode: "none",
	},
	{ id: "panel", name: "面板", icon: "sidebar", selectionMode: "none" },
	{
		id: "panel-top",
		name: "顶部面板",
		parentId: "panel",
		icon: "panel-top",
		selectionMode: "none",
	},
	{
		id: "panel-left",
		name: "左侧面板",
		parentId: "panel",
		icon: "panel-left",
		selectionMode: "none",
	},
	{
		id: "panel-right",
		name: "右侧面板",
		parentId: "panel",
		icon: "panel-right",
		selectionMode: "none",
	},
];

const slotById = new Map(builtinSlotRegistry.map((slot) => [slot.id, slot]));

function builtinSlotPath(id: string) {
	const names: string[] = [];
	let current = slotById.get(id);
	while (current) {
		names.unshift(current.name);
		current = current.parentId ? slotById.get(current.parentId) : undefined;
	}
	return names.length ? `/slot/${names.join("/")}` : `/slot/${id}`;
}

const builtinManifests = import.meta.glob("../builtIn/*/.pulsar-plugin.json", {
	eager: true,
	query: "?raw",
	import: "default",
}) as Record<string, string>;
const builtinTextFiles = import.meta.glob(
	"../builtIn/*/**/*.{md,json,js,vue,ts,txt,data,yaml,yml}",
	{ eager: true, query: "?raw", import: "default" },
) as Record<string, string>;
const builtinAssets = import.meta.glob("../builtIn/*/**/*", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

function set(target: object, key: string, value: unknown) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}

function ensureFolder(data: PluginData, path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") return data.tree;
	let tree = data.tree;
	let current = "";
	for (const name of normalized.slice(1).split("/")) {
		current += `/${name}`;
		const existing = tree[name];
		if (typeof existing === "string")
			throw new Error(`内置资源目录冲突：${current}`);
		if (!existing) {
			const next: ResourceTree = {};
			set(tree, name, next);
			set(data.meta, current, defaultFolderMeta());
			tree = next;
		} else {
			tree = existing;
		}
	}
	return tree;
}

function writeBuiltinFile(
	data: PluginData,
	path: ResourcePath,
	content: string,
	meta: FileMeta,
) {
	const normalized = normalizeResourcePath(path);
	const parent = ensureFolder(
		data,
		normalized.slice(0, normalized.lastIndexOf("/")) || "/",
	);
	set(parent, normalized.slice(normalized.lastIndexOf("/") + 1), content);
	set(data.meta, normalized, meta);
}

function localSlot(data: PluginData, slot: string) {
	const path = `/localSlot/${slot}`;
	ensureFolder(data, path);
	set(data.meta, path, {
		...defaultFolderMeta(),
		parent: builtinSlotPath(slot),
	});
	return path;
}

function materializeSlotRegistry(data: PluginData) {
	ensureFolder(data, "/slot");
	for (const slot of builtinSlotRegistry) {
		const path = builtinSlotPath(slot.id);
		ensureFolder(data, path);
		set(data.meta, path, { selectionMode: slot.selectionMode });
	}
}

function sourceKey(folder: string, path: string) {
	return `../builtIn/${folder}/${path.replace(/^\//, "")}`;
}

function importBuiltinPlugin(
	folder: string,
	manifestSource: string,
): PluginData {
	const manifest = JSON.parse(manifestSource) as BuiltinManifest;
	const data: PluginData = { id: manifest.plugin.id, tree: {}, meta: {} };
	for (const path of Object.keys(manifest.nodes)
		.filter((path) => path !== "/")
		.sort((left, right) => left.localeCompare(right))) {
		const source = sourceKey(folder, path);
		const text = builtinTextFiles[source];
		const asset = builtinAssets[source];
		if (text === undefined && asset === undefined) {
			ensureFolder(data, `/${path}`);
			continue;
		}
		const definition = manifest.nodes[path]!;
		writeBuiltinFile(data, `/${path}`, text ?? asset ?? "", {
			...defaultFileMeta(),
			resourceSelected: manifest.plugin.id !== "builtin-blank-plugin",
			priority: definition.order ?? 100,
			...(definition.insertion
				? {
						slot: localSlot(data, definition.insertion.slot),
						condition: definition.insertion.condition,
						conditionEnabled: definition.insertion.conditionEnabled,
					}
				: {}),
		});
	}
	return data;
}

/** Built-ins are imported as ordinary source-local trees; no World-only shape survives. */
export function importBuiltinPlugins() {
	return Object.fromEntries(
		Object.entries(builtinManifests).map(([key, source]) => {
			const folder = key.split("/").at(-2);
			if (!folder) throw new Error(`无效的内置 Plugin 路径：${key}`);
			const data = importBuiltinPlugin(folder, source);
			return [folder, data];
		}),
	);
}

/** New local Plugins start as an ordinary editable source tree. */
export function createLocalPluginData(id: string): PluginData {
	const data: PluginData = { id, tree: {}, meta: {} };
	materializeSlotRegistry(data);
	ensureFolder(data, "/localSlot");
	writeBuiltinFile(
		data,
		"/definition.package.json",
		JSON.stringify(
			{
				schemaVersion: 1,
				name: "新角色",
				tags: [],
				globalPlugins: ["core", "default"],
			},
			null,
			2,
		),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/avatar.png",
		generateProceduralAvatarDataUrl(id, "新角色"),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/cover.png",
		generateProceduralCoverDataUrl(id, "新角色"),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/config.json",
		JSON.stringify(
			{ temperature: 0.7, maxTokens: 2048, debugMode: false, promptPrefix: "" },
			null,
			2,
		),
		defaultFileMeta(),
	);
	return data;
}


src/features/Plugin/utils/procedural-cover.ts

/**
 * Procedural cover image generator.
 * Creates an actual PNG data URL (`data:image/png;base64,...`)
 * by rendering procedural gradient and geometric art onto an offscreen canvas.
 */

function hashString(str: string): number {
	let hash = 2166136261;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function createRng(seedStr: string) {
	let s = hashString(seedStr) || 123456789;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

export function generateProceduralCoverDataUrl(
	seed: string,
	title = "",
	width = 800,
	height = 500,
): string {
	if (typeof document === "undefined") {
		const hue1 = hashString(seed) % 360;
		const hue2 = (hue1 + 55) % 360;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="hsl(${hue1},70%,50%)"/><stop offset="100%" stop-color="hsl(${hue2},75%,35%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
		return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
	}

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";

	const rng = createRng(seed + title);

	const baseHue = Math.floor(rng() * 360);
	const hue2 = (baseHue + 40 + Math.floor(rng() * 40)) % 360;
	const hue3 = (baseHue + 140 + Math.floor(rng() * 60)) % 360;

	// Background linear gradient
	const angle = rng() * Math.PI * 2;
	const x1 = width / 2 + Math.cos(angle) * (width / 2);
	const y1 = height / 2 + Math.sin(angle) * (height / 2);
	const x2 = width / 2 - Math.cos(angle) * (width / 2);
	const y2 = height / 2 - Math.sin(angle) * (height / 2);

	const bgGrad = ctx.createLinearGradient(x1, y1, x2, y2);
	bgGrad.addColorStop(0, `hsl(${baseHue}, 75%, 35%)`);
	bgGrad.addColorStop(0.5, `hsl(${hue2}, 65%, 22%)`);
	bgGrad.addColorStop(1, `hsl(${hue3}, 80%, 15%)`);
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, width, height);

	// Radial glowing orbs
	const orbCount = 3 + Math.floor(rng() * 3);
	for (let i = 0; i < orbCount; i++) {
		const ox = rng() * width;
		const oy = rng() * height;
		const radius = width * (0.25 + rng() * 0.4);
		const orbHue = (baseHue + Math.floor(rng() * 120)) % 360;

		const radGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
		radGrad.addColorStop(0, `hsla(${orbHue}, 85%, 65%, 0.45)`);
		radGrad.addColorStop(0.6, `hsla(${orbHue}, 80%, 50%, 0.15)`);
		radGrad.addColorStop(1, `hsla(${orbHue}, 80%, 40%, 0)`);

		ctx.fillStyle = radGrad;
		ctx.beginPath();
		ctx.arc(ox, oy, radius, 0, Math.PI * 2);
		ctx.fill();
	}

	// Procedural subtle geometric accents / arcs
	ctx.save();
	ctx.lineWidth = 1.5;
	const lineCount = 4 + Math.floor(rng() * 4);
	for (let i = 0; i < lineCount; i++) {
		const cx = rng() * width;
		const cy = rng() * height;
		const r = 80 + rng() * 180;
		ctx.strokeStyle = `hsla(${hue2}, 90%, 75%, ${0.08 + rng() * 0.12})`;
		ctx.beginPath();
		ctx.arc(cx, cy, r, rng() * Math.PI, rng() * Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();

	// Soft noise / vignette overlay
	const vignette = ctx.createRadialGradient(
		width / 2,
		height / 2,
		width * 0.25,
		width / 2,
		height / 2,
		width * 0.7,
	);
	vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
	vignette.addColorStop(1, "rgba(0, 0, 0, 0.45)");
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, width, height);

	return canvas.toDataURL("image/png");
}

export function generateProceduralAvatarDataUrl(
	seed: string,
	title = "",
	size = 256,
): string {
	const initial = (title.trim() || "P").slice(0, 1).toUpperCase();
	if (typeof document === "undefined") {
		const hue1 = hashString(seed) % 360;
		const hue2 = (hue1 + 50) % 360;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="hsl(${hue1},75%,45%)"/><stop offset="100%" stop-color="hsl(${hue2},80%,25%)"/></linearGradient></defs><rect width="${size}" height="${size}" rx="${size / 2}" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${Math.round(size * 0.44)}" font-weight="700">${initial}</text></svg>`;
		return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
	}

	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";

	const rng = createRng(seed + title + "avatar");
	const baseHue = Math.floor(rng() * 360);
	const hue2 = (baseHue + 45 + Math.floor(rng() * 40)) % 360;
	const hue3 = (baseHue + 160 + Math.floor(rng() * 50)) % 360;

	// Background circle gradient
	const bgGrad = ctx.createLinearGradient(0, 0, size, size);
	bgGrad.addColorStop(0, `hsl(${baseHue}, 80%, 45%)`);
	bgGrad.addColorStop(0.5, `hsl(${hue2}, 70%, 28%)`);
	bgGrad.addColorStop(1, `hsl(${hue3}, 85%, 16%)`);
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, size, size);

	// Ambient orbs
	const orbCount = 3;
	for (let i = 0; i < orbCount; i++) {
		const ox = rng() * size;
		const oy = rng() * size;
		const rad = size * (0.3 + rng() * 0.35);
		const orbHue = (baseHue + Math.floor(rng() * 100)) % 360;
		const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad);
		grad.addColorStop(0, `hsla(${orbHue}, 90%, 65%, 0.45)`);
		grad.addColorStop(0.7, `hsla(${orbHue}, 80%, 45%, 0.1)`);
		grad.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(ox, oy, rad, 0, Math.PI * 2);
		ctx.fill();
	}

	// Concentric abstract ring accents
	ctx.save();
	ctx.lineWidth = 2;
	for (let i = 0; i < 3; i++) {
		const r = size * (0.2 + i * 0.18);
		ctx.strokeStyle = `hsla(${hue2}, 95%, 75%, ${0.12 + i * 0.05})`;
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();

	// Stylized Monogram / Initial
	const fontSize = Math.round(size * 0.44);
	ctx.font = `bold ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// Soft drop shadow
	ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
	ctx.shadowBlur = Math.round(size * 0.08);
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = Math.round(size * 0.03);

	ctx.fillStyle = "#ffffff";
	ctx.fillText(initial, size / 2, size / 2 + size * 0.03);

	return canvas.toDataURL("image/png");
}


src/features/Request/ai-sdk.ts

import {
	generateImage as baseGenerateImage,
	generateSpeech as baseGenerateSpeech,
	generateText as baseGenerateText,
	streamText as baseStreamText,
	transcribe as baseTranscribe,
	type EmbeddingModel,
	type ImageModel,
	type LanguageModel,
	type SpeechModel,
	type TranscriptionModel,
} from "ai";
import { writeMedia } from "@/features/Plugin/media/media-link";
import { createSandboxFunction } from "@/features/Plugin/runtime/sandbox";
import { useRequestDefaults } from "./defaults";
import { builtInFunctions } from "./provider";
import {
	hydrateModel as hydrateLegacyModel,
	type HydratableModel as LegacyHydratableModel,
	registerProviderHydration,
} from "./provider/shared/native-ai";
import { useRequestStore } from "./request-store";
import type { ModelSelection, Provider, RequestKind } from "./types";
import { buildRequestParams } from "./utils/params";

export type HydratableModel =
	| ModelSelection
	| string
	| LanguageModel
	| ImageModel
	| EmbeddingModel
	| TranscriptionModel
	| SpeechModel;

type Operation = keyof Provider["requestOverride"];
export type GenerateImageResult = Awaited<ReturnType<typeof baseGenerateImage>>;
type WithModel<T> = T extends { model: unknown }
	? Omit<T, "model"> & { model: HydratableModel }
	: T;

export type GenerateImageOptions = Omit<
	Parameters<typeof baseGenerateImage>[0],
	"model"
> & { model?: HydratableModel };
export type GenerateSpeechOptions = Omit<
	Parameters<typeof baseGenerateSpeech>[0],
	"model"
> & { model?: HydratableModel };
export type TranscribeOptions = Omit<
	Parameters<typeof baseTranscribe>[0],
	"model"
> & { model?: HydratableModel };

function selectionFor(
	model: HydratableModel,
	kind: RequestKind,
): ModelSelection | undefined {
	if (typeof model === "object" && model && "providerId" in model) {
		return model as ModelSelection;
	}
	if (typeof model !== "string") return;
	const [providerId, ...parts] = model.split("/");
	return providerId && parts.length
		? { providerId, modelId: parts.join("/"), kind }
		: undefined;
}

function providerFor(model: HydratableModel, kind: RequestKind) {
	const selection = selectionFor(model, kind);
	return {
		selection,
		provider: selection
			? useRequestStore().provider(selection.providerId)
			: undefined,
	};
}

function providerValue(provider: Provider, name: string) {
	return provider.params.basic.find((param) => param.paramName === name)?.value;
}

function hydrateFromProvider(
	provider: Provider,
	modelId: string,
	kind: RequestKind,
) {
	const baseUrl = providerValue(provider, "baseURL");
	const apiKeyName = providerValue(provider, "apiKeyName");
	if (typeof baseUrl !== "string" || typeof apiKeyName !== "string") {
		throw new Error(`提供商 ${provider.id} 缺少 baseURL 或 apiKeyName。`);
	}
	registerProviderHydration({
		id: provider.id,
		baseUrl,
		apiKeyName,
		transport:
			provider.hydrator === "openai-compatible"
				? "openai-compatible"
				: "ai-sdk",
	});
	return hydrateLegacyModel(`${provider.id}/${modelId}`, legacyKind(kind));
}

function legacyKind(kind: RequestKind) {
	if (kind === "video") throw new Error("当前 AI SDK 水合器尚未支持视频模型。");
	return { text: "chat", image: "image", speech: "tts", transcribe: "asr" }[
		kind
	] as "chat" | "image" | "tts" | "asr";
}

export function hydrateRequestModel(model: HydratableModel, kind: RequestKind) {
	const { provider, selection } = providerFor(model, kind);
	if (!provider || !selection) return model as LegacyHydratableModel;
	if (!provider.enabled) throw new Error(`提供商 ${provider.name} 未启用。`);
	if (
		!provider.models[kind].some(
			(item) => item.id === selection.modelId && item.enabled,
		)
	) {
		throw new Error(`模型 ${selection.modelId} 未启用或不支持 ${kind}。`);
	}
	const hydrator = provider.hydrator;
	if (!hydrator || hydrator === "ai-sdk" || hydrator === "openai-compatible") {
		return hydrateFromProvider(provider, selection.modelId, kind);
	}
	const builtIn = builtInFunctions.get(hydrator);
	const fn = builtIn ?? createSandboxFunction(hydrator);
	const result = fn({ provider, modelId: selection.modelId, kind });
	if (result instanceof Promise)
		throw new Error("模型水合器必须同步返回 AI SDK 模型。");
	return result as LegacyHydratableModel;
}

function requestInput<T extends { model: HydratableModel }>(
	kind: RequestKind,
	input: T,
) {
	const { provider, selection } = providerFor(input.model, kind);
	const params = provider ? buildRequestParams(provider, kind) : {};
	const options = {
		...params,
		...input,
	};
	return { provider, selection, options };
}

function call<T extends { model: HydratableModel }, R>(
	operation: Operation,
	kind: RequestKind,
	input: T,
	native: (options: Record<string, unknown>) => R,
): R {
	const { provider, selection, options } = requestInput(kind, input);
	const override = provider?.requestOverride[operation];
	const callNative = (next: Record<string, unknown> = options) =>
		native({
			...next,
			model: hydrateRequestModel(
				(next.model as HydratableModel | undefined) ?? input.model,
				kind,
			),
		});
	if (!override) return callNative();
	const fn = builtInFunctions.get(override) ?? createSandboxFunction(override);
	return fn({
		provider,
		modelId: selection?.modelId,
		options,
		native: callNative,
	}) as R;
}

export function generateText(
	options: WithModel<Parameters<typeof baseGenerateText>[0]>,
) {
	return call("generateText", "text", options, (input) =>
		baseGenerateText(input as Parameters<typeof baseGenerateText>[0]),
	);
}

export function streamText(
	options: WithModel<Parameters<typeof baseStreamText>[0]>,
) {
	return call("streamText", "text", options, (input) =>
		baseStreamText(input as Parameters<typeof baseStreamText>[0]),
	);
}

export function generateImage(options: GenerateImageOptions) {
	const model = options.model ?? useRequestDefaults().defaults.imageModel;
	if (!model) throw new Error("尚未配置图片生成模型。");
	return call("generateImage", "image", { ...options, model }, (input) =>
		baseGenerateImage(input as Parameters<typeof baseGenerateImage>[0]),
	);
}

export async function generateImageToPath(
	options: GenerateImageOptions & { path?: string },
) {
	const { path = "temp", ...input } = options;
	const result = await generateImage(input);
	return (
		await writeMedia(result.image.uint8Array, result.image.mediaType, path)
	).id;
}

/** AI SDK 7 has no generic video helper yet; Providers must supply this override. */
export function generateVideo(
	options: { model: HydratableModel } & Record<string, unknown>,
) {
	return call("generateVideo", "video", options, () => {
		throw new Error("此提供商没有实现 generateVideo override。");
	});
}

export function generateSpeech(options: GenerateSpeechOptions) {
	const model = options.model ?? useRequestDefaults().defaults.speechModel;
	if (!model) throw new Error("尚未配置语音生成模型。");
	return call("generateSpeech", "speech", { ...options, model }, (input) =>
		baseGenerateSpeech(input as Parameters<typeof baseGenerateSpeech>[0]),
	);
}

export function transcribe(options: TranscribeOptions) {
	const model =
		options.model ?? useRequestDefaults().defaults.transcriptionModel;
	if (!model) throw new Error("尚未配置语音转写模型。");
	return call("transcribe", "transcribe", { ...options, model }, (input) =>
		baseTranscribe(input as Parameters<typeof baseTranscribe>[0]),
	);
}

/** Lets Provider overrides wrap ToolLoopAgent without creating a second Agent path. */
export function createToolLoopAgent<T>(
	model: HydratableModel,
	options: Record<string, unknown>,
	native: (options: Record<string, unknown>) => T,
): T {
	const { provider, selection } = providerFor(model, "text");
	const override = provider?.requestOverride.ToolLoopAgent;
	const callNative = (next: Record<string, unknown> = options) =>
		native({ ...next, model: hydrateRequestModel(model, "text") });
	if (!override) return callNative();
	const fn = builtInFunctions.get(override) ?? createSandboxFunction(override);
	const result = fn({
		provider,
		modelId: selection?.modelId,
		options,
		native: callNative,
	});
	if (result instanceof Promise) {
		throw new Error("ToolLoopAgent override 必须同步返回 Agent 实例。");
	}
	return result as T;
}


src/features/Request/components/DefaultPicker.vue

<script setup lang="ts">
import { computed, onMounted } from "vue";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/fluid";
import { Check, ChevronDown } from "@/lib/phosphor-icons";
import { useRequestStore } from "../request-store";
import type { ModelSelection, RequestKind } from "../types";
import ParamDefinitionRenderer from "./ParamDefinitionRenderer.vue";

const props = withDefaults(
	defineProps<{
		modelValue: ModelSelection | null;
		kind: RequestKind;
		allowEmpty?: boolean;
		emptyLabel?: string;
	}>(),
	{ allowEmpty: false, emptyLabel: "未设置" },
);
const emit = defineEmits<{
	"update:modelValue": [value: ModelSelection | null];
}>();
const store = useRequestStore();
const provider = computed(() =>
	props.modelValue ? store.provider(props.modelValue.providerId) : undefined,
);
const model = computed(() =>
	provider.value?.models[props.kind].find(
		(item) => item.id === props.modelValue?.modelId,
	),
);
const providers = computed(() =>
	store.providers.filter(
		(item) =>
			item.enabled && item.models[props.kind].some((model) => model.enabled),
	),
);
const defaultParams = computed(() =>
	provider.value
		? [
				...provider.value.params.basic,
				...provider.value.params[props.kind],
				...provider.value.params.provider,
			].filter((item) => item.enableInDefault)
		: [],
);
function select(providerId: string, modelId: string) {
	emit("update:modelValue", { providerId, modelId, kind: props.kind });
}
function updateParam(paramName: string, value: unknown) {
	if (!provider.value) return;
	const group = (
		Object.keys(provider.value.params) as Array<
			keyof typeof provider.value.params
		>
	).find((key) =>
		provider.value!.params[key].some((item) => item.paramName === paramName),
	);
	if (group) void store.patchParam(provider.value.id, group, paramName, value);
}
onMounted(() => void store.initialize());
</script>

<template>
  <div class="space-y-2">
    <DropdownMenu>
      <DropdownMenuTrigger as-child><Button variant="outline" class="w-full justify-between sm:w-80"><span class="truncate">{{ model?.displayName || emptyLabel }}</span><ChevronDown class="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent class="w-72" align="start"><DropdownMenuGroup>
        <DropdownMenuItem v-if="allowEmpty" @select="emit('update:modelValue', null)"><Check :class="modelValue ? 'opacity-0' : 'opacity-100'" />{{ emptyLabel }}</DropdownMenuItem>
        <DropdownMenuSub v-for="item in providers" :key="item.id"><DropdownMenuSubTrigger>{{ item.name }}</DropdownMenuSubTrigger><DropdownMenuSubContent class="w-64"><DropdownMenuItem v-for="candidate in item.models[kind].filter((value) => value.enabled)" :key="candidate.id" @select="select(item.id, candidate.id)"><Check :class="modelValue?.providerId === item.id && modelValue?.modelId === candidate.id ? 'opacity-100' : 'opacity-0'" />{{ candidate.displayName }}</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub>
      </DropdownMenuGroup></DropdownMenuContent>
    </DropdownMenu>
    <div v-if="defaultParams.length" class="space-y-1 rounded-md border p-2"><ParamDefinitionRenderer v-for="definition in defaultParams" :key="definition.paramName" :definition="definition" @update:value="updateParam(definition.paramName, $event)" /></div>
  </div>
</template>



src/features/Request/components/DefaultSettingsPage.vue

<script setup lang="ts">
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { useRequestDefaults } from "../defaults";
import DefaultPicker from "./DefaultPicker.vue";

const request = useRequestDefaults();
</script>

<template>
  <SettingPage title="默认项" description="选择默认模型；选择后可直接修改该提供商允许显示的参数。">
    <SettingGroup title="模型">
      <SettingItem title="默认模型" description="未显式指定时的对话模型。"><DefaultPicker v-model="request.defaults.defaultChatModel" kind="text" /></SettingItem>
      <SettingItem title="快速模型" description="用于低延迟、低成本任务。"><DefaultPicker v-model="request.defaults.fastModel" kind="text" /></SettingItem>
      <SettingItem title="图片生成模型" description="用于文生图或图像编辑。"><DefaultPicker v-model="request.defaults.imageModel" kind="image" allow-empty /></SettingItem>
      <SettingItem title="语音生成模型" description="用于文本转语音。"><DefaultPicker v-model="request.defaults.speechModel" kind="speech" allow-empty /></SettingItem>
      <SettingItem title="语音转写模型" description="用于将音频转换为文字。"><DefaultPicker v-model="request.defaults.transcriptionModel" kind="transcribe" allow-empty /></SettingItem>
    </SettingGroup>
  </SettingPage>
</template>


src/features/Request/components/ModelList.vue

<script setup lang="ts">
import { ref } from "vue";
import { Button, Switch } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "@/lib/phosphor-icons";
import { useRequestStore } from "../request-store";
import type { Provider, RequestKind } from "../types";

const props = defineProps<{ provider: Provider; kind: RequestKind }>();
const store = useRequestStore();
const id = ref("");
async function add() {
	const value = id.value.trim();
	if (!value) return;
	await store.addModel(props.provider.id, props.kind, {
		id: value,
		displayName: value,
		enabled: true,
	});
	id.value = "";
}
function toggle(modelId: string, enabled: boolean) {
	const model = props.provider.models[props.kind].find(
		(item) => item.id === modelId,
	);
	if (!model) return;
	model.enabled = enabled;
	void store.save(props.provider);
}
</script>
<template>
  <div class="space-y-2"><div v-for="model in provider.models[kind]" :key="model.id" class="flex items-center gap-2 rounded-md border px-3 py-2"><Switch :model-value="model.enabled" @update:model-value="toggle(model.id, Boolean($event))" /><span class="min-w-0 flex-1 truncate text-sm">{{ model.displayName }}</span><Button size="icon" variant="ghost" @click="store.removeModel(provider.id, kind, model.id)"><Trash2 class="size-4" /></Button></div><div class="flex gap-2"><Input v-model="id" placeholder="模型 ID" @keyup.enter="add" /><Button size="sm" @click="add"><Plus class="size-4" />添加</Button></div></div>
</template>



src/features/Request/components/ParamDefinitionContainer.vue

<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/fluid";
import { Pencil } from "@/lib/phosphor-icons";
import { useRequestStore } from "../request-store";
import type { ParamDefinition, ParamGroup } from "../types";
import ParamDefinitionEditor from "./ParamDefinitionEditor.vue";
import ParamDefinitionRenderer from "./ParamDefinitionRenderer.vue";

const props = defineProps<{
	providerId: string;
	group: ParamGroup;
	definition: ParamDefinition;
}>();
const store = useRequestStore();
const editing = ref(false);
async function update(value: ParamDefinition) {
	const provider = store.provider(props.providerId);
	const index = provider?.params[props.group].indexOf(props.definition) ?? -1;
	if (!provider || index < 0) return;
	provider.params[props.group][index] = value;
	await store.save(provider);
}
</script>
<template><div class="rounded-md border p-2"><div class="flex justify-end"><Button size="icon" variant="ghost" @click="editing = !editing"><Pencil class="size-4" /></Button></div><ParamDefinitionRenderer :definition="definition" @update:value="store.patchParam(providerId, group, definition.paramName, $event)" /><ParamDefinitionEditor v-if="editing" :definition="definition" class="mt-2" @update:definition="update" /></div></template>



src/features/Request/components/ParamDefinitionEditor.vue

<script setup lang="ts">
import { computed } from "vue";
import { Switch } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import type { ParamDefinition } from "../types";

const props = defineProps<{ definition: ParamDefinition }>();
const emit = defineEmits<{ "update:definition": [value: ParamDefinition] }>();
const definition = computed({
	get: () => props.definition,
	set: (value) => emit("update:definition", value),
});
function patch(key: keyof ParamDefinition, value: unknown) {
	definition.value = { ...definition.value, [key]: value };
}
</script>
<template>
  <div class="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-2"><Input :model-value="definition.paramName" placeholder="访问链；空字符串表示仅组件" @update:model-value="patch('paramName', String($event))" /><Input :model-value="definition.title || ''" placeholder="标题" @update:model-value="patch('title', String($event))" /><Input class="sm:col-span-2" :model-value="definition.description || ''" placeholder="说明" @update:model-value="patch('description', String($event))" /><label class="flex items-center gap-2 text-sm"><Switch :model-value="definition.enableInDefault" @update:model-value="patch('enableInDefault', Boolean($event))" />在默认选择器显示</label><Input :model-value="definition.customBlockComponent || ''" placeholder="自定义区块组件" @update:model-value="patch('customBlockComponent', String($event) || undefined)" /></div>
</template>


src/features/Request/components/ParamDefinitionRenderer.vue

<script setup lang="ts">
import { computed } from "vue";
import { Switch } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { builtInComponents } from "../provider";
import type { ParamDefinition } from "../types";

const props = defineProps<{ definition: ParamDefinition }>();
const emit = defineEmits<{ "update:value": [value: unknown] }>();

const isBoolean = computed(() => typeof props.definition.value === "boolean");
const inputType = computed(() =>
	typeof props.definition.value === "number" ? "number" : "text",
);

function update(value: string | number) {
	emit("update:value", inputType.value === "number" ? Number(value) : value);
}

const customComponent = computed(() =>
	props.definition.customBlockComponent
		? builtInComponents.get(props.definition.customBlockComponent)
		: undefined,
);
</script>

<template>
  <component
    v-if="customComponent"
    :is="customComponent"
    v-bind="definition.customBlockComponent === 'PiperModelDownload' ? { type: 'piper' } : definition.customBlockComponent === 'WhisperModelDownload' ? { type: 'whisper' } : { name: (definition.paramComponent.componentParam as { name?: string }).name || '', title: definition.title }"
  />
  <div v-else class="flex min-h-11 items-center gap-3">
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium">{{ definition.title || definition.paramName }}</p>
      <p v-if="definition.description" class="text-xs text-muted-foreground">{{ definition.description }}</p>
    </div>
    <Switch
      v-if="isBoolean"
      :model-value="Boolean(definition.value)"
      @update:model-value="emit('update:value', $event)"
    />
    <Input
      v-else
      class="max-w-64"
      :model-value="String(definition.value ?? '')"
      :type="inputType"
      @update:model-value="update($event)"
    />
  </div>
</template>



src/features/Request/components/PopableJSEditor.vue

<script setup lang="ts">
import { ref } from "vue";
import {
	Button,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/fluid";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{ modelValue: string; title?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const draft = ref(props.modelValue);
function save() {
	emit("update:modelValue", draft.value);
}
</script>
<template><Dialog><DialogTrigger as-child><Button size="sm" variant="outline">{{ title || '编辑 JavaScript' }}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{{ title || 'JavaScript' }}</DialogTitle></DialogHeader><Textarea v-model="draft" class="min-h-72 font-mono text-xs" /><Button @click="save">保存</Button></DialogContent></Dialog></template>


src/features/Request/components/RequestSettingsPage.vue

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
	Button,
	Switch,
	Tabs,
	TabsList,
	TabsTrigger,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, RefreshCw, Trash2 } from "@/lib/phosphor-icons";
import { useRequestStore } from "../request-store";
import type {
	ParamDefinition,
	ParamGroup,
	Provider,
	RequestOverride,
} from "../types";
import { defaultParam } from "../utils/params";
import ModelList from "./ModelList.vue";
import ParamDefinitionContainer from "./ParamDefinitionContainer.vue";
import PopableJSEditor from "./PopableJSEditor.vue";

const store = useRequestStore();
const activeProviderId = ref("");
const activeKind = ref<ParamGroup>("text");
const draft = reactive({ id: "", name: "" });
const groups: Array<{ id: ParamGroup; label: string }> = [
	{ id: "basic", label: "基础" },
	{ id: "text", label: "文本" },
	{ id: "image", label: "图片" },
	{ id: "video", label: "视频" },
	{ id: "speech", label: "语音" },
	{ id: "transcribe", label: "转写" },
	{ id: "provider", label: "Provider" },
];
const activeProvider = computed(() => store.provider(activeProviderId.value));
const visibleGroups = computed(() =>
	groups.filter(
		(group) =>
			group.id === "basic" ||
			group.id === "provider" ||
			activeProvider.value?.models[group.id as keyof Provider["models"]].length,
	),
);
const modelKind = computed(() =>
	activeKind.value === "basic" || activeKind.value === "provider"
		? undefined
		: activeKind.value,
);
const operations: Array<keyof RequestOverride> = [
	"generateText",
	"streamText",
	"generateImage",
	"generateVideo",
	"generateSpeech",
	"transcribe",
	"ToolLoopAgent",
];
function blankParam(): ParamDefinition {
	return {
		paramName: "",
		enableInDefault: false,
		title: "新参数",
		paramComponent: { component: "input", componentParam: {} },
		defaultValue: "",
		value: "",
	};
}
async function addParam() {
	const provider = activeProvider.value;
	if (!provider) return;
	provider.params[activeKind.value].push(defaultParam(blankParam()));
	await store.save(provider);
}
async function addProvider() {
	const id = draft.id.trim();
	if (!id) return;
	await store.addProvider({
		id,
		name: draft.name.trim() || id,
		enabled: false,
		params: {
			basic: [],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: { text: [], image: [], video: [], speech: [], transcribe: [] },
		requestOverride: {},
	});
	activeProviderId.value = id;
	draft.id = "";
	draft.name = "";
}
async function deleteProvider() {
	if (!activeProvider.value) return;
	const id = activeProvider.value.id;
	await store.deleteProvider(id);
	activeProviderId.value = store.providers[0]?.id ?? "";
}
async function setOverride(operation: keyof RequestOverride, source: string) {
	const provider = activeProvider.value;
	if (!provider) return;
	if (source.trim()) provider.requestOverride[operation] = source;
	else delete provider.requestOverride[operation];
	await store.save(provider);
}
async function setModelGetter(source: string) {
	const provider = activeProvider.value;
	if (!provider) return;
	provider.modelGetter = source.trim() || undefined;
	await store.save(provider);
}
onMounted(async () => {
	await store.initialize();
	activeProviderId.value = store.providers[0]?.id ?? "";
});
</script>

<template>
  <div class="flex min-h-0 gap-4 max-md:flex-col">
    <ScrollArea class="w-52 shrink-0 max-md:w-full"><div class="space-y-2 p-1"><Button v-for="provider in store.providers" :key="provider.id" size="sm" :variant="provider.id === activeProviderId ? 'secondary' : 'ghost'" class="w-full justify-start" @click="activeProviderId = provider.id">{{ provider.name }}</Button><div class="grid gap-2 border-t pt-2"><Input v-model="draft.id" placeholder="提供商 ID" /><Input v-model="draft.name" placeholder="显示名称" /><Button size="sm" @click="addProvider"><Plus class="size-4" />添加提供商</Button></div></div></ScrollArea>
    <section v-if="activeProvider" class="min-w-0 flex-1 space-y-4"><header class="flex flex-wrap items-center gap-3"><div class="min-w-0 flex-1"><h2 class="text-base font-semibold">{{ activeProvider.name }}</h2><p v-if="activeProvider.description" class="text-sm text-muted-foreground">{{ activeProvider.description }}</p></div><label class="flex items-center gap-2 text-sm"><Switch :model-value="activeProvider.enabled" @update:model-value="activeProvider.enabled = Boolean($event); store.save(activeProvider)" />启用</label><Button v-if="activeProvider.modelGetter" size="sm" variant="outline" @click="store.refreshModels(activeProvider.id)"><RefreshCw class="size-4" />获取模型</Button><Button size="icon" variant="ghost" title="删除提供商" @click="deleteProvider"><Trash2 class="size-4" /></Button></header>
      <Tabs :model-value="activeKind" @update:model-value="activeKind = $event as ParamGroup"><TabsList><TabsTrigger v-for="group in visibleGroups" :key="group.id" :value="group.id">{{ group.label }}</TabsTrigger></TabsList></Tabs>
      <div v-if="modelKind" class="space-y-2 rounded-md border p-3"><p class="text-sm font-medium">{{ groups.find((item) => item.id === modelKind)?.label }}模型</p><ModelList :provider="activeProvider" :kind="modelKind" /></div>
      <div class="space-y-2"><ParamDefinitionContainer v-for="(definition, index) in activeProvider.params[activeKind]" :key="`${definition.paramName}:${index}`" :provider-id="activeProvider.id" :group="activeKind" :definition="definition" /><Button size="sm" variant="outline" @click="addParam"><Plus class="size-4" />添加参数</Button></div>
      <details class="rounded-md border p-3"><summary class="cursor-pointer text-sm font-medium">高级函数</summary><div class="mt-3 flex flex-wrap gap-2"><PopableJSEditor title="modelGetter" :model-value="activeProvider.modelGetter || ''" @update:model-value="setModelGetter" /><PopableJSEditor v-for="operation in operations" :key="operation" :title="operation" :model-value="activeProvider.requestOverride[operation] || ''" @update:model-value="setOverride(operation, $event)" /></div></details>
    </section>
  </div>
</template>



src/features/Request/defaults.ts

import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { host } from "@/host";
import type { ModelSelection } from "./types";

export interface DefaultRequestSettings {
	defaultChatModel: ModelSelection;
	fastModel: ModelSelection;
	imageModel: ModelSelection | null;
	speechModel: ModelSelection | null;
	transcriptionModel: ModelSelection | null;
}

export function getDefaultRequestSettings(): DefaultRequestSettings {
	return {
		defaultChatModel: {
			providerId: "openai",
			modelId: "gpt-4o-mini",
			kind: "text",
		},
		fastModel: { providerId: "openai", modelId: "gpt-4o-mini", kind: "text" },
		imageModel: null,
		speechModel: {
			providerId: "edge-tts",
			modelId: "edge-tts",
			kind: "speech",
		},
		transcriptionModel: null,
	};
}

export const useRequestDefaults = defineStore("request-defaults", () => {
	const defaults = ref<DefaultRequestSettings>(getDefaultRequestSettings());
	let loaded = false;

	watch(defaults, () => void host.config.set("defaults", defaults.value), {
		deep: true,
	});

	async function initialize() {
		if (loaded) return;
		const stored = await host.config.get<DefaultRequestSettings>("defaults");
		if (stored) Object.assign(defaults.value, stored);
		loaded = true;
	}

	return { defaults, initialize };
});


src/features/Request/provider/automatic1111/client.ts

import { modelProxyFetch } from "../shared/custom-fetch";
import type { GeneratedImage } from "../shared/image";

const AUTOMATIC1111_BASIC_AUTH_NAME = "automatic1111_BASIC_AUTH";
type Automatic1111Settings = {
	protocol: "http" | "https";
	host: string;
	port: number;
	model: string;
	sampler: string;
	scheduler: string;
	width: number;
	height: number;
	steps: number;
	cfg: number;
	negativePrompt: string;
};

interface Automatic1111Catalog {
	baseUrl: string;
	activeModel: string;
	models: string[];
	samplers: string[];
	schedulers: string[];
}

function buildAutomatic1111BaseUrl(
	settings: Pick<Automatic1111Settings, "protocol" | "host" | "port">,
) {
	const host = settings.host
		.trim()
		.replace(/^https?:\/\//i, "")
		.replace(/\/+$/, "");
	if (!host) throw new Error("请填写 A1111 主机地址。");
	if (
		!Number.isInteger(settings.port) ||
		settings.port < 1 ||
		settings.port > 65535
	)
		throw new Error("A1111 端口无效。");
	return `${settings.protocol}://${host}:${settings.port}`;
}

export async function testAutomatic1111Connection(
	settings: Automatic1111Settings,
	useAuth: boolean,
): Promise<Automatic1111Catalog> {
	const baseUrl = buildAutomatic1111BaseUrl(settings);
	const headers = authHeaders(useAuth);
	const [options, models, samplers, schedulers] = await Promise.all([
		getJson(`${baseUrl}/sdapi/v1/options`, headers),
		getJson(`${baseUrl}/sdapi/v1/sd-models`, headers),
		getJson(`${baseUrl}/sdapi/v1/samplers`, headers),
		getJson(`${baseUrl}/sdapi/v1/schedulers`, headers).catch(() => []),
	]);
	return {
		baseUrl,
		activeModel: readString(options, "sd_model_checkpoint"),
		models: readNames(models, "title"),
		samplers: readNames(samplers, "name"),
		schedulers: readNames(schedulers, "name"),
	};
}

export async function generateAutomatic1111Images(options: {
	prompt: string;
	settings: Automatic1111Settings;
	count?: number;
	seed?: number;
	signal?: AbortSignal;
	useAuth: boolean;
}) {
	const baseUrl = buildAutomatic1111BaseUrl(options.settings);
	const seed = normalizeSeed(options.seed);
	const overrideSettings = options.settings.model.trim()
		? { sd_model_checkpoint: options.settings.model.trim() }
		: undefined;
	try {
		const response = await modelProxyFetch(`${baseUrl}/sdapi/v1/txt2img`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...authHeaders(options.useAuth),
			},
			body: JSON.stringify({
				prompt: options.prompt.trim(),
				negative_prompt: options.settings.negativePrompt,
				seed,
				batch_size: Math.min(4, Math.max(1, Math.trunc(options.count ?? 1))),
				n_iter: 1,
				steps: options.settings.steps,
				cfg_scale: options.settings.cfg,
				width: options.settings.width,
				height: options.settings.height,
				sampler_name: options.settings.sampler,
				scheduler: options.settings.scheduler,
				override_settings: overrideSettings,
				override_settings_restore_afterwards: true,
			}),
			signal: options.signal,
		});
		const payload = (await readResponseJson(response, "A1111 txt2img")) as {
			images?: unknown[];
		};
		const images = (payload.images ?? [])
			.filter((item): item is string => typeof item === "string")
			.map(base64Image);
		if (!images.length) throw new Error("A1111 响应中没有图片。");
		return { images, seed };
	} catch (error) {
		if (options.signal?.aborted)
			void modelProxyFetch(`${baseUrl}/sdapi/v1/interrupt`, {
				method: "POST",
				headers: authHeaders(options.useAuth),
			});
		throw error;
	}
}

function authHeaders(enabled: boolean): Record<string, string> {
	return enabled
		? { Authorization: `Basic <<${AUTOMATIC1111_BASIC_AUTH_NAME}>>` }
		: {};
}

async function getJson(url: string, headers: Record<string, string>) {
	return readResponseJson(await modelProxyFetch(url, { headers }), "A1111");
}

async function readResponseJson(response: Response, label: string) {
	if (!response.ok)
		throw new Error(
			`${label} 请求失败 (${response.status})：${(await response.text()).slice(0, 240)}`,
		);
	return response.json() as Promise<unknown>;
}

function readNames(value: unknown, key: string) {
	return Array.isArray(value)
		? value.map((item) => readString(item, key)).filter(Boolean)
		: [];
}

function readString(value: unknown, key: string) {
	return typeof value === "object" &&
		value !== null &&
		typeof (value as Record<string, unknown>)[key] === "string"
		? (value as Record<string, string>)[key]
		: "";
}

function base64Image(value: string): GeneratedImage {
	const normalized = value.includes(",")
		? value.slice(value.indexOf(",") + 1)
		: value;
	const binary = atob(normalized);
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	return { base64: normalized, mediaType: "image/png", uint8Array: bytes };
}

function normalizeSeed(seed?: number) {
	return seed == null || !Number.isFinite(seed) ? -1 : Math.trunc(seed);
}


src/features/Request/provider/automatic1111/index.ts

import { host } from "@/host";
import type { GenerateImageResult } from "../../ai-sdk";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { generateAutomatic1111Images } from "./client";

async function generateImage({
	options,
}: {
	options: Record<string, unknown>;
}) {
	const result = await generateAutomatic1111Images({
		prompt: text(options.prompt),
		settings: options as any,
		count: number(options.n),
		seed: number(options.seed),
		signal: options.abortSignal as AbortSignal | undefined,
		useAuth: await host.secrets.has("automatic1111_BASIC_AUTH"),
	});
	return resultFor(result.images, { automatic1111: { seed: result.seed } });
}
export const automatic1111: ProviderRegistration = {
	provider: {
		id: "automatic1111",
		name: "AUTOMATIC1111 / Forge",
		description: "用户控制端点的 Stable Diffusion WebUI 服务。",
		icon: "automatic1111",
		enabled: false,
		params: {
			basic: [
				param("protocol", "http", "协议"),
				param("host", "127.0.0.1", "主机"),
				param("port", 7860, "端口"),
				secret("automatic1111_BASIC_AUTH", "基础认证"),
			],
			text: [],
			image: [
				param("model", "", "Checkpoint"),
				param("sampler", "Euler a", "采样器"),
				param("scheduler", "Automatic", "调度器"),
				param("width", 832, "宽度", true),
				param("height", 1216, "高度", true),
				param("steps", 28, "步数", true),
				param("cfg", 7, "CFG", true),
				param("negativePrompt", "", "反向提示词", true),
			],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: {
			...emptyModels(),
			image: [{ id: "txt2img", displayName: "txt2img", enabled: true }],
		},
		requestOverride: { generateImage: "automatic1111GenerateImage" },
	},
	functions: { automatic1111GenerateImage: generateImage },
};
function text(value: unknown) {
	const result = typeof value === "string" ? value.trim() : "";
	if (!result) throw new Error("A1111 提示词不能为空。");
	return result;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function resultFor(
	images: GenerateImageResult["images"],
	providerMetadata: Record<string, unknown>,
): GenerateImageResult {
	return {
		image: images[0]!,
		images,
		calls: [],
		warnings: [],
		responses: [],
		providerMetadata:
			providerMetadata as GenerateImageResult["providerMetadata"],
		usage: {
			inputTokens: undefined,
			outputTokens: undefined,
			totalTokens: undefined,
		},
	};
}


src/features/Request/provider/azure-speech/client.ts

import { modelProxyFetch } from "../shared/custom-fetch";

export const AZURE_TTS_API_KEY_SECRET = "azureSpeech_TTS_API_KEY";

export interface AzureTtsSettings {
	region: string;
	outputFormat: string;
}

export interface AzureSpeechVoice {
	name: string;
	shortName: string;
	locale: string;
	localName: string;
	gender: string;
	styles: string[];
	sampleRateHertz: string;
}

export async function listAzureSpeechVoices(
	settings: AzureTtsSettings,
	signal?: AbortSignal,
) {
	const response = await azureSpeechFetch(
		settings,
		"/cognitiveservices/voices/list",
		{
			method: "GET",
			signal,
		},
	);
	if (!response.ok) await throwResponseError(response, "Azure Speech 声音列表");
	const payload = (await response.json()) as Array<{
		Name?: string;
		ShortName?: string;
		Locale?: string;
		LocalName?: string;
		Gender?: string;
		StyleList?: string[];
		SampleRateHertz?: string;
	}>;
	return payload
		.flatMap((voice): AzureSpeechVoice[] =>
			voice.ShortName
				? [
						{
							name: voice.Name || voice.ShortName,
							shortName: voice.ShortName,
							locale: voice.Locale || "",
							localName: voice.LocalName || voice.ShortName,
							gender: voice.Gender || "",
							styles: voice.StyleList ?? [],
							sampleRateHertz: voice.SampleRateHertz || "",
						},
					]
				: [],
		)
		.sort(
			(left, right) =>
				left.locale.localeCompare(right.locale) ||
				left.localName.localeCompare(right.localName),
		);
}

export async function synthesizeWithAzureSpeech(options: {
	settings: AzureTtsSettings;
	text: string;
	voiceId: string;
	style?: string;
	speed?: number;
	signal?: AbortSignal;
}) {
	const text = options.text.trim();
	const voiceId = options.voiceId.trim();
	if (!text) throw new Error("Azure Speech 合成文本不能为空。");
	if (!voiceId) throw new Error("请选择 Azure Speech 声音。");
	const locale = voiceId.split("-").slice(0, 2).join("-") || "en-US";
	const body = buildSsml(
		text,
		locale,
		voiceId,
		options.style?.trim(),
		options.speed,
	);
	const response = await azureSpeechFetch(
		options.settings,
		"/cognitiveservices/v1",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/ssml+xml",
				"X-Microsoft-OutputFormat": options.settings.outputFormat,
				"User-Agent": "PulsarAI",
			},
			body,
			signal: options.signal,
		},
	);
	if (!response.ok) await throwResponseError(response, "Azure Speech 语音生成");
	return {
		audio: new Uint8Array(await response.arrayBuffer()),
		mediaType: mediaTypeForAzureFormat(options.settings.outputFormat),
		headers: Object.fromEntries(response.headers.entries()),
	};
}

function azureSpeechFetch(
	settings: AzureTtsSettings,
	path: string,
	init: RequestInit,
) {
	const region = settings.region.trim().toLowerCase();
	if (!/^[a-z0-9-]+$/.test(region))
		throw new Error("请填写有效的 Azure Speech Region。");
	const headers = new Headers(init.headers);
	headers.set("Ocp-Apim-Subscription-Key", `<<${AZURE_TTS_API_KEY_SECRET}>>`);
	return modelProxyFetch(`https://${region}.tts.speech.microsoft.com${path}`, {
		...init,
		headers,
	});
}

function buildSsml(
	text: string,
	locale: string,
	voiceId: string,
	style?: string,
	speed?: number,
) {
	const percentage = speed && speed !== 1 ? Math.round((speed - 1) * 100) : 0;
	const rate = percentage
		? `${percentage > 0 ? "+" : ""}${percentage}%`
		: "default";
	const spoken = `<prosody rate="${rate}">${escapeXml(text)}</prosody>`;
	const styled = style
		? `<mstts:express-as style="${escapeXmlAttribute(style)}">${spoken}</mstts:express-as>`
		: spoken;
	return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${escapeXmlAttribute(locale)}"><voice name="${escapeXmlAttribute(voiceId)}">${styled}</voice></speak>`;
}

function escapeXml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string) {
	return escapeXml(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function throwResponseError(
	response: Response,
	operation: string,
): Promise<never> {
	const detail = (await response.text().catch(() => "")).trim().slice(0, 300);
	throw new Error(
		`${operation}失败 (${response.status})${detail ? `：${detail}` : ""}`,
	);
}

function mediaTypeForAzureFormat(format: string) {
	if (format.startsWith("riff") || format.startsWith("raw"))
		return format.startsWith("riff") ? "audio/wav" : "audio/pcm";
	if (format.startsWith("webm")) return "audio/webm";
	if (format.startsWith("ogg")) return "audio/ogg";
	return "audio/mpeg";
}


src/features/Request/provider/azure-speech/index.ts

import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { synthesizeWithAzureSpeech } from "./client";

const model: SpeechModelV4 = {
	specificationVersion: "v4",
	provider: "azure-speech",
	modelId: "standard",
	async doGenerate(options) {
		const value = options.providerOptions?.azureSpeech as
			| Record<string, unknown>
			| undefined;
		const result = await synthesizeWithAzureSpeech({
			settings: {
				region: string(value?.region) ?? "",
				outputFormat:
					string(value?.outputFormat) ?? "audio-24khz-48kbitrate-mono-mp3",
			},
			text: options.text,
			voiceId: options.voice ?? string(value?.voiceId) ?? "",
			style: string(value?.style),
			speed: options.speed,
			signal: options.abortSignal,
		});
		return {
			audio: result.audio,
			warnings: [],
			response: {
				timestamp: new Date(),
				modelId: "standard",
				headers: result.headers,
			},
			providerMetadata: {
				azureSpeech: { audioBytes: result.audio.byteLength },
			},
		};
	},
};
export const azureSpeech: ProviderRegistration = {
	provider: {
		id: "azure-speech",
		name: "Azure Speech",
		description: "Azure Speech Synthesis API。",
		icon: "azure",
		enabled: false,
		params: {
			basic: [secret("azureSpeech_TTS_API_KEY", "API Key")],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [
				param("azureSpeech.region", "", "Region"),
				param("azureSpeech.voiceId", "", "默认声音"),
				param("azureSpeech.style", "", "风格"),
				param(
					"azureSpeech.outputFormat",
					"audio-24khz-48kbitrate-mono-mp3",
					"输出格式",
				),
			],
		},
		models: {
			...emptyModels(),
			speech: [{ id: "standard", displayName: "Standard", enabled: true }],
		},
		requestOverride: { generateSpeech: "azureSpeechGenerateSpeech" },
	},
	functions: {
		azureSpeechGenerateSpeech: ({ options, native }: any) =>
			native({ ...options, model }),
	},
};
function string(value: unknown) {
	return typeof value === "string" ? value : undefined;
}


src/features/Request/provider/comfyui/client.ts

import { modelProxyFetch } from "../shared/custom-fetch";
import type { GeneratedImage } from "../shared/image";

const COMFYUI_RUNPOD_API_KEY_NAME = "comfyui_RUNPOD_API_KEY";
type ComfyUISettings = {
	serverType: "standard" | "runpod";
	protocol: "http" | "https";
	host: string;
	port: number;
	runpodEndpointUrl: string;
	timeoutSeconds: number;
	workflowMode: "basic" | "custom";
	workflowJson: string;
	checkpoint: string;
	width: number;
	height: number;
	steps: number;
	cfg: number;
	sampler: string;
	scheduler: string;
	negativePrompt: string;
};

type WorkflowNode = {
	class_type: string;
	inputs: Record<string, unknown>;
	_meta?: {
		pulsar?: WorkflowMetadata;
		cosmosVision?: WorkflowMetadata;
	};
};
type Workflow = Record<string, WorkflowNode>;
type PromptBinding = "positive" | "negative";
type WorkflowMetadata = {
	promptBindings?: Record<string, PromptBinding>;
	imageOutput?: boolean;
};
type HistoryImage = { filename: string; subfolder?: string; type?: string };
type HistoryEntry = {
	outputs?: Record<string, { images?: HistoryImage[] }>;
	status?: { status_str?: string; messages?: unknown[] };
};

const pollIntervalMs = 1000;

export interface ComfyUIGenerateOptions {
	prompt: string;
	settings: ComfyUISettings;
	count?: number;
	seed?: number;
	signal?: AbortSignal;
}

export async function testComfyUIConnection(settings: ComfyUISettings) {
	if (settings.serverType === "runpod") return testRunPodConnection(settings);
	const baseUrl = buildComfyUIBaseUrl(settings);
	const controller = new AbortController();
	const timeout = window.setTimeout(() => controller.abort(), 10000);
	try {
		const response = await proxyFetch(
			`${baseUrl}/object_info/CheckpointLoaderSimple`,
			undefined,
			controller.signal,
		);
		const payload = await readJson(response, "ComfyUI 连接测试");
		const checkpoints = extractCheckpointNames(payload);
		return { baseUrl, checkpoints };
	} catch (error) {
		if (controller.signal.aborted)
			throw new Error(
				`连接 ${baseUrl} 超过 10 秒，请检查主机、端口与 ComfyUI 监听地址。`,
			);
		throw error;
	} finally {
		window.clearTimeout(timeout);
	}
}

export async function generateComfyUIImages(options: ComfyUIGenerateOptions) {
	if (options.settings.serverType === "runpod")
		return generateRunPodImages(options);
	const baseUrl = buildComfyUIBaseUrl(options.settings);
	const seed = normalizeSeed(options.seed);
	const { workflow, outputNodeIds } = buildWorkflow(
		options.settings,
		options.prompt.trim(),
		seed,
		options.count ?? 1,
	);
	if (!options.prompt.trim()) throw new Error("ComfyUI 图片提示词不能为空。");

	const controller = new AbortController();
	const timeout = window.setTimeout(
		() => controller.abort(),
		options.settings.timeoutSeconds * 1000,
	);
	const forwardAbort = () => controller.abort();
	options.signal?.addEventListener("abort", forwardAbort, { once: true });
	try {
		const promptId = await queuePrompt(baseUrl, workflow, controller.signal);
		const images = await waitForImages(
			baseUrl,
			promptId,
			outputNodeIds,
			controller.signal,
		);
		return {
			images: await downloadImages(baseUrl, images, controller.signal),
			seed,
			promptId,
		};
	} catch (error) {
		if (controller.signal.aborted) {
			void modelProxyFetch(`${baseUrl}/interrupt`, { method: "POST" }).catch(
				() => undefined,
			);
			if (options.signal?.aborted) throw new Error("已取消 ComfyUI 生成。");
			throw new Error(
				`ComfyUI 生成超过 ${options.settings.timeoutSeconds} 秒。`,
			);
		}
		throw error;
	} finally {
		window.clearTimeout(timeout);
		options.signal?.removeEventListener("abort", forwardAbort);
	}
}

function buildRunPodBaseUrl(settings: ComfyUISettings) {
	const url = settings.runpodEndpointUrl.trim().replace(/\/+$/, "");
	if (!/^https?:\/\//i.test(url))
		throw new Error(
			"请填写完整的 RunPod Endpoint URL，例如 https://api.runpod.ai/v2/endpoint-id。",
		);
	return url;
}

async function testRunPodConnection(settings: ComfyUISettings) {
	const baseUrl = buildRunPodBaseUrl(settings);
	const response = await modelProxyFetch(`${baseUrl}/health`, {
		headers: runPodHeaders(),
	});
	const payload = await readJson(response, "RunPod /health");
	const readyWorkers = readReadyWorkers(payload);
	return { baseUrl, checkpoints: [] as string[], readyWorkers };
}

async function generateRunPodImages(options: ComfyUIGenerateOptions) {
	const baseUrl = buildRunPodBaseUrl(options.settings);
	const seed = normalizeSeed(options.seed);
	const { workflow } = buildWorkflow(
		options.settings,
		options.prompt.trim(),
		seed,
		options.count ?? 1,
	);
	const response = await modelProxyFetch(`${baseUrl}/run`, {
		method: "POST",
		headers: { ...runPodHeaders(), "Content-Type": "application/json" },
		body: JSON.stringify({ input: { workflow } }),
		signal: options.signal,
	});
	const queued = (await readJson(response, "RunPod /run")) as { id?: string };
	if (!queued.id) throw new Error("RunPod /run 未返回任务 ID。");
	const jobId = queued.id;
	const controller = new AbortController();
	const timeout = window.setTimeout(
		() => controller.abort(),
		options.settings.timeoutSeconds * 1000,
	);
	const forwardAbort = () => controller.abort();
	options.signal?.addEventListener("abort", forwardAbort, { once: true });
	try {
		while (!controller.signal.aborted) {
			const statusResponse = await modelProxyFetch(
				`${baseUrl}/status/${encodeURIComponent(jobId)}`,
				{
					headers: runPodHeaders(),
					signal: controller.signal,
				},
			);
			const status = (await readJson(
				statusResponse,
				"RunPod /status",
			)) as Record<string, unknown>;
			const images = readRunPodImages(status);
			if (images.length) return { images, seed, promptId: jobId };
			const state =
				typeof status.status === "string" ? status.status.toUpperCase() : "";
			if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(state))
				throw new Error(`RunPod 任务失败：${state}`);
			await wait(500, controller.signal);
		}
		throw new Error("RunPod 生成已取消。");
	} catch (error) {
		if (controller.signal.aborted)
			void modelProxyFetch(`${baseUrl}/cancel/${encodeURIComponent(jobId)}`, {
				method: "POST",
				headers: runPodHeaders(),
			});
		throw error;
	} finally {
		window.clearTimeout(timeout);
		options.signal?.removeEventListener("abort", forwardAbort);
	}
}

function runPodHeaders() {
	return { Authorization: `Bearer <<${COMFYUI_RUNPOD_API_KEY_NAME}>>` };
}

function readReadyWorkers(payload: unknown) {
	if (!isRecord(payload) || !isRecord(payload.workers)) return 0;
	return typeof payload.workers.ready === "number" ? payload.workers.ready : 0;
}

function readRunPodImages(payload: Record<string, unknown>): GeneratedImage[] {
	if (!isRecord(payload.output) || !Array.isArray(payload.output.images))
		return [];
	return payload.output.images.flatMap((item) => {
		if (!isRecord(item) || typeof item.data !== "string") return [];
		const normalized = item.data.includes(",")
			? item.data.slice(item.data.indexOf(",") + 1)
			: item.data;
		const binary = atob(normalized);
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0),
		);
		const filename =
			typeof item.filename === "string" ? item.filename : "image.png";
		return [
			{
				base64: normalized,
				mediaType: mediaTypeForName(filename),
				uint8Array: bytes,
			},
		];
	});
}

export function buildComfyUIBaseUrl(
	settings: Pick<ComfyUISettings, "protocol" | "host" | "port">,
) {
	const host = settings.host.trim();
	if (!host) throw new Error("请填写 ComfyUI 主机地址。");
	if (
		!Number.isInteger(settings.port) ||
		settings.port < 1 ||
		settings.port > 65535
	) {
		throw new Error("ComfyUI 端口必须是 1 到 65535 的整数。");
	}
	const normalizedHost = host.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
	return `${settings.protocol}://${normalizedHost}:${settings.port}`;
}

function buildWorkflow(
	settings: ComfyUISettings,
	prompt: string,
	seed: number,
	count: number,
) {
	if (settings.workflowMode === "basic") {
		if (!settings.checkpoint.trim())
			throw new Error("请先连接 ComfyUI 并选择 checkpoint。");
		return {
			workflow: createBasicWorkflow(settings, prompt, seed, count),
			outputNodeIds: ["9"],
		};
	}
	const workflow = parseCustomWorkflow(settings.workflowJson);
	applyCustomBindings(workflow, {
		prompt,
		negativePrompt: settings.negativePrompt,
		seed,
		width: settings.width,
		height: settings.height,
	});
	const outputNodeIds = findOutputNodeIds(workflow);
	if (!outputNodeIds.length)
		throw new Error(
			"自定义工作流没有 SaveImage、PreviewImage 或 imageOutput 标记节点。",
		);
	stripPulsarMetadata(workflow);
	return { workflow, outputNodeIds };
}

function createBasicWorkflow(
	settings: ComfyUISettings,
	prompt: string,
	seed: number,
	count: number,
): Workflow {
	return {
		"3": {
			class_type: "KSampler",
			inputs: {
				seed,
				steps: settings.steps,
				cfg: settings.cfg,
				sampler_name: settings.sampler,
				scheduler: settings.scheduler,
				denoise: 1,
				model: ["4", 0],
				positive: ["6", 0],
				negative: ["7", 0],
				latent_image: ["5", 0],
			},
		},
		"4": {
			class_type: "CheckpointLoaderSimple",
			inputs: { ckpt_name: settings.checkpoint },
		},
		"5": {
			class_type: "EmptyLatentImage",
			inputs: {
				width: settings.width,
				height: settings.height,
				batch_size: Math.min(4, Math.max(1, Math.trunc(count))),
			},
		},
		"6": {
			class_type: "CLIPTextEncode",
			inputs: { text: prompt, clip: ["4", 1] },
		},
		"7": {
			class_type: "CLIPTextEncode",
			inputs: { text: settings.negativePrompt, clip: ["4", 1] },
		},
		"8": {
			class_type: "VAEDecode",
			inputs: { samples: ["3", 0], vae: ["4", 2] },
		},
		"9": {
			class_type: "SaveImage",
			inputs: { filename_prefix: "PulsarAI", images: ["8", 0] },
		},
	};
}

function parseCustomWorkflow(source: string): Workflow {
	if (!source.trim())
		throw new Error("请粘贴 ComfyUI API-format 工作流 JSON。");
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch (error) {
		throw new Error(`ComfyUI 工作流 JSON 无效：${(error as Error).message}`);
	}
	if (!isRecord(parsed) || !Object.keys(parsed).length)
		throw new Error("ComfyUI 工作流必须是非空对象。");
	for (const [nodeId, node] of Object.entries(parsed)) {
		if (
			!isRecord(node) ||
			typeof node.class_type !== "string" ||
			!isRecord(node.inputs)
		) {
			throw new Error(`ComfyUI 工作流节点 ${nodeId} 结构无效。`);
		}
	}
	return structuredClone(parsed) as Workflow;
}

function applyCustomBindings(
	workflow: Workflow,
	values: Record<string, string | number>,
) {
	for (const node of Object.values(workflow)) {
		const metadata = node._meta?.pulsar ?? node._meta?.cosmosVision;
		for (const [inputName, binding] of Object.entries(
			metadata?.promptBindings ?? {},
		)) {
			node.inputs[inputName] =
				binding === "positive" ? values.prompt : values.negativePrompt;
		}
		for (const [inputName, value] of Object.entries(node.inputs)) {
			if (typeof value !== "string") continue;
			const exact = value.match(
				/^\{\{(prompt|negativePrompt|seed|width|height)\}\}$/,
			);
			if (exact) {
				node.inputs[inputName] = values[exact[1]!]!;
				continue;
			}
			node.inputs[inputName] = value
				.split("{{prompt}}")
				.join(String(values.prompt))
				.split("{{negativePrompt}}")
				.join(String(values.negativePrompt));
		}
	}
}

function findOutputNodeIds(workflow: Workflow) {
	const marked = Object.entries(workflow)
		.filter(
			([, node]) =>
				node._meta?.pulsar?.imageOutput ||
				node._meta?.cosmosVision?.imageOutput,
		)
		.map(([nodeId]) => nodeId);
	if (marked.length) return marked;
	return Object.entries(workflow)
		.filter(
			([, node]) =>
				node.class_type === "SaveImage" || node.class_type === "PreviewImage",
		)
		.map(([nodeId]) => nodeId);
}

function stripPulsarMetadata(workflow: Workflow) {
	for (const node of Object.values(workflow)) {
		if (!node._meta) continue;
		delete node._meta.pulsar;
		delete node._meta.cosmosVision;
		if (!Object.keys(node._meta).length) delete node._meta;
	}
}

async function queuePrompt(
	baseUrl: string,
	workflow: Workflow,
	signal: AbortSignal,
) {
	const response = await proxyFetch(
		`${baseUrl}/prompt`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: `pulsarai-${crypto.randomUUID()}`,
				prompt: workflow,
			}),
		},
		signal,
	);
	const payload = (await readJson(response, "ComfyUI /prompt")) as {
		prompt_id?: string;
	};
	if (!payload.prompt_id) throw new Error("ComfyUI /prompt 未返回 prompt_id。");
	return payload.prompt_id;
}

async function waitForImages(
	baseUrl: string,
	promptId: string,
	outputNodeIds: string[],
	signal: AbortSignal,
) {
	while (!signal.aborted) {
		const response = await proxyFetch(
			`${baseUrl}/history/${encodeURIComponent(promptId)}`,
			undefined,
			signal,
		);
		const payload = await readJson(response, "ComfyUI /history");
		const entry = readHistoryEntry(payload, promptId);
		const error = readExecutionError(entry);
		if (error) throw new Error(error);
		const images = readHistoryImages(entry, outputNodeIds);
		if (images) return images;
		await wait(pollIntervalMs, signal);
	}
	throw new Error("ComfyUI 生成已取消。");
}

function readHistoryEntry(
	payload: unknown,
	promptId: string,
): HistoryEntry | null {
	if (!isRecord(payload)) return null;
	if (isRecord(payload.outputs)) return payload as HistoryEntry;
	return isRecord(payload[promptId])
		? (payload[promptId] as HistoryEntry)
		: null;
}

function readHistoryImages(
	entry: HistoryEntry | null,
	outputNodeIds: string[],
): HistoryImage[] | null {
	if (!entry?.outputs) return null;
	const images = outputNodeIds
		.flatMap((nodeId) => entry.outputs?.[nodeId]?.images ?? [])
		.filter((image) => image.filename);
	if (images.length) return images;
	if (outputNodeIds.some((nodeId) => nodeId in entry.outputs!)) {
		throw new Error("ComfyUI 输出节点已完成，但没有返回图片。");
	}
	return null;
}

function readExecutionError(entry: HistoryEntry | null) {
	const status = entry?.status?.status_str?.toLowerCase() ?? "";
	if (!status.includes("error") && !status.includes("fail")) return null;
	return `ComfyUI 工作流执行失败：${entry?.status?.status_str ?? "未知错误"}`;
}

async function downloadImages(
	baseUrl: string,
	images: HistoryImage[],
	signal: AbortSignal,
): Promise<GeneratedImage[]> {
	const results: GeneratedImage[] = [];
	for (const image of images) {
		const query = new URLSearchParams({
			filename: image.filename,
			subfolder: image.subfolder ?? "",
			type: image.type ?? "output",
		});
		const response = await proxyFetch(
			`${baseUrl}/view?${query}`,
			undefined,
			signal,
		);
		if (!response.ok)
			throw new Error(`ComfyUI /view 请求失败 (${response.status})。`);
		const bytes = new Uint8Array(await response.arrayBuffer());
		results.push(
			binaryImage(
				bytes,
				response.headers.get("content-type") ||
					mediaTypeForName(image.filename),
			),
		);
	}
	return results;
}

async function readJson(response: Response, label: string): Promise<unknown> {
	if (!response.ok) {
		const detail = (await response.text().catch(() => "")).trim().slice(0, 240);
		throw new Error(
			`${label} 请求失败 (${response.status})${detail ? `：${detail}` : ""}`,
		);
	}
	try {
		return await response.json();
	} catch (error) {
		throw new Error(`${label} 没有返回有效 JSON：${(error as Error).message}`);
	}
}

function extractCheckpointNames(payload: unknown) {
	if (!isRecord(payload) || !isRecord(payload.CheckpointLoaderSimple))
		return [];
	const node = payload.CheckpointLoaderSimple;
	if (!isRecord(node.input) || !isRecord(node.input.required)) return [];
	const value = node.input.required.ckpt_name;
	if (!Array.isArray(value) || !Array.isArray(value[0])) return [];
	return value[0].filter(
		(item): item is string => typeof item === "string" && Boolean(item.trim()),
	);
}

function binaryImage(bytes: Uint8Array, mediaType: string): GeneratedImage {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return { base64: btoa(binary), mediaType, uint8Array: bytes };
}

function mediaTypeForName(name: string) {
	if (/\.webp$/i.test(name)) return "image/webp";
	if (/\.jpe?g$/i.test(name)) return "image/jpeg";
	return "image/png";
}

function normalizeSeed(seed?: number) {
	if (seed == null || !Number.isFinite(seed))
		return Math.floor(Math.random() * 4294967296);
	return Math.min(4294967295, Math.max(0, Math.trunc(seed)));
}

function wait(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal.aborted) return reject(new Error("ComfyUI 生成已取消。"));
		const abort = () => {
			window.clearTimeout(timeout);
			reject(new Error("ComfyUI 生成已取消。"));
		};
		const timeout = window.setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, ms);
		signal.addEventListener("abort", abort, { once: true });
	});
}

function proxyFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
	signal?: AbortSignal,
) {
	if (!signal) return modelProxyFetch(input, init);
	if (signal.aborted) return Promise.reject(new Error("ComfyUI 请求已取消。"));
	return new Promise<Response>((resolve, reject) => {
		const abort = () => reject(new Error("ComfyUI 请求已取消。"));
		signal.addEventListener("abort", abort, { once: true });
		modelProxyFetch(input, init).then(
			(response) => {
				signal.removeEventListener("abort", abort);
				resolve(response);
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}


src/features/Request/provider/comfyui/index.ts

import type { GenerateImageResult } from "../../ai-sdk";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { generateComfyUIImages } from "./client";

async function generateImage({
	options,
}: {
	options: Record<string, unknown>;
}) {
	const result = await generateComfyUIImages({
		prompt: text(options.prompt),
		settings: options as any,
		count: number(options.n),
		seed: number(options.seed),
		signal: options.abortSignal as AbortSignal | undefined,
	});
	return imageResult(result.images, {
		comfyui: { promptId: result.promptId, seed: result.seed },
	});
}
export const comfyui: ProviderRegistration = {
	provider: {
		id: "comfyui",
		name: "ComfyUI",
		description: "ComfyUI 或 RunPod Serverless 工作流。",
		icon: "comfyui",
		enabled: false,
		params: {
			basic: [
				param("serverType", "standard", "服务类型"),
				param("protocol", "http", "协议"),
				param("host", "127.0.0.1", "主机"),
				param("port", 8188, "端口"),
				param("runpodEndpointUrl", "", "RunPod Endpoint URL"),
				param("timeoutSeconds", 120, "超时（秒）"),
				secret("comfyui_RUNPOD_API_KEY", "RunPod API Key"),
			],
			text: [],
			image: [
				param("workflowMode", "basic", "工作流模式"),
				param("workflowJson", "", "工作流 JSON"),
				param("checkpoint", "", "Checkpoint"),
				param("width", 832, "宽度", true),
				param("height", 1216, "高度", true),
				param("steps", 30, "步数", true),
				param("cfg", 5, "CFG", true),
				param("sampler", "euler_ancestral", "采样器"),
				param("scheduler", "karras", "调度器"),
				param("negativePrompt", "", "反向提示词", true),
			],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: {
			...emptyModels(),
			image: [{ id: "workflow", displayName: "工作流", enabled: true }],
		},
		requestOverride: { generateImage: "comfyuiGenerateImage" },
	},
	functions: { comfyuiGenerateImage: generateImage },
};
function text(value: unknown) {
	const result = typeof value === "string" ? value.trim() : "";
	if (!result) throw new Error("ComfyUI 提示词不能为空。");
	return result;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function imageResult(
	images: GenerateImageResult["images"],
	providerMetadata: Record<string, unknown>,
): GenerateImageResult {
	return {
		image: images[0]!,
		images,
		calls: [],
		warnings: [],
		responses: [],
		providerMetadata:
			providerMetadata as GenerateImageResult["providerMetadata"],
		usage: {
			inputTokens: undefined,
			outputTokens: undefined,
			totalTokens: undefined,
		},
	};
}


src/features/Request/provider/edge-tts/client.ts

import type { TTSChunk, Voice } from "edge-tts-ts";
import type {
	SpeechBoundary,
	SpeechVoice,
	TextToSpeechRequest,
	TextToSpeechResult,
} from "../../types";
import { loadEdgeTts } from "./load";

const EDGE_TTS_DEFAULT_VOICE = "en-US-EmmaMultilingualNeural";

function assertText(text: string): string {
	const normalized = text.trim();
	if (!normalized) {
		throw new Error("Edge TTS 文本不能为空。");
	}
	return normalized;
}

function isBoundaryChunk(
	chunk: TTSChunk,
): chunk is Extract<TTSChunk, { text: string }> {
	return chunk.type === "WordBoundary" || chunk.type === "SentenceBoundary";
}

function mapVoice(voice: Voice): SpeechVoice {
	return {
		name: voice.Name,
		shortName: voice.ShortName,
		gender: voice.Gender,
		locale: voice.Locale,
		suggestedCodec: voice.SuggestedCodec,
		friendlyName: voice.FriendlyName,
		status: voice.Status,
		contentCategories: voice.VoiceTag.ContentCategories,
		voicePersonalities: voice.VoiceTag.VoicePersonalities,
	};
}

export async function synthesizeWithEdgeTts(
	request: TextToSpeechRequest,
): Promise<TextToSpeechResult> {
	const { Communicate } = await loadEdgeTts();
	const communicate = new Communicate(assertText(request.text), {
		voice: request.voice ?? EDGE_TTS_DEFAULT_VOICE,
		rate: request.rate ?? "+0%",
		volume: request.volume ?? "+0%",
		pitch: request.pitch ?? "+0Hz",
		boundary: request.boundary ?? "WordBoundary",
	});

	const audioChunks: Uint8Array[] = [];
	const boundaries: SpeechBoundary[] = [];
	let audioBytes = 0;

	for await (const chunk of communicate.stream()) {
		if (chunk.type === "audio") {
			audioChunks.push(chunk.data);
			audioBytes += chunk.data.byteLength;
			continue;
		}

		if (isBoundaryChunk(chunk)) {
			boundaries.push(chunk);
		}
	}

	if (audioBytes === 0) {
		throw new Error("Edge TTS 没有返回音频数据。");
	}

	return {
		audio: new Blob(
			audioChunks.map((chunk) => Uint8Array.from(chunk)),
			{
				type: "audio/mpeg",
			},
		),
		audioBytes,
		boundaries,
	};
}

export async function listEdgeTtsVoices(): Promise<SpeechVoice[]> {
	const { listVoices } = await loadEdgeTts();
	const voices = await listVoices();
	return voices.map(mapVoice);
}


src/features/Request/provider/edge-tts/index.ts

import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { synthesizeWithEdgeTts } from "./client";

const model: SpeechModelV4 = {
	specificationVersion: "v4",
	provider: "edge-tts",
	modelId: "edge-tts",
	async doGenerate(options) {
		const values = options.providerOptions?.edgeTts as
			| Record<string, unknown>
			| undefined;
		const result = await synthesizeWithEdgeTts({
			text: options.text,
			voice: options.voice,
			rate: string(values?.rate) ?? rate(options.speed),
			volume: string(values?.volume),
			pitch: string(values?.pitch),
		});
		return {
			audio: new Uint8Array(await result.audio.arrayBuffer()),
			warnings: [],
			response: { timestamp: new Date(), modelId: "edge-tts" },
			providerMetadata: { edgeTts: { audioBytes: result.audioBytes } },
		};
	},
};
export const edgeTts: ProviderRegistration = {
	provider: {
		id: "edge-tts",
		name: "Edge TTS",
		description: "Microsoft Edge 在线语音服务。",
		enabled: true,
		params: {
			basic: [],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [
				param("edgeTts.rate", "+0%", "语速"),
				param("edgeTts.volume", "+0%", "音量"),
				param("edgeTts.pitch", "+0Hz", "音调"),
			],
		},
		models: {
			...emptyModels(),
			speech: [{ id: "edge-tts", displayName: "Edge TTS", enabled: true }],
		},
		requestOverride: { generateSpeech: "edgeTtsGenerateSpeech" },
	},
	functions: {
		edgeTtsGenerateSpeech: ({ options, native }: any) =>
			native({ ...options, model }),
	},
};
function string(value: unknown) {
	return typeof value === "string" ? value : undefined;
}
function rate(speed: number | undefined) {
	return speed === undefined || speed === 1
		? undefined
		: `${Math.round((speed - 1) * 100) >= 0 ? "+" : ""}${Math.round((speed - 1) * 100)}%`;
}


src/features/Request/provider/edge-tts/load.ts

import { host } from "@/host";

type EdgeTtsModule = typeof import("edge-tts-ts");

let edgeTtsModulePromise: Promise<EdgeTtsModule> | undefined;

function importEdgeTts(): Promise<EdgeTtsModule> {
	if (
		typeof window === "undefined" ||
		typeof globalThis.WebSocket === "undefined"
	) {
		return import("edge-tts-ts");
	}

	const NativeWebSocket = globalThis.WebSocket;
	globalThis.WebSocket = host.webSocket;

	return import("edge-tts-ts").finally(() => {
		globalThis.WebSocket = NativeWebSocket;
	});
}

export function loadEdgeTts(): Promise<EdgeTtsModule> {
	edgeTtsModulePromise ??= importEdgeTts();
	return edgeTtsModulePromise;
}


src/features/Request/provider/elevenlabs/client.ts

import { modelProxyFetch } from "../shared/custom-fetch";

export const ELEVENLABS_TTS_API_KEY_SECRET = "elevenlabs_TTS_API_KEY";

export interface ElevenLabsTtsSettings {
	baseUrl: string;
	outputFormat: string;
	stability: number;
	similarityBoost: number;
	style: number;
	speakerBoost: boolean;
	speed: number;
}

export interface ElevenLabsVoice {
	voiceId: string;
	name: string;
	category: string;
	description: string;
	previewUrl: string;
	labels: Record<string, string>;
}

export interface ElevenLabsModel {
	modelId: string;
	name: string;
	description: string;
	languages: Array<{ languageId: string; name: string }>;
}

interface ElevenLabsVoiceResponse {
	voices?: Array<{
		voice_id?: string;
		name?: string;
		category?: string;
		description?: string;
		preview_url?: string;
		labels?: Record<string, string>;
	}>;
	has_more?: boolean;
	next_page_token?: string | null;
}

export async function listElevenLabsVoices(
	settings: ElevenLabsTtsSettings,
	signal?: AbortSignal,
) {
	const voices: ElevenLabsVoice[] = [];
	let nextPageToken = "";
	do {
		const query = new URLSearchParams({
			page_size: "100",
			include_total_count: "false",
		});
		if (nextPageToken) query.set("next_page_token", nextPageToken);
		const response = await elevenLabsFetch(settings, `/v2/voices?${query}`, {
			signal,
		});
		const payload = await readJson<ElevenLabsVoiceResponse>(
			response,
			"ElevenLabs 声音列表",
		);
		voices.push(
			...(payload.voices ?? []).flatMap((voice) => {
				if (!voice.voice_id) return [];
				return [
					{
						voiceId: voice.voice_id,
						name: voice.name || voice.voice_id,
						category: voice.category || "",
						description: voice.description || "",
						previewUrl: voice.preview_url || "",
						labels: voice.labels ?? {},
					},
				];
			}),
		);
		nextPageToken =
			payload.has_more && payload.next_page_token
				? payload.next_page_token
				: "";
	} while (nextPageToken);
	return voices.sort((left, right) => left.name.localeCompare(right.name));
}

export async function listElevenLabsModels(
	settings: ElevenLabsTtsSettings,
	signal?: AbortSignal,
) {
	const response = await elevenLabsFetch(settings, "/v1/models", { signal });
	const payload = await readJson<
		Array<{
			model_id?: string;
			name?: string;
			description?: string;
			can_do_text_to_speech?: boolean;
			languages?: Array<{ language_id?: string; name?: string }>;
		}>
	>(response, "ElevenLabs 模型列表");
	return payload.flatMap((model): ElevenLabsModel[] => {
		if (!model.model_id || model.can_do_text_to_speech === false) return [];
		return [
			{
				modelId: model.model_id,
				name: model.name || model.model_id,
				description: model.description || "",
				languages: (model.languages ?? []).flatMap((language) =>
					language.language_id
						? [
								{
									languageId: language.language_id,
									name: language.name || language.language_id,
								},
							]
						: [],
				),
			},
		];
	});
}

export async function synthesizeWithElevenLabsTts(options: {
	settings: ElevenLabsTtsSettings;
	text: string;
	modelId: string;
	voiceId: string;
	speed?: number;
	signal?: AbortSignal;
}) {
	const text = options.text.trim();
	const modelId = options.modelId.trim();
	const voiceId = options.voiceId.trim();
	if (!text) throw new Error("ElevenLabs 合成文本不能为空。");
	if (!modelId) throw new Error("请选择 ElevenLabs 模型。");
	if (!voiceId) throw new Error("请选择 ElevenLabs 声音。");

	const outputFormat = options.settings.outputFormat.trim() || "mp3_44100_128";
	const response = await elevenLabsFetch(
		options.settings,
		`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				text,
				model_id: modelId,
				voice_settings: {
					stability: options.settings.stability,
					similarity_boost: options.settings.similarityBoost,
					style: options.settings.style,
					use_speaker_boost: options.settings.speakerBoost,
					speed: options.speed ?? options.settings.speed,
				},
			}),
			signal: options.signal,
		},
	);
	if (!response.ok) await throwResponseError(response, "ElevenLabs 语音生成");
	return {
		audio: new Uint8Array(await response.arrayBuffer()),
		mediaType: mediaTypeForElevenLabsFormat(outputFormat),
		headers: Object.fromEntries(response.headers.entries()),
	};
}

async function elevenLabsFetch(
	settings: ElevenLabsTtsSettings,
	path: string,
	init: RequestInit = {},
) {
	const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
	if (!/^https:\/\//i.test(baseUrl))
		throw new Error("ElevenLabs API 地址必须使用 HTTPS。");
	const headers = new Headers(init.headers);
	headers.set("xi-api-key", `<<${ELEVENLABS_TTS_API_KEY_SECRET}>>`);
	return modelProxyFetch(`${baseUrl}${path}`, { ...init, headers });
}

async function readJson<T>(response: Response, operation: string): Promise<T> {
	if (!response.ok) await throwResponseError(response, operation);
	return response.json() as Promise<T>;
}

async function throwResponseError(
	response: Response,
	operation: string,
): Promise<never> {
	const detail = (await response.text().catch(() => "")).trim().slice(0, 300);
	throw new Error(
		`${operation}失败 (${response.status})${detail ? `：${detail}` : ""}`,
	);
}

function mediaTypeForElevenLabsFormat(format: string) {
	if (format.startsWith("mp3")) return "audio/mpeg";
	if (format.startsWith("opus")) return "audio/ogg";
	if (format.startsWith("ulaw")) return "audio/basic";
	return "audio/pcm";
}


src/features/Request/provider/elevenlabs/index.ts

import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { synthesizeWithElevenLabsTts } from "./client";

function model(modelId: string): SpeechModelV4 {
	return {
		specificationVersion: "v4",
		provider: "elevenlabs",
		modelId,
		async doGenerate(options) {
			const value = options.providerOptions?.elevenLabs as
				| Record<string, unknown>
				| undefined;
			const result = await synthesizeWithElevenLabsTts({
				settings: {
					baseUrl: string(value?.baseUrl) ?? "https://api.elevenlabs.io",
					outputFormat: string(value?.outputFormat) ?? "mp3_44100_128",
					stability: number(value?.stability) ?? 0.5,
					similarityBoost: number(value?.similarityBoost) ?? 0.75,
					style: number(value?.style) ?? 0,
					speakerBoost: value?.speakerBoost !== false,
					speed: number(value?.speed) ?? 1,
				},
				text: options.text,
				modelId,
				voiceId: options.voice ?? string(value?.voiceId) ?? "",
				speed: options.speed,
				signal: options.abortSignal,
			});
			return {
				audio: result.audio,
				warnings: [],
				response: { timestamp: new Date(), modelId, headers: result.headers },
				providerMetadata: {
					elevenlabs: { audioBytes: result.audio.byteLength },
				},
			};
		},
	};
}
export const elevenLabs: ProviderRegistration = {
	provider: {
		id: "elevenlabs",
		name: "ElevenLabs",
		description: "ElevenLabs 语音生成 API。",
		icon: "elevenlabs",
		enabled: false,
		params: {
			basic: [secret("elevenlabs_TTS_API_KEY", "API Key")],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [
				param("elevenLabs.baseUrl", "https://api.elevenlabs.io", "API 地址"),
				param("elevenLabs.voiceId", "", "默认声音"),
				param("elevenLabs.outputFormat", "mp3_44100_128", "输出格式"),
				param("elevenLabs.stability", 0.5, "稳定性"),
				param("elevenLabs.similarityBoost", 0.75, "相似度增强"),
				param("elevenLabs.style", 0, "风格"),
				param("elevenLabs.speakerBoost", true, "说话人增强"),
				param("elevenLabs.speed", 1, "语速"),
			],
		},
		models: {
			...emptyModels(),
			speech: [
				{
					id: "eleven_multilingual_v2",
					displayName: "Eleven Multilingual v2",
					enabled: true,
				},
			],
		},
		requestOverride: { generateSpeech: "elevenLabsGenerateSpeech" },
	},
	functions: {
		elevenLabsGenerateSpeech: ({ modelId, options, native }: any) =>
			native({ ...options, model: model(modelId ?? "") }),
	},
};
function string(value: unknown) {
	return typeof value === "string" ? value : undefined;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}


src/features/Request/provider/index.ts

import { createSandboxFunction } from "@/features/Plugin/runtime/sandbox";
import type {
	BuiltInComponents,
	BuiltInFunctions,
	FunctionalString,
	Provider,
} from "../types";
import { automatic1111 } from "./automatic1111";
import { azureSpeech } from "./azure-speech";
import { comfyui } from "./comfyui";
import { edgeTts } from "./edge-tts";
import { elevenLabs } from "./elevenlabs";
import { novelai } from "./novelai";
import { piper } from "./piper";
import LocalModelDownload from "./shared/components/LocalModelDownload.vue";
import SecretInput from "./shared/components/SecretInput.vue";
import type { ProviderRegistration } from "./shared/registration";
import { stability } from "./stability";
import { volcengineTts } from "./volcengine-tts";
import { whisperCandle } from "./whisper-candle";

const registrations: ProviderRegistration[] = [
	automatic1111,
	comfyui,
	novelai,
	stability,
	edgeTts,
	piper,
	whisperCandle,
	volcengineTts,
	elevenLabs,
	azureSpeech,
];
export const localRequestProviders: Provider[] = registrations.map(
	({ provider }) => provider,
);
export const builtInFunctions: BuiltInFunctions = new Map(
	registrations.flatMap(({ functions = {} }) => Object.entries(functions)),
);
export const builtInComponents: BuiltInComponents = new Map([
	["SecretInput", SecretInput],
	["PiperModelDownload", LocalModelDownload],
	["WhisperModelDownload", LocalModelDownload],
	...registrations.flatMap(({ components = {} }) => Object.entries(components)),
]);
export async function invokeRequestFunction<T>(
	source: FunctionalString,
	context: Record<string, unknown>,
): Promise<T> {
	const builtIn = builtInFunctions.get(source);
	return (
		builtIn
			? await builtIn(context)
			: await createSandboxFunction(source)(context)
	) as T;
}


src/features/Request/provider/novelai/client.ts

import { unzipSync } from "fflate";
import { modelProxyFetch } from "../shared/custom-fetch";
import type { GeneratedImage } from "../shared/image";

const NOVELAI_API_KEY_NAME = "novelai_IMAGE_API_KEY";
const maxSeed = 4294967295;
const qualityTags: Record<string, string> = {
	"nai-diffusion-4-5-full": "location, very aesthetic, masterpiece, no text",
	"nai-diffusion-4-5-curated":
		"very aesthetic, masterpiece, no text, rating:general",
	"nai-diffusion-4-full": "no text, best quality, very aesthetic, absurdres",
	"nai-diffusion-4-curated-preview":
		"rating:general, amazing quality, very aesthetic, absurdres",
	"nai-diffusion-3": "best quality, amazing quality, very aesthetic, absurdres",
	"nai-diffusion-furry-3": "{best quality}, {amazing quality}",
};

type NovelAISettings = {
	baseUrl: string;
	model: string;
	width: number;
	height: number;
	steps: number;
	guidance: number;
	sampler: string;
	seed: number | null;
	negativePrompt: string;
	addQualityTags: boolean;
};

export interface NovelAIGenerateOptions {
	prompt: string;
	settings: NovelAISettings;
	model?: string;
	count?: number;
	seed?: number;
	signal?: AbortSignal;
}

export async function generateNovelAIImages(options: NovelAIGenerateOptions) {
	const count = Math.min(4, Math.max(1, Math.trunc(options.count ?? 1)));
	const model = options.model ?? options.settings.model;
	const seed = normalizeSeed(options.seed ?? options.settings.seed);
	const prompt = appendQualityTags(
		options.prompt.trim(),
		model,
		options.settings.addQualityTags,
	);
	if (!prompt) throw new Error("NovelAI 图片提示词不能为空。");

	const response = await modelProxyFetch(
		buildEndpoint(options.settings.baseUrl),
		{
			method: "POST",
			headers: {
				Authorization: `Bearer <<${NOVELAI_API_KEY_NAME}>>`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(
				buildPayload(options.settings, model, prompt, seed, count),
			),
			signal: options.signal,
		},
	);
	if (!response.ok) {
		const detail = (await response.text().catch(() => "")).trim().slice(0, 240);
		throw new Error(
			`NovelAI 请求失败 (${response.status})${detail ? `：${detail}` : ""}`,
		);
	}

	const images = await extractImages(response);
	if (!images.length) throw new Error("NovelAI 响应中没有图片。");
	return { images, seed };
}

function buildEndpoint(baseUrl: string) {
	const normalized = baseUrl.trim().replace(/\/+$/, "");
	if (!normalized) throw new Error("请先填写 NovelAI API 地址。");
	return `${normalized}/ai/generate-image`;
}

function buildPayload(
	settings: NovelAISettings,
	model: string,
	prompt: string,
	seed: number,
	count: number,
) {
	const negativePrompt = settings.negativePrompt.trim();
	const parameters: Record<string, unknown> = {
		params_version: 3,
		width: settings.width,
		height: settings.height,
		scale: settings.guidance,
		sampler: settings.sampler,
		steps: settings.steps,
		n_samples: count,
		ucPreset: 0,
		qualityToggle: settings.addQualityTags,
		autoSmea: false,
		controlnet_strength: 1,
		add_original_image: true,
		cfg_rescale: 0,
		noise_schedule: "karras",
		legacy_v3_extend: false,
		legacy_uc: false,
		normalize_reference_strength_multiple: true,
		inpaintImg2ImgStrength: 1,
		seed,
		characterPrompts: [],
		negative_prompt: negativePrompt,
		prefer_brownian: true,
		dynamic_thresholding: false,
		legacy: false,
		skip_cfg_above_sigma: null,
		deliberate_euler_ancestral_bug: false,
	};
	if (model.startsWith("nai-diffusion-4")) {
		parameters.v4_prompt = {
			caption: { base_caption: prompt, char_captions: [] },
			use_coords: false,
			use_order: false,
		};
		parameters.v4_negative_prompt = {
			caption: { base_caption: negativePrompt, char_captions: [] },
			use_coords: false,
			use_order: false,
			legacy_uc: false,
		};
	}
	if (model.includes("diffusion-3") || model.includes("diffusion-furry-3")) {
		parameters.sm = false;
		parameters.sm_dyn = false;
	}
	return {
		action: "generate",
		input: prompt,
		model,
		parameters,
		use_new_shared_trial: true,
	};
}

async function extractImages(response: Response): Promise<GeneratedImage[]> {
	const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
	if (contentType.includes("application/json")) {
		const payload = (await response.json()) as {
			images?: Array<{ image?: string }>;
		};
		return (payload.images ?? []).flatMap((item) =>
			item.image ? [base64Image(item.image, "image/png")] : [],
		);
	}

	const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
	return Object.entries(archive)
		.filter(([name]) => /\.(png|jpe?g|webp)$/i.test(name))
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, bytes]) => binaryImage(bytes, mediaTypeForName(name)));
}

function base64Image(base64: string, mediaType: string): GeneratedImage {
	const binary = atob(base64);
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	return { base64, mediaType, uint8Array: bytes };
}

function binaryImage(bytes: Uint8Array, mediaType: string): GeneratedImage {
	let binary = "";
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(
			...bytes.subarray(offset, offset + chunkSize),
		);
	}
	return { base64: btoa(binary), mediaType, uint8Array: bytes };
}

function mediaTypeForName(name: string) {
	if (/\.webp$/i.test(name)) return "image/webp";
	if (/\.jpe?g$/i.test(name)) return "image/jpeg";
	return "image/png";
}

function appendQualityTags(
	prompt: string,
	model: string,
	enabled: boolean,
) {
	return [prompt, enabled ? qualityTags[model] : ""].filter(Boolean).join(", ");
}

function normalizeSeed(seed: number | null | undefined) {
	if (seed == null || !Number.isFinite(seed))
		return Math.floor(Math.random() * (maxSeed + 1));
	return Math.min(maxSeed, Math.max(0, Math.trunc(seed)));
}


src/features/Request/provider/novelai/index.ts

import type { GenerateImageResult } from "../../ai-sdk";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { generateNovelAIImages } from "./client";

const models = [
	{ id: "nai-diffusion-4-5-curated", name: "NAI Diffusion v4.5 Curated" },
	{ id: "nai-diffusion-4-5-full", name: "NAI Diffusion v4.5 Full" },
	{ id: "nai-diffusion-4-curated-preview", name: "NAI Diffusion v4 Curated" },
	{ id: "nai-diffusion-4-full", name: "NAI Diffusion v4 Full" },
	{ id: "nai-diffusion-3", name: "NAI Diffusion Anime v3" },
	{ id: "nai-diffusion-furry-3", name: "NAI Diffusion Furry v3" },
];

async function generateImage({
	modelId,
	options,
}: {
	modelId?: string;
	options: Record<string, unknown>;
}) {
	const result = await generateNovelAIImages({
		prompt: text(options.prompt),
		settings: options as any,
		model: modelId as any,
		count: number(options.n),
		seed: number(options.seed),
		signal: options.abortSignal as AbortSignal | undefined,
	});
	return imageResult(result.images, { novelai: { seed: result.seed } });
}
export const novelai: ProviderRegistration = {
	provider: {
		id: "novelai",
		name: "NovelAI",
		description: "NovelAI 图片生成 API。",
		icon: "novelai",
		enabled: false,
		params: {
			basic: [
				param("baseUrl", "https://image.novelai.net", "API 地址"),
				secret("novelai_IMAGE_API_KEY", "API Key"),
			],
			text: [],
			image: [
				param("width", 832, "宽度", true),
				param("height", 1216, "高度", true),
				param("steps", 28, "步数", true),
				param("guidance", 5.5, "引导强度", true),
				param("sampler", "k_euler_ancestral", "采样器"),
				param("negativePrompt", "", "反向提示词", true),
				param("addQualityTags", true, "自动质量标签"),
			],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: {
			...emptyModels(),
			image: models.map((item) => ({
				id: item.id,
				displayName: item.name,
				enabled: true,
			})),
		},
		requestOverride: { generateImage: "novelaiGenerateImage" },
	},
	functions: { novelaiGenerateImage: generateImage },
};
function text(value: unknown) {
	const result = typeof value === "string" ? value.trim() : "";
	if (!result) throw new Error("NovelAI 提示词不能为空。");
	return result;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function imageResult(
	images: GenerateImageResult["images"],
	providerMetadata: Record<string, unknown>,
): GenerateImageResult {
	return {
		image: images[0]!,
		images,
		calls: [],
		warnings: [],
		responses: [],
		providerMetadata:
			providerMetadata as GenerateImageResult["providerMetadata"],
		usage: {
			inputTokens: undefined,
			outputTokens: undefined,
			totalTokens: undefined,
		},
	};
}


src/features/Request/provider/piper/client.ts

import { host } from "@/host";

export const PIPER_TTS_PROVIDER_ID = "piper";

export interface PiperModelPack {
	id: string;
	version: string;
	sha256: string;
	size: number;
	diskSize: number;
	language?: string;
	runtime: "sherpa-onnx-piper";
}

export type PiperModelDownloadPack = Omit<PiperModelPack, "diskSize">;

export interface PiperSynthesis {
	audio: number[];
	sampleRate: number;
	modelId: string;
}

export function listPiperModels() {
	return host.local.invoke<PiperModelPack[]>("tts", "piper_models");
}

export function downloadPiperModel(pack: PiperModelDownloadPack, url: string) {
	return host.local.invoke<PiperModelPack>("tts", "piper_download", {
		request: { pack, url },
	});
}

export function deletePiperModel(id: string) {
	return host.local.invoke<void>("tts", "piper_delete", { id });
}

export async function synthesizeWithPiper(options: {
	modelId: string;
	text: string;
	speaker?: number;
	speed?: number;
}) {
	const result = await host.local.invoke<PiperSynthesis>(
		"tts",
		"piper_synthesize",
		{
			request: options,
		},
	);
	return {
		...result,
		audio: new Uint8Array(result.audio),
	};
}


src/features/Request/provider/piper/index.ts

import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { PIPER_TTS_PROVIDER_ID, synthesizeWithPiper } from "./client";

function model(modelId: string): SpeechModelV4 {
	return {
		specificationVersion: "v4",
		provider: PIPER_TTS_PROVIDER_ID,
		modelId,
		async doGenerate(options) {
			const result = await synthesizeWithPiper({
				modelId,
				text: options.text,
				speaker: Number.parseInt(options.voice ?? "0", 10) || 0,
				speed: options.speed,
			});
			return {
				audio: result.audio,
				warnings: [],
				response: { timestamp: new Date(), modelId },
				providerMetadata: { piper: { sampleRate: result.sampleRate } },
			};
		},
	};
}
export const piper: ProviderRegistration = {
	provider: {
		id: "piper",
		name: "Piper 本地语音",
		description: "下载的本地 Piper 模型。",
		enabled: true,
		params: {
			basic: [{ ...param("", ""), customBlockComponent: "PiperModelDownload" }],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: emptyModels(),
		requestOverride: { generateSpeech: "piperGenerateSpeech" },
	},
	functions: {
		piperGenerateSpeech: ({ modelId, options, native }: any) =>
			native({ ...options, model: model(modelId ?? "") }),
	},
};


src/features/Request/provider/shared/components/LocalModelDownload.vue

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { useRequestStore } from "../../../request-store";
import {
	deletePiperModel,
	downloadPiperModel,
	listPiperModels,
	type PiperModelDownloadPack,
} from "../../piper/client";
import {
	deleteWhisperModel,
	downloadWhisperModel,
	listWhisperModels,
	type WhisperModelDownloadPack,
} from "../../whisper-candle/client";

const props = defineProps<{ type: "piper" | "whisper" }>();
const store = useRequestStore();
const downloading = ref(false);
const models = ref<
	Array<{ id: string; version: string; size: number; language?: string }>
>([]);
const form = reactive({
	id: "",
	version: "",
	url: "",
	sha256: "",
	size: "",
	language: "",
});
const providerId = () => (props.type === "piper" ? "piper" : "whisper-candle");
const kind = () =>
	props.type === "piper" ? ("speech" as const) : ("transcribe" as const);
async function refresh() {
	models.value =
		props.type === "piper"
			? await listPiperModels()
			: await listWhisperModels();
	await store.upsertModels(
		providerId(),
		kind(),
		models.value.map((item) => ({
			id: item.id,
			displayName: item.id,
			enabled: true,
			extraInfo: {
				version: item.version,
				...(item.language ? { language: item.language } : {}),
			},
		})),
	);
}
async function download() {
	const size = Number(form.size);
	if (
		!form.id ||
		!form.version ||
		!form.url ||
		!form.sha256 ||
		!Number.isSafeInteger(size) ||
		size <= 0
	)
		throw new Error("请填写模型 ID、版本、下载地址、SHA-256 和字节大小。");
	downloading.value = true;
	try {
		if (props.type === "piper")
			await downloadPiperModel(
				{
					id: form.id,
					version: form.version,
					sha256: form.sha256,
					size,
					language: form.language || undefined,
					runtime: "sherpa-onnx-piper",
				} satisfies PiperModelDownloadPack,
				form.url,
			);
		else
			await downloadWhisperModel(
				{
					id: form.id,
					version: form.version,
					sha256: form.sha256,
					size,
					language: form.language || undefined,
					runtime: "whisper-candle-core",
				} satisfies WhisperModelDownloadPack,
				form.url,
			);
		await refresh();
	} finally {
		downloading.value = false;
	}
}
async function remove(id: string) {
	if (props.type === "piper") await deletePiperModel(id);
	else await deleteWhisperModel(id);
	await refresh();
}
onMounted(() => void refresh());
</script>
<template>
  <div class="space-y-3 rounded-md border p-3"><p class="text-sm font-medium">本地模型</p><div v-for="model in models" :key="model.id" class="flex items-center gap-2 text-sm"><span class="min-w-0 flex-1 truncate">{{ model.id }} · {{ model.version }}</span><Button size="sm" variant="ghost" @click="remove(model.id)">删除</Button></div><div class="grid gap-2 sm:grid-cols-2"><Input v-model="form.id" placeholder="模型 ID" /><Input v-model="form.version" placeholder="版本" /><Input v-model="form.url" class="sm:col-span-2" placeholder="下载 URL" /><Input v-model="form.sha256" class="sm:col-span-2" placeholder="SHA-256" /><Input v-model="form.size" type="number" placeholder="字节大小" /><Input v-model="form.language" placeholder="语言（可选）" /></div><Button size="sm" :disabled="downloading" @click="download">{{ downloading ? '下载中…' : '下载并校验' }}</Button></div>
</template>


src/features/Request/provider/shared/components/ProviderAvatar.vue

<script setup lang="ts">
import { computed } from "vue";
import { providerIconUrl, useProviderIconVariant } from "../provider-icons";

const props = defineProps<{
	name: string;
	src?: string;
	providerId?: string;
	iconId?: string;
}>();

const variant = useProviderIconVariant();

const iconSrc = computed(() => {
	const fallback = providerIconUrl(
		props.providerId || props.name,
		props.src,
		variant.value,
	);
	return providerIconUrl(props.iconId, fallback, variant.value);
});
</script>

<template>
  <span class="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
    <img v-if="iconSrc" class="size-4.5 object-contain" :src="iconSrc" :alt="name" />
    <span v-else class="text-xs font-medium">{{ name.slice(0, 1).toUpperCase() }}</span>
  </span>
</template>



src/features/Request/provider/shared/components/SecretInput.vue

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { host } from "@/host";

const props = defineProps<{ name: string; title?: string }>();
const value = ref("");
const preview = ref("");
const saving = ref(false);

async function refresh() {
	preview.value = await host.secrets.preview(props.name);
}
async function save() {
	saving.value = true;
	try {
		if (value.value.trim())
			await host.secrets.set(props.name, value.value.trim());
		else await host.secrets.clearValue(props.name);
		value.value = "";
		await refresh();
	} finally {
		saving.value = false;
	}
}
onMounted(() => void refresh());
</script>

<template>
  <div class="flex min-h-11 items-center gap-3">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium">{{ title || name }}</p>
      <p class="truncate text-xs text-muted-foreground">{{ preview || '未设置' }}</p>
    </div>
    <Input v-model="value" type="password" class="max-w-48" placeholder="输入新值" @keyup.enter="save" />
    <Button size="sm" :disabled="saving" @click="save">保存</Button>
  </div>
</template>


src/features/Request/provider/shared/components/ServiceProviderSelector.vue

<script setup lang="ts">
import { computed, ref } from "vue";
import { Button, Switch } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronDown, Search } from "@/lib/phosphor-icons";
import type { ServiceProviderView } from "../service-provider";
import ProviderAvatar from "./ProviderAvatar.vue";

const props = defineProps<{
	providers: ServiceProviderView[];
	activeProviderId: string;
	search: string;
}>();

const emit = defineEmits<{
	"update:search": [value: string];
	"select-provider": [providerId: string];
	"toggle-provider": [providerId: string, enabled: boolean];
}>();

const open = ref(false);
const activeProvider = computed(
	() =>
		props.providers.find(
			(provider) => provider.id === props.activeProviderId,
		) ?? props.providers[0],
);
const filteredProviders = computed(() => {
	const keyword = props.search.trim().toLowerCase();
	if (!keyword) return props.providers;
	return props.providers.filter((provider) =>
		[provider.id, provider.name, provider.description]
			.filter(Boolean)
			.some((value) => value?.toLowerCase().includes(keyword)),
	);
});
const providerListHeight = computed(() => {
	const rowCount = filteredProviders.value.length || 2;
	return `${Math.min(rowCount * 48 + 8, 320)}px`;
});

function selectProvider(providerId: string) {
	emit("select-provider", providerId);
	open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button v-if="activeProvider" variant="ghost" class="h-11 max-w-full justify-start gap-2 px-2">
        <ProviderAvatar :name="activeProvider.name" :src="activeProvider.iconUrl" :provider-id="activeProvider.id" :icon-id="activeProvider.icon" />
        <span class="min-w-0 text-left">
          <span class="block truncate text-sm font-medium">{{ activeProvider.name }}</span>
          <span class="block truncate text-xs font-normal text-muted-foreground">
            {{ activeProvider.description || activeProvider.id }}
          </span>
        </span>
        <ChevronDown class="ml-1 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="start" :side-offset="6" class="w-[min(24rem,calc(100vw-1rem))] p-2">
      <div class="flex items-center gap-2 p-1">
        <div class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="search"
            class="h-9 pl-8"
            placeholder="搜索提供商"
            @update:model-value="emit('update:search', String($event))"
          />
        </div>
        <slot name="actions" />
      </div>

      <ScrollArea class="mt-1" :style="{ height: providerListHeight }">
        <div class="flex flex-col gap-1 p-1">
          <div
            v-for="provider in filteredProviders"
            :key="provider.id"
            class="flex h-11 items-center gap-2 rounded-md px-2 hover:bg-accent"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 text-left"
              @click="selectProvider(provider.id)"
            >
              <ProviderAvatar :name="provider.name" :src="provider.iconUrl" :provider-id="provider.id" :icon-id="provider.icon" />
              <span class="min-w-0 flex-1 truncate text-sm">{{ provider.name }}</span>
              <Check v-if="provider.id === activeProviderId" class="shrink-0 text-muted-foreground" />
            </button>
            <Switch
              size="sm"
              :model-value="provider.enabled"
              title="启用提供商"
              @click.stop
              @update:model-value="emit('toggle-provider', provider.id, Boolean($event))"
            />
          </div>
          <p v-if="filteredProviders.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            没有匹配的提供商
          </p>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>




src/features/Request/provider/shared/components/ServiceProviderSettingsLayout.vue

<script setup lang="ts">
import SettingForm from "@/features/Environment/setting/SettingForm.vue";
import SettingFormField from "@/features/Environment/setting/SettingFormField.vue";
import type { ServiceProviderView } from "../service-provider";
import ServiceProviderSelector from "./ServiceProviderSelector.vue";

defineProps<{
	providers: ServiceProviderView[];
	activeProviderId: string;
	search: string;
}>();

const emit = defineEmits<{
	"update:search": [value: string];
	"select-provider": [providerId: string];
	"toggle-provider": [providerId: string, enabled: boolean];
}>();

function forwardToggleProvider(providerId: string, enabled: boolean) {
	emit("toggle-provider", providerId, enabled);
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto p-6 mobile:p-4">
      <SettingForm>
        <SettingFormField title="提供商" description="选择当前功能使用的提供商，并管理启用状态。">
          <ServiceProviderSelector
            :providers="providers"
            :active-provider-id="activeProviderId"
            :search="search"
            @update:search="emit('update:search', $event)"
            @select-provider="emit('select-provider', $event)"
            @toggle-provider="forwardToggleProvider"
          >
            <template #actions>
              <slot name="selector-actions" />
            </template>
          </ServiceProviderSelector>
        </SettingFormField>
      </SettingForm>

      <div class="mt-6">
        <slot />
      </div>
    </div>
  </section>
</template>



src/features/Request/provider/shared/custom-fetch.ts

import { host } from "@/host";

interface ProxyHeader {
	name: string;
	value: string;
}

interface ProxyFetchResponse {
	status: number;
	headers: ProxyHeader[];
	body: number[];
}

async function readRequestBody(request: Request) {
	if (
		request.method === "GET" ||
		request.method === "HEAD" ||
		request.body === null
	) {
		return undefined;
	}
	return [...new Uint8Array(await request.clone().arrayBuffer())];
}

export const modelProxyFetch: typeof fetch = async (input, init) => {
	const request = input instanceof Request ? input : new Request(input, init);
	const headers: ProxyHeader[] = [];
	request.headers.forEach((value, name) => {
		headers.push({ name, value });
	});

	const body = await readRequestBody(request);
	const response = await host.network.modelProxyFetch<ProxyFetchResponse>({
		url: request.url,
		method: request.method,
		headers,
		body,
	});

	return new Response(new Uint8Array(response.body), {
		status: response.status,
		headers: response.headers.map((header): [string, string] => [
			header.name,
			header.value,
		]),
	});
};


src/features/Request/provider/shared/definition.ts

import type { ParamDefinition, Provider } from "../../types";

export function param(
	paramName: string,
	value: unknown,
	title?: string,
	enableInDefault = false,
): ParamDefinition {
	return {
		paramName,
		title,
		enableInDefault,
		paramComponent: { component: "input", componentParam: {} },
		defaultValue: value,
		value,
	};
}

export function secret(name: string, title: string): ParamDefinition {
	return {
		...param("", "", title),
		customBlockComponent: "SecretInput",
		paramComponent: { component: "secret", componentParam: { name } },
	};
}

export function emptyModels(): Provider["models"] {
	return { text: [], image: [], video: [], speech: [], transcribe: [] };
}


src/features/Request/provider/shared/huggingface-image-model.ts

import type { ImageModelV4 } from "@ai-sdk/provider";
import {
	InferenceClient,
	type InferenceProviderOrPolicy,
} from "@huggingface/inference";
import { modelProxyFetch } from "./custom-fetch";

export class HuggingFaceImageModel implements ImageModelV4 {
	readonly specificationVersion = "v4" as const;
	readonly provider = "huggingface";
	readonly maxImagesPerCall = 1;

	constructor(
		readonly modelId: string,
		private readonly apiKeyName: string,
		private readonly baseUrl: string,
	) {}

	async doGenerate(
		options: Parameters<ImageModelV4["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<ImageModelV4["doGenerate"]>>> {
		if (!options.prompt?.trim())
			throw new Error("Hugging Face 图片提示词不能为空。");
		if (options.files?.length || options.mask)
			throw new Error("Hugging Face text-to-image 模型不接受参考图或蒙版。");

		const providerOptions = options.providerOptions.huggingface ?? {};
		const provider =
			typeof providerOptions.provider === "string"
				? (providerOptions.provider as InferenceProviderOrPolicy)
				: "auto";
		const parameters: Record<string, unknown> = { ...providerOptions };
		delete parameters.provider;
		if (options.seed != null) parameters.seed = options.seed;
		if (options.size) {
			const [width, height] = options.size.split("x").map(Number);
			parameters.width = width;
			parameters.height = height;
		}

		const client = new InferenceClient(`<<${this.apiKeyName}>>`, {
			fetch: modelProxyFetch,
			retry_on_error: true,
			...(this.baseUrl && this.baseUrl !== "https://router.huggingface.co"
				? {
						endpointUrl: `${this.baseUrl.replace(/\/+$/, "")}/hf-inference/models/${this.modelId}`,
					}
				: {}),
		});
		const startedAt = new Date();
		const image = await client.textToImage(
			{
				model: this.modelId,
				provider,
				inputs: options.prompt.trim(),
				parameters,
			},
			{
				signal: options.abortSignal,
				outputType: "blob",
			},
		);

		return {
			images: [new Uint8Array(await image.arrayBuffer())],
			warnings: options.aspectRatio
				? [
						{
							type: "unsupported",
							feature: "aspectRatio",
							details: "请改用 size 指定 Hugging Face 图片尺寸。",
						},
					]
				: [],
			providerMetadata: { huggingface: { images: [{ provider }] } },
			response: {
				timestamp: startedAt,
				modelId: this.modelId,
				headers: undefined,
			},
		};
	}
}


src/features/Request/provider/shared/image.ts

export interface GeneratedImage {
	mediaType: string;
	uint8Array: Uint8Array;
	base64: string;
}


src/features/Request/provider/shared/legacy-model-catalog.ts

export type ModelApiType =
	| "chat"
	| "image"
	| "video"
	| "embedding"
	| "asr"
	| "tts";
type ModelProviderRuntime = "remote" | "local-heavy";

type ModelCapability =
	| "audio"
	| "files"
	| "functionCall"
	| "imageOutput"
	| "reasoning"
	| "search"
	| "structuredOutput"
	| "video"
	| "vision";

/** A capability is only recorded when the provider explicitly declares support. */
type ModelCapabilities = Partial<Record<ModelCapability, boolean>>;

type ModelPriceCurrency = "CNY" | "USD";
type ModelPriceUnit =
	| "millionTokens"
	| "millionCharacters"
	| "image"
	| "video"
	| "megapixel"
	| "second";

interface FixedModelPricingUnit {
	name: string;
	strategy: "fixed";
	unit: ModelPriceUnit;
	rate: number;
	originalRate?: number;
}

interface TieredModelPricingUnit {
	name: string;
	strategy: "tiered";
	unit: ModelPriceUnit;
	tiers: Array<{
		rate: number;
		originalRate?: number;
		upTo: number | "infinity";
	}>;
}

interface LookupModelPricingUnit {
	name: string;
	strategy: "lookup";
	unit: ModelPriceUnit;
	lookup: {
		prices: Record<string, number>;
		originalPrices?: Record<string, number>;
		pricingParams: string[];
	};
}

export interface ModelPricing {
	currency?: ModelPriceCurrency;
	units: Array<
		FixedModelPricingUnit | TieredModelPricingUnit | LookupModelPricingUnit
	>;
	approximatePricePerImage?: number;
	approximatePricePerVideo?: number;
	audioTokensPerSecond?: number;
}

export interface ModelDefinition {
	id: string;
	name: string;
	apiType: ModelApiType;
	contextSize?: number;
	maxOutput?: number;
	capabilities?: ModelCapabilities;
	/** Provider-specific model options retained from the configuration catalog. */
	parameters?: Record<string, unknown>;
	pricing?: ModelPricing;
	/** Model-provider declared reliable knowledge cutoff, normally YYYY-MM. */
	knowledgeCutoff?: string;
	releasedAt?: string;
	family?: string;
	generation?: string;
	iconUrl?: string;
	enabled: boolean;
}

export interface ModelProviderDefinition {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	iconUrl?: string;
	baseUrl: string;
	apiKeyName: string;
	enabled: boolean;
	builtIn?: boolean;
	/** Heavy local runtimes are persisted for future support but hidden from media-service Features. */
	runtime?: ModelProviderRuntime;
	/** Native AI SDK package metadata or the generic OpenAI-compatible fallback. */
	transport?: "ai-sdk" | "openai-compatible";
	models: ModelDefinition[];
}

export function supportsFeatureService(provider: ModelProviderDefinition) {
	return provider.runtime !== "local-heavy";
}

export interface NewModelProviderInput {
	id: string;
	name?: string;
	description?: string;
	/** Built-in icon id; custom OpenAI-compatible providers default to "openai". */
	icon?: string;
	baseUrl?: string;
	apiKey?: string;
}

export interface NewModelInput {
	id: string;
	name?: string;
	apiType: ModelApiType;
	contextSize?: number;
	iconUrl?: string;
	capabilities?: ModelCapabilities;
	pricing?: ModelPricing;
	knowledgeCutoff?: string;
}


src/features/Request/provider/shared/model-catalog.ts

import type { ModelProviderDefinition } from "./legacy-model-catalog";
import { providerIconUrl } from "./provider-icons";

function nativeProvider(
	id: string,
	name: string,
	description: string,
	baseUrl = "",
): ModelProviderDefinition {
	return {
		id,
		name,
		description,
		icon: id,
		iconUrl: providerIconUrl(id),
		baseUrl,
		apiKeyName: `${id.replace(/-/g, "_")}_API_KEY`,
		enabled: false,
		builtIn: true,
		runtime: "remote",
		transport: "ai-sdk",
		models: [],
	};
}

export const builtinModelProviders: ModelProviderDefinition[] = [
	{
		...nativeProvider(
			"openai",
			"OpenAI",
			"OpenAI 官方 AI SDK Provider。",
			"https://api.openai.com/v1",
		),
		enabled: true,
		models: [
			{
				id: "gpt-4o",
				name: "GPT-4o",
				apiType: "chat",
				contextSize: 128000,
				enabled: true,
			},
			{
				id: "gpt-4o-mini",
				name: "GPT-4o mini",
				apiType: "chat",
				contextSize: 128000,
				enabled: true,
			},
			{
				id: "text-embedding-3-small",
				name: "Text Embedding 3 Small",
				apiType: "embedding",
				enabled: true,
			},
			{
				id: "gpt-image-2",
				name: "GPT Image 2",
				apiType: "image",
				enabled: false,
			},
			{
				id: "gpt-4o-mini-tts",
				name: "GPT-4o mini TTS",
				apiType: "tts",
				enabled: false,
			},
			{ id: "whisper-1", name: "Whisper", apiType: "asr", enabled: false },
		],
	},
	{
		id: "huggingface",
		name: "Hugging Face",
		description: "Inference Providers 图片服务。",
		icon: "huggingface",
		iconUrl: providerIconUrl("huggingface"),
		baseUrl: "https://router.huggingface.co",
		apiKeyName: "huggingface_API_KEY",
		enabled: false,
		builtIn: true,
		runtime: "remote",
		models: [
			{
				id: "black-forest-labs/FLUX.1-dev",
				name: "FLUX.1 dev",
				apiType: "image",
				enabled: true,
			},
			{
				id: "black-forest-labs/FLUX.1-schnell",
				name: "FLUX.1 schnell",
				apiType: "image",
				enabled: true,
			},
			{
				id: "stabilityai/stable-diffusion-xl-base-1.0",
				name: "Stable Diffusion XL Base 1.0",
				apiType: "image",
				enabled: true,
			},
		],
	},
	{
		...nativeProvider(
			"deepseek",
			"DeepSeek",
			"DeepSeek 官方 AI SDK Provider，支持结构化 reasoning 流。",
			"https://api.deepseek.com",
		),
		models: [
			{
				id: "deepseek-v4-flash",
				name: "DeepSeek V4 Flash",
				apiType: "chat",
				contextSize: 64000,
				enabled: true,
			},
			{
				id: "deepseek-v4-pro",
				name: "DeepSeek V4 Pro",
				apiType: "chat",
				contextSize: 64000,
				enabled: true,
			},
		],
	},
	nativeProvider("xai", "xAI Grok", "xAI Grok 官方 AI SDK Provider。"),
	nativeProvider(
		"azure",
		"Azure OpenAI",
		"Azure OpenAI 官方 AI SDK Provider。",
	),
	nativeProvider("anthropic", "Anthropic", "Anthropic 官方 AI SDK Provider。"),
	nativeProvider(
		"amazon-bedrock",
		"Amazon Bedrock",
		"Amazon Bedrock 官方 AI SDK Provider。",
	),
	nativeProvider("google", "Google", "Google Gemini 官方 AI SDK Provider。"),
	nativeProvider("mistral", "Mistral", "Mistral 官方 AI SDK Provider。"),
	nativeProvider(
		"togetherai",
		"Together.ai",
		"Together.ai 官方 AI SDK Provider。",
	),
	nativeProvider("cohere", "Cohere", "Cohere 官方 AI SDK Provider。"),
	nativeProvider("fireworks", "Fireworks", "Fireworks 官方 AI SDK Provider。"),
	nativeProvider("deepinfra", "DeepInfra", "DeepInfra 官方 AI SDK Provider。"),
	nativeProvider("cerebras", "Cerebras", "Cerebras 官方 AI SDK Provider。"),
	nativeProvider("groq", "Groq", "Groq 官方 AI SDK Provider。"),
	nativeProvider(
		"perplexity",
		"Perplexity",
		"Perplexity 官方 AI SDK Provider。",
	),
	nativeProvider(
		"elevenlabs",
		"ElevenLabs",
		"ElevenLabs 官方 AI SDK Provider。",
	),
	nativeProvider("lmnt", "LMNT", "LMNT 官方 AI SDK Provider。"),
	nativeProvider("hume", "Hume", "Hume 官方 AI SDK Provider。"),
	nativeProvider("revai", "Rev.ai", "Rev.ai 官方 AI SDK Provider。"),
	nativeProvider("deepgram", "Deepgram", "Deepgram 官方 AI SDK Provider。"),
	nativeProvider("gladia", "Gladia", "Gladia 官方 AI SDK Provider。"),
	nativeProvider(
		"assemblyai",
		"AssemblyAI",
		"AssemblyAI 官方 AI SDK Provider。",
	),
	nativeProvider("baseten", "Baseten", "Baseten 官方 AI SDK Provider。"),
];


src/features/Request/provider/shared/model-reference.ts

export type ReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";
export type ThinkingLevel = "auto" | ReasoningEffort;

export const thinkingLevelOptions = [
	{ value: "auto", label: "自动" },
	{ value: "none", label: "关闭" },
	{ value: "minimal", label: "最小" },
	{ value: "low", label: "低" },
	{ value: "medium", label: "中" },
	{ value: "high", label: "高" },
	{ value: "xhigh", label: "超高" },
] as const satisfies ReadonlyArray<{ value: ThinkingLevel; label: string }>;

const reasoningEfforts = new Set<ReasoningEffort>(
	thinkingLevelOptions
		.map((option) => option.value)
		.filter((value): value is ReasoningEffort => value !== "auto"),
);

export interface ParsedModelReference {
	providerId: string;
	modelId: string;
	thinkingLevel: ThinkingLevel;
	reasoning?: ReasoningEffort;
}

export function parseModelReference(reference: string): ParsedModelReference {
	const [providerId = "", ...segments] = reference.trim().split("/");
	const possibleReasoning = segments[segments.length - 1] as
		| ReasoningEffort
		| undefined;
	const reasoning =
		possibleReasoning && reasoningEfforts.has(possibleReasoning)
			? possibleReasoning
			: undefined;
	if (reasoning) segments.pop();
	return {
		providerId,
		modelId: segments.join("/"),
		thinkingLevel: reasoning ?? "auto",
		...(reasoning ? { reasoning } : {}),
	};
}

export function createModelReference(
	providerId: string,
	modelId: string,
	thinkingLevel: ThinkingLevel = "auto",
) {
	const base = `${providerId}/${modelId}`;
	return thinkingLevel === "auto" ? base : `${base}/${thinkingLevel}`;
}

export function thinkingLevelLabel(level: ThinkingLevel) {
	return (
		thinkingLevelOptions.find((option) => option.value === level)?.label ??
		"自动"
	);
}


src/features/Request/provider/shared/native-ai.ts

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAssemblyAI } from "@ai-sdk/assemblyai";
import { createAzure } from "@ai-sdk/azure";
import { createBaseten } from "@ai-sdk/baseten";
import { createCerebras } from "@ai-sdk/cerebras";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepgram } from "@ai-sdk/deepgram";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createElevenLabs } from "@ai-sdk/elevenlabs";
import { createFireworks } from "@ai-sdk/fireworks";
import { createGladia } from "@ai-sdk/gladia";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createHume } from "@ai-sdk/hume";
import { createLMNT } from "@ai-sdk/lmnt";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createRevai } from "@ai-sdk/revai";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import type {
	generateImage as baseGenerateImage,
	EmbeddingModel,
	ImageModel,
	LanguageModel,
	SpeechModel,
	TranscriptionModel,
} from "ai";
import { modelProxyFetch } from "./custom-fetch";
import { HuggingFaceImageModel } from "./huggingface-image-model";

export type HydratableModel =
	| string
	| LanguageModel
	| ImageModel
	| EmbeddingModel
	| TranscriptionModel
	| SpeechModel;
export type ModelKind = "chat" | "image" | "embedding" | "asr" | "tts";
export type GenerateImageResult = Awaited<ReturnType<typeof baseGenerateImage>>;

interface ProviderHydrationConfig {
	baseURL: string;
	apiKeyName: string;
	kindMap: Partial<
		Record<
			ModelKind,
			"default" | "chat" | "image" | "embedding" | "transcription" | "speech"
		>
	>;
}

type ProviderFactory = { [name: string]: unknown } & ((
	modelId: string,
) => unknown);
type ProviderBuilder = (
	config: ProviderHydrationConfig,
) => Record<string, (modelId: string) => unknown>;

function createNativeProviderBuilder(
	createProvider: unknown,
	extraSettings?: (config: ProviderHydrationConfig) => Record<string, unknown>,
): ProviderBuilder {
	return (config) => {
		const provider = (
			createProvider as (settings: Record<string, unknown>) => ProviderFactory
		)({
			apiKey: `<<${config.apiKeyName}>>`,
			...(config.baseURL ? { baseURL: config.baseURL } : {}),
			fetch: modelProxyFetch,
			...extraSettings?.(config),
		});
		const create =
			(...names: string[]) =>
			(modelId: string) => {
				for (const name of names) {
					const factory = provider[name];
					if (typeof factory === "function") {
						return factory.call(provider, modelId);
					}
				}
				if (typeof provider === "function") {
					return provider(modelId);
				}
				throw new Error(`Provider does not implement ${names.join(" / ")}.`);
			};

		return {
			default: create("languageModel", "chat", "chatModel"),
			chat: create("chat", "chatModel", "languageModel"),
			image: create("image", "imageModel"),
			embedding: create("embedding", "embeddingModel", "textEmbeddingModel"),
			transcription: create("transcription", "transcriptionModel"),
			speech: create("speech", "speechModel"),
		};
	};
}

const nativeProviderBuilders: Record<string, ProviderBuilder> = {
	openai: createNativeProviderBuilder(createOpenAI),
	azure: createNativeProviderBuilder(createAzure),
	anthropic: createNativeProviderBuilder(createAnthropic),
	"amazon-bedrock": createNativeProviderBuilder(createAmazonBedrock),
	google: createNativeProviderBuilder(createGoogle),
	mistral: createNativeProviderBuilder(createMistral),
	togetherai: createNativeProviderBuilder(createTogetherAI),
	cohere: createNativeProviderBuilder(createCohere),
	fireworks: createNativeProviderBuilder(createFireworks),
	deepinfra: createNativeProviderBuilder(createDeepInfra),
	deepseek: createNativeProviderBuilder(createDeepSeek),
	cerebras: createNativeProviderBuilder(createCerebras),
	groq: createNativeProviderBuilder(createGroq),
	perplexity: createNativeProviderBuilder(createPerplexity),
	elevenlabs: createNativeProviderBuilder(createElevenLabs),
	lmnt: createNativeProviderBuilder(createLMNT),
	hume: createNativeProviderBuilder(createHume),
	revai: createNativeProviderBuilder(createRevai),
	deepgram: createNativeProviderBuilder(createDeepgram),
	gladia: createNativeProviderBuilder(createGladia),
	assemblyai: createNativeProviderBuilder(createAssemblyAI),
	baseten: createNativeProviderBuilder(createBaseten),
	xai: createNativeProviderBuilder(createXai),
};

const providerConfigs: Record<string, ProviderHydrationConfig> = {
	openai: {
		baseURL: "https://api.openai.com/v1",
		apiKeyName: "openai_API_KEY",
		kindMap: {
			chat: "chat",
			image: "image",
			embedding: "embedding",
			asr: "transcription",
			tts: "speech",
		},
	},
	deepseek: {
		baseURL: "https://api.deepseek.com",
		apiKeyName: "deepseek_API_KEY",
		kindMap: { chat: "chat" },
	},
};

const providerBuilders: Record<string, ProviderBuilder> = {
	...nativeProviderBuilders,
	huggingface: (config) => ({
		image: (modelId: string) =>
			new HuggingFaceImageModel(modelId, config.apiKeyName, config.baseURL),
	}),
};

export function registerProviderHydration(provider: {
	id: string;
	baseUrl: string;
	apiKeyName: string;
	transport?: "ai-sdk" | "openai-compatible";
}) {
	const builder =
		provider.transport === "ai-sdk"
			? nativeProviderBuilders[provider.id]
			: undefined;
	if (builder) {
		providerConfigs[provider.id] = {
			baseURL: provider.baseUrl,
			apiKeyName: provider.apiKeyName,
			kindMap: {
				chat: "chat",
				image: "image",
				embedding: "embedding",
				asr: "transcription",
				tts: "speech",
			},
		};
		providerBuilders[provider.id] = builder;
		return;
	}

	registerOpenAICompatibleProvider(
		provider.id,
		provider.baseUrl,
		provider.apiKeyName,
	);
}

function registerOpenAICompatibleProvider(
	providerId: string,
	baseURL: string,
	apiKeyName: string,
) {
	if (providerId === "huggingface") {
		providerConfigs[providerId] = {
			baseURL,
			apiKeyName,
			kindMap: { image: "image" },
		};
		providerBuilders[providerId] = providerBuilders.huggingface;
		return;
	}
	providerConfigs[providerId] = {
		baseURL,
		apiKeyName,
		kindMap: {
			chat: "chat",
			image: "image",
			embedding: "embedding",
			asr: "transcription",
			tts: "speech",
		},
	};
	providerBuilders[providerId] = createNativeProviderBuilder(
		createOpenAICompatible,
		() => ({ name: providerId }),
	);
}

export function unregisterProviderHydration(providerId: string) {
	if (nativeProviderBuilders[providerId] || providerId === "huggingface")
		return;
	delete providerConfigs[providerId];
	delete providerBuilders[providerId];
}

export function hydrateModel(model: HydratableModel, kind: ModelKind = "chat") {
	if (typeof model !== "string") return model;

	const [providerId = "", ...modelSegments] = model.split("/");
	const modelId = modelSegments.join("/");
	const config = providerConfigs[providerId];
	const builder = providerBuilders[providerId];
	if (!providerId || !modelId || !config || !builder) {
		throw new Error(`Unknown model reference: ${model}`);
	}

	const factory = builder(config)[config.kindMap[kind] ?? "default"];
	if (!factory)
		throw new Error(`Provider ${providerId} does not support ${kind} models.`);
	return factory(modelId);
}


src/features/Request/provider/shared/provider-icons.ts

import { computed, ref } from "vue";

const iconModules = import.meta.glob("./icons/{dark,light}/*.png", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

export type ProviderIconVariant = "dark" | "light";

const providerIcons: Record<ProviderIconVariant, Map<string, string>> = {
	dark: new Map(),
	light: new Map(),
};

for (const [path, url] of Object.entries(iconModules)) {
	const match = /[/\\](dark|light)[/\\]([^/\\]+)\.png$/.exec(path);
	if (match) {
		providerIcons[match[1] as ProviderIconVariant].set(match[2], url);
	}
}

/** OpenAI comes first as the default icon for custom providers; the rest stay alphabetical. */
export const providerIconIds: string[] = [
	"openai",
	...[...providerIcons.light.keys()].filter((id) => id !== "openai").sort(),
];

const isDarkTheme = ref(false);
if (typeof document !== "undefined") {
	isDarkTheme.value = document.documentElement.classList.contains("dark");
	if (typeof MutationObserver !== "undefined") {
		new MutationObserver(() => {
			isDarkTheme.value = document.documentElement.classList.contains("dark");
		}).observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
	}
}

/** Tracks the applied root theme so mono icons can follow light/dark reactively. */
export function useProviderIconVariant() {
	return computed<ProviderIconVariant>(() =>
		isDarkTheme.value ? "dark" : "light",
	);
}

function currentVariant(): ProviderIconVariant {
	return typeof document !== "undefined" &&
		document.documentElement.classList.contains("dark")
		? "dark"
		: "light";
}

export function providerIconUrl(
	providerId?: string,
	fallbackUrl?: string,
	variant: ProviderIconVariant = currentVariant(),
): string {
	const id = providerId?.trim().toLowerCase();
	if (id) {
		const iconUrl = providerIcons[variant].get(id);
		if (iconUrl) {
			return iconUrl;
		}
	}
	return fallbackUrl ?? "";
}


src/features/Request/provider/shared/registration.ts

import type { Component } from "vue";
import type { Provider } from "../../types";

export interface ProviderRegistration {
	provider: Provider;
	functions?: Record<string, Function>;
	components?: Record<string, Component>;
}


src/features/Request/provider/shared/service-provider.ts

export interface ServiceProviderView {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	iconUrl?: string;
	enabled: boolean;
	source: "model" | "feature";
}


src/features/Request/provider/stability/client.ts

import { modelProxyFetch } from "../shared/custom-fetch";
import type { GeneratedImage } from "../shared/image";

const STABILITY_API_KEY_NAME = "stability_API_KEY";
const paths: Record<string, string> = {
	"stable-image-ultra": "/v2beta/stable-image/generate/ultra",
	"stable-image-core": "/v2beta/stable-image/generate/core",
	"stable-diffusion-3": "/v2beta/stable-image/generate/sd3",
};

type StabilitySettings = {
	baseUrl: string;
	aspectRatio: string;
	outputFormat: "png" | "jpeg" | "webp";
	negativePrompt: string;
	stylePreset: string;
};

export async function generateStabilityImages(options: {
	prompt: string;
	settings: StabilitySettings;
	model: string;
	count?: number;
	seed?: number;
	signal?: AbortSignal;
}) {
	const images: GeneratedImage[] = [];
	const count = Math.min(4, Math.max(1, Math.trunc(options.count ?? 1)));
	for (let index = 0; index < count; index += 1) {
		const form = new FormData();
		form.set("prompt", options.prompt.trim().slice(0, 10000));
		if (options.settings.negativePrompt.trim())
			form.set(
				"negative_prompt",
				options.settings.negativePrompt.trim().slice(0, 10000),
			);
		form.set("aspect_ratio", options.settings.aspectRatio);
		form.set("output_format", options.settings.outputFormat);
		if (options.settings.stylePreset)
			form.set("style_preset", options.settings.stylePreset);
		if (options.seed != null && Number.isFinite(options.seed))
			form.set("seed", String(Math.max(0, Math.trunc(options.seed)) + index));
		if (options.model === "stable-diffusion-3")
			form.set("model", "sd3.5-large");

		const baseUrl = options.settings.baseUrl.trim().replace(/\/+$/, "");
		const response = await modelProxyFetch(
			`${baseUrl}${paths[options.model]}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer <<${STABILITY_API_KEY_NAME}>>`,
					Accept: "image/*",
				},
				body: form,
				signal: options.signal,
			},
		);
		if (!response.ok)
			throw new Error(
				`Stability 请求失败 (${response.status})：${(await response.text()).slice(0, 300)}`,
			);
		const bytes = new Uint8Array(await response.arrayBuffer());
		const mediaType =
			response.headers.get("content-type") ||
			`image/${options.settings.outputFormat}`;
		images.push(binaryImage(bytes, mediaType));
	}
	return { images };
}

function binaryImage(bytes: Uint8Array, mediaType: string): GeneratedImage {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	return { base64: btoa(binary), mediaType, uint8Array: bytes };
}


src/features/Request/provider/stability/index.ts

import type { GenerateImageResult } from "../../ai-sdk";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { generateStabilityImages } from "./client";

const models = [
	{ id: "stable-image-ultra", name: "Stable Image Ultra" },
	{ id: "stable-image-core", name: "Stable Image Core" },
	{ id: "stable-diffusion-3", name: "Stable Diffusion 3 / 3.5" },
];

async function generateImage({
	modelId,
	options,
}: {
	modelId?: string;
	options: Record<string, unknown>;
}) {
	const result = await generateStabilityImages({
		prompt: text(options.prompt),
		settings: options as any,
		model: modelId as any,
		count: number(options.n),
		seed: number(options.seed),
		signal: options.abortSignal as AbortSignal | undefined,
	});
	return imageResult(result.images, { stability: { model: modelId } });
}
export const stability: ProviderRegistration = {
	provider: {
		id: "stability",
		name: "Stability AI",
		description: "Stability 图片生成 API。",
		icon: "stability",
		enabled: false,
		params: {
			basic: [
				param("baseUrl", "https://api.stability.ai", "API 地址"),
				secret("stability_API_KEY", "API Key"),
			],
			text: [],
			image: [
				param("aspectRatio", "2:3", "宽高比", true),
				param("outputFormat", "png", "输出格式"),
				param("negativePrompt", "", "反向提示词", true),
				param("stylePreset", "", "风格预设"),
			],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: {
			...emptyModels(),
			image: models.map((item) => ({
				id: item.id,
				displayName: item.name,
				enabled: true,
			})),
		},
		requestOverride: { generateImage: "stabilityGenerateImage" },
	},
	functions: { stabilityGenerateImage: generateImage },
};
function text(value: unknown) {
	const result = typeof value === "string" ? value.trim() : "";
	if (!result) throw new Error("Stability 提示词不能为空。");
	return result;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function imageResult(
	images: GenerateImageResult["images"],
	providerMetadata: Record<string, unknown>,
): GenerateImageResult {
	return {
		image: images[0]!,
		images,
		calls: [],
		warnings: [],
		responses: [],
		providerMetadata:
			providerMetadata as GenerateImageResult["providerMetadata"],
		usage: {
			inputTokens: undefined,
			outputTokens: undefined,
			totalTokens: undefined,
		},
	};
}


src/features/Request/provider/volcengine-tts/client.ts

import { modelProxyFetch } from "../shared/custom-fetch";

export const VOLCENGINE_TTS_APP_ID_SECRET = "volcengine_TTS_APP_ID";
export const VOLCENGINE_TTS_ACCESS_KEY_SECRET = "volcengine_TTS_ACCESS_KEY";
export const VOLCENGINE_TTS_ENDPOINT =
	"https://openspeech.bytedance.com/api/v1/tts";

export interface VolcengineTtsGenerateOptions {
	text: string;
	resourceId: string;
	speakerId: string;
	sampleRate?: number;
	contextText?: string;
	signal?: AbortSignal;
}

interface VolcengineChunk {
	code?: number | string;
	message?: string;
	data?: string;
}

export async function synthesizeWithVolcengineTts(
	options: VolcengineTtsGenerateOptions,
) {
	const text = options.text.trim();
	const resourceId = options.resourceId.trim();
	const speakerId = options.speakerId.trim();
	if (!text) throw new Error("豆包语音合成文本不能为空。");
	if (!resourceId) throw new Error("请填写豆包语音 Resource ID。");
	if (!speakerId) throw new Error("请填写豆包语音 Speaker ID。");
	options.signal?.throwIfAborted();

	const additions = options.contextText?.trim()
		? { context_texts: [options.contextText.trim()] }
		: {};
	const response = await modelProxyFetch(VOLCENGINE_TTS_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Api-App-Key": `<<${VOLCENGINE_TTS_APP_ID_SECRET}>>`,
			"X-Api-Access-Key": `<<${VOLCENGINE_TTS_ACCESS_KEY_SECRET}>>`,
			"X-Api-Resource-Id": resourceId,
		},
		body: JSON.stringify({
			user: { uid: `pulsar_${crypto.randomUUID()}` },
			req_params: {
				text,
				speaker: speakerId,
				audio_params: {
					format: "mp3",
					sample_rate: options.sampleRate ?? 24000,
				},
				additions: JSON.stringify(additions),
			},
		}),
		signal: options.signal,
	});
	options.signal?.throwIfAborted();

	const responseText = await response.text();
	if (!response.ok) {
		throw new Error(
			`豆包语音请求失败 (${response.status})${responseText.trim() ? `：${responseText.trim().slice(0, 240)}` : ""}`,
		);
	}

	const chunks = parseChunkedJson(responseText);
	const audioBase64 = chunks
		.flatMap((chunk) => (chunk.data ? [chunk.data] : []))
		.join("");
	if (!audioBase64) throw new Error("豆包语音响应中没有音频数据。");

	const binary = atob(audioBase64);
	const audio = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	return {
		audio,
		mediaType: "audio/mpeg",
		chunkCount: chunks.filter((chunk) => Boolean(chunk.data)).length,
	};
}

function parseChunkedJson(value: string): VolcengineChunk[] {
	const lines = value
		.split(/\r?\n/)
		.map((line) => line.trim().replace(/^data:\s*/, ""))
		.filter(Boolean);
	const chunks: VolcengineChunk[] = [];
	for (const line of lines) {
		let chunk: VolcengineChunk;
		try {
			chunk = JSON.parse(line) as VolcengineChunk;
		} catch {
			throw new Error("豆包语音返回了无法解析的流式 JSON。");
		}
		const code = chunk.code == null ? 0 : Number(chunk.code);
		if (Number.isFinite(code) && code !== 0 && code !== 20000000) {
			throw new Error(
				`豆包语音返回异常 [${chunk.code}]${chunk.message ? `：${chunk.message}` : ""}`,
			);
		}
		chunks.push(chunk);
	}
	return chunks;
}


src/features/Request/provider/volcengine-tts/index.ts

import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { synthesizeWithVolcengineTts } from "./client";

function model(modelId: string): SpeechModelV4 {
	return {
		specificationVersion: "v4",
		provider: "volcengine-tts",
		modelId,
		async doGenerate(options) {
			const value = options.providerOptions?.volcengineTts as
				| Record<string, unknown>
				| undefined;
			const result = await synthesizeWithVolcengineTts({
				text: options.text,
				resourceId: string(value?.resourceId) ?? modelId,
				speakerId: string(value?.speakerId) ?? options.voice ?? "",
				sampleRate: number(value?.sampleRate),
				contextText: string(value?.contextText) ?? options.instructions,
				signal: options.abortSignal,
			});
			return resultFor(modelId, result.audio, {
				volcengineTts: {
					audioBytes: result.audio.byteLength,
					chunkCount: result.chunkCount,
				},
			});
		},
	};
}
export const volcengineTts: ProviderRegistration = {
	provider: {
		id: "volcengine-tts",
		name: "豆包语音",
		description: "火山引擎流式语音合成。",
		icon: "volcengine",
		enabled: false,
		params: {
			basic: [
				secret("volcengine_TTS_APP_ID", "App ID"),
				secret("volcengine_TTS_ACCESS_KEY", "Access Key"),
			],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [
				param("volcengineTts.resourceId", "", "Resource ID"),
				param("volcengineTts.speakerId", "", "Speaker ID"),
				param("volcengineTts.sampleRate", 24000, "采样率"),
				param("volcengineTts.contextText", "", "上下文文本"),
			],
		},
		models: {
			...emptyModels(),
			speech: [
				{ id: "seed-tts-2.0", displayName: "Seed TTS 2.0", enabled: true },
			],
		},
		requestOverride: { generateSpeech: "volcengineGenerateSpeech" },
	},
	functions: {
		volcengineGenerateSpeech: ({ modelId, options, native }: any) =>
			native({ ...options, model: model(modelId ?? "") }),
	},
};
function string(value: unknown) {
	return typeof value === "string" ? value : undefined;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function resultFor(
	modelId: string,
	audio: Uint8Array,
	providerMetadata: Record<string, any>,
) {
	return {
		audio,
		warnings: [],
		response: { timestamp: new Date(), modelId },
		providerMetadata,
	};
}


src/features/Request/provider/whisper-candle/client.ts

import { host } from "@/host";

export const WHISPER_CANDLE_PROVIDER_ID = "whisper-candle";

export interface WhisperModelPack {
	id: string;
	version: string;
	sha256: string;
	size: number;
	diskSize: number;
	language?: string;
	runtime: "whisper-candle-core";
}

export type WhisperModelDownloadPack = Omit<WhisperModelPack, "diskSize">;

export interface WhisperTranscription {
	text: string;
	modelId: string;
	language?: string;
}

export function listWhisperModels() {
	return host.local.invoke<WhisperModelPack[]>("stt", "whisper_candle_models");
}

export function downloadWhisperModel(
	pack: WhisperModelDownloadPack,
	url: string,
) {
	return host.local.invoke<WhisperModelPack>("stt", "whisper_candle_download", {
		request: { pack, url },
	});
}

export function deleteWhisperModel(id: string) {
	return host.local.invoke<void>("stt", "whisper_candle_delete", { id });
}

export function transcribeWithWhisper(
	modelId: string,
	audio: Uint8Array,
	language?: string,
) {
	return host.local.invoke<WhisperTranscription>("stt", "transcribe", {
		request: { modelId, audio: Array.from(audio), language },
	});
}


src/features/Request/provider/whisper-candle/index.ts

import { emptyModels, param } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { transcribeWithWhisper } from "./client";
export const whisperCandle: ProviderRegistration = {
	provider: {
		id: "whisper-candle",
		name: "Whisper Candle 本地转写",
		description: "下载的本地 Whisper Candle 模型。",
		enabled: true,
		params: {
			basic: [
				{ ...param("", ""), customBlockComponent: "WhisperModelDownload" },
			],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: emptyModels(),
		requestOverride: { transcribe: "whisperCandleTranscribe" },
	},
	functions: {
		whisperCandleTranscribe: async ({ modelId, options }: any) => {
			if (!(options.audio instanceof Uint8Array))
				throw new Error(
					"Whisper Candle 仅接收 Uint8Array 格式的 WAV PCM 音频。",
				);
			return transcribeWithWhisper(
				modelId ?? "",
				options.audio,
				typeof options.language === "string" ? options.language : undefined,
			);
		},
	},
};


src/features/Request/request-store.ts

import { defineStore } from "pinia";
import {
	remove,
	selectAll,
	upsert,
} from "@/features/Database/database-service";
import { invokeRequestFunction, localRequestProviders } from "./provider";
import type {
	ModelApiType,
	ModelProviderDefinition,
} from "./provider/shared/legacy-model-catalog";
import { builtinModelProviders } from "./provider/shared/model-catalog";
import type {
	ModelDefinition,
	ParamDefinition,
	Provider,
	RequestKind,
} from "./types";

const table = "request_providers";

const kindByApiType: Partial<Record<ModelApiType, RequestKind>> = {
	chat: "text",
	image: "image",
	video: "video",
	tts: "speech",
	asr: "transcribe",
};

function param(paramName: string, value: unknown): ParamDefinition {
	return {
		paramName,
		enableInDefault: false,
		paramComponent: { component: "input", componentParam: {} },
		defaultValue: value,
		value,
	};
}

function emptyModels(): Provider["models"] {
	return { text: [], image: [], video: [], speech: [], transcribe: [] };
}

function fromModelProvider(source: ModelProviderDefinition): Provider {
	const models = emptyModels();
	for (const model of source.models) {
		const kind = kindByApiType[model.apiType];
		if (!kind) continue;
		models[kind].push({
			id: model.id,
			displayName: model.name,
			enabled: model.enabled,
			icon: model.iconUrl,
			extraInfo: {
				...(model.contextSize
					? { contextSize: String(model.contextSize) }
					: {}),
				...(model.knowledgeCutoff
					? { knowledgeCutoff: model.knowledgeCutoff }
					: {}),
			},
		});
	}
	return {
		id: source.id,
		name: source.name,
		description: source.description,
		icon: source.iconUrl ?? source.icon,
		enabled: source.enabled,
		params: {
			basic: [
				param("baseURL", source.baseUrl),
				param("apiKeyName", source.apiKeyName),
			],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models,
		...(source.transport === "openai-compatible"
			? { hydrator: "openai-compatible" }
			: {}),
		requestOverride: {},
	};
}

function cloneBuiltinProviders() {
	return [
		...builtinModelProviders.map(fromModelProvider),
		...structuredClone(localRequestProviders),
	];
}

export const useRequestStore = defineStore("request", {
	state: () => ({
		providers: cloneBuiltinProviders() as Provider[],
		loaded: false,
	}),
	actions: {
		async initialize() {
			if (this.loaded) return;
			const persisted = await selectAll<Provider>(table);
			const byId = new Map(
				this.providers.map((provider) => [provider.id, provider]),
			);
			for (const { value } of persisted) byId.set(value.id, value);
			this.providers = [...byId.values()];
			this.loaded = true;
		},
		provider(id: string) {
			return this.providers.find((provider) => provider.id === id);
		},
		async save(provider: Provider) {
			const index = this.providers.findIndex((item) => item.id === provider.id);
			if (index < 0) this.providers.push(provider);
			else this.providers[index] = provider;
			await upsert(table, provider.id, structuredClone(provider));
		},
		async addProvider(provider: Provider) {
			const id = provider.id.trim();
			if (!id || this.provider(id)) throw new Error("提供商 id 为空或已存在。");
			provider.id = id;
			this.providers.push(provider);
			await this.save(provider);
		},
		async deleteProvider(providerId: string) {
			if (!this.provider(providerId)) return;
			this.providers = this.providers.filter((item) => item.id !== providerId);
			await remove(table, providerId);
		},
		async patchProvider(providerId: string, patch: Partial<Provider>) {
			const provider = this.provider(providerId);
			if (!provider) return;
			Object.assign(provider, patch);
			await this.save(provider);
		},
		async addModel(
			providerId: string,
			kind: RequestKind,
			model: ModelDefinition,
		) {
			const provider = this.provider(providerId);
			if (!provider) return;
			if (provider.models[kind].some((item) => item.id === model.id)) {
				throw new Error("该类型下的模型 id 已存在。");
			}
			provider.models[kind].push(model);
			await this.save(provider);
		},
		async upsertModels(
			providerId: string,
			kind: RequestKind,
			models: ModelDefinition[],
		) {
			const provider = this.provider(providerId);
			if (!provider) return 0;
			let added = 0;
			for (const model of models) {
				const existing = provider.models[kind].find(
					(item) => item.id === model.id,
				);
				if (existing)
					Object.assign(existing, { ...model, enabled: existing.enabled });
				else {
					provider.models[kind].push(model);
					added += 1;
				}
			}
			await this.save(provider);
			return added;
		},
		async removeModel(providerId: string, kind: RequestKind, modelId: string) {
			const provider = this.provider(providerId);
			if (!provider) return;
			provider.models[kind] = provider.models[kind].filter(
				(item) => item.id !== modelId,
			);
			await this.save(provider);
		},
		async refreshModels(providerId: string) {
			const provider = this.provider(providerId);
			if (!provider?.modelGetter) return 0;
			const result = await invokeRequestFunction<
				Partial<Record<RequestKind, ModelDefinition[]>> | ModelDefinition[]
			>(provider.modelGetter, { provider });
			let added = 0;
			if (Array.isArray(result)) {
				added += await this.upsertModels(providerId, "text", result);
			} else {
				for (const kind of [
					"text",
					"image",
					"video",
					"speech",
					"transcribe",
				] as const) {
					if (result[kind])
						added += await this.upsertModels(providerId, kind, result[kind]);
				}
			}
			return added;
		},
		async patchParam(
			providerId: string,
			kind: keyof Provider["params"],
			paramName: string,
			value: unknown,
		) {
			const provider = this.provider(providerId);
			const definition = provider?.params[kind].find(
				(item) => item.paramName === paramName,
			);
			if (!provider || !definition) return;
			definition.value = value;
			await this.save(provider);
		},
	},
});

export function requestKindForApiType(
	apiType: ModelApiType,
): RequestKind | undefined {
	return kindByApiType[apiType];
}

export function requestModels(
	provider: Provider,
	kind: RequestKind,
): ModelDefinition[] {
	return provider.models[kind];
}


src/features/Request/test/params.test.ts

import { describe, expect, it } from "vitest";
import { setParamPath } from "../utils/params";

describe("request parameter paths", () => {
	it("merges compatible prefixes and rejects collisions", () => {
		const target: Record<string, unknown> = {};
		setParamPath(target, "openai.enableWebSearch", true);
		setParamPath(target, "openai.reasoningEffort", "high");
		setParamPath(target, "openai", { textVerbosity: "low" });
		expect(target).toEqual({
			openai: {
				enableWebSearch: true,
				reasoningEffort: "high",
				textVerbosity: "low",
			},
		});
		expect(() => setParamPath(target, "openai", true)).toThrow("重复");
		expect(() =>
			setParamPath(target, "openai.enableWebSearch.foo", true),
		).toThrow("不兼容");
	});
});


src/features/Request/types.ts

import type { Component } from "vue";

export const TOME = Symbol("tome");
export type Tome = typeof TOME;

export type RequestKind = "text" | "image" | "video" | "speech" | "transcribe";
export type ParamGroup = "basic" | RequestKind | "provider";
export type FunctionalString = string;
export type ComponentString = string;
export type BuiltInFunctionKey = string;
export type BuiltInComponentKey = string;
export type RequestValue = unknown;

export type BuiltInFunctions = Map<BuiltInFunctionKey, Function>;
export type BuiltInComponents = Map<BuiltInComponentKey, Component>;

export interface ParamDefinition {
	/** Dot-separated destination below the request object. */
	paramName: string;
	enableInDefault: boolean;
	title?: string;
	description?: string;
	customBlockComponent?: ComponentString | BuiltInComponentKey;
	paramComponent: {
		component: ComponentString | BuiltInComponentKey;
		componentParam: unknown;
	};
	defaultValue: RequestValue;
	value: RequestValue;
	valueChecker?: FunctionalString | BuiltInFunctionKey;
}

export interface ModelDefinition {
	id: string;
	displayName: string;
	enabled: boolean;
	description?: string;
	icon?: string;
	/** Display-only provider metadata. It must never control request routing. */
	extraInfo?: Record<string, string>;
}

export type ProviderHydrator = FunctionalString | BuiltInFunctionKey;

export interface RequestOverride {
	generateText?: FunctionalString | BuiltInFunctionKey;
	streamText?: FunctionalString | BuiltInFunctionKey;
	generateImage?: FunctionalString | BuiltInFunctionKey;
	generateVideo?: FunctionalString | BuiltInFunctionKey;
	generateSpeech?: FunctionalString | BuiltInFunctionKey;
	transcribe?: FunctionalString | BuiltInFunctionKey;
	ToolLoopAgent?: FunctionalString | BuiltInFunctionKey;
}

export interface Provider {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	enabled: boolean;
	params: Record<ParamGroup, ParamDefinition[]>;
	modelGetter?: FunctionalString | BuiltInFunctionKey;
	models: Record<RequestKind, ModelDefinition[]>;
	/** Builds an AI SDK model from this Provider and the selected model id. */
	hydrator?: ProviderHydrator;
	requestOverride: RequestOverride;
}

export type ParamDefinitionPreset = Map<
	string,
	Record<ParamGroup, ParamDefinition[]>
>;

/** Creation-time templates; providers retain their own mutable definitions. */
export const paramDefinitionPreset: ParamDefinitionPreset = new Map();

export interface ModelSelection {
	providerId: string;
	modelId: string;
	kind: RequestKind;
}

export type SpeechBoundaryType = "WordBoundary" | "SentenceBoundary";

export interface TextToSpeechRequest {
	text: string;
	voice?: string;
	rate?: string;
	volume?: string;
	pitch?: string;
	boundary?: SpeechBoundaryType;
}

export interface SpeechBoundary {
	type: SpeechBoundaryType;
	offset: number;
	duration: number;
	text: string;
}

export interface TextToSpeechResult {
	audio: Blob;
	audioBytes: number;
	boundaries: SpeechBoundary[];
}

export interface SpeechVoice {
	name: string;
	shortName: string;
	gender: string;
	locale: string;
	suggestedCodec: string;
	friendlyName: string;
	status: string;
	contentCategories: string[];
	voicePersonalities: string[];
}


src/features/Request/utils/params.ts

import type { ParamDefinition, Provider, RequestKind } from "../types";

const blockedSegments = new Set(["__proto__", "constructor", "prototype"]);

function segments(path: string) {
	const result = path.split(".").map((part) => part.trim());
	if (
		!result.length ||
		result.some((part) => !part || blockedSegments.has(part))
	) {
		throw new Error(`无效的参数访问链：${path}`);
	}
	return result;
}

/** Assigns a value without ever replacing an existing incompatible branch. */
export function setParamPath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
) {
	const parts = segments(path);
	let current = target;
	for (const part of parts.slice(0, -1)) {
		const existing = current[part];
		if (existing === undefined) {
			const next: Record<string, unknown> = {};
			current[part] = next;
			current = next;
			continue;
		}
		if (!isRecord(existing)) {
			throw new Error(`参数 ${path} 与已有参数类型不兼容。`);
		}
		current = existing;
	}
	const key = parts.at(-1)!;
	if (current[key] !== undefined) {
		if (isRecord(current[key]) && isRecord(value)) {
			mergeObject(current[key], value, path);
			return;
		}
		throw new Error(`参数 ${path} 重复。`);
	}
	current[key] = value;
}

export function buildRequestParams(provider: Provider, kind: RequestKind) {
	const params: Record<string, unknown> = {};
	for (const definition of [
		...provider.params.basic,
		...provider.params[kind],
	]) {
		if (!definition.paramName.trim()) continue;
		setParamPath(params, definition.paramName, definition.value);
	}
	const providerOptions: Record<string, unknown> = {};
	for (const definition of provider.params.provider) {
		if (!definition.paramName.trim()) continue;
		setParamPath(providerOptions, definition.paramName, definition.value);
	}
	if (Object.keys(providerOptions).length)
		params.providerOptions = providerOptions;
	return params;
}

export function defaultParam(definition: ParamDefinition) {
	return { ...definition, value: structuredClone(definition.defaultValue) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeObject(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
	path: string,
) {
	for (const [key, value] of Object.entries(source)) {
		if (target[key] === undefined) {
			target[key] = value;
			continue;
		}
		if (isRecord(target[key]) && isRecord(value)) {
			mergeObject(target[key], value, `${path}.${key}`);
			continue;
		}
		throw new Error(`参数 ${path}.${key} 重复或类型不兼容。`);
	}
}


src/features/Tabs/CharacterEntryPage.vue

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Button, TabItem, Tabs, TabsList } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCharacterList } from "@/features/Plugin/dataflow";
import { resolveMediaUrl } from "@/features/Plugin/media/media-link";
import {
	Grid2X2,
	List,
	Plus,
	Search,
	Upload,
	UserRound,
} from "@/lib/phosphor-icons";

const emit = defineEmits<{ open: [localPluginId: string] }>();
const characterList = useCharacterList();
const search = ref("");
const mode = ref<"card" | "list">("card");
const pending = ref<"create" | "import" | null>(null);
const actionError = ref("");
const media = reactive(new Map<string, string>());
const characters = computed(() => {
	const query = search.value.trim().toLocaleLowerCase();
	return [...characterList.characters.value]
		.filter(
			(character) =>
				!query ||
				character.name.toLocaleLowerCase().includes(query) ||
				character.description?.toLocaleLowerCase().includes(query),
		)
		.sort((left, right) => left.name.localeCompare(right.name));
});

watch(
	() =>
		[...characterList.characters.value].flatMap((item) => [
			item.avatarUrl,
			item.coverUrl,
		]),
	async (sources) => {
		for (const source of sources) {
			if (!source || media.has(source)) continue;
			media.set(source, await resolveMediaUrl(source));
		}
	},
	{ immediate: true },
);

async function createCharacter() {
	pending.value = "create";
	actionError.value = "";
	try {
		const character = await characterList.create();
		emit("open", character.id);
	} catch (error) {
		actionError.value = error instanceof Error ? error.message : String(error);
	} finally {
		pending.value = null;
	}
}

async function importCharacter() {
	pending.value = "import";
	actionError.value = "";
	try {
		const character = await characterList.import();
		if (character) emit("open", character.id);
	} catch (error) {
		actionError.value = error instanceof Error ? error.message : String(error);
	} finally {
		pending.value = null;
	}
}
</script>

<template>
  <main class="flex min-h-0 flex-1 flex-col bg-background">
    <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-6 py-5 mobile:px-3 mobile:py-3">
      <div class="relative min-w-44 flex-1"><Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-10 pl-9" placeholder="搜索角色…" /></div>
      <Tabs v-model="mode" size="compact" aria-label="角色视图">
        <TabsList>
          <TabItem value="card" title="卡片视图"><Grid2X2 /></TabItem>
          <TabItem value="list" title="列表视图"><List /></TabItem>
        </TabsList>
      </Tabs>
      <Button variant="outline" :disabled="pending !== null" @click="importCharacter"><Upload class="size-4" />{{ pending === 'import' ? '导入中…' : '导入角色' }}</Button>
      <Button :disabled="pending !== null" @click="createCharacter"><Plus class="size-4" />{{ pending === 'create' ? '创建中…' : '新建角色' }}</Button>
      </div>
    <p v-if="actionError" class="mx-auto mb-3 w-full max-w-6xl px-6 text-sm text-destructive mobile:px-3">{{ actionError }}</p>
    <ScrollArea class="min-h-0 flex-1"><div class="mx-auto w-full max-w-6xl px-6 pb-10 mobile:px-3">
      <div v-if="characters.length" :class="mode === 'card' ? 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 mobile:grid-cols-1' : 'flex flex-col gap-2'">
        <button v-for="character in characters" :key="character.id" type="button" class="group overflow-hidden rounded-xl bg-muted/25 text-left transition-colors hover:bg-muted/55" :class="mode === 'card' ? 'min-h-52' : 'flex min-h-20 items-center gap-3 p-3'" @click="emit('open', character.id)">
          <template v-if="mode === 'card'"><div class="relative h-28 overflow-hidden bg-muted"><img v-if="character.coverUrl" :src="media.get(character.coverUrl) ?? character.coverUrl" :alt="character.name" class="size-full object-cover transition-transform group-hover:scale-[1.02]" /><UserRound v-else class="absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" /></div><div class="flex items-start gap-3 p-4"><div class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted"><img v-if="character.avatarUrl" :src="media.get(character.avatarUrl) ?? character.avatarUrl" :alt="character.name" class="size-full object-cover" /><UserRound v-else class="size-5 text-muted-foreground" /></div><div class="min-w-0"><h2 class="truncate font-medium">{{ character.name }}</h2><p class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{{ character.description || '暂无角色描述' }}</p></div></div></template>
          <template v-else><div class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-muted"><img v-if="character.avatarUrl" :src="media.get(character.avatarUrl) ?? character.avatarUrl" :alt="character.name" class="size-full object-cover" /><UserRound v-else class="size-5 text-muted-foreground" /></div><div class="min-w-0 flex-1"><h2 class="truncate font-medium">{{ character.name }}</h2><p class="mt-1 truncate text-xs text-muted-foreground">{{ character.description || '暂无角色描述' }}</p></div></template>
        </button>
      </div>
      <div v-else class="grid min-h-64 place-items-center p-8 text-center"><div><UserRound class="mx-auto size-9 text-muted-foreground" /><p class="mt-3 text-sm font-medium">{{ search ? '没有匹配的角色' : '还没有角色' }}</p><p class="mt-1 text-xs text-muted-foreground">{{ search ? '尝试其他关键词。' : '新建角色或导入资源包后即可开始。' }}</p><Button v-if="!search" class="mt-4" size="sm" :disabled="pending !== null" @click="createCharacter"><Plus class="size-4" />新建角色</Button></div></div>
    </div></ScrollArea>
  </main>
</template>


src/features/Tabs/store.ts

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";

export type Tab = { type: "chat"; id: string } | { type: "home"; id: string };
export type OpenTab = { type: "chat"; contentid: string } | { type: "home" };
export type TabView = Tab & {
	name: string;
	icon?: "message-circle" | "layout-grid";
	localPluginId?: string;
};

function indexOf(tabs: Tab[], target: string | number) {
	return typeof target === "number"
		? target
		: tabs.findIndex((tab) => tab.id === target);
}

/** UI view lifetime only; records remain owned and persisted by dbsync. */
export const useTabsStore = defineStore("tabs", () => {
	const tabs = ref<Tab[]>([]);
	const activeId = ref<string | null>(null);
	const sync = useSyncStore();
	const pendingUnloads = new Map<string, ReturnType<typeof setTimeout>>();
	const activeTab = computed(
		() => tabs.value.find((tab) => tab.id === activeId.value) ?? null,
	);
	const views = computed<TabView[]>(() =>
		tabs.value.map((tab) => {
			if (tab.type === "home")
				return { ...tab, name: "角色", icon: "layout-grid" };
			const chat = [...sync.chatMeta.values()]
				.map((chats) => chats.get(tab.id))
				.find(Boolean);
			return {
				...tab,
				name: chat?.title ?? "加载中…",
				icon: "message-circle",
				localPluginId: chat?.localPluginId,
			};
		}),
	);

	async function open(input: OpenTab) {
		if (input.type === "home") {
			const id = `home:${crypto.randomUUID()}`;
			tabs.value.push({ type: "home", id });
			activeId.value = id;
			return;
		}
		const id = input.contentid;
		const pending = pendingUnloads.get(id);
		if (pending) {
			clearTimeout(pending);
			pendingUnloads.delete(id);
		}
		await sync.load({ type: "chat", id });
		if (!tabs.value.some((tab) => tab.id === id))
			tabs.value.push({ type: "chat", id });
		activeId.value = id;
	}

	function close(target: string | number) {
		const index = indexOf(tabs.value, target);
		if (index < 0) return;
		const [tab] = tabs.value.splice(index, 1);
		if (!tab) return;
		if (activeId.value === tab.id)
			activeId.value =
				tabs.value[index]?.id ?? tabs.value[index - 1]?.id ?? null;
		if (tab.type !== "chat") return;
		pendingUnloads.set(
			tab.id,
			setTimeout(() => {
				pendingUnloads.delete(tab.id);
				if (!tabs.value.some((item) => item.id === tab.id))
					void sync.unload({ type: "chat", id: tab.id });
			}, 300),
		);
	}

	function closeRange(
		target: string | number,
		predicate: (index: number, targetIndex: number) => boolean,
	) {
		const targetIndex = indexOf(tabs.value, target);
		if (targetIndex < 0) return;
		for (const tab of tabs.value.filter((_, index) =>
			predicate(index, targetIndex),
		))
			close(tab.id);
	}

	function closeOthers(target: string | number) {
		closeRange(target, (index, targetIndex) => index !== targetIndex);
	}
	function closeLeft(target: string | number) {
		closeRange(target, (index, targetIndex) => index < targetIndex);
	}
	function closeRight(target: string | number) {
		closeRange(target, (index, targetIndex) => index > targetIndex);
	}
	async function reload(target: string | number) {
		const tab = tabs.value[indexOf(tabs.value, target)];
		if (tab?.type !== "chat") return;
		await sync.unload({ type: "chat", id: tab.id });
		await sync.load({ type: "chat", id: tab.id });
	}

	function reorder(fromIndex: number, toIndex: number) {
		if (
			fromIndex < 0 ||
			toIndex < 0 ||
			fromIndex >= tabs.value.length ||
			toIndex >= tabs.value.length ||
			fromIndex === toIndex
		)
			return;
		const [tab] = tabs.value.splice(fromIndex, 1);
		if (tab) tabs.value.splice(toIndex, 0, tab);
	}

	function active(target: string | number) {
		const tab = tabs.value[indexOf(tabs.value, target)];
		if (tab) activeId.value = tab.id;
	}

	return {
		tabs,
		activeId,
		activeTab,
		views,
		open,
		close,
		closeOthers,
		closeLeft,
		closeRight,
		reload,
		reorder,
		active,
	};
});


src/features/Tabs/subWindow/sub-window-protocol.ts

export type SubWindowMode = "normal" | "simplified";

export type SubWindowTarget =
	| {
			type: "resource";
			resourceType: string;
			resourceId: string;
			localPluginId?: string;
			title?: string;
			resourceParams?: Record<string, unknown>;
	  }
	| {
			type: "builtin";
			resourceId: string;
			title?: string;
			resourceParams?: Record<string, unknown>;
	  }
	| {
			type: "component";
			componentId: string;
			title?: string;
			props?: Record<string, unknown>;
	  };

export type SubWindowParams = {
	label: string;
	mode: SubWindowMode;
	target: SubWindowTarget;
	hidden?: boolean;
	loadMode?: "immediate" | "on-visible";
	title?: string;
};

export type SubWindowBridgeMessage = {
	id: string;
	channel: string;
	payload: unknown;
	sourceLabel: string;
	targetLabel?: string;
};

export function createSubWindowLabel(target: SubWindowTarget) {
	const id =
		target.type === "resource"
			? `${target.resourceType}-${target.resourceId}`
			: target.type === "builtin"
				? `builtin-${target.resourceId}`
				: `component-${target.componentId}`;
	return `pulsarai-${id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function encodeSubWindowParams(params: SubWindowParams) {
	return encodeURIComponent(JSON.stringify(params));
}

export function decodeSubWindowParams(
	value: string | null,
): SubWindowParams | null {
	if (!value) {
		return null;
	}
	try {
		return JSON.parse(decodeURIComponent(value)) as SubWindowParams;
	} catch {
		return null;
	}
}

export function readSubWindowParamsFromLocation(
	location: Location = window.location,
) {
	return decodeSubWindowParams(
		new URL(location.href).searchParams.get("subwindow"),
	);
}

export function shouldCreateSubWindow(params: SubWindowParams) {
	return !(params.hidden && params.loadMode === "on-visible");
}


src/features/Tabs/subWindow/sub-window-service.ts

import { host } from "@/host";
import {
	createSubWindowLabel,
	encodeSubWindowParams,
	type SubWindowBridgeMessage,
	type SubWindowParams,
	type SubWindowTarget,
	shouldCreateSubWindow,
} from "./sub-window-protocol";

export async function popOutTarget(target: SubWindowTarget, title?: string) {
	const params: SubWindowParams = {
		label: createSubWindowLabel(target),
		mode: "simplified",
		target,
		title,
		loadMode: "immediate",
	};
	return openSubWindow(params);
}

export async function openSubWindow(params: SubWindowParams) {
	if (!shouldCreateSubWindow(params)) {
		return null;
	}

	const url = `${window.location.pathname}?subwindow=${encodeSubWindowParams(params)}`;
	const desktop = host.desktop;
	if (!desktop) {
		throw new Error("子窗口仅在桌面端可用。");
	}
	await desktop.subWindow.create({
		label: params.label,
		url,
		title: params.title ?? "PulsarAI",
		width: 980,
		height: 720,
		hidden: params.hidden,
	});
	return params.label;
}

export async function returnToMain(target: SubWindowTarget) {
	await host.desktop?.subWindow.send("main", "subwindow:return", target);
}

export async function sendSubWindowParams(
	label: string,
	params: SubWindowParams,
) {
	await host.desktop?.subWindow.send(label, "subwindow:params", params);
}

export async function sendBridgeMessage(
	message: Omit<SubWindowBridgeMessage, "id">,
) {
	await host.desktop?.subWindow.send("main", "subwindow:bridge", {
		...message,
		id: crypto.randomUUID(),
	});
}

export function listenBridgeMessages(
	handler: (message: SubWindowBridgeMessage) => void,
) {
	if (!host.desktop) return () => {};
	return host.desktop.subWindow.listen("subwindow:bridge", (payload) =>
		handler(payload as SubWindowBridgeMessage),
	);
}


src/features/Tabs/subWindow/SubWindowContainer.vue

<script setup lang="ts">
import {
	type Component,
	computed,
	onMounted,
	onUnmounted,
	ref,
	watch,
} from "vue";
import { host } from "@/host";
import {
	readSubWindowParamsFromLocation,
	type SubWindowBridgeMessage,
	type SubWindowParams,
} from "./sub-window-protocol";
import { listenBridgeMessages, sendBridgeMessage } from "./sub-window-service";

const props = withDefaults(
	defineProps<{
		component: Component;
		params?: Record<string, unknown>;
		windowParams?: SubWindowParams | null;
		loadMode?: "immediate" | "on-visible";
	}>(),
	{
		params: () => ({}),
		windowParams: null,
		loadMode: "immediate",
	},
);

const emit = defineEmits<{ message: [message: SubWindowBridgeMessage] }>();
const currentParams = ref<SubWindowParams | null>(
	props.windowParams ?? readSubWindowParamsFromLocation(),
);
const visible = ref(props.loadMode === "immediate");
let unlistenParams: (() => void) | null = null;
let unlistenBridge: (() => void) | null = null;

const shouldRender = computed(
	() => visible.value || props.loadMode === "immediate",
);

watch(
	() => props.windowParams,
	(params) => {
		if (params) {
			currentParams.value = params;
		}
	},
);

onMounted(() => {
	if (host.desktop) {
		unlistenParams = host.desktop.subWindow.listen(
			"subwindow:params",
			(payload) => {
				currentParams.value = payload as SubWindowParams;
				visible.value = true;
			},
		);
	}
	unlistenBridge = listenBridgeMessages((message) => emit("message", message));
});

onUnmounted(() => {
	unlistenParams?.();
	unlistenBridge?.();
});

async function send(channel: string, payload: unknown) {
	await sendBridgeMessage({
		channel,
		payload,
		sourceLabel: currentParams.value?.label ?? "main",
	});
}

defineExpose({ currentParams, send });
</script>

<template>
  <component
    :is="component"
    v-if="shouldRender"
    v-bind="params"
    :sub-window-params="currentParams"
    @subwindow-message="send('component', $event)"
  />
</template>


src/features/Tabs/TabBar.vue

<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/fluid";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { LayoutGrid, MessageCircle, Plus, X } from "@/lib/phosphor-icons";
import type { TabView } from "./store";

const props = withDefaults(
	defineProps<{
		tabs: TabView[];
		activeId: string | null;
		inactiveClass?: string;
	}>(),
	{
		inactiveClass: "text-muted-foreground hover:bg-muted hover:text-foreground",
	},
);
const emit = defineEmits<{
	activate: [id: string];
	close: [id: string];
	reorder: [fromIndex: number, toIndex: number];
	create: [];
	action: [
		id: string,
		action: "close" | "others" | "left" | "right" | "reload" | "popout",
	];
}>();
const draggingIndex = ref<number | null>(null);

function iconFor(icon: TabView["icon"]) {
	if (icon === "message-circle") return MessageCircle;
	if (icon === "layout-grid") return LayoutGrid;
	return null;
}

function drop(toIndex: number) {
	if (draggingIndex.value !== null)
		emit("reorder", draggingIndex.value, toIndex);
	draggingIndex.value = null;
}

function reorderByKeyboard(event: KeyboardEvent, index: number) {
	if (!event.altKey) return;
	const offset =
		event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
	if (!offset) return;
	event.preventDefault();
	emit("reorder", index, index + offset);
}

function activateByKeyboard(event: KeyboardEvent, id: string, index: number) {
	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		emit("activate", id);
		return;
	}
	reorderByKeyboard(event, index);
}

function closeByMiddleClick(event: MouseEvent, id: string) {
	if (event.button !== 1) return;
	event.preventDefault();
	emit("close", id);
}
</script>

<template>
  <div class="flex h-full min-w-0 items-stretch gap-1" role="tablist">
    <div class="flex min-w-0 items-stretch gap-1 overflow-x-auto">
	  <ContextMenu v-for="(tab, index) in props.tabs" :key="tab.id">
      <ContextMenuTrigger as-child>
      <div
      role="tab"
      tabindex="0"
      class="group relative flex h-full min-w-24 max-w-52 shrink-0 cursor-pointer items-center rounded-md px-2 pr-7 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
      :class="tab.id === props.activeId ? 'bg-muted text-foreground shadow-xs' : props.inactiveClass"
      :aria-selected="tab.id === props.activeId"
      :title="tab.name"
      draggable="true"
      @dragstart="draggingIndex = index"
      @dragend="draggingIndex = null"
      @dragover.prevent
      @drop="drop(index)"
      @click="emit('activate', tab.id)"
      @keydown="activateByKeyboard($event, tab.id, index)"
      @mousedown.middle.prevent
      @auxclick="closeByMiddleClick($event, tab.id)"
    >
      <component :is="iconFor(tab.icon)" v-if="tab.icon" class="size-3.5 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ tab.name }}</span>
      <Button variant="ghost" size="icon-sm" class="absolute right-1 size-5 rounded opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100 focus-visible:opacity-100 mobile:opacity-100" :aria-label="`关闭 ${tab.name}`" @click.stop="emit('close', tab.id)"><X class="size-3" /></Button>
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem @select="emit('action', tab.id, 'close')">关闭</ContextMenuItem>
        <ContextMenuItem @select="emit('action', tab.id, 'others')">关闭其他</ContextMenuItem>
        <ContextMenuItem :disabled="index === 0" @select="emit('action', tab.id, 'left')">关闭左侧</ContextMenuItem>
        <ContextMenuItem :disabled="index === props.tabs.length - 1" @select="emit('action', tab.id, 'right')">关闭右侧</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem :disabled="tab.type !== 'chat'" @select="emit('action', tab.id, 'reload')">重新加载</ContextMenuItem>
        <ContextMenuItem :disabled="tab.type !== 'chat'" @select="emit('action', tab.id, 'popout')">弹出为新窗口</ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>
    </div>
    <Button variant="ghost" size="icon-sm" class="h-full w-8 shrink-0 rounded-md" :class="props.inactiveClass" title="新建页面" aria-label="新建页面" @click="emit('create')"><Plus class="size-4" /></Button>
  </div>
</template>


src/features/Tabs/test/store.test.ts

import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sync } = vi.hoisted(() => ({
	sync: {
		chatMeta: new Map(),
		load: vi.fn(async () => {}),
		unload: vi.fn(async () => {}),
	},
}));

vi.mock("@/features/Database/dbsync-store", () => ({
	useSyncStore: () => sync,
}));

import { useTabsStore } from "../store";

describe("Tabs store", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		sync.chatMeta.clear();
		sync.load.mockClear();
		sync.unload.mockClear();
		vi.useFakeTimers();
	});
	afterEach(() => vi.useRealTimers());

	it("loads, reorders, activates, and unloads closed chats after a delay", async () => {
		const store = useTabsStore();
		await store.open({ type: "chat", contentid: "one" });
		await store.open({ type: "chat", contentid: "two" });
		expect(sync.load).toHaveBeenCalledTimes(2);
		store.reorder(1, 0);
		expect(store.tabs.map((tab) => tab.id)).toEqual(["two", "one"]);
		store.active(1);
		expect(store.activeId).toBe("one");
		store.close("one");
		expect(store.activeId).toBe("two");
		expect(sync.unload).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(300);
		expect(sync.unload).toHaveBeenCalledWith({ type: "chat", id: "one" });
	});

	it("creates a blank home page without loading conversation data", async () => {
		const store = useTabsStore();
		await store.open({ type: "home" });
		expect(store.tabs[0]?.type).toBe("home");
		expect(store.views[0]?.name).toBe("角色");
		expect(sync.load).not.toHaveBeenCalled();

		store.close(0);
		await vi.advanceTimersByTimeAsync(300);
		expect(sync.unload).not.toHaveBeenCalled();
	});
});
