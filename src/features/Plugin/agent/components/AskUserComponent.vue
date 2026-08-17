<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowUp, Check, ChevronLeft, ChevronRight, ShieldCheck, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { registerAskUserRequester } from "@/features/Conversation/generation/ask-user-requester";
import type {
  AskUserQuestionItem,
  QuestionAnswerDetail,
} from "../runtime/ask-user-tool";

/**
 * Self-contained ask-user dialog. It registers itself as the global ask-user
 * requester on mount; CodeAct's `agent.askUser(...)` / `api.askUser(...)`
 * pauses on the promise settled here. Questions support radio/check with free
 * input plus a `confirm` approve/reject mode.
 */
const open = ref(false);
const questions = ref<AskUserQuestionItem[]>([]);
const qi = ref(0);
const choices = ref<Record<number, number[]>>({});
const approvals = ref<Record<number, boolean>>({});
const custom = ref<Record<number, string>>({});
let resolveRequest: ((value: unknown) => void) | null = null;
let unregisterRequester: (() => void) | null = null;
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  unregisterRequester = registerAskUserRequester(async (input) => {
    settle(undefined);
    questions.value = input.questions;
    resetForm();
    open.value = true;
    return new Promise((resolve) => {
      resolveRequest = resolve;
    });
  });
});

onBeforeUnmount(() => {
  unregisterRequester?.();
  settle(undefined);
});

function settle(value: unknown) {
  resolveRequest?.(value);
  resolveRequest = null;
  open.value = false;
}

function onOpenChange(value: boolean) {
  if (!value) {
    settle(undefined);
  }
}

const currentQuestion = computed(() => questions.value[qi.value]);
const isLast = computed(() => qi.value === questions.value.length - 1);
const selectedIndices = computed(() => choices.value[qi.value] ?? []);
const currentCustom = computed(() => custom.value[qi.value] ?? "");
const currentApproval = computed(() => approvals.value[qi.value]);
const isConfirm = computed(() => currentQuestion.value?.type === "confirm");
const hasAnswer = computed(() => {
  if (!currentQuestion.value) return false;
  if (isConfirm.value) return typeof currentApproval.value === "boolean";
  return selectedIndices.value.length > 0 || Boolean(currentCustom.value.trim());
});

function toggleOption(index: number) {
  if (!currentQuestion.value || isConfirm.value) return;
  const qType = currentQuestion.value.type;
  const currentPicked = choices.value[qi.value] ?? [];

  if (qType === "radio") {
    choices.value[qi.value] = [index];
    custom.value[qi.value] = "";
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => {
      if (isLast.value) {
        submitAll();
      } else {
        qi.value = Math.min(questions.value.length - 1, qi.value + 1);
      }
    }, 350);
  } else {
    if (currentPicked.includes(index)) {
      choices.value[qi.value] = currentPicked.filter((i) => i !== index);
    } else {
      choices.value[qi.value] = [...currentPicked, index];
    }
  }
}

function approve(value: boolean) {
  approvals.value[qi.value] = value;
  if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = setTimeout(() => {
    if (isLast.value) {
      submitAll();
    } else {
      qi.value = Math.min(questions.value.length - 1, qi.value + 1);
    }
  }, 350);
}

function onCustomInput(text: string) {
  custom.value[qi.value] = text;
  if (currentQuestion.value?.type === "radio" && text.trim()) {
    choices.value[qi.value] = [];
  }
}

function prevQuestion() {
  if (qi.value > 0) {
    qi.value--;
  }
}

function nextQuestion() {
  if (!isLast.value) {
    qi.value++;
  }
}

function submitAll() {
  const details: QuestionAnswerDetail[] = questions.value.map((q, idx) => {
    if (q.type === "confirm") {
      return {
        questionIndex: idx,
        question: q.question,
        selectedIndices: [],
        selectedOptions: [],
        approved: approvals.value[idx] === true,
      };
    }
    const selected = choices.value[idx] ?? [];
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

  if (questions.value.length === 1) {
    if (questions.value[0]!.type === "confirm") {
      settle({ approved: approvals.value[0] === true });
      return;
    }
    const q = questions.value[0];
    const customTxt = (custom.value[0] ?? "").trim();
    const selected = choices.value[0] ?? [];
    if (customTxt) {
      settle({ answer: customTxt, source: "custom" });
    } else if (selected.length > 0) {
      const opt = q.options[selected[0]];
      settle({
        answer: opt.value ?? opt.label,
        source: "option",
        optionLabel: opt.label,
      });
    } else {
      settle({ answer: "", source: "custom" });
    }
  } else {
    const summary = details
      .map((d) => {
        const parts = typeof d.approved === "boolean"
          ? [d.approved ? "已批准" : "已拒绝"]
          : [
              ...d.selectedOptions,
              ...(d.customAnswer ? [`"${d.customAnswer}"`] : []),
            ];
        return `Q${d.questionIndex + 1}: ${parts.join(", ")}`;
      })
      .join("; ");
    settle({ answers: details, summary });
  }
}

function resetForm() {
  qi.value = 0;
  choices.value = {};
  approvals.value = {};
  custom.value = {};
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      :show-close-button="false"
      class="w-auto max-w-[calc(100vw-32px)] gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-none"
    >
      <div class="flex min-h-[200px] w-full max-w-md flex-col items-stretch">
        <div class="w-full overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          <template v-if="currentQuestion">
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
                  @click="settle(undefined)"
                >
                  <X class="size-3.5" />
                </Button>
              </div>

              <div v-if="isConfirm" class="mt-3 flex flex-col gap-2">
                <Button
                  :variant="currentApproval === true ? 'default' : 'outline'"
                  class="h-11 justify-start gap-2.5 rounded-lg text-sm font-medium"
                  @click="approve(true)"
                >
                  <ShieldCheck class="size-4" />
                  批准
                </Button>
                <Button
                  :variant="currentApproval === false ? 'destructive' : 'outline'"
                  class="h-11 justify-start gap-2.5 rounded-lg text-sm font-medium"
                  @click="approve(false)"
                >
                  <X class="size-4" />
                  拒绝
                </Button>
              </div>

              <div v-else class="mt-3 flex flex-col gap-1">
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
                  :disabled="qi === 0"
                  title="上一题"
                  @click="prevQuestion"
                >
                  <ChevronLeft class="size-4" />
                </Button>

                <span class="flex items-center gap-1.5">
                  <button
                    v-for="(_, idx) in questions"
                    :key="idx"
                    type="button"
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
                  :disabled="isLast"
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
    </DialogContent>
  </Dialog>
</template>
