<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onMounted,
  onUnmounted,
  useTemplateRef,
  nextTick,
  useId,
} from "vue";
import { AnimatePresence, motion, ReorderGroup, ReorderItem, useReducedMotion } from "motion-v";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { spring } from "../../../lib/springs";
import { useShape } from "../../../lib/shape-context";
import { provideSize, useSize, type SizeVariant } from "../../../lib/size-context";
import { useIcon } from "../../../lib/icon-context";
import { surfaceClasses } from "../../../lib/surface-classes";
import { provideSurface } from "../../../lib/surface-context";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import FileThumbnail from "./FileThumbnail.vue";
import Button from "../button/Button.vue";
import Tooltip from "../tooltip/Tooltip.vue";

const DEFAULT_ACCEPT = "image/png,image/jpeg,application/pdf";

export interface QueuedMessage {
  id: string;
  text: string;
  files: File[];
}

export interface InputMessageSlotContext {
  openFilePicker: (acceptOverride?: string) => void;
  files: File[];
}

export interface InputMessageProps {
  size?: SizeVariant;
  modelValue?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  placeholderSuggestion?: string;
  suggestions?: string[];
  history?: string[];
  disabled?: boolean;
  minRows?: number;
  maxRows?: number;
  clickToFocus?: boolean;
  sendLabel?: string;
  files?: File[];
  accept?: string;
  maxFiles?: number;
  filePreviewSize?: number;
  status?: "idle" | "streaming";
  queue?: QueuedMessage[];
  showQueue?: boolean;
  textareaProps?: Record<string, any>;
  class?: string;
  style?: any;
}

const props = withDefaults(defineProps<InputMessageProps>(), {
  defaultValue: "",
  placeholder: "Ask me anything…",
  disabled: false,
  minRows: 1,
  maxRows: 8,
  clickToFocus: true,
  sendLabel: "Send",
  accept: DEFAULT_ACCEPT,
  filePreviewSize: 80,
  showQueue: true,
  history: () => [],
});

const emit = defineEmits<{
  (e: "update:modelValue", val: string): void;
  (e: "update:value", val: string): void;
  (e: "valueChange", val: string): void;
  (e: "send", value: string, files: File[], meta?: { queuedId?: string }): void;
  (e: "stop"): void;
  (e: "update:files", files: File[]): void;
  (e: "update:queue", queue: QueuedMessage[]): void;
}>();

const slots = defineSlots<{
  left?: (ctx: InputMessageSlotContext) => any;
  leftSlot?: (ctx: InputMessageSlotContext) => any;
  right?: (ctx: InputMessageSlotContext) => any;
  rightSlot?: (ctx: InputMessageSlotContext) => any;
  actions?: (ctx: InputMessageSlotContext) => any;
}>();

defineOptions({ name: "InputMessage" });

const shape = useShape();
const sizeClasses = useSize(() => props.size);
const compactStep = computed(() => sizeClasses.value.variant === "compact");
provideSize({ size: () => props.size });
provideSurface(2);

const ArrowUpIcon = useIcon("arrow-up");
const ArrowDownIcon = useIcon("arrow-down");
const EnterIcon = useIcon("corner-down-left");
const XIcon = useIcon("x");
const ImageIcon = useIcon("image");

const prefersReducedMotion = useReducedMotion();
const reduceMotion = computed(() => prefersReducedMotion.value ?? false);

// ── Touch detection ──
const isTouch = ref(false);
onMounted(() => {
  if (typeof window !== "undefined") {
    const mq = window.matchMedia("(hover: none)");
    isTouch.value = mq.matches;
    const update = () => {
      isTouch.value = mq.matches;
    };
    mq.addEventListener("change", update);
    onUnmounted(() => mq.removeEventListener("change", update));
  }
});

// ── Values & Textarea state ──
const rawValue = computed(() => props.modelValue ?? props.value ?? undefined);
const isControlledValue = computed(() => rawValue.value !== undefined);
const internalValue = ref(props.defaultValue ?? "");
const currentValue = computed(() =>
  isControlledValue.value ? (rawValue.value as string) : internalValue.value
);

function setValue(next: string) {
  if (!isControlledValue.value) {
    internalValue.value = next;
  }
  emit("update:modelValue", next);
  emit("update:value", next);
  emit("valueChange", next);
}

const textareaRef = useTemplateRef<HTMLTextAreaElement>("textareaRef");
const fileInputRef = useTemplateRef<HTMLInputElement>("fileInputRef");
const focusVisible = ref(false);
const dragOver = ref(false);
const hovered = ref(false);

// ── Files state ──
const filesPassed = computed(() => props.files !== undefined);
const internalFiles = ref<File[]>([]);
const filesArr = computed<File[]>(() =>
  filesPassed.value ? props.files ?? [] : internalFiles.value
);
const supportsFiles = computed(() => filesPassed.value || true);

function setFiles(next: File[]) {
  if (!filesPassed.value) {
    internalFiles.value = next;
  }
  emit("update:files", next);
}

// ── Queue state ──
const queuePassed = computed(() => props.queue !== undefined);
const internalQueue = ref<QueuedMessage[]>([]);
const queueArr = computed<QueuedMessage[]>(() =>
  queuePassed.value ? props.queue ?? [] : internalQueue.value
);
const supportsQueue = computed(() => props.status !== undefined);
const streaming = computed(() => props.status === "streaming");
const liveMsg = ref("");

function setQueue(next: QueuedMessage[]) {
  if (!queuePassed.value) {
    internalQueue.value = next;
  }
  emit("update:queue", next);
}

// ── History state ──
const historyIndex = ref<number | null>(null);
const draftBeforeHistory = ref("");

// ── Suggestions state ──
const suggestionsArr = computed(() => props.suggestions ?? []);
const suggestionsOpen = computed(
  () => suggestionsArr.value.length > 0 && currentValue.value === ""
);
const suggestionListRef = useTemplateRef<HTMLDivElement>("suggestionListRef");

const {
  activeIndex: activeSuggestion,
  setActiveIndex: setActiveSuggestion,
  itemRects: suggestionRects,
  session: suggestionSession,
  handlers: suggestionHandlers,
  registerItem: registerSuggestion,
  measureItems,
} = useProximityHover(suggestionListRef);

watch(
  [suggestionsOpen, () => suggestionsArr.value.length],
  ([open]) => {
    if (open) {
      nextTick(() => measureItems());
    } else {
      setActiveSuggestion(null);
    }
  },
  { immediate: true }
);

const suggestionListId = useId();
const ghostHintId = useId();
const showGhost = computed(
  () =>
    !!props.placeholderSuggestion &&
    currentValue.value === "" &&
    !(dragOver.value && supportsFiles.value)
);

// ── Region height measurement hook ──
function useRegionHeight() {
  let ro: ResizeObserver | null = null;
  const height = ref<number | null>(null);

  const setRef = (el: any) => {
    const rawEl = (el?.$el as HTMLElement | null) ?? (el as HTMLElement | null) ?? null;
    ro?.disconnect();
    ro = null;
    if (!rawEl) return;
    const sync = () => {
      const next = rawEl.parentElement?.scrollHeight ?? rawEl.offsetHeight;
      if (next > 0) height.value = next;
    };
    sync();
    ro = new ResizeObserver(sync);
    ro.observe(rawEl);
  };

  onUnmounted(() => {
    ro?.disconnect();
    ro = null;
  });

  return { setRef, height };
}

const filesRegion = useRegionHeight();
const queueRegion = useRegionHeight();
const suggestionsRegion = useRegionHeight();

// ── Textarea line-height & auto-resize ──
let lineHeightCache: { el: HTMLTextAreaElement; value: number } | null = null;

function resizeTextarea() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  if (!lineHeightCache || lineHeightCache.el !== el) {
    const lh = parseFloat(window.getComputedStyle(el).lineHeight);
    lineHeightCache = { el, value: Number.isNaN(lh) ? 20 : lh };
  }
  const min = lineHeightCache.value * props.minRows;
  const max = lineHeightCache.value * props.maxRows;
  const next = Math.min(Math.max(el.scrollHeight, min), max);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
}

watch(currentValue, () => nextTick(resizeTextarea));

onMounted(() => {
  resizeTextarea();
  const el = textareaRef.value;
  if (!el || typeof ResizeObserver === "undefined") return;
  let lastWidth = el.offsetWidth;
  const ro = new ResizeObserver(() => {
    const width = el.offsetWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    resizeTextarea();
  });
  ro.observe(el);
  onUnmounted(() => ro.disconnect());
});

function setCaretEnd() {
  nextTick(() => {
    const el = textareaRef.value;
    if (el) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });
}

function acceptSuggestion(text: string) {
  setActiveSuggestion(null);
  historyIndex.value = null;
  setValue(text);
  nextTick(() => {
    const el = textareaRef.value;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

const trimmed = computed(() => currentValue.value.trim());
const canSend = computed(
  () => !props.disabled && (trimmed.value.length > 0 || filesArr.value.length > 0)
);

const EDGE_DROP = "0 1px 1px -0.5px var(--shadow-color)";
const edgeShadow = computed(() => {
  if (dragOver.value) return `0 0 0 1px #6B97FF, ${EDGE_DROP}`;
  if (focusVisible.value)
    return `0 0 0 1px color-mix(in oklab, var(--foreground) 20%, transparent), ${EDGE_DROP}`;
  if (hovered.value && props.clickToFocus && !props.disabled)
    return `0 0 0 1px var(--border), ${EDGE_DROP}`;
  return undefined;
});

function handleSend() {
  if (!canSend.value) return;
  historyIndex.value = null;

  if (streaming.value && supportsQueue.value) {
    const item: QueuedMessage = {
      id: crypto.randomUUID(),
      text: trimmed.value,
      files: [...filesArr.value],
    };
    setQueue([...queueArr.value, item]);
    setValue("");
    if (supportsFiles.value) setFiles([]);
    nextTick(() => textareaRef.value?.focus());
    return;
  }

  emit("send", trimmed.value, [...filesArr.value]);
}

function handleStop() {
  emit("stop");
}

// ── Auto-dispatch on streaming -> idle ──
const prevStatus = ref(props.status);
watch(
  () => props.status,
  (next, prev) => {
    prevStatus.value = prev;
    if (!supportsQueue.value) return;
    if (prev === "streaming" && next === "idle" && queueArr.value.length > 0) {
      const [head, ...rest] = queueArr.value;
      setQueue(rest);
      emit("send", head.text, head.files, { queuedId: head.id });
      liveMsg.value = `Message sent.${rest.length ? ` ${rest.length} still queued.` : ""}`;
    }
  }
);

// ── Queue actions ──
function editQueued(item: QueuedMessage) {
  if (!supportsQueue.value) return;
  historyIndex.value = null;
  setValue(item.text);
  if (supportsFiles.value) {
    setFiles(props.maxFiles != null ? item.files.slice(0, props.maxFiles) : item.files);
  }
  setQueue(queueArr.value.filter((q) => q.id !== item.id));
  nextTick(() => {
    const el = textareaRef.value;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

function removeQueued(item: QueuedMessage) {
  setQueue(queueArr.value.filter((q) => q.id !== item.id));
}

function moveQueued(item: QueuedMessage, dir: -1 | 1) {
  const cur = queueArr.value;
  const i = cur.findIndex((q) => q.id === item.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cur.length) return;
  const next = [...cur];
  [next[i], next[j]] = [next[j], next[i]];
  setQueue(next);
}

const buttonMode = computed<"send" | "queue" | "stop">(() => {
  if (!streaming.value) return "send";
  if (canSend.value && supportsQueue.value) return "queue";
  return "stop";
});

const buttonLabel = computed(() => {
  if (buttonMode.value === "stop") return "Stop";
  if (buttonMode.value === "queue") return "Queue message";
  return props.sendLabel;
});

function handleKeyDown(e: KeyboardEvent) {
  if (e.isComposing) return;

  if (
    suggestionsOpen.value &&
    !e.shiftKey &&
    !e.altKey &&
    !e.metaKey &&
    !e.ctrlKey
  ) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion(
        activeSuggestion.value == null
          ? 0
          : Math.min(activeSuggestion.value + 1, suggestionsArr.value.length - 1)
      );
      return;
    }
    if (activeSuggestion.value != null) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestion(
          activeSuggestion.value === 0 ? null : activeSuggestion.value - 1
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        acceptSuggestion(suggestionsArr.value[activeSuggestion.value]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setActiveSuggestion(null);
        return;
      }
    }
  }

  // Tab fills suggested placeholder prompt
  if (
    e.key === "Tab" &&
    !e.shiftKey &&
    props.placeholderSuggestion &&
    currentValue.value === ""
  ) {
    e.preventDefault();
    acceptSuggestion(props.placeholderSuggestion);
    return;
  }

  // Readline-style history
  const hist = props.history;
  if (
    hist.length > 0 &&
    (e.key === "ArrowUp" || e.key === "ArrowDown") &&
    !e.shiftKey &&
    !e.altKey &&
    !e.metaKey &&
    !e.ctrlKey
  ) {
    const el = textareaRef.value;
    if (el) {
      const caret = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? caret;
      if (e.key === "ArrowUp" && !currentValue.value.slice(0, caret).includes("\n")) {
        const start = historyIndex.value == null ? hist.length : historyIndex.value;
        if (start > 0) {
          e.preventDefault();
          if (historyIndex.value == null) draftBeforeHistory.value = currentValue.value;
          const ni = start - 1;
          historyIndex.value = ni;
          setValue(hist[ni]);
          setCaretEnd();
        }
        return;
      }
      if (
        e.key === "ArrowDown" &&
        historyIndex.value != null &&
        !currentValue.value.slice(end).includes("\n")
      ) {
        e.preventDefault();
        const ni = historyIndex.value + 1;
        if (ni >= hist.length) {
          historyIndex.value = null;
          setValue(draftBeforeHistory.value);
        } else {
          historyIndex.value = ni;
          setValue(hist[ni]);
        }
        setCaretEnd();
        return;
      }
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleContainerMouseDown(e: MouseEvent) {
  if (!props.clickToFocus || props.disabled) return;
  const target = e.target as HTMLElement;
  if (target === textareaRef.value) return;
  if (
    target.closest(
      'button, a, input, select, textarea, [contenteditable], [role="button"], [data-im-queue]'
    )
  ) {
    return;
  }
  e.preventDefault();
  textareaRef.value?.focus();
}

// ── File helpers ──
const acceptTokens = computed(() =>
  props.accept
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function matchesAccept(file: File): boolean {
  return acceptTokens.value.some((token) => {
    if (token.endsWith("/*")) return file.type.startsWith(token.slice(0, -1));
    if (token.startsWith(".")) return file.name.toLowerCase().endsWith(token.toLowerCase());
    return file.type === token;
  });
}

function addFiles(incoming: File[]) {
  const fingerprint = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;
  const existing = new Set(filesArr.value.map(fingerprint));
  const accepted: File[] = [];
  for (const f of incoming) {
    if (!matchesAccept(f)) continue;
    const fp = fingerprint(f);
    if (existing.has(fp)) continue;
    existing.add(fp);
    accepted.push(f);
  }
  if (!accepted.length) return;
  const next = [...filesArr.value, ...accepted];
  setFiles(props.maxFiles != null ? next.slice(0, props.maxFiles) : next);
}

function removeFile(idx: number) {
  setFiles(filesArr.value.filter((_, i) => i !== idx));
}

function openFilePicker(overrideAccept?: string) {
  const el = fileInputRef.value;
  if (!el) return;
  if (overrideAccept) {
    el.accept = overrideAccept;
    el.click();
    queueMicrotask(() => {
      if (fileInputRef.value) fileInputRef.value.accept = props.accept;
    });
    return;
  }
  el.click();
}

const slotCtx = computed<InputMessageSlotContext>(() => ({
  openFilePicker,
  files: filesArr.value,
}));

// ── Drag & Drop ──
function handleDragOver(e: DragEvent) {
  if (!supportsFiles.value || props.disabled) return;
  if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  dragOver.value = true;
}

function handleDragLeave(e: DragEvent) {
  const wrapper = e.currentTarget as HTMLElement | null;
  const next = e.relatedTarget as Node | null;
  if (next && wrapper?.contains(next)) return;
  dragOver.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  dragOver.value = false;
  if (!supportsFiles.value || props.disabled || !e.dataTransfer?.files) return;
  addFiles(Array.from(e.dataTransfer.files));
}

function handleFileInputChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files) return;
  addFiles(Array.from(target.files));
  target.value = "";
}

function focus() {
  textareaRef.value?.focus();
}

defineExpose({
  focus,
  textareaRef,
  openFilePicker,
});
</script>

<template>
  <div
    :class="
      cn(
        'flex flex-col gap-1 p-2 transition-[box-shadow,color] duration-80',
        surfaceClasses(2, 2),
        shape.container,
        clickToFocus && !disabled && 'cursor-text',
        disabled && 'pointer-events-none opacity-50',
        props.class
      )
    "
    :style="edgeShadow ? { boxShadow: edgeShadow, ...props.style } : props.style"
    @mousedown="handleContainerMouseDown"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <input
      v-if="supportsFiles"
      ref="fileInputRef"
      type="file"
      :accept="accept"
      :multiple="maxFiles == null || maxFiles > 1"
      class="hidden"
      aria-hidden="true"
      tabindex="-1"
      @change="handleFileInputChange"
    />

    <!-- 附件预览行 -->
    <AnimatePresence :initial="false">
      <motion.div
        v-if="filesArr.length > 0"
        key="preview-row"
        :initial="{ height: 0, opacity: 0 }"
        :animate="{ height: filesRegion.height.value ?? 0, opacity: 1 }"
        :exit="{ height: 0, opacity: 0 }"
        :transition="{ ...spring.moderate, bounce: 0 }"
        class="overflow-hidden"
      >
        <div :ref="filesRegion.setRef" class="flex flex-wrap gap-2 pb-1">
          <AnimatePresence :initial="false" mode="popLayout">
            <motion.div
              v-for="(file, i) in filesArr"
              :key="`${file.name}-${file.size}-${file.lastModified}`"
              layout
              :initial="{ opacity: 0, scale: 0.9 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.9, transition: spring.fast.exit }"
              :transition="spring.fast"
              class="group/tile relative shrink-0 cursor-default"
            >
              <FileThumbnail :file="file" :size="filePreviewSize" />
              <Tooltip content="移除" side="top">
                <button
                  type="button"
                  :aria-label="`移除 ${file.name}`"
                  class="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white opacity-0 outline-none transition-opacity duration-80 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)] group-hover/tile:opacity-100"
                  @click.stop="removeFile(i)"
                >
                  <XIcon :size="12" :stroke-width="2.5" />
                </button>
              </Tooltip>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>

    <!-- 队列消息行 -->
    <AnimatePresence v-if="supportsQueue && showQueue" :initial="false">
      <motion.div
        v-if="queueArr.length > 0"
        key="queue-row"
        :initial="{ height: 0, opacity: 0 }"
        :animate="{ height: queueRegion.height.value ?? 0, opacity: 1 }"
        :exit="{ height: 0, opacity: 0 }"
        :transition="{ ...spring.moderate, bounce: 0 }"
        class="overflow-hidden"
      >
        <div :ref="queueRegion.setRef">
          <ReorderGroup
            axis="y"
            :values="queueArr"
            data-im-queue
            class="flex flex-col gap-1 pb-1"
            @update:values="setQueue"
          >
            <AnimatePresence :initial="false">
              <ReorderItem
                v-for="(item, i) in queueArr"
                :key="item.id"
                :value="item"
                layout
                :initial="reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: spring.fast.exit }"
                :transition="spring.fast"
                :aria-label="`Queued message ${i + 1} of ${queueArr.length}: ${item.text || `${item.files.length} attachments`}`"
                tabindex="0"
                :class="
                  cn(
                    'group/qrow flex items-center gap-2 rounded-lg bg-muted select-none outline-none',
                    compactStep ? 'h-7 px-2 text-[12px]' : 'h-8 px-2.5 text-[13px]',
                    'text-foreground/85 cursor-grab active:cursor-grabbing',
                    'focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]'
                  )
                "
                :style="{ fontVariationSettings: fontWeights.normal }"
                @dblclick="editQueued(item)"
                @keydown="
                  (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === 'F2') {
                      e.preventDefault();
                      editQueued(item);
                    } else if (e.key === 'Delete' || e.key === 'Backspace') {
                      e.preventDefault();
                      removeQueued(item);
                    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault();
                      moveQueued(item, e.key === 'ArrowUp' ? -1 : 1);
                    }
                  }
                "
              >
                <span
                  v-if="item.files.length > 0"
                  class="flex shrink-0 items-center gap-0.5 text-muted-foreground"
                >
                  <ImageIcon :size="13" />
                  <span v-if="item.text" class="tabular-nums">{{ item.files.length }}</span>
                </span>
                <span class="-my-1 min-w-0 flex-1 truncate py-1 [text-box:trim-both_cap_alphabetic]">
                  {{ item.text || `${item.files.length} attachment${item.files.length === 1 ? '' : 's'}` }}
                </span>
                <Tooltip content="移除" side="top">
                  <button
                    type="button"
                    :aria-label="`Remove queued message: ${item.text}`"
                    :class="
                      cn(
                        'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full',
                        'text-muted-foreground outline-none hover:bg-hover hover:text-foreground',
                        isTouch ? 'opacity-100' : 'opacity-0 group-hover/qrow:opacity-100 focus-visible:opacity-100',
                        'transition-opacity duration-80 focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]'
                      )
                    "
                    @pointerdown.stop
                    @click.stop="removeQueued(item)"
                  >
                    <XIcon :size="13" :stroke-width="2.5" />
                  </button>
                </Tooltip>
              </ReorderItem>
            </AnimatePresence>
          </ReorderGroup>
        </div>
      </motion.div>
    </AnimatePresence>

    <!-- Textarea 区域 -->
    <div class="relative">
      <textarea
        ref="textareaRef"
        :value="currentValue"
        :rows="minRows"
        :disabled="disabled"
        :placeholder="
          dragOver && supportsFiles
            ? '将文件拖放至此添加到聊天'
            : placeholderSuggestion
              ? undefined
              : placeholder
        "
        :aria-label="textareaProps?.['aria-label'] ?? 'Message'"
        :aria-describedby="showGhost ? ghostHintId : undefined"
        :aria-activedescendant="
          activeSuggestion != null ? `${suggestionListId}-${activeSuggestion}` : undefined
        "
        :class="
          cn(
            'w-full resize-none bg-transparent outline-none',
            'text-foreground placeholder:text-muted-foreground',
            compactStep
              ? 'px-1.5 py-1.5 text-[13px] leading-[18px]'
              : 'px-2 py-2 text-[14px] leading-5'
          )
        "
        :style="{ fontVariationSettings: fontWeights.normal }"
        v-bind="textareaProps"
        @input="
          (e) => {
            historyIndex = null;
            setActiveSuggestion(null);
            setValue((e.target as HTMLTextAreaElement).value);
          }
        "
        @keydown="handleKeyDown"
        @focus="
          (e) => {
            if ((e.target as HTMLElement).matches(':focus-visible')) focusVisible = true;
          }
        "
        @blur="
          () => {
            focusVisible = false;
            setActiveSuggestion(null);
          }
        "
      />

      <!-- Ghost 占位符推荐词 -->
      <div
        v-if="showGhost"
        aria-hidden="true"
        :class="
          cn(
            'pointer-events-none absolute inset-0 overflow-hidden text-muted-foreground',
            compactStep
              ? 'px-1.5 py-1.5 text-[13px] leading-[18px]'
              : 'px-2 py-2 text-[14px] leading-5'
          )
        "
        :style="{ fontVariationSettings: fontWeights.normal }"
      >
        <span class="flex max-w-full items-center gap-1.5">
          <span class="min-w-0 truncate">{{ placeholderSuggestion }}</span>
          <kbd
            :class="
              cn(
                'inline-flex shrink-0 -translate-y-px items-center rounded-[5px] border border-border bg-background px-1 font-sans text-muted-foreground',
                compactStep ? 'h-4 text-[10px]' : 'h-[18px] text-[11px]'
              )
            "
          >
            Tab
          </kbd>
        </span>
      </div>
      <span v-if="showGhost" :id="ghostHintId" class="sr-only">
        建议提示词：{{ placeholderSuggestion }}。按 Tab 键填入。
      </span>
    </div>

    <!-- 底部操作栏 -->
    <div
      :class="
        cn(
          'flex items-center justify-between',
          compactStep
            ? 'gap-1.5 [&_button]:h-6 [&_button]:text-[11px] [&_button.w-7]:w-6'
            : 'gap-2'
        )
      "
    >
      <div class="flex min-w-0 items-center gap-1.5">
        <slot name="leftSlot" :="slotCtx">
          <slot name="left" :="slotCtx">
            <slot name="actions" :="slotCtx" />
          </slot>
        </slot>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <slot name="rightSlot" :="slotCtx">
          <slot name="right" :="slotCtx" />
        </slot>
        <Button
          type="button"
          variant="primary"
          size="icon-sm"
          :aria-label="buttonLabel"
          :disabled="buttonMode === 'stop' ? disabled : !canSend"
          @click="buttonMode === 'stop' ? handleStop() : handleSend()"
        >
          <AnimatePresence mode="wait" :initial="false">
            <motion.span
              :key="buttonMode === 'stop' ? 'stop' : 'arrow'"
              :initial="reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, transition: spring.fast.exit }"
              :transition="spring.fast"
              class="flex items-center justify-center leading-none"
            >
              <span v-if="buttonMode === 'stop'" class="h-3 w-3 rounded-[3px] bg-current" />
              <ArrowUpIcon
                v-else
                :size="compactStep ? 15 : 19"
                :class="cn('block', compactStep ? '!h-[15px] !w-[15px]' : '!h-[19px] !w-[19px]')"
              />
            </motion.span>
          </AnimatePresence>
        </Button>
      </div>
    </div>

    <!-- 建议词列表 -->
    <AnimatePresence v-if="suggestionsArr.length > 0" :initial="false">
      <motion.div
        v-if="suggestionsOpen"
        key="suggestions"
        :initial="{ height: 0, opacity: 0 }"
        :animate="{ height: suggestionsRegion.height.value ?? 0, opacity: 1 }"
        :exit="{ height: 0 }"
        :transition="{ ...spring.moderate, bounce: 0 }"
        class="-mx-2 -mt-1 overflow-hidden"
      >
        <div
          :ref="
            (el) => {
              suggestionListRef = el as HTMLDivElement;
              suggestionsRegion.setRef(el);
            }
          "
          :id="suggestionListId"
          role="listbox"
          aria-label="Suggested prompts"
          class="relative mt-2 flex flex-col border-t border-border/60 px-1.5 pt-1.5"
          @mouseenter="suggestionHandlers.onMouseEnter"
          @mousemove="suggestionHandlers.onMouseMove"
          @mouseleave="suggestionHandlers.onMouseLeave"
        >
          <!-- 悬停/键盘高亮滑动块 -->
          <AnimatePresence>
            <motion.div
              v-if="activeSuggestion != null && suggestionRects[activeSuggestion]"
              :key="suggestionSession"
              :class="cn('pointer-events-none absolute bg-hover', shape.bg)"
              :initial="{
                opacity: 0,
                top: suggestionRects[activeSuggestion].top + 'px',
                left: suggestionRects[activeSuggestion].left + 'px',
                width: suggestionRects[activeSuggestion].width + 'px',
                height: suggestionRects[activeSuggestion].height + 'px',
              }"
              :animate="{
                opacity: 1,
                top: suggestionRects[activeSuggestion].top + 'px',
                left: suggestionRects[activeSuggestion].left + 'px',
                width: suggestionRects[activeSuggestion].width + 'px',
                height: suggestionRects[activeSuggestion].height + 'px',
              }"
              :exit="{ opacity: 0, transition: spring.fast.exit }"
              :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
            />
          </AnimatePresence>

          <!-- 建议词条目 -->
          <div
            v-for="(s, i) in suggestionsArr"
            :key="`${s}-${i}`"
            :ref="
              (el) => {
                registerSuggestion(i, el as HTMLElement | null);
              }
            "
            :id="`${suggestionListId}-${i}`"
            role="option"
            :aria-selected="i === activeSuggestion"
            :class="
              cn(
                'relative flex cursor-pointer items-center gap-2 select-none',
                compactStep ? 'h-7 px-2 text-[13px]' : 'h-8 px-2.5 text-[14px]',
                'text-muted-foreground transition-colors duration-80',
                i === activeSuggestion && 'text-foreground'
              )
            "
            :style="{ fontVariationSettings: fontWeights.normal }"
            @click="acceptSuggestion(s)"
          >
            <span class="-my-1 min-w-0 flex-1 truncate py-1 [text-box:trim-both_cap_alphabetic]">
              {{ s }}
            </span>
            <ArrowDownIcon
              v-if="i !== activeSuggestion && i === 0 && activeSuggestion == null"
              :size="13"
              class="shrink-0 text-muted-foreground/70 transition-opacity duration-80"
            />
            <EnterIcon
              v-else
              :size="13"
              :class="cn('shrink-0 transition-opacity duration-80', i === activeSuggestion ? 'opacity-100' : 'opacity-0')"
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>

    <!-- 屏幕朗诵状态 -->
    <span class="sr-only" role="status" aria-live="polite">
      {{ liveMsg }}
    </span>
  </div>
</template>
