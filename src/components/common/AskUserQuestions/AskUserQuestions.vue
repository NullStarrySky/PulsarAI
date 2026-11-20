<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ArrowLeft, ArrowRight } from '@/lib/remix-icons';
import List from '../List/List.vue';
import { type GlideOption } from '../types';

export interface AskUserOption {
  id?: string;
  title?: string;
  label?: string;
  description?: string;
  value?: string;
}

export interface AskUserQuestion {
  id?: string;
  title?: string;
  question?: string;
  description?: string;
  options?: (string | GlideOption | AskUserOption)[];
  is_multi_select?: boolean;
  multiSelect?: boolean;
  defaultAnswer?: string | string[];
}

export interface AskUserAnswer {
  questionId: string;
  selectedIds: string[];
  otherText?: string;
  skipped?: boolean;
}

export type GlideAskUserQuestion = AskUserQuestion;

export interface AskUserQuestionsProps {
  questions: AskUserQuestion[];
  currentIndex?: number;
  skipLabel?: string;
  submitLabel?: string;
  showStepCount?: boolean;
  className?: string;
}
export type GlideAskUserQuestionsProps = AskUserQuestionsProps;

const props = withDefaults(defineProps<AskUserQuestionsProps>(), {
  currentIndex: 0,
  skipLabel: '跳过',
  submitLabel: '完成',
  showStepCount: true,
  className: ''
});

const emit = defineEmits<{
  'update:currentIndex': [index: number];
  'complete': [answers: Record<string, AskUserAnswer>];
  'skip': [questionId: string, index: number];
  'close': [];
}>();

const currentIdx = ref(props.currentIndex);
const answers = ref<Record<string, string | string[]>>({});

const currentQuestion = computed(() => props.questions[currentIdx.value]);
const isLastQuestion = computed(() => currentIdx.value === props.questions.length - 1);

const norm = (o: string | GlideOption | AskUserOption): GlideOption => {
  if (typeof o === 'string') return { value: o, label: o };
  const val = (o as any).value ?? (o as any).id ?? (o as any).title ?? '';
  const lab = (o as any).label ?? (o as any).title ?? val;
  return { ...o, value: val, label: lab };
};
const currentOptions = computed(() => (currentQuestion.value?.options ?? []).map(norm));

const currentQId = computed(() => currentQuestion.value?.id || `q-${currentIdx.value}`);

// 获取当前题目的回答
const currentAnswer = computed(() => {
  return answers.value[currentQId.value] ?? currentQuestion.value?.defaultAnswer;
});

const isMulti = computed(() => !!(currentQuestion.value?.is_multi_select || currentQuestion.value?.multiSelect));

// 多选下的 Set 集合
const selectedMultiSet = computed(() => {
  const ans = currentAnswer.value;
  if (Array.isArray(ans)) return new Set(ans.map(String));
  if (typeof ans === 'string') return new Set([ans]);
  return new Set<string>();
});

// 处理单选或多选选择
const handleSelect = (val: string) => {
  const qId = currentQId.value;
  if (isMulti.value) {
    const nextSet = new Set(selectedMultiSet.value);
    if (nextSet.has(val)) nextSet.delete(val);
    else nextSet.add(val);
    answers.value[qId] = Array.from(nextSet);
  } else {
    answers.value[qId] = val;
    // 单选支持即刻跳转下一题
    if (!isLastQuestion.value) {
      setTimeout(() => nextStep(), 120);
    }
  }
};

const buildFormattedAnswers = () => {
  const result: Record<string, AskUserAnswer> = {};
  for (let idx = 0; idx < props.questions.length; idx++) {
    const q = props.questions[idx]!;
    const qId = q.id || `q-${idx}`;
    const ans = answers.value[qId] ?? q.defaultAnswer;
    const selectedIds = Array.isArray(ans) ? ans.map(String) : ans ? [String(ans)] : [];
    result[qId] = {
      questionId: qId,
      selectedIds,
      skipped: !selectedIds.length,
    };
  }
  return result;
};

const nextStep = () => {
  if (isLastQuestion.value) {
    emit('complete', buildFormattedAnswers());
  } else {
    currentIdx.value++;
    emit('update:currentIndex', currentIdx.value);
  }
};

const prevStep = () => {
  if (currentIdx.value > 0) {
    currentIdx.value--;
    emit('update:currentIndex', currentIdx.value);
  }
};

const skip = () => {
  emit('skip', currentQId.value, currentIdx.value);
  if (isLastQuestion.value) {
    emit('complete', buildFormattedAnswers());
  } else {
    nextStep();
  }
};

// 键盘快捷键监听 (1-9 键选行，Enter 提交)
const onGlobalKey = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

  const num = parseInt(e.key, 10);
  if (!isNaN(num) && num >= 1 && num <= currentOptions.value.length) {
    e.preventDefault();
    const opt = currentOptions.value[num - 1];
    if (opt && !opt.disabled) {
      handleSelect(opt.value);
    }
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || isMulti.value)) {
    e.preventDefault();
    nextStep();
  }
};

onMounted(() => window.addEventListener('keydown', onGlobalKey));
onUnmounted(() => window.removeEventListener('keydown', onGlobalKey));
</script>

<template>
  <div
    v-if="currentQuestion"
    class="flex flex-col rounded-2xl border border-border/80 bg-card p-5 text-card-foreground shadow-lg backdrop-blur-md select-none transition-all duration-200"
    :class="className"
  >
    <!-- Header: Step & Question title -->
    <div class="flex items-start justify-between gap-3 pb-3 border-b border-border/60">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span
            v-if="showStepCount"
            class="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary"
          >
            问题 {{ currentIdx + 1 }} / {{ questions.length }}
          </span>
          <span v-if="isMulti" class="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            多选
          </span>
        </div>
        <h3 class="text-sm font-semibold text-foreground leading-snug">
          {{ currentQuestion?.question || (currentQuestion as any)?.title }}
        </h3>
        <p v-if="currentQuestion.description" class="text-xs text-muted-foreground mt-0.5">
          {{ currentQuestion.description }}
        </p>
      </div>

      <button
        type="button"
        class="text-xs text-muted-foreground hover:text-foreground transition-colors p-1"
        @click="$emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- Options List using GlideList: 对齐 Fluid 行高 36px (h-9) 与尺寸 -->
    <div class="py-3">
      <List
        :key="currentQId"
        :options="currentOptions"
        :model-value="isMulti ? Array.from(selectedMultiSet) : (currentAnswer as string)"
        item-type="control"
        highlight-mode="both"
        size="md"
        :radius="8"
        :padding="4"
        :gap="2"
        active-class="bg-primary/10 text-primary dark:bg-primary/20 border border-primary/25 font-medium"
        hover-class="bg-accent/80 text-accent-foreground dark:bg-muted/70 shadow-xs border border-border/40"
        @select="handleSelect"
      >
        <template #default="{ item, index, isSelected }">
          <div class="flex items-center gap-2.5 px-3 w-full">
            <!-- 1-9 Shortcut badge -->
            <kbd class="grid size-4 shrink-0 place-items-center rounded bg-muted/80 text-[10px] font-mono text-muted-foreground">
              {{ index + 1 }}
            </kbd>

            <!-- Multi checkbox indicator: 无外轮廓，仅箭头伸缩过渡 -->
            <div
              v-if="isMulti"
              class="relative grid size-4 shrink-0 place-items-center transition-all duration-150"
              :class="selectedMultiSet.has(item.value) ? 'border-transparent bg-transparent' : 'border border-border/80 rounded-[4px] bg-background/50'"
            >
              <svg
                class="size-4 shrink-0 text-foreground transition-all duration-160 origin-center"
                :class="selectedMultiSet.has(item.value) ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline
                  points="20 6 9 17 4 12"
                  :class="selectedMultiSet.has(item.value) ? 'animate-check-stroke' : ''"
                />
              </svg>
            </div>

            <!-- Single radio dot indicator: 无外轮廓，白点缩放过渡 -->
            <div
              v-else
              class="relative grid size-4 shrink-0 place-items-center rounded-full transition-all duration-150"
              :class="isSelected ? 'border-transparent bg-transparent' : 'border border-border/80 bg-background/50'"
            >
              <span
                class="size-2 rounded-full bg-foreground transition-all duration-160 origin-center"
                :class="isSelected ? 'scale-100 opacity-100 animate-dot-pop' : 'scale-0 opacity-0 pointer-events-none'"
              />
            </div>

            <span class="flex-1 truncate text-[13px] font-medium">{{ item.label }}</span>
            <span v-if="item.tag" class="shrink-0 text-[10px] text-muted-foreground">{{ item.tag }}</span>
          </div>
        </template>
      </List>
    </div>

    <!-- Footer Action Bar -->
    <div class="flex items-center justify-between pt-3 border-t border-border/60 gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg disabled:opacity-30 disabled:pointer-events-none"
        :disabled="currentIdx === 0"
        @click="prevStep"
      >
        <ArrowLeft class="size-3.5" />
        <span>上一题</span>
      </button>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg"
          @click="skip"
        >
          {{ skipLabel }}
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
          @click="nextStep"
        >
          <span>{{ isLastQuestion ? submitLabel : '下一题' }}</span>
          <ArrowRight class="size-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes check-stroke {
  from {
    stroke-dashoffset: 24;
    transform: scale(0.6);
  }
  to {
    stroke-dashoffset: 0;
    transform: scale(1);
  }
}

.animate-check-stroke {
  stroke-dasharray: 24;
  animation: check-stroke 170ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}

@keyframes dot-pop {
  0% {
    transform: scale(0.2);
    opacity: 0;
  }
  70% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-dot-pop {
  animation: dot-pop 160ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}
</style>
