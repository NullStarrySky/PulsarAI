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
                  <ChatBubble :container-id="visibleRows[row.index]!.container.id" :interval-summary="visibleRows[row.index]!.intervalSummary" @regenerate="conversation.regenerate" @delete-container="conversation.deleteContainer" @toggle-interval="toggleInterval" />
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
