<script setup lang="ts">
import { ref } from "vue";
import { GripVertical } from "lucide-vue-next";
import {
  composerToolDefinitions,
  moveComposerTool,
  type ComposerToolbarLayout,
  type ComposerToolbarZone,
  type ComposerToolId,
} from "@/features/UI/domain/composer-toolbar";

const props = defineProps<{
  modelValue: ComposerToolbarLayout;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: ComposerToolbarLayout];
}>();

const dragging = ref<ComposerToolId | null>(null);
const touchDrag = ref<{ id: ComposerToolId; x: number; y: number } | null>(null);
const labels = new Map(
  composerToolDefinitions.map((item) => [item.id, item.label]),
);

function move(target: ComposerToolbarZone, beforeId?: ComposerToolId) {
  if (!dragging.value) {
    return;
  }
  emit(
    "update:modelValue",
    moveComposerTool(props.modelValue, dragging.value, target, beforeId),
  );
  dragging.value = null;
}

function startTouchDrag(event: PointerEvent, id: ComposerToolId) {
  if (event.pointerType === "mouse") {
    return;
  }
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  touchDrag.value = { id, x: event.clientX, y: event.clientY };
}

function finishTouchDrag(event: PointerEvent) {
  const start = touchDrag.value;
  touchDrag.value = null;
  if (
    !start
    || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
  ) {
    return;
  }
  const target = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-toolbar-zone]");
  const zone = target?.dataset.toolbarZone as ComposerToolbarZone | undefined;
  if (!zone) {
    return;
  }
  const beforeId = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-tool-id]")
    ?.dataset.toolId as ComposerToolId | undefined;
  dragging.value = start.id;
  move(zone, beforeId === start.id ? undefined : beforeId);
}
</script>

<template>
  <div class="ml-auto w-full max-w-2xl space-y-2">
    <div
      class="grid min-h-12 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-lg border bg-card px-2 py-1.5 shadow-sm"
      aria-label="会话输入框工具栏布局"
      @click.prevent
    >
      <div
        data-toolbar-zone="left"
        class="flex min-h-9 min-w-0 items-center gap-1 rounded-md border border-dashed border-transparent p-1"
        @dragover.prevent
        @drop.prevent="move('left')"
      >
        <div
          v-for="toolId in modelValue.left"
          :key="toolId"
          draggable="true"
          class="flex h-8 touch-none cursor-grab items-center gap-1 rounded-md border bg-background px-2 text-xs active:cursor-grabbing"
          @dragstart="dragging = toolId"
          @dragend="dragging = null"
          @dragover.prevent
          @drop.prevent.stop="move('left', toolId)"
          :data-tool-id="toolId"
          @pointerdown="startTouchDrag($event, toolId)"
          @pointerup="finishTouchDrag"
        >
          <GripVertical class="size-3 text-muted-foreground" />
          {{ labels.get(toolId) }}
        </div>
      </div>
      <div
        data-toolbar-zone="right"
        class="flex min-h-9 min-w-0 items-center justify-end gap-1 rounded-md border border-dashed border-transparent p-1"
        @dragover.prevent
        @drop.prevent="move('right')"
      >
        <div
          v-for="toolId in modelValue.right"
          :key="toolId"
          draggable="true"
          class="flex h-8 touch-none cursor-grab items-center gap-1 rounded-md border bg-background px-2 text-xs active:cursor-grabbing"
          @dragstart="dragging = toolId"
          @dragend="dragging = null"
          @dragover.prevent
          @drop.prevent.stop="move('right', toolId)"
          :data-tool-id="toolId"
          @pointerdown="startTouchDrag($event, toolId)"
          @pointerup="finishTouchDrag"
        >
          <GripVertical class="size-3 text-muted-foreground" />
          {{ labels.get(toolId) }}
        </div>
      </div>
    </div>

    <div
      data-toolbar-zone="unused"
      class="flex min-h-12 flex-wrap items-center gap-1 rounded-lg border border-dashed bg-muted/25 px-3 py-2"
      @dragover.prevent
      @drop.prevent="move('unused')"
    >
      <span class="mr-2 text-xs text-muted-foreground">未使用</span>
      <div
        v-for="toolId in modelValue.unused"
        :key="toolId"
        draggable="true"
        class="flex h-8 touch-none cursor-grab items-center gap-1 rounded-md border bg-background px-2 text-xs opacity-70 active:cursor-grabbing"
        @dragstart="dragging = toolId"
        @dragend="dragging = null"
        @dragover.prevent
        @drop.prevent.stop="move('unused', toolId)"
        :data-tool-id="toolId"
        @pointerdown="startTouchDrag($event, toolId)"
        @pointerup="finishTouchDrag"
      >
        <GripVertical class="size-3 text-muted-foreground" />
        {{ labels.get(toolId) }}
      </div>
      <span v-if="modelValue.unused.length === 0" class="text-xs text-muted-foreground/70">
        拖到这里以隐藏
      </span>
    </div>
  </div>
</template>
