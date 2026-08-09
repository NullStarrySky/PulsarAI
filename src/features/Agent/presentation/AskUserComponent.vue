<script setup lang="ts">
import { ref } from "vue";
import { ChevronRight, MessageSquareText } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireItem,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type {
  AskUserAnswer,
  AskUserOption,
} from "../application/ask-user-tool";

defineProps<{
  question: string;
  options: AskUserOption[];
}>();

const emit = defineEmits<{
  resolve: [value: AskUserAnswer];
}>();

const customDialogOpen = ref(false);
const customAnswer = ref("");

function selectOption(option: AskUserOption) {
  emit("resolve", {
    answer: option.value ?? option.label,
    source: "option",
    optionLabel: option.label,
  });
}

function submitCustomAnswer() {
  const answer = customAnswer.value.trim();
  if (!answer) {
    return;
  }
  emit("resolve", {
    answer,
    source: "custom",
  });
  customDialogOpen.value = false;
  customAnswer.value = "";
}
</script>

<template>
  <section class="grid gap-3">
    <Questionnaire @submit.prevent>
      <QuestionnaireItem name="answer" required>
        <QuestionnaireTitle>{{ question }}</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice
            v-for="(option, index) in options"
            :key="`${index}:${option.label}:${option.value ?? ''}`"
            :value="option.value ?? option.label"
            @change="selectOption(option)"
          >
            <span class="block font-medium">{{ option.label }}</span>
            <span
              v-if="option.description"
              class="mt-0.5 block text-xs leading-5 text-muted-foreground"
            >
              {{ option.description }}
            </span>
          </QuestionnaireChoice>
        </QuestionnaireChoices>
      </QuestionnaireItem>
    </Questionnaire>

    <Button
      type="button"
      variant="outline"
      class="h-auto min-h-12 w-full justify-between gap-4 px-4 py-3 text-left mobile:min-h-14"
      @click="customDialogOpen = true"
    >
      <span class="flex min-w-0 items-center gap-3">
        <MessageSquareText class="size-4 shrink-0 text-muted-foreground" />
        <span>
          <span class="block font-medium">自由回复</span>
          <span class="mt-0.5 block text-xs text-muted-foreground">输入不在预定义选项中的回答</span>
        </span>
      </span>
      <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
    </Button>

    <Dialog v-model:open="customDialogOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>自由回复</DialogTitle>
          <DialogDescription>{{ question }}</DialogDescription>
        </DialogHeader>
        <Textarea
          v-model="customAnswer"
          class="min-h-32 resize-y"
          placeholder="输入你的回答"
          autofocus
          @keydown.ctrl.enter.prevent="submitCustomAnswer"
          @keydown.meta.enter.prevent="submitCustomAnswer"
        />
        <DialogFooter>
          <Button variant="outline" @click="customDialogOpen = false">返回选项</Button>
          <Button :disabled="!customAnswer.trim()" @click="submitCustomAnswer">提交回答</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
