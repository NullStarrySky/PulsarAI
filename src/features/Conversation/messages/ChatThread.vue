<script setup lang="ts">
import { useVirtualizer } from "@tanstack/vue-virtual";
import {
	type ComponentPublicInstance,
	computed,
	onBeforeUnmount,
	onMounted,
	ref,
	toRef,
	watch,
} from "vue";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { useConversation } from "@/features/Conversation/use-conversation";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import ChatBubble from "./ChatBubble.vue";

const props = defineProps<{ chatId: string }>();
const conversation = useConversation(toRef(props, "chatId"));
const localPlugins = useLocalPluginStore();
const viewport = ref<{ element: HTMLElement | null } | null>(null);
const loadedChatId = ref("");
const holdVirtualEnd = ref(false);
const expandedIntervals = ref(new Set<string>());

const visiblePathView = computed(() => {
	const source = conversation.activePathView.value;
	const closed = new Map(
		conversation.intervalProjection.value.spans
			.filter((span) => span.interval.type === "edit")
			.map((span) => [span.openedAt.containerId, span]),
	);
	const open = new Map(
		conversation.intervalProjection.value.openIntervals
			.filter((item) => item.interval.type === "edit")
			.map((item) => [item.openedAt.containerId, item]),
	);
	const rows = [] as typeof source;
	for (let index = 0; index < source.length; index += 1) {
		const item = source[index]!;
		const span = closed.get(item.containerId);
		if (span) {
			const closeIndex = source.findIndex(
				(row) => row.containerId === span.closedAt.containerId,
			);
			const expanded = expandedIntervals.value.has(span.interval.id);
			if (!expanded && closeIndex >= index) {
				rows.push({
					...source[closeIndex]!,
					intervalSummary: {
						id: span.interval.id,
						count: Math.max(0, closeIndex - index - 1),
						collapsed: true,
						open: false,
					},
				});
				index = closeIndex;
				continue;
			}
			rows.push({
				...item,
				intervalSummary: {
					id: span.interval.id,
					count: Math.max(0, closeIndex - index - 1),
					collapsed: false,
					open: false,
				},
			});
			continue;
		}
		const opening = open.get(item.containerId);
		rows.push(
			opening
				? {
						...item,
						intervalSummary: {
							id: opening.interval.id,
							count: opening.visibleContainersAfterOpen,
							collapsed: false,
							open: true,
						},
					}
				: item,
		);
	}
	return rows.filter(
		(item) =>
			item.role !== "system" ||
			Boolean(item.intervalSummary) ||
			Boolean(item.message?.content) ||
			(item.pulses && item.pulses.length > 0),
	);
});

function toggleInterval(id: string) {
	const next = new Set(expandedIntervals.value);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	expandedIntervals.value = next;
}

const virtualizer = useVirtualizer(
	computed(() => ({
		count: visiblePathView.value.length,
		getScrollElement: () => viewport.value?.element ?? null,
		getItemKey: (index: number) =>
			visiblePathView.value[index]?.containerId ?? index,
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
	) {
		holdVirtualEnd.value = false;
	}
}

async function loadChat(chatId: string) {
	loadedChatId.value = "";
	if (!chatId) return;
	await conversation.ensureLoaded();
	if (props.chatId === chatId) loadedChatId.value = chatId;
}

watch(
	() => props.chatId,
	(chatId) => {
		holdVirtualEnd.value = false;
		void loadChat(chatId);
	},
	{ immediate: true },
);

const currentPluginName = computed(() => {
	const localPluginId = conversation.chat.value?.localPluginId;
	if (!localPluginId) return "P";
	return (
		localPlugins.localPlugins.find((item) => item.id === localPluginId)?.name ??
		"P"
	);
});

const lastAssistantItem = computed(() => {
	const list = conversation.activePathView.value;
	for (let i = list.length - 1; i >= 0; i--) {
		if (list[i]?.role === "assistant" && list[i]?.message) {
			return list[i];
		}
	}
	return null;
});

function isEditableElement(target: EventTarget | null): boolean {
	if (!target || !(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	if (tag === "input" || tag === "textarea" || tag === "select") return true;
	if (target.isContentEditable) return true;
	if (target.closest?.(".ProseMirror, .cm-editor, [contenteditable='true']"))
		return true;
	return false;
}

async function handleKeyDown(event: KeyboardEvent) {
	if (event.defaultPrevented) return;
	if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
	if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
	if (isEditableElement(event.target)) return;

	const item = lastAssistantItem.value;
	if (!item) return;

	if (event.key === "ArrowLeft") {
		if (item.activeVersionIndex > 0) {
			event.preventDefault();
			await conversation.switchVersion(
				item.containerId,
				item.activeVersionIndex - 1,
			);
		}
	} else if (event.key === "ArrowRight") {
		if (item.activeVersionIndex < item.versionCount - 1) {
			event.preventDefault();
			await conversation.switchVersion(
				item.containerId,
				item.activeVersionIndex + 1,
			);
		} else {
			if (!conversation.generating.value) {
				event.preventDefault();
				await conversation.regenerate(item.containerId);
			}
		}
	}
}

onMounted(() => {
	window.addEventListener("keydown", handleKeyDown);
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <MessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
    <MessageScroller class="absolute inset-0 min-h-0 min-w-0">
      <MessageScrollerViewport ref="viewport" @scroll="resumeVirtualEndAtBottom">
        <MessageScrollerContent :virtual-count="visiblePathView.length" class="gap-0">
          <div class="grid min-h-full w-full grid-cols-[minmax(1rem,1fr)_minmax(0,724px)_minmax(1rem,1fr)] mobile:block">
            <div aria-hidden="true" class="mobile:hidden" />
            <div class="flex min-h-full min-w-0 flex-col justify-end px-4 pb-48 pt-5 mobile:px-3 mobile:pb-44">
              <div v-if="loadedChatId === props.chatId && visiblePathView.length" class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }">
                <div v-for="row in virtualItems" :key="String(row.key)" :ref="measureRow" :data-index="row.index" class="absolute left-0 top-0 w-full pb-4" :style="{ transform: `translateY(${row.start}px)` }">
                  <MessageScrollerItem :message-id="visiblePathView[row.index]!.containerId" :scroll-anchor="visiblePathView[row.index]!.role === 'user'">
                    <ChatBubble
                      :key="visiblePathView[row.index]!.containerId"
                      :view-model="visiblePathView[row.index]!"
                      :generating="conversation.generating.value"
                      @process-interaction="pauseVirtualEnd"
                      @delete-message="conversation.deleteMessage"
                      @toggle-interval="toggleInterval"
                    >
                      <template #messageAction="bubbleProps">
                        <slot name="messageAction" v-bind="bubbleProps" />
                      </template>
                    </ChatBubble>
                  </MessageScrollerItem>
                </div>
              </div>
              <div v-else-if="loadedChatId === props.chatId" class="flex min-h-72 flex-1 flex-col items-center justify-center text-center">
                <div class="flex size-14 items-center justify-center rounded-2xl bg-muted text-xl font-semibold text-muted-foreground">{{ currentPluginName.slice(0, 1) }}</div>
                <h1 class="mt-4 text-lg font-medium">开始新的会话</h1>
                <p class="mt-1 max-w-sm text-sm text-muted-foreground">输入一条消息开始。</p>
              </div>
            </div>
            <div aria-hidden="true" class="mobile:hidden" />
          </div>
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton direction="end" />
    </MessageScroller>
  </MessageScrollerProvider>
</template>
