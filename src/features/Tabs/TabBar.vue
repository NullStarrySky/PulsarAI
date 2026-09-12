<script setup lang="ts">
import { MessageCircle, X } from "lucide-vue-next";
import { ref } from "vue";
import { Button } from "@/components/fluid";
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
}>();
const draggingIndex = ref<number | null>(null);

function iconFor(icon: TabView["icon"]) {
	return icon === "message-circle" ? MessageCircle : null;
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
</script>

<template>
  <div class="flex min-w-0 items-center gap-1 overflow-x-auto py-1" role="tablist">
    <div
      v-for="(tab, index) in props.tabs"
      :key="tab.id"
      class="group flex h-7 min-w-24 max-w-52 shrink-0 items-center rounded-md text-xs transition-colors"
      :class="tab.id === props.activeId ? 'bg-muted text-foreground shadow-xs' : props.inactiveClass"
      draggable="true"
      @dragstart="draggingIndex = index"
      @dragend="draggingIndex = null"
      @dragover.prevent
      @drop="drop(index)"
    >
      <Button
        variant="ghost"
        size="sm"
        role="tab"
        class="h-full min-w-0 flex-1 justify-start gap-1.5 rounded-r-none px-2 text-left text-xs"
        :aria-selected="tab.id === props.activeId"
        :title="tab.name"
        @click="emit('activate', tab.id)"
        @keydown="reorderByKeyboard($event, index)"
      >
        <component :is="iconFor(tab.icon)" v-if="tab.icon" class="size-3.5 shrink-0" />
        <span class="min-w-0 flex-1 truncate">{{ tab.name }}</span>
      </Button>
      <Button variant="ghost" size="icon-sm" class="mr-1 size-4 shrink-0 rounded opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100 focus-visible:opacity-100 mobile:opacity-100" :aria-label="`关闭 ${tab.name}`" @click="emit('close', tab.id)"><X class="size-3" /></Button>
    </div>
    <span v-if="!props.tabs.length" class="px-2 text-sm font-medium">PulsarAI</span>
  </div>
</template>
