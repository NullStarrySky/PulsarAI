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
