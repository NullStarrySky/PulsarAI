<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  ArrowUp,
  GitFork,
  Maximize2,
  Paperclip,
  PenTool,
  Plus,
  Sparkles,
  Square,
  X,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import type { ActionPart, FilePart } from "@/features/Resources/Conversation/messages/conversation-types";
import type { ResolvedPluginAction } from "@/features/Resources/Plugin/tree/plugin-types";
import SttInputButton from "@/features/STT/SttInputButton.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    variant?: "Rounded" | "Pill";
    actions?: ResolvedPluginAction[];
    selectedAction?: ActionPart | null;
    attachments?: FilePart[];
    generating?: boolean;
  }>(),
  {
    variant: "Rounded",
    actions: () => [],
    selectedAction: null,
    attachments: () => [],
    generating: false,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:selectedAction": [value: ActionPart | null];
  submit: [];
  attach: [];
  optimize: [];
  whiteboard: [];
  map: [];
  fullscreen: [];
  removeAttachment: [index: number];
  openView: [action: ResolvedPluginAction];
}>();

const inputRef = ref<HTMLTextAreaElement | null>(null);
const plusOpen = ref(false);
const activeIndex = ref(0);

const pill = computed(() => props.variant === "Pill");

const parseToken = computed(() => {
  const text = props.modelValue;
  const match = /(^|\s)([@/])([\w-]*)$/.exec(text);
  if (!match) return null;
  return {
    kind: match[2] === "@" ? ("at" as const) : ("slash" as const),
    query: match[3].toLowerCase(),
    start: match.index + match[1].length,
  };
});

const menuKind = computed(() => (plusOpen.value ? "at" : parseToken.value?.kind ?? null));
const searchQuery = computed(() => (plusOpen.value ? "" : parseToken.value?.query ?? ""));

const sources = [
  { key: "attach", name: "附加文件与照片", desc: "从计算机上传文件", glyph: "clip" },
  { key: "optimize", name: "优化提示词", desc: "AI 自动补充与表达调优", glyph: "sparkles" },
  { key: "whiteboard", name: "打开白板", desc: "Excalidraw 自由画板", glyph: "pen" },
  { key: "map", name: "会话地图", desc: "查看对话分支树", glyph: "git" },
  { key: "fullscreen", name: "全屏输入", desc: "放大输入框专注编辑", glyph: "fullscreen" },
];

const atRows = computed(() => {
  if (menuKind.value !== "at") return [];
  return sources.filter((s) => s.name.toLowerCase().includes(searchQuery.value));
});

const slashRows = computed(() => {
  if (menuKind.value !== "slash") return [];
  return props.actions.filter((a) =>
    a.resource.name.toLowerCase().includes(searchQuery.value)
  );
});

const currentRowsCount = computed(() => {
  if (menuKind.value === "at") return atRows.value.length;
  if (menuKind.value === "slash") return slashRows.value.length;
  return 0;
});

watch([menuKind, searchQuery], () => {
  activeIndex.value = 0;
});

function handleTextareaInput(e: Event) {
  const val = (e.target as HTMLTextAreaElement).value;
  emit("update:modelValue", val);
  adjustTextareaHeight();
}

function adjustTextareaHeight() {
  nextTick(() => {
    const el = inputRef.value;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 36), 160);
    el.style.height = `${newHeight}px`;
  });
}

function handleKeyDown(e: KeyboardEvent) {
  if (menuKind.value && currentRowsCount.value > 0) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex.value = (activeIndex.value + 1) % currentRowsCount.value;
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex.value =
        (activeIndex.value - 1 + currentRowsCount.value) % currentRowsCount.value;
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (menuKind.value === "at" && atRows.value[activeIndex.value]) {
        pickAtRow(atRows.value[activeIndex.value]);
      } else if (menuKind.value === "slash" && slashRows.value[activeIndex.value]) {
        pickSlashRow(slashRows.value[activeIndex.value]);
      }
      return;
    }
  }

  if (e.key === "Escape") {
    plusOpen.value = false;
    return;
  }

  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    handleSend();
  }
}

function pickAtRow(row: typeof sources[number]) {
  if (row.key === "attach") {
    emit("attach");
  } else if (row.key === "optimize") {
    emit("optimize");
  } else if (row.key === "whiteboard") {
    emit("whiteboard");
  } else if (row.key === "map") {
    emit("map");
  } else if (row.key === "fullscreen") {
    emit("fullscreen");
  }
  plusOpen.value = false;
  inputRef.value?.focus();
}

function pickSlashRow(action: ResolvedPluginAction) {
  if (action.kind === "prompt") {
    emit(
      "update:modelValue",
      typeof action.resource.content === "string"
        ? action.resource.content
        : JSON.stringify(action.resource.content, null, 2)
    );
    emit("update:selectedAction", null);
  } else if (action.kind === "view") {
    emit("openView", action);
  } else {
    emit("update:selectedAction", {
      type: "action",
      actionId: action.resource.id,
      pluginId: action.pluginId,
      pluginName: action.pluginName,
      name: action.resource.name,
      description: "",
    });
    emit("update:modelValue", "");
  }
  plusOpen.value = false;
  inputRef.value?.focus();
}

function handleSend() {
  if ((!props.modelValue.trim() && !props.selectedAction && !props.attachments.length) || props.generating) {
    return;
  }
  emit("submit");
  plusOpen.value = false;
}

function onSttResult(text: string) {
  if (!text) return;
  const current = props.modelValue.trim();
  emit("update:modelValue", current ? `${current} ${text}` : text);
  adjustTextareaHeight();
}
</script>

<template>
  <div class="relative w-full">
    <!-- Popover Menu (@ or / or +) -->
    <div
      v-if="menuKind && currentRowsCount > 0"
      class="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-50 zoom-in-95 duration-150"
    >
      <div class="border-b border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        {{ menuKind === 'at' ? '快捷工具' : '选择快捷命令' }}
      </div>
      <div class="max-h-60 overflow-y-auto py-1">
        <template v-if="menuKind === 'at'">
          <button
            v-for="(row, idx) in atRows"
            :key="row.key"
            type="button"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors"
            :class="idx === activeIndex ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground hover:bg-accent/50'"
            @mousedown.prevent
            @click="pickAtRow(row)"
          >
            <Paperclip v-if="row.glyph === 'clip'" class="size-3.5 text-muted-foreground shrink-0" />
            <Sparkles v-else-if="row.glyph === 'sparkles'" class="size-3.5 text-primary shrink-0" />
            <PenTool v-else-if="row.glyph === 'pen'" class="size-3.5 text-muted-foreground shrink-0" />
            <GitFork v-else-if="row.glyph === 'git'" class="size-3.5 text-muted-foreground shrink-0" />
            <Maximize2 v-else-if="row.glyph === 'fullscreen'" class="size-3.5 text-muted-foreground shrink-0" />
            <span class="font-medium text-foreground">{{ row.name }}</span>
            <span class="truncate text-[11px] text-muted-foreground ml-auto">{{ row.desc }}</span>
          </button>
        </template>
        <template v-else-if="menuKind === 'slash'">
          <button
            v-for="(action, idx) in slashRows"
            :key="`${action.pluginId}:${action.resource.id}`"
            type="button"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors"
            :class="idx === activeIndex ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground hover:bg-accent/50'"
            @mousedown.prevent
            @click="pickSlashRow(action)"
          >
            <span class="font-mono font-medium text-primary">/{{ action.resource.name }}</span>
            <span class="truncate text-[11px] text-muted-foreground ml-auto font-sans">
              {{ action.pluginName }}
            </span>
          </button>
        </template>
      </div>
    </div>

    <!-- Selected Action Badge -->
    <div v-if="selectedAction" class="mb-1.5 flex items-center">
      <div class="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/50 py-1 pl-2.5 pr-1 text-xs">
        <span class="shrink-0 font-mono font-medium text-primary">/{{ selectedAction.name }}</span>
        <Button
          size="icon"
          variant="ghost"
          class="size-5 rounded-full text-muted-foreground hover:text-foreground"
          title="移除命令"
          @click="emit('update:selectedAction', null)"
        >
          <X class="size-3" />
        </Button>
      </div>
    </div>

    <!-- Main Prompt Bar Container Card (No focus ring/outline, clean border) -->
    <div
      class="relative flex flex-col gap-2 overflow-hidden border border-border bg-card p-2 shadow-sm transition-colors"
      :class="pill ? 'rounded-3xl' : 'rounded-2xl'"
    >
      <!-- Attachments Strip -->
      <div v-if="attachments.length > 0" class="flex flex-wrap gap-1.5 px-1 pt-0.5">
        <span
          v-for="(att, i) in attachments"
          :key="i"
          class="flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-foreground"
        >
          <Paperclip class="size-3 text-muted-foreground" />
          <span class="max-w-36 truncate font-medium">{{ att.filename || '附件' }}</span>
          <button
            type="button"
            class="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            @click="emit('removeAttachment', i)"
          >
            <X class="size-3" />
          </button>
        </span>
      </div>

      <!-- Auto-growing Textarea (No outline or focus ring) -->
      <textarea
        ref="inputRef"
        rows="1"
        :value="modelValue"
        placeholder="随心输入，输入 / 触发命令，点击 + 选择快捷工具…"
        class="min-h-9 max-h-40 min-w-0 w-full resize-none bg-transparent px-2 py-1 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0 shadow-none border-none"
        @input="handleTextareaInput"
        @keydown="handleKeyDown"
      />

      <!-- Inside Toolbar Row (Bottom row INSIDE input container) -->
      <div class="flex min-w-0 items-center justify-between gap-2 border-t border-border/40 pt-1.5 px-1">
        <div class="flex min-w-0 items-center gap-1.5 flex-wrap">
          <!-- Plus Button (@ or + tools) -->
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
            :class="{ 'bg-accent text-accent-foreground': plusOpen }"
            title="快捷工具与功能"
            @click="plusOpen = !plusOpen"
          >
            <Plus class="size-4" />
          </Button>

          <!-- Left Slot for Toolbar Tools -->
          <slot name="left-tools" />
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <!-- Right Slot for Toolbar Tools (Model Picker, etc.) -->
          <slot name="right-tools" />

          <!-- STT Voice Input Button -->
          <SttInputButton @result="onSttResult" />

          <!-- Send / Stop Button -->
          <Button
            v-if="generating"
            type="button"
            size="icon"
            class="size-7 shrink-0 rounded-lg"
            title="生成中"
          >
            <Square class="size-3.5 fill-current" />
          </Button>
          <Button
            v-else
            type="button"
            size="icon"
            class="size-7 shrink-0 rounded-lg transition-transform active:scale-95 disabled:opacity-40"
            :disabled="!modelValue.trim() && !selectedAction && !attachments.length"
            title="发送消息"
            @click="handleSend"
          >
            <ArrowUp class="size-4 stroke-[2.5]" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
