<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
	AskUserQuestions,
	Dialog,
	DialogContent,
	type AskUserAnswer,
} from "@/components/fluid";
import {
	type AskUserInput,
	type AskUserResult,
	registerAskUser,
} from "./ask-user";

const open = ref(false);
const request = ref<AskUserInput | null>(null);
let settle: ((value: AskUserResult) => void) | null = null;
let unregister: (() => void) | null = null;

onMounted(() => {
	unregister = registerAskUser(
		(input) =>
			new Promise((resolve) => {
				settle?.({ cancelled: true });
				request.value = input;
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
	request.value = null;
}

function handleComplete(answers: Record<string, AskUserAnswer>) {
	finish({ answers, cancelled: false });
}
</script>

<template>
  <Dialog :open="open" @update:open="value => !value && finish({ cancelled: true })">
    <DialogContent
      :show-close-button="false"
      class="flex w-auto max-w-none items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none"
    >
      <AskUserQuestions
        v-if="request?.questions.length"
        :questions="request.questions"
        @complete="handleComplete"
        @skip="finish({ cancelled: true })"
        @close="finish({ cancelled: true })"
      />
    </DialogContent>
  </Dialog>
</template>
