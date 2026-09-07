<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onUnmounted,
  useTemplateRef,
  nextTick,
} from "vue";
import { AnimatePresence, motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize, type SizeVariant } from "../../../lib/size-context";
import { useIcon } from "../../../lib/icon-context";
import { useProximityHover } from "../../../hooks/use-proximity-hover";
import { useMergeSplitBlocks, type Run } from "../../../hooks/use-merge-split";
import SelectionBackgrounds from "../../../hooks/SelectionBackgrounds.vue";
import Button from "../button/Button.vue";
import AskUserRow from "./AskUserRow.vue";
import AskUserShortcutChip from "./AskUserShortcutChip.vue";
import { isPointerFocusRedirect } from "./pointer-focus";
import type {
  AskUserQuestion,
  AskUserOption,
  AskUserAnswer,
} from "./ask-user-questions-types";

// ─── AskUserQuestions ────────────────────────────────────────────────────
// 逐题推进的提问卡片。单选点行即提交并前进；多选/自由文本用底部提交
// 按钮；⌘/⌃+Enter 等价；1-9 直选选项；←/→ 后退/跳过；↑/↓ 在行间移动
// 与悬停共用同一套指示器。相邻多选合并为一个圆角背景块（merge/split
// 边界动画）。卡片高度真实布局值弹簧动画，页脚逐帧回流。

export interface AskUserQuestionsProps {
  questions: AskUserQuestion[];
  currentIndex?: number;
  defaultCurrentIndex?: number;
  answers?: Record<string, AskUserAnswer>;
  defaultAnswers?: Record<string, AskUserAnswer>;
  skipLabel?: string;
  showCloseButton?: boolean;
  size?: SizeVariant;
  class?: string;
}

const props = withDefaults(defineProps<AskUserQuestionsProps>(), {
  defaultCurrentIndex: 0,
  skipLabel: "跳过",
  showCloseButton: true,
});

const emit = defineEmits<{
  (e: "update:currentIndex", index: number): void;
  (e: "update:answers", answers: Record<string, AskUserAnswer>): void;
  (e: "complete", answers: Record<string, AskUserAnswer>): void;
  (e: "skip", questionId: string, currentIndex: number): void;
  (e: "close"): void;
}>();

defineOptions({ name: "AskUserQuestions" });

function questionKey(q: AskUserQuestion, i: number) {
  return q.id ?? `q-${i}`;
}

function optionKey(o: AskUserOption, i: number) {
  return o.id ?? `o-${i}`;
}

// ── 受控 / 非受控状态 ────────────────────────────────────────
const indexPassed = computed(() => props.currentIndex !== undefined);
const internalIndex = ref(props.defaultCurrentIndex);
const index = computed(() =>
  indexPassed.value ? (props.currentIndex as number) : internalIndex.value
);

function setIndex(next: number) {
  if (!indexPassed.value) internalIndex.value = next;
  emit("update:currentIndex", next);
}

const answersPassed = computed(() => props.answers !== undefined);
const internalAnswers = ref<Record<string, AskUserAnswer>>(props.defaultAnswers ?? {});
const answers = computed(() =>
  answersPassed.value ? (props.answers as Record<string, AskUserAnswer>) : internalAnswers.value
);

// 回答读取走 ref 镜像：同一 tick 内先写后读不会读到过期的渲染快照。
const answersRef = ref(answers.value);
watch(answers, (a) => {
  answersRef.value = a;
});

function writeAnswers(
  updater: (prev: Record<string, AskUserAnswer>) => Record<string, AskUserAnswer>
): Record<string, AskUserAnswer> {
  const next = updater(answersRef.value);
  answersRef.value = next;
  if (!answersPassed.value) internalAnswers.value = next;
  emit("update:answers", next);
  return next;
}

const shape = useShape();
const sizeClasses = useSize(() => props.size);
const compact = computed(() => sizeClasses.value.variant === "compact");
const ArrowLeftIcon = useIcon("arrow-left");
const ArrowRightIcon = useIcon("arrow-right");
const XIcon = useIcon("x");

// 平台检测：Continue 快捷键提示显示 ⌘（macOS）或 ⌃（其他）。
const isMac =
  typeof navigator !== "undefined"
    ? /mac/i.test(
        (navigator as Navigator & { userAgentData?: { platform?: string } })
          .userAgentData?.platform ??
          navigator.platform ??
          ""
      )
    : false;

const total = computed(() => props.questions.length);
const safeIndex = computed(() =>
  Math.max(0, Math.min(index.value, Math.max(0, total.value - 1)))
);
const question = computed(() => props.questions[safeIndex.value]);
const qId = computed(() => (question.value ? questionKey(question.value, safeIndex.value) : ""));
const currentAnswer = computed(() => answers.value[qId.value]);

const isMulti = computed(() => !!question.value?.multiSelect);
const isSkippable = computed(() => question.value?.skippable !== false);
const isFreeText = computed(() => !!question.value?.freeText);
const isFreeTextMultiline = computed(() => question.value?.freeTextMultiline !== false);
// freeText 独占整个答案区，即使同时设置了 allowOther 也抑制 Other 行。
const allowOther = computed(() => !isFreeText.value && !!question.value?.allowOther);
const selectedIds = computed(() => currentAnswer.value?.selectedIds ?? []);
const otherText = computed(() => currentAnswer.value?.otherText ?? "");

const options = computed(() => question.value?.options ?? []);
const otherIndex = computed(() => (allowOther.value ? options.value.length : -1));
const rowCount = computed(() => options.value.length + (allowOther.value ? 1 : 0));

// ── refs 与邻近悬停 ───────────────────────────────────────
const rootRef = useTemplateRef<HTMLDivElement>("rootRef");
const hasQuestion = computed(() => !!question.value);
const rowsContainerRef = ref<HTMLDivElement | null>(null);
const otherInputRef = useTemplateRef<HTMLTextAreaElement>("otherInputRef");

// 文档级 1-9 快捷键的实例注册表：只有包含焦点的实例（或焦点在任何
// 实例之外时最近挂载的那个）响应按键。模块级（跨实例共享），存放在
// window 上避免 dev HMR 双实例拷贝。
const mountedInstances: HTMLElement[] =
  ((globalThis as any).__askUserInstances ??= []);

watch(
  hasQuestion,
  (has) => {
    const el = rootRef.value;
    if (!has || !el) return;
    mountedInstances.push(el);
    onUnmounted(() => {
      const i = mountedInstances.indexOf(el);
      if (i !== -1) mountedInstances.splice(i, 1);
    });
  },
  { flush: "post" }
);

// 文本域多行标志：Other 字段在显示超过一行（显式 \n 或文本换行）时
// 才切到 topAlign；单行状态保持 items-center 与选项行光学对齐。
const isOtherMultiline = ref(false);
watch(qId, () => {
  isOtherMultiline.value = false;
});

function autoResizeOther() {
  const el = otherInputRef.value;
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
  const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 18;
  isOtherMultiline.value = el.scrollHeight > lineHeight * 1.5;
  rows.measureItems();
}

watch([otherText, qId], () => nextTick(autoResizeOther), { flush: "post" });

// ── freeText 自动聚焦 ─────────────────────────────────────
watch(
  [isFreeText, qId],
  ([ft]) => {
    if (!ft) return;
    // preventScroll：字段出现时光标就位而不拖动视口。
    nextTick(() => otherInputRef.value?.focus({ preventScroll: true } as FocusOptions));
  },
  { immediate: false }
);

// ── 动画高度 ──────────────────────────────────────────────
// 追踪 Q/A 内容的自然高度，把包裹层的真实高度动画到它——卡片边框与
// 页脚逐帧回流，高度形变与页脚同步移动。
const contentMeasureRef = useTemplateRef<HTMLDivElement>("contentMeasureRef");
const contentHeight = ref<number | "auto">("auto");
watch(
  contentMeasureRef,
  (el, _prev, onCleanup) => {
    if (!el) return;
    const update = () => {
      contentHeight.value = el.offsetHeight;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  },
  { immediate: true, flush: "post" }
);

const focusedIndex = ref<number | null>(null);
// 校验消息（null = 有效）。
const freeTextError = ref<string | null>(null);

// 问题变化时重置瞬态状态
watch([safeIndex], () => {
  rows.setActiveIndex(null);
  focusedIndex.value = null;
  freeTextError.value = null;
});

// ── 跨问题变化的键盘焦点恢复 ──────────────────────────────
// 问题内容在 qId 上重挂载，聚焦行被销毁、焦点掉到 body。如果是从行内
// 导航过来的（用户在用键盘），重新聚焦新问题的第一行。
const restoreFocusRef = ref(false);
function markFocusRestore() {
  if (
    rowsContainerRef.value?.contains(document.activeElement) &&
    focusedIndex.value !== null
  ) {
    restoreFocusRef.value = true;
  }
}
watch(safeIndex, () => {
  if (!restoreFocusRef.value) return;
  restoreFocusRef.value = false;
  nextTick(() => {
    const firstRow = rowsContainerRef.value?.querySelector(
      '[data-proximity-index="0"]'
    ) as HTMLElement | null;
    firstRow?.focus();
  });
});

// ── 回答动作 ──────────────────────────────────────────────
function goNext(snapshot: Record<string, AskUserAnswer>) {
  if (safeIndex.value >= total.value - 1) {
    emit("complete", snapshot);
  } else {
    markFocusRestore();
    setIndex(safeIndex.value + 1);
  }
}

function handleSingleSelect(optId: string) {
  if (!question.value) return;
  const text = answersRef.value[qId.value]?.otherText;
  const snapshot = writeAnswers((prev) => ({
    ...prev,
    [qId.value]: {
      questionId: qId.value,
      selectedIds: [optId],
      otherText: text || undefined,
      skipped: false,
    },
  }));
  goNext(snapshot);
}

function handleMultiToggle(optId: string) {
  if (!question.value) return;
  writeAnswers((prev) => {
    const existing = prev[qId.value];
    const set = new Set(existing?.selectedIds ?? []);
    if (set.has(optId)) set.delete(optId);
    else set.add(optId);
    return {
      ...prev,
      [qId.value]: {
        questionId: qId.value,
        selectedIds: Array.from(set),
        otherText: existing?.otherText,
        skipped: false,
      },
    };
  });
}

function handleOtherChange(text: string) {
  if (!question.value) return;
  // 编辑即清除校验错误——用户正在修。
  freeTextError.value = null;
  writeAnswers((prev) => ({
    ...prev,
    [qId.value]: {
      questionId: qId.value,
      selectedIds: prev[qId.value]?.selectedIds ?? [],
      otherText: text,
      skipped: false,
    },
  }));
}

function handleOtherSubmit() {
  if (!question.value) return;
  const text = (answersRef.value[qId.value]?.otherText ?? "").trim();
  if (!text) return;
  if (question.value.freeText && question.value.freeTextValidate) {
    const message = question.value.freeTextValidate(text);
    if (message) {
      freeTextError.value = message;
      return;
    }
  }
  freeTextError.value = null;
  const snapshot = writeAnswers((prev) => ({
    ...prev,
    [qId.value]: {
      questionId: qId.value,
      selectedIds: prev[qId.value]?.selectedIds ?? [],
      otherText: text,
      skipped: false,
    },
  }));
  goNext(snapshot);
}

function handleSkip() {
  if (!question.value) return;
  const snapshot = writeAnswers((prev) => ({
    ...prev,
    [qId.value]: {
      questionId: qId.value,
      selectedIds: prev[qId.value]?.selectedIds ?? [],
      otherText: prev[qId.value]?.otherText,
      skipped: true,
    },
  }));
  emit("skip", qId.value, safeIndex.value);
  goNext(snapshot);
}

function handleMultiNext() {
  goNext(answersRef.value);
}

function handleBack() {
  if (safeIndex.value > 0) {
    markFocusRestore();
    setIndex(safeIndex.value - 1);
  }
}

// ── 键盘快捷键：1-9（文档级）──────────────────────────────
// 数字应当在不聚焦卡片时也生效，但只有 ONE 个实例响应：包含焦点的
// 那个，或焦点在所有实例之外时最近挂载的那个。
watch(
  [question, options, isMulti, allowOther],
  () => {
    if (!question.value) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      const root = rootRef.value;
      if (!root) return;
      if (!root.contains(target)) {
        if (mountedInstances.some((el) => el !== root && el.contains(target))) return;
        const wrapped = mountedInstances.filter((el) => target.contains(el));
        const pool = wrapped.length > 0 ? wrapped : mountedInstances;
        if (pool[pool.length - 1] !== root) return;
      }
      const code = e.key;
      if (code < "1" || code > "9") return;
      const idx = parseInt(code, 10) - 1;
      if (idx >= 0 && idx < options.value.length) {
        e.preventDefault();
        const oid = optionKey(options.value[idx], idx);
        if (isMulti.value) handleMultiToggle(oid);
        else handleSingleSelect(oid);
      } else if (idx === options.value.length && allowOther.value) {
        e.preventDefault();
        otherInputRef.value?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    onUnmounted(() => document.removeEventListener("keydown", handler));
  },
  { immediate: true }
);

// ── 键盘导航 ──────────────────────────────────────────────
// ↑/↓ 在行间移动，与鼠标悬停共用同一指示器（activeIndex → bg-hover）。
// ← = 后退，→ = 跳过。Other 文本域内 ←/→/Home/End 原生移动光标；
// ↑/↓ 只在光标已到首/末行时才劫持去切换行。
function focusRow(idx: number) {
  const el = rowsContainerRef.value?.querySelector(
    `[data-proximity-index="${idx}"]`
  ) as HTMLElement | null;
  el?.focus();
}

const rows = useProximityHover(rowsContainerRef);

// 行数/问题/形状变化时重测
watch([qId, rowCount, () => shape.value], () => {
  rows.measureItems();
});

function moveActive(next: number) {
  rows.setActiveIndex(next);
  // Other 行是文本字段——直接聚焦输入；其他聚焦行本身。
  if (allowOther.value && next === otherIndex.value) otherInputRef.value?.focus();
  else focusRow(next);
}

function handleNavKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const isTextInput =
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

  if (isTextInput && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  if (
    isTextInput &&
    (e.key === "ArrowUp" || e.key === "ArrowDown") &&
    target.tagName === "TEXTAREA"
  ) {
    // 位置边界检查——显式 \n 与视觉换行都适用。只有光标已无处可去时
    // 才劫持按键去切换行。
    const ta = target as HTMLTextAreaElement;
    if (e.key === "ArrowUp" && (ta.selectionStart ?? 0) > 0) return;
    if (e.key === "ArrowDown" && (ta.selectionEnd ?? 0) < ta.value.length) return;
  }

  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "ArrowLeft") {
      if (safeIndex.value > 0) handleBack();
    } else if (isSkippable.value && total.value > 1) {
      handleSkip();
    }
    return;
  }

  if (rowCount.value === 0) return;
  if (
    e.key === "ArrowDown" ||
    e.key === "ArrowUp" ||
    e.key === "Home" ||
    e.key === "End"
  ) {
    e.preventDefault();
    e.stopPropagation();
    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rowCount.value - 1;
    else {
      const base = isTextInput ? otherIndex.value : (rows.activeIndex.value ?? -1);
      next = e.key === "ArrowDown" ? base + 1 : base - 1;
      next = (next + rowCount.value) % rowCount.value;
    }
    moveActive(next);
  }
}

// ⌘/⌃+Enter 提交多选与自由文本，等价底部 Continue。挂在根上，焦点在
// 卡片内任意处都生效；事件从聚焦后代冒泡，实例天然隔离。
function handleRootKey(e: KeyboardEvent) {
  if (e.key !== "Enter") return;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod || !(isMulti.value || isFreeText.value)) return;
  e.preventDefault(); // 防止聚焦的按钮/行同时激活
  if (isFreeText.value) {
    if (otherText.value.trim().length > 0) handleOtherSubmit();
    return;
  }
  const hasAnswer = selectedIds.value.length > 0 || otherText.value.trim().length > 0;
  if (hasAnswer) handleMultiNext();
}

// ── 悬停/焦点指示器布局 ───────────────────────────────────
const activeRect = computed(() =>
  rows.activeIndex.value !== null ? (rows.itemRects.value[rows.activeIndex.value] ?? null) : null
);
// focusedIndex 只在 :focus-visible 时设置——蓝色形变环跟随键盘焦点。
// Other 字段有意抑制：它有自己的输入框处理（空时提示、有字时合并选中
// 背景），环在那里是噪音。
const focusRingRect = computed(() =>
  focusedIndex.value !== null && !(allowOther.value && focusedIndex.value === otherIndex.value)
    ? (rows.itemRects.value[focusedIndex.value] ?? null)
    : null
);

// ── 选中行分组（相邻选中合并）─────────────────────────────
// 与 CheckboxGroup 模式一致：连续选中索引折叠成单一圆角背景块；稳定 id
// 让 motion 在相邻行切换时形变块尺寸/位置而不是退出重进。Other 行有
// 文本时也计入，让它与相邻选中选项合并进同一块。
const selectedIndices = computed(() => {
  const set = new Set<number>();
  options.value.forEach((opt, i) => {
    if (selectedIds.value.includes(optionKey(opt, i))) set.add(i);
  });
  if (allowOther.value && otherText.value.length > 0) set.add(otherIndex.value);
  return set;
});

let groupIdCounter = 0;
let prevGroupMap = new Map<number, number>();
const selectedGroups = computed<Run[]>(() => {
  const runs: { start: number; end: number }[] = [];
  const sorted = [...selectedIndices.value].sort((a, b) => a - b);
  for (const idx of sorted) {
    const last = runs[runs.length - 1];
    if (last && idx === last.end + 1) last.end = idx;
    else runs.push({ start: idx, end: idx });
  }

  // 稳定 run id：增长/收缩的 run 走动画而不是退出重进。
  const usedIds = new Set<number>();
  const nextGroupMap = new Map<number, number>();
  const groups = runs.map((run) => {
    let stableId: number | null = null;
    for (let i = run.start; i <= run.end; i++) {
      const prev = prevGroupMap.get(i);
      if (prev !== undefined && !usedIds.has(prev)) {
        stableId = prev;
        break;
      }
    }
    const id = stableId ?? ++groupIdCounter;
    usedIds.add(id);
    for (let i = run.start; i <= run.end; i++) nextGroupMap.set(i, id);
    return { ...run, id };
  });
  prevGroupMap = nextGroupMap;
  return groups;
});

// 选中背景，带 merge/split 边界动画。背景用 shape.bg，角随其半径动画。
const blocks = useMergeSplitBlocks(selectedGroups, rows.itemRects, shape.value.bgRadius);

const showBack = computed(() => total.value > 1 && safeIndex.value > 0);
const showSkip = computed(() => total.value > 1 && isSkippable.value);
// freeText 与多选共用底部提交按钮。
const showSubmit = computed(() => isMulti.value || isFreeText.value);
const showFooter = computed(() => showBack.value || showSkip.value || showSubmit.value);

// ── 单选组 roving tabindex ────────────────────────────────
// 整组一个 tab 停靠点：第一个选中行，未回答时第一行。方向键处理
// 行间移动；Tab 越过整组。Other 行不占停靠——它的 textarea 自身可聚焦。
const firstSelectedRow = computed(() =>
  options.value.findIndex((opt, i) => selectedIds.value.includes(optionKey(opt, i)))
);

function rowTabIndex(i: number): number {
  return i === firstSelectedRow.value || (firstSelectedRow.value === -1 && i === 0) ? 0 : -1;
}

function handleRowKeydown(e: KeyboardEvent, optId: string) {
  if ((e.key === " " || e.key === "Enter") && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    if (isMulti.value) handleMultiToggle(optId);
    else handleSingleSelect(optId);
  }
}

function handleRowsFocus(e: FocusEvent) {
  // 在容器上跟踪焦点（focusin 冒泡）：activeIndex 把悬停高亮镜像到聚焦
  // 行；focusedIndex 喂给形变蓝环，用 :focus-visible 门控——鼠标点击
  // 聚焦行不画环。
  const target = e.target as HTMLElement;
  const indexAttr = target.closest("[data-proximity-index]")?.getAttribute("data-proximity-index");
  if (indexAttr != null) {
    const idx = Number(indexAttr);
    rows.setActiveIndex(idx);
    focusedIndex.value =
      !isPointerFocusRedirect() && target.matches(":focus-visible") ? idx : null;
  }
}

function handleRowsBlur(e: FocusEvent) {
  // 只有焦点离开整组才清除——行到行的移动保持指示器挂载以便形变。
  if (rowsContainerRef.value?.contains(e.relatedTarget as Node)) return;
  focusedIndex.value = null;
  rows.setActiveIndex(null);
}

const rowsClass = computed(() => "relative flex flex-col gap-0.5 -mx-3");
</script>

<template>
  <div
    v-if="!question"
    ref="rootRef"
    :class="
      cn('w-full max-w-[520px] border border-border bg-card p-5', shape.container, props.class)
    "
  >
    <p class="text-[13px] text-muted-foreground">没有问题。</p>
  </div>

  <div
    v-else
    ref="rootRef"
    :class="
      cn(
        // overflow-hidden 把页脚按钮裁进卡片圆角边界——退出的按钮在
        // 边缘被裁而不是飞出卡片外。
        'relative w-full max-w-[520px] overflow-hidden border border-border bg-card',
        shape.container,
        props.class
      )
    "
    @keydown="handleRootKey"
  >
    <!-- 页眉——静态顶部，跨问题固定；只有数字变化。住在形变区外，绝不
        位移。卡片外边距在 compact 降一档；px-3.5 是下限：选项行以
        -mx-3 外扩，再紧会把悬停背景顶到卡片边上。 -->
    <div
      :class="
        cn(
          'flex items-center justify-between text-muted-foreground',
          compact
            ? 'px-3.5 sm:px-4 pt-2.5 sm:pt-3 pb-1.5 text-[11px]'
            : 'px-4 sm:px-5 pt-3.5 sm:pt-4 pb-2 text-[12px]'
        )
      "
    >
      <span>第 {{ safeIndex + 1 }} 题，共 {{ total }} 题</span>
      <button
        v-if="props.showCloseButton !== false"
        type="button"
        aria-label="关闭"
        class="flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)] transition-colors"
        @click="emit('close')"
      >
        <XIcon :size="14" :stroke-width="2" />
      </button>
    </div>

    <!-- 形变 Q/A 区——真实高度动画到下方内容的测量自然高度。 -->
    <motion.div
      :animate="{ height: contentHeight }"
      :initial="false"
      :transition="spring.slow"
      class="overflow-hidden"
    >
      <div
        ref="contentMeasureRef"
        :class="
          cn(
            compact ? 'px-3.5 sm:px-4' : 'px-4 sm:px-5',
            showFooter
              ? 'pb-1'
              : compact
                ? 'pb-2 sm:pb-2.5'
                : 'pb-2.5 sm:pb-3'
          )
        "
      >
        <div :key="qId" class="flex flex-col gap-2">
          <!-- 问题标题 -->
          <h3
            class="text-[16px] leading-snug text-foreground"
            :style="{ fontVariationSettings: fontWeights.semibold }"
          >
            {{ question.title }}
          </h3>

          <!-- 自由文本：单个开放式 textarea 就是全部答案。 -->
          <div
            v-if="isFreeText"
            class="relative mt-1 cursor-text transition-colors"
            :class="
              cn(
                compact ? '-mx-2.5 py-2' : '-mx-3 py-2.5',
                sizeClasses.px,
                isFreeTextMultiline
                  ? 'min-h-[76px]'
                  : compact
                    ? 'min-h-8'
                    : 'min-h-10',
                shape.bg,
                otherText.length > 0
                  ? 'bg-active'
                  : 'hover:bg-hover focus-within:bg-card focus-within:ring-1 focus-within:ring-inset focus-within:ring-border'
              )
            "
            @click="otherInputRef?.focus()"
          >
            <textarea
              ref="otherInputRef"
              rows="1"
              :value="otherText"
              :placeholder="question.freeTextPlaceholder ?? '输入你的回答…'"
              :aria-invalid="freeTextError !== null"
              class="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 leading-snug text-foreground outline-none placeholder:text-muted-foreground"
              :class="sizeClasses.text"
              :style="{ fontVariationSettings: fontWeights.medium }"
              @input="handleOtherChange(($event.target as HTMLTextAreaElement).value)"
              @keydown="(e: KeyboardEvent) => {
                if (e.key !== 'Enter') return;
                if (e.shiftKey || e.metaKey || e.ctrlKey) return;
                if (!isFreeTextMultiline) {
                  e.preventDefault();
                  handleOtherSubmit();
                }
              }"
            />
          </div>

          <!-- 选项行（单选/多选 + Other） -->
          <div
            v-else
            ref="rowsContainerRef"
            :role="isMulti ? 'group' : 'radiogroup'"
            :aria-label="question.title"
            :class="rowsClass"
            @mouseenter="rows.handlers.onMouseEnter"
            @mousemove="rows.handlers.onMouseMove"
            @mouseleave="rows.handlers.onMouseLeave"
            @focusin="handleRowsFocus"
            @focusout="handleRowsBlur"
            @keydown="handleNavKey"
          >
            <!-- Other 行输入提示——仅当 Other 输入聚焦且仍为空时显示 -->
            <AnimatePresence>
              <motion.div
                v-if="
                  allowOther &&
                  rows.itemRects.value[otherIndex] &&
                  focusedIndex === otherIndex &&
                  otherText.length === 0
                "
                key="other-input"
                aria-hidden="true"
                :class="cn('pointer-events-none absolute bg-card ring-1 ring-inset ring-border', shape.bg)"
                :initial="{ opacity: 0 }"
                :animate="{ opacity: 1 }"
                :exit="{ opacity: 0, transition: spring.fast.exit }"
                :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
                :style="{
                  top: rows.itemRects.value[otherIndex]?.top + 'px',
                  left: rows.itemRects.value[otherIndex]?.left + 'px',
                  width: rows.itemRects.value[otherIndex]?.width + 'px',
                  height: rows.itemRects.value[otherIndex]?.height + 'px',
                }"
              />
            </AnimatePresence>

            <!-- 单一形变悬停指示器（画在选中背景之下） -->
            <AnimatePresence>
              <motion.div
                v-if="activeRect"
                :key="`hover-${rows.session.value}`"
                aria-hidden="true"
                :class="cn('pointer-events-none absolute bg-hover', shape.bg)"
                :initial="{ opacity: 0 }"
                :animate="{ opacity: 1 }"
                :exit="{ opacity: 0, transition: spring.fast.exit }"
                :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
                :style="{
                  top: activeRect.top + 'px',
                  left: activeRect.left + 'px',
                  width: activeRect.width + 'px',
                  height: activeRect.height + 'px',
                }"
              />
            </AnimatePresence>

            <!-- 选中行背景（相邻选中合并） -->
            <SelectionBackgrounds :blocks="blocks" />

            <!-- 单一形变焦点环（键盘焦点） -->
            <AnimatePresence>
              <motion.div
                v-if="focusRingRect"
                aria-hidden="true"
                :class="
                  cn(
                    'pointer-events-none absolute z-20 border border-[color:var(--focus-ring,#6B97FF)]',
                    shape.focusRing
                  )
                "
                :initial="{ opacity: 0 }"
                :animate="{ opacity: 1 }"
                :exit="{ opacity: 0, transition: spring.fast.exit }"
                :transition="{ ...spring.fast, opacity: { duration: 0.08 } }"
                :style="{
                  top: focusRingRect.top - 2 + 'px',
                  left: focusRingRect.left - 2 + 'px',
                  width: focusRingRect.width + 4 + 'px',
                  height: focusRingRect.height + 4 + 'px',
                }"
              />
            </AnimatePresence>

            <AskUserRow
              v-for="(opt, i) in options"
              :key="optionKey(opt, i)"
              :index="i"
              :register-item="rows.registerItem"
              :role="isMulti ? 'checkbox' : 'radio'"
              :is-selected="selectedIds.includes(optionKey(opt, i))"
              :tab-index="rowTabIndex(i)"
              :chip-content="i + 1"
              :chip-filled="selectedIds.includes(optionKey(opt, i))"
              :is-multi="isMulti"
              :show-arrow="!isMulti && rows.activeIndex.value === i"
              :body-layout="question.layout === 'stacked' ? 'stacked' : 'inline'"
              :top-align="question.layout === 'stacked'"
              :chip-position="question.chipPosition ?? 'right'"
              :aria-checked="selectedIds.includes(optionKey(opt, i))"
              @click="isMulti ? handleMultiToggle(optionKey(opt, i)) : handleSingleSelect(optionKey(opt, i))"
              @keydown="(e: KeyboardEvent) => handleRowKeydown(e, optionKey(opt, i))"
            >
              <span :class="cn('inline-grid')">
                <span
                  class="col-start-1 row-start-1 invisible"
                  :style="{ fontVariationSettings: fontWeights.semibold }"
                  aria-hidden="true"
                >
                  {{ opt.title }}
                </span>
                <span
                  class="col-start-1 row-start-1 text-foreground transition-[color,font-variation-settings] duration-80"
                  :style="{
                    fontVariationSettings: selectedIds.includes(optionKey(opt, i))
                      ? fontWeights.semibold
                      : fontWeights.medium,
                  }"
                >
                  {{ opt.title }}
                </span>
              </span>
              <span
                v-if="opt.description"
                :class="cn('text-muted-foreground', question.layout === 'stacked' ? '' : 'ml-1.5')"
              >
                {{ opt.description }}
              </span>
              <template #arrow>
                <ArrowRightIcon :size="14" :stroke-width="2" class="h-3.5 w-3.5" />
              </template>
            </AskUserRow>

            <!-- Other 行 -->
            <AskUserRow
              v-if="allowOther"
              :index="otherIndex"
              :register-item="rows.registerItem"
              :role="null"
              :is-selected="otherText.length > 0"
              :tab-index="-1"
              :chip-content="otherIndex + 1"
              :chip-filled="otherText.length > 0"
              :is-multi="isMulti"
              :top-align="isOtherMultiline"
              :chip-position="question.chipPosition ?? 'right'"
              :aria-label="question.otherPlaceholder ?? '用自己的话描述'"
              :show-arrow="
                !isMulti &&
                (focusedIndex === otherIndex || rows.activeIndex.value === otherIndex) &&
                otherText.trim().length > 0
              "
              :on-arrow-click="
                !isMulti && otherText.trim().length > 0 ? handleOtherSubmit : undefined
              "
              @click="otherInputRef?.focus()"
            >
              <span class="inline-grid w-full">
                <textarea
                  ref="otherInputRef"
                  rows="1"
                  :value="otherText"
                  :placeholder="question.otherPlaceholder ?? '用自己的话描述…'"
                  :aria-label="question.otherPlaceholder ?? '用自己的话描述'"
                  :class="
                    cn(
                      'col-start-1 row-start-1 block w-full resize-none overflow-hidden border-0 bg-transparent leading-snug text-foreground outline-none placeholder:text-muted-foreground p-0 m-0',
                      sizeClasses.text
                    )
                  "
                  :style="{ fontVariationSettings: fontWeights.medium }"
                  @input="handleOtherChange(($event.target as HTMLTextAreaElement).value)"
                  @keydown="(e: KeyboardEvent) => {
                    if (e.key !== 'Enter') return;
                    if (e.shiftKey) return; // Shift+Enter = 换行
                    e.stopPropagation();
                    if (!isMulti) {
                      e.preventDefault();
                      handleOtherSubmit();
                    }
                  }"
                  @click.stop
                />
              </span>
              <template #arrow>
                <ArrowRightIcon
                  :size="compact ? 12 : 14"
                  :stroke-width="2"
                  :class="compact ? 'h-3 w-3' : 'h-3.5 w-3.5'"
                />
              </template>
            </AskUserRow>
          </div>
        </div>
      </div>
    </motion.div>

    <!-- 页脚——形变区之外，动画高度不裁剪它。 -->
    <div
      v-if="showFooter"
      :class="cn('pt-1', compact ? 'px-3.5 sm:px-4 pb-1.5' : 'px-4 sm:px-5 pb-2')"
    >
      <div class="-mx-2 flex items-center justify-between gap-2 sm:-mx-3">
        <div class="relative flex min-w-0 flex-1 items-center gap-2">
          <AnimatePresence :initial="false">
            <motion.div
              v-if="showBack"
              key="back"
              layout="position"
              :initial="{ opacity: 0, scale: 0.85 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.85 }"
              :transition="{ ...spring.fast, opacity: { duration: 0.1 } }"
            >
              <Button variant="ghost" size="sm" @click="handleBack">
                <ArrowLeftIcon
                  :size="14"
                  :stroke-width="1.5"
                  class="hidden sm:block"
                />
                {{ "后退" }}
              </Button>
            </motion.div>
          </AnimatePresence>
          <AnimatePresence :initial="false">
            <motion.p
              v-if="freeTextError"
              key="ft-error"
              role="alert"
              :initial="{ opacity: 0, y: -2 }"
              :animate="{ opacity: 1, y: 0 }"
              :exit="{ opacity: 0 }"
              :transition="{ ...spring.fast, opacity: { duration: 0.12 } }"
              class="min-w-0 px-2 text-left text-[12px] leading-snug text-destructive sm:px-3"
            >
              {{ freeTextError }}
            </motion.p>
          </AnimatePresence>
        </div>
        <div class="relative flex items-center gap-2">
          <AnimatePresence :initial="false">
            <motion.div
              v-if="showSkip"
              key="skip"
              layout="position"
              :initial="{ opacity: 0, scale: 0.85 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.85 }"
              :transition="{ ...spring.fast, opacity: { duration: 0.1 } }"
            >
              <Button variant="ghost" size="sm" @click="handleSkip">
                {{ props.skipLabel }}
                <ArrowRightIcon :size="14" :stroke-width="1.5" class="hidden sm:block" />
              </Button>
            </motion.div>
            <motion.div
              v-if="showSubmit"
              key="continue"
              layout="position"
              :initial="{ opacity: 0, scale: 0.85 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.85 }"
              :transition="{ ...spring.fast, opacity: { duration: 0.1 } }"
            >
              <Button
                variant="primary"
                size="sm"
                :disabled="
                  isFreeText
                    ? otherText.trim().length === 0
                    : selectedIds.length === 0 && otherText.trim().length === 0
                "
                @click="isFreeText ? handleOtherSubmit() : handleMultiNext()"
              >
                <span class="inline-flex items-center gap-1.5">
                  {{
                    question.nextLabel ??
                    (safeIndex >= total - 1 ? "完成" : "继续")
                  }}
                  <span class="hidden sm:contents">
                    <AskUserShortcutChip tone="inverted">
                      {{ isMac ? "⌘" : "⌃" }}↵
                    </AskUserShortcutChip>
                  </span>
                </span>
              </Button>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  </div>
</template>
