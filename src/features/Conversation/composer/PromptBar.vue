<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ArrowUp,
  LoaderCircle,
  Maximize2,
  Paperclip,
  PenTool,
  Plus,
  X,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import SttInputButton from "@/features/STT/SttInputButton.vue";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import type { ActionPart, FilePart } from "@/features/Conversation/messages/conversation-types";
import type { ResolvedPluginAction } from "@/features/Plugin/tree/plugin-types";
import ComposerAttachmentStrip from "./ComposerAttachmentStrip.vue";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    attachments: FilePart[];
    actions?: ResolvedPluginAction[];
    selectedAction?: ActionPart | null;
    generating?: boolean;
  }>(),
  { actions: () => [], selectedAction: null, generating: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:selectedAction": [value: ActionPart | null];
  submit: [];
  attach: [];
  whiteboard: [];
  fullscreen: [];
  removeAttachment: [index: number];
  openView: [action: ResolvedPluginAction];
}>();

const responsive = useResponsiveStore();
const toolsOpen = ref(false);
const activeIndex = ref(0);
const token = computed(() => {
  const match = /(^|\s)([@/])([\w-]*)$/.exec(props.modelValue);
  if (!match) return null;
  return { kind: match[2] === "@" ? "at" as const : "slash" as const, query: match[3].toLocaleLowerCase() };
});
const menuKind = computed(() => toolsOpen.value ? "at" as const : token.value?.kind ?? null);
const atRows = [
  { key: "attach", title: "附加文件与照片", icon: Paperclip },
  { key: "whiteboard", title: "打开白板", icon: PenTool },
  { key: "fullscreen", title: "全屏输入", icon: Maximize2 },
] as const;
const actionRows = computed(() => props.actions.filter(
  (action) => action.resource.name.toLocaleLowerCase().includes(token.value?.query ?? ""),
));
const menuRows = computed(() => menuKind.value === "at"
  ? atRows
  : menuKind.value === "slash" ? actionRows.value : []);
const wide = computed(() => !responsive.isMobileLayout);
const canSubmit = computed(
  () => Boolean(props.modelValue.trim() || props.selectedAction || props.attachments.length) && !props.generating,
);

watch([menuKind, () => token.value?.query], () => { activeIndex.value = 0; });

function insertDictation(text: string) {
  emit("update:modelValue", `${props.modelValue}${props.modelValue ? " " : ""}${text}`);
}

function runAtTool(key: typeof atRows[number]["key"]) {
  if (key === "attach") emit("attach");
  if (key === "whiteboard") emit("whiteboard");
  if (key === "fullscreen") emit("fullscreen");
  toolsOpen.value = false;
}

function pickAction(action: ResolvedPluginAction) {
  if (action.kind === "prompt") {
    emit("update:modelValue", typeof action.resource.content === "string" ? action.resource.content : JSON.stringify(action.resource.content, null, 2));
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
  toolsOpen.value = false;
}

function handleKeydown(event: KeyboardEvent) {
  const count = menuRows.value.length;
  if (menuKind.value && count) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      activeIndex.value = (activeIndex.value + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const item = menuRows.value[activeIndex.value];
      if (!item) return;
      if (menuKind.value === "at") runAtTool((item as typeof atRows[number]).key);
      else pickAction(item as ResolvedPluginAction);
      return;
    }
  }
  if (event.key === "Escape") toolsOpen.value = false;
}
</script>

<template>
  <div class="relative" @keydown.capture="handleKeydown">
    <Transition name="fade">
      <div
        v-if="menuKind && menuRows.length"
        class="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-[min(32rem,calc(100vw-1rem))] overflow-hidden rounded-xl border bg-popover p-1.5 shadow-lg"
      >
        <p class="border-b px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">{{ menuKind === 'at' ? '快捷工具' : '选择插件动作' }}</p>
        <div class="max-h-60 overflow-y-auto py-1">
          <template v-if="menuKind === 'at'">
            <button
              v-for="(item, index) in atRows"
              :key="item.key"
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs"
              :class="index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'"
              @mousedown.prevent
              @click="runAtTool(item.key)"
            >
              <component :is="item.icon" class="size-4 text-muted-foreground" />
              <span>{{ item.title }}</span>
            </button>
          </template>
          <template v-else>
            <button
              v-for="(item, index) in actionRows"
              :key="`${item.pluginId}:${item.resource.id}`"
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs"
              :class="index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'"
              @mousedown.prevent
              @click="pickAction(item)"
            >
              <span class="font-mono font-medium text-primary">/{{ item.resource.name }}</span>
              <span class="ml-auto truncate text-muted-foreground">{{ item.pluginName }}</span>
            </button>
          </template>
        </div>
      </div>
    </Transition>

    <div v-if="selectedAction" class="mb-1.5 flex items-center">
      <div class="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/50 py-1 pl-2.5 pr-1 text-xs">
        <span class="truncate font-mono font-medium text-primary">/{{ selectedAction.name }}</span>
        <Button size="icon-sm" variant="ghost" class="rounded-full" title="移除动作" @click="emit('update:selectedAction', null)"><X class="size-3" /></Button>
      </div>
    </div>

    <div
      class="rounded-2xl border bg-background/95 p-1.5 shadow-sm transition-[border-radius] duration-150 focus-within:ring-2 focus-within:ring-ring/20"
      :class="{ 'rounded-xl': !wide && !attachments.length }"
    >
      <ComposerAttachmentStrip
        v-if="attachments.length"
        :attachments="attachments"
        @remove="emit('removeAttachment', $event)"
      />

      <div
        class="grid min-w-0 items-end gap-1"
        :class="wide ? 'grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] grid-rows-[minmax(5.25rem,auto)_auto]' : 'grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]'"
      >
        <Button
          size="icon"
          variant="ghost"
          class="size-8 rounded-lg text-muted-foreground"
          :class="wide ? 'col-start-1 row-start-2' : 'col-start-1'"
          title="更多输入工具"
          @click="toolsOpen = !toolsOpen"
        >
          <Plus class="size-4" />
        </Button>

        <ConversationComposerEditor
          :model-value="modelValue"
          compact
          placeholder="随心输入，输入 @ 或 / 打开工具…"
          class="min-w-0"
          :class="wide ? 'col-span-5 col-start-1 row-start-1' : 'col-start-2'"
          @update:model-value="emit('update:modelValue', $event)"
          @submit="emit('submit')"
        />

        <div :class="wide ? 'col-start-2 row-start-2 min-w-0' : 'col-start-3 min-w-0'">
          <slot name="model" />
        </div>

        <SttInputButton
          class="size-8 rounded-lg text-muted-foreground"
          :class="wide ? 'col-start-4 row-start-2' : 'col-start-4'"
          @result="insertDictation"
        />

        <Button
          size="icon"
          class="size-8 rounded-lg"
          :class="wide ? 'col-start-5 row-start-2' : 'col-start-5'"
          :disabled="!canSubmit"
          title="发送"
          @click="emit('submit')"
        >
          <LoaderCircle v-if="generating" class="size-4 animate-spin" />
          <ArrowUp v-else class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(0.25rem);
}
</style>
