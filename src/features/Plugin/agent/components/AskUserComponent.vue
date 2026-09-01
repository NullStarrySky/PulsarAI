<script setup lang="ts">
import { ArrowUp, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Questionnaire,
	QuestionnaireChoice,
	QuestionnaireChoices,
	QuestionnaireDescription,
	QuestionnaireItem,
	QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
	type AskUserAnswer,
	type AskUserInput,
	type AskUserQuestion,
	type AskUserResult,
	askUserSchema,
	registerAskUser,
} from "../runtime/ask-user";

const open = ref(false);
const request = ref<AskUserInput | null>(null);
const questionIndex = ref(0);
const answers = ref<Record<string, AskUserAnswer>>({});
let settle: ((value: AskUserResult) => void) | null = null;
let unregister: (() => void) | null = null;

const currentQuestion = computed(
	() => request.value?.questions[questionIndex.value] ?? null,
);
const isLastQuestion = computed(
	() => questionIndex.value === (request.value?.questions.length ?? 1) - 1,
);
const currentAnswered = computed(() =>
	currentQuestion.value ? hasAnswer(currentQuestion.value) : false,
);

onMounted(() => {
	unregister = registerAskUser(
		(input) =>
			new Promise((resolve) => {
				settle?.({ cancelled: true });
				request.value = askUserSchema.parse(input);
				questionIndex.value = 0;
				answers.value = {};
				settle = resolve;
				open.value = true;
			}),
	);
});
onBeforeUnmount(() => {
	unregister?.();
	finish({ cancelled: true });
});

function finish(value: AskUserResult) {
	settle?.(value);
	settle = null;
	open.value = false;
}
function optionValue(option: AskUserQuestion["options"][number]) {
	return typeof option === "string" ? option : option.value || option.label;
}
function hasAnswer(question: AskUserQuestion) {
	const answer = answers.value[question.id];
	return Array.isArray(answer)
		? answer.length > 0
		: answer !== undefined && answer !== "";
}
function selectOption(
	question: AskUserQuestion,
	option: AskUserQuestion["options"][number],
) {
	const value = optionValue(option);
	if (question.kind === "multi-select") {
		const current = Array.isArray(answers.value[question.id])
			? (answers.value[question.id] as string[])
			: [];
		answers.value = {
			...answers.value,
			[question.id]: current.includes(value)
				? current.filter((item) => item !== value)
				: [...current, value],
		};
		return;
	}
	answers.value = { ...answers.value, [question.id]: value };
}
function setText(question: AskUserQuestion, value: string) {
	answers.value = { ...answers.value, [question.id]: value };
}
function setBoolean(question: AskUserQuestion, value: boolean) {
	answers.value = { ...answers.value, [question.id]: value };
}
function submit() {
	if (currentAnswered.value)
		finish({ answers: answers.value, cancelled: false });
}
function nextQuestion() {
	if (currentAnswered.value && !isLastQuestion.value) questionIndex.value += 1;
}
function advance() {
	if (isLastQuestion.value) submit();
	else nextQuestion();
}
function isOptionSelected(
	question: AskUserQuestion,
	option: AskUserQuestion["options"][number],
) {
	const value = optionValue(option);
	const answer = answers.value[question.id];
	return question.kind === "multi-select"
		? Array.isArray(answer) && answer.includes(value)
		: answer === value;
}
function textAnswer(question: AskUserQuestion) {
	const answer = answers.value[question.id];
	return typeof answer === "string" ? answer : "";
}
</script>

<template>
  <Dialog :open="open" @update:open="value => !value && finish({ cancelled: true })">
    <DialogContent :show-close-button="false" class="max-h-[calc(100dvh-2rem)]! w-[calc(100vw-2rem)]! max-w-152! gap-0 overflow-hidden p-0">
      <template v-if="request && currentQuestion">
        <DialogHeader class="border-b px-6 py-5 mobile:px-4">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <DialogTitle>需要你的回答</DialogTitle>
              <DialogDescription class="mt-1">请补充信息后继续执行。</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" @click="finish({ cancelled: true })">取消</Button>
          </div>
        </DialogHeader>

        <Questionnaire @submit.prevent="advance">
          <div :key="currentQuestion.id" class="animate-in fade-in-50 slide-in-from-right-1 px-6 py-6 duration-200 mobile:px-4">
            <QuestionnaireItem :name="currentQuestion.id" :multiple="currentQuestion.kind === 'multi-select'">
              <QuestionnaireTitle>{{ currentQuestion.question }}</QuestionnaireTitle>
              <QuestionnaireDescription v-if="currentQuestion.kind === 'multi-select'">可选择多项</QuestionnaireDescription>
              <QuestionnaireDescription v-else-if="currentQuestion.kind === 'select'">请选择一项</QuestionnaireDescription>
              <QuestionnaireDescription v-else-if="currentQuestion.kind === 'boolean'">请选择是否接受</QuestionnaireDescription>

              <QuestionnaireChoices v-if="currentQuestion.kind === 'select' || currentQuestion.kind === 'multi-select'">
                <QuestionnaireChoice v-for="option in currentQuestion.options" :key="optionValue(option)" :value="optionValue(option)" :checked="isOptionSelected(currentQuestion, option)" @change="selectOption(currentQuestion, option)">
                  {{ typeof option === "string" ? option : option.label }}
                </QuestionnaireChoice>
              </QuestionnaireChoices>

              <QuestionnaireChoices v-else-if="currentQuestion.kind === 'boolean'" class="sm:grid-cols-2">
                <QuestionnaireChoice value="false" :checked="answers[currentQuestion.id] === false" @change="setBoolean(currentQuestion, false)">拒绝</QuestionnaireChoice>
                <QuestionnaireChoice value="true" :checked="answers[currentQuestion.id] === true" @change="setBoolean(currentQuestion, true)">接受</QuestionnaireChoice>
              </QuestionnaireChoices>

              <Input v-else class="mt-4" :model-value="textAnswer(currentQuestion)" :placeholder="currentQuestion.placeholder || '输入回答…'" @update:model-value="setText(currentQuestion, String($event))" />
            </QuestionnaireItem>
          </div>

          <DialogFooter class="m-0! flex-row! items-center! justify-between! rounded-b-xl border-x-0 border-b-0 bg-background px-6 py-2.5 mobile:px-4 sm:flex-row sm:justify-between">
            <div class="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" title="上一题" :disabled="questionIndex === 0" @click="questionIndex -= 1"><ChevronLeft /></Button>
              <span class="min-w-10 text-center text-xs tabular-nums text-muted-foreground">{{ questionIndex + 1 }}/{{ request.questions.length }}</span>
              <Button type="button" variant="ghost" size="icon-sm" title="下一题" :disabled="isLastQuestion || !currentAnswered" @click="nextQuestion"><ChevronRight /></Button>
            </div>
            <Button type="submit" size="icon-sm" class="rounded-lg" :title="isLastQuestion ? '提交回答' : '下一题'" :disabled="!currentAnswered"><ArrowUp /></Button>
          </DialogFooter>
        </Questionnaire>
      </template>
    </DialogContent>
  </Dialog>
</template>
