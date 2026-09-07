<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
	AskUserQuestions,
	type AskUserAnswer as FluidAskUserAnswer,
	type AskUserQuestion as FluidAskUserQuestion,
	Dialog,
	DialogContent,
} from "@/components/fluid";
import {
	type AskUserAnswer,
	type AskUserInput,
	type AskUserResult,
	askUserSchema,
	registerAskUser,
} from "../runtime/ask-user";

const open = ref(false);
const request = ref<AskUserInput | null>(null);
let settle: ((value: AskUserResult) => void) | null = null;
let unregister: (() => void) | null = null;

const mappedQuestions = computed<FluidAskUserQuestion[]>(() => {
	if (!request.value) return [];
	return request.value.questions.map((q) => {
		if (q.kind === "text") {
			return {
				id: q.id,
				title: q.question,
				freeText: true,
				freeTextPlaceholder: q.placeholder || "输入回答…",
				skippable: false,
			};
		}
		if (q.kind === "boolean") {
			return {
				id: q.id,
				title: q.question,
				options: [
					{ id: "true", title: "接受" },
					{ id: "false", title: "拒绝" },
				],
				multiSelect: false,
				skippable: false,
			};
		}
		const opts = q.options.map((opt) => {
			const id = typeof opt === "string" ? opt : opt.value || opt.label;
			const title = typeof opt === "string" ? opt : opt.label;
			return { id, title };
		});
		return {
			id: q.id,
			title: q.question,
			options: opts,
			multiSelect: q.kind === "multi-select",
			skippable: false,
		};
	});
});

onMounted(() => {
	unregister = registerAskUser(
		(input) =>
			new Promise((resolve) => {
				settle?.({ cancelled: true });
				request.value = askUserSchema.parse(input);
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

function handleComplete(answersMap: Record<string, FluidAskUserAnswer>) {
	if (!request.value) return;
	const resultAnswers: Record<string, AskUserAnswer> = {};
	for (const q of request.value.questions) {
		const ans = answersMap[q.id];
		if (q.kind === "boolean") {
			resultAnswers[q.id] = ans?.selectedIds?.includes("true") ?? false;
		} else if (q.kind === "text") {
			resultAnswers[q.id] = ans?.otherText ?? "";
		} else if (q.kind === "multi-select") {
			resultAnswers[q.id] = ans?.selectedIds ?? [];
		} else {
			resultAnswers[q.id] = ans?.selectedIds?.[0] ?? ans?.otherText ?? "";
		}
	}
	finish({ answers: resultAnswers, cancelled: false });
}

function handleSkip() {
	finish({ cancelled: true });
}
</script>

<template>
  <Dialog :open="open" @update:open="value => !value && finish({ cancelled: true })">
    <DialogContent
      :show-close-button="false"
      class="flex w-auto max-w-none items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none"
    >
      <AskUserQuestions
        v-if="request && mappedQuestions.length"
        :questions="mappedQuestions"
        @complete="handleComplete"
        @skip="handleSkip"
        @close="finish({ cancelled: true })"
      />
    </DialogContent>
  </Dialog>
</template>
