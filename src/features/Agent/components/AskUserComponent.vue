<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowUp, Check, ChevronLeft, ChevronRight, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import type {
  AskUserAnswer,
  AskUserOption,
  AskUserQuestionItem,
  QuestionAnswerDetail,
} from "../runtime/ask-user-tool";

const props = defineProps<{
  questions?: AskUserQuestionItem[];
  question?: string;
  options?: AskUserOption[];
  type?: "radio" | "check" | "checkbox";
}>();

const emit = defineEmits<{
  resolve: [value: AskUserAnswer];
  cancel: [];
}>();

const normalizedQuestions = computed<AskUserQuestionItem[]>(() => {
  if (props.questions && props.questions.length > 0) {
    return props.questions;
  }
  if (props.question) {
    const rawOptions: AskUserOption[] = (props.options ?? []).map((opt) =>
      typeof opt === "string" ? { label: opt, value: opt } : opt
    );
    return [
      {
        question: props.question,
        type: props.type === "checkbox" ? "check" : (props.type ?? "radio"),
        options: rawOptions,
      },
    ];
  }
  return [];
});

const qi = ref(0);
const answers = ref<Record<number, number[]>>({});
const custom = ref<Record<number, string>>({});
const sent = ref(false);

const currentQuestion = computed(() => normalizedQuestions.value[qi.value]);
const isLast = computed(() => qi.value === normalizedQuestions.value.length - 1);
const selectedIndices = computed(() => answers.value[qi.value] ?? []);
const currentCustom = computed(() => custom.value[qi.value] ?? "");
const hasAnswer = computed(
  () => selectedIndices.value.length > 0 || Boolean(currentCustom.value.trim())
);

let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

function toggleOption(index: number) {
  if (!currentQuestion.value) return;
  const qType = currentQuestion.value.type;
  const currentPicked = answers.value[qi.value] ?? [];

  if (qType === "radio") {
    answers.value[qi.value] = [index];
    custom.value[qi.value] = "";
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => {
      if (isLast.value) {
        submitAll();
      } else {
        qi.value = Math.min(normalizedQuestions.value.length - 1, qi.value + 1);
      }
    }, 350);
  } else {
    if (currentPicked.includes(index)) {
      answers.value[qi.value] = currentPicked.filter((i) => i !== index);
    } else {
      answers.value[qi.value] = [...currentPicked, index];
    }
  }
}

function onCustomInput(text: string) {
  custom.value[qi.value] = text;
  if (currentQuestion.value?.type === "radio" && text.trim()) {
    answers.value[qi.value] = [];
  }
}

function prevQuestion() {
  if (qi.value > 0 && !sent.value) {
    qi.value--;
  }
}

function nextQuestion() {
  if (!isLast.value && !sent.value) {
    qi.value++;
  }
}

function submitAll() {
  if (sent.value) return;
  sent.value = true;

  const details: QuestionAnswerDetail[] = normalizedQuestions.value.map((q, idx) => {
    const selected = answers.value[idx] ?? [];
    const customTxt = (custom.value[idx] ?? "").trim();
    const selectedOpts = selected.map(
      (i) => q.options[i]?.label ?? q.options[i]?.value ?? String(i)
    );
    return {
      questionIndex: idx,
      question: q.question,
      selectedIndices: selected,
      selectedOptions: selectedOpts,
      customAnswer: customTxt || undefined,
    };
  });

  if (normalizedQuestions.value.length === 1 && !props.questions) {
    const q = normalizedQuestions.value[0];
    const customTxt = (custom.value[0] ?? "").trim();
    const selected = answers.value[0] ?? [];
    if (customTxt) {
      emit("resolve", { answer: customTxt, source: "custom" });
    } else if (selected.length > 0) {
      const opt = q.options[selected[0]];
      emit("resolve", {
        answer: opt.value ?? opt.label,
        source: "option",
        optionLabel: opt.label,
      });
    } else {
      emit("resolve", { answer: "", source: "custom" });
    }
  } else {
    const summary = details
      .map(
        (d) =>
          `Q${d.questionIndex + 1}: ${[
            ...d.selectedOptions,
            ...(d.customAnswer ? [`"${d.customAnswer}"`] : []),
          ].join(", ")}`
      )
      .join("; ");
    emit("resolve", { answers: details, summary });
  }
}

function resetForm() {
  qi.value = 0;
  answers.value = {};
  custom.value = {};
  sent.value = false;
}
</script>

<template>
  <div class="flex min-h-[200px] w-full max-w-md flex-col items-stretch">
    <div class="w-full overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <template v-if="sent">
        <div class="flex h-44 flex-col items-center justify-center gap-2 p-4 text-center">
          <span class="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground animate-in zoom-in-75 duration-200">
            <Check class="size-4 stroke-[3]" />
          </span>
          <span class="text-sm font-medium text-foreground">回答已发送</span>
          <button type="button" class="text-xs font-medium text-primary hover:underline" @click="resetForm">
            重新填写
          </button>
        </div>
      </template>

      <template v-else-if="currentQuestion">
        <div :key="qi" class="p-4 animate-in fade-in-50 duration-200">
          <div class="flex items-start justify-between gap-3">
            <span class="text-sm font-semibold text-foreground leading-snug">
              {{ currentQuestion.question }}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              title="关闭"
              @click="emit('cancel')"
            >
              <X class="size-3.5" />
            </Button>
          </div>

          <div class="mt-3 flex flex-col gap-1">
            <button
              v-for="(opt, i) in currentQuestion.options"
              :key="`${opt.label}:${i}`"
              type="button"
              :aria-pressed="selectedIndices.includes(i)"
              class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              @click="toggleOption(i)"
            >
              <span
                class="flex size-4 shrink-0 items-center justify-center transition-colors"
                :class="[
                  currentQuestion.type === 'radio' ? 'rounded-full' : 'rounded-[4px]',
                  selectedIndices.includes(i)
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-input text-transparent hover:border-primary/50',
                ]"
              >
                <span
                  v-if="currentQuestion.type === 'radio'"
                  class="size-1.5 rounded-full bg-primary-foreground transition-transform"
                  :class="selectedIndices.includes(i) ? 'scale-100' : 'scale-0'"
                />
                <Check v-else class="size-3 stroke-[3]" />
              </span>
              <span class="flex-1" :class="selectedIndices.includes(i) ? 'font-medium text-foreground' : 'text-muted-foreground'">
                {{ opt.label }}
              </span>
            </button>

            <div class="mt-1 flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5 transition-colors focus-within:border-ring">
              <input
                :value="currentCustom"
                placeholder="输入自由回答…"
                aria-label="自定义回答"
                class="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                @input="onCustomInput(($event.target as HTMLInputElement).value)"
                @keydown.enter.prevent="isLast ? submitAll() : nextQuestion()"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2.5">
          <div class="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
              :disabled="qi === 0 || sent"
              title="上一题"
              @click="prevQuestion"
            >
              <ChevronLeft class="size-4" />
            </Button>

            <span class="flex items-center gap-1.5">
              <button
                v-for="(_, idx) in normalizedQuestions"
                :key="idx"
                type="button"
                :disabled="sent"
                class="rounded-full transition-all"
                :class="[
                  idx === qi
                    ? 'size-2.5 border-2 border-primary bg-primary'
                    : idx < qi
                    ? 'size-2 bg-primary/60'
                    : 'size-2 border border-muted-foreground/40 bg-transparent',
                ]"
                :title="`第 ${idx + 1} 题`"
                @click="qi = idx"
              />
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
              :disabled="isLast || sent"
              title="下一题"
              @click="nextQuestion"
            >
              <ChevronRight class="size-4" />
            </Button>
          </div>

          <Button
            type="button"
            size="icon"
            class="size-7 rounded-lg transition-transform active:scale-95 disabled:opacity-40"
            :disabled="!hasAnswer"
            :title="isLast ? '提交回答' : '下一题'"
            @click="isLast ? submitAll() : nextQuestion()"
          >
            <ArrowUp class="size-4 stroke-[2.5]" />
          </Button>
        </div>
      </template>
    </div>
  </div>
</template>
