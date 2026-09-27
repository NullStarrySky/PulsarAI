<script setup lang="ts">
import { recalSize } from "@/features/Plugin/dataflow/recalculate";
import { MarkstreamVirtualTimeline } from "markstream-vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useActivePathComposable } from "../dataflow/activePathComposable";
import type { ConversationContainer } from "../dataflow/types";
import Message from "./Message.vue";

const props = defineProps<{ conversationId: string; bottomInset?: number }>();
const conversation = useActivePathComposable(props.conversationId);
const expandedIntervals = ref(new Set<string>());

interface IntervalSummary {
	id: string;
	count: number;
	collapsed: boolean;
	open: boolean;
}
interface ThreadRow {
	container: ConversationContainer;
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
				(message) => message.content || recalSize(message.meta.recal),
			),
	);
});

const timelineItems = computed(() => visibleRows.value);
function currentContent(row: ThreadRow) {
	const index = row.container.activeMessage ?? 0;
	return row.container.content[index] ?? row.container.content[0];
}
function itemRevision(row: ThreadRow) {
	const message = currentContent(row);
	return `${message?.id ?? ""}:${message?.content.length ?? 0}:${message?.final ?? true}:${row.intervalSummary?.collapsed ?? false}`;
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
  <MarkstreamVirtualTimeline
    v-if="timelineItems.length"
    :items="timelineItems"
    :thread-key="props.conversationId"
    :get-key="(row: ThreadRow) => row.container.id"
    :get-kind="(row: ThreadRow) => row.container.role"
    :get-content="(row: ThreadRow) => currentContent(row)?.content ?? ''"
    :get-final="(row: ThreadRow) => currentContent(row)?.final ?? true"
    :get-revision="itemRevision"
    :estimate-item-height="() => 240"
    stick-to-bottom="auto"
    markdown-mode="chat"
    class="absolute inset-0 min-h-0 min-w-0"
    :style="{ paddingBottom: `${props.bottomInset ?? 0}px` }"
  >
    <template #default="{ item, measureRef }">
      <div :ref="measureRef" class="mx-auto w-full max-w-[724px] px-4 pb-4 pt-5 mobile:px-3">
        <Message :conversation-id="props.conversationId" :container-id="item.container.id" :interval-summary="item.intervalSummary" @regenerate="conversation.regenerate" @delete-container="conversation.deleteContainer" @toggle-interval="toggleInterval" />
      </div>
    </template>
  </MarkstreamVirtualTimeline>
</template>
