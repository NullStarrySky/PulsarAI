<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { askUserSchema, registerAskUser, type AskUserInput } from "../runtime/ask-user";

const open = ref(false);
const request = ref<AskUserInput | null>(null);
const answer = ref("");
let settle: ((value: unknown) => void) | null = null;
let unregister: (() => void) | null = null;

onMounted(() => {
  unregister = registerAskUser((input) => new Promise((resolve) => {
    settle?.({ cancelled: true });
    request.value = askUserSchema.parse(input);
    answer.value = "";
    settle = resolve;
    open.value = true;
  }));
});
onBeforeUnmount(() => { unregister?.(); finish({ cancelled: true }); });

function finish(value: unknown) {
  settle?.(value);
  settle = null;
  open.value = false;
}
function submit() { finish({ answer: answer.value, cancelled: false }); }
</script>

<template>
  <Dialog :open="open" @update:open="value => !value && finish({ cancelled: true })">
    <DialogContent class="max-w-md">
      <div v-if="request" class="space-y-4">
        <h2 class="text-base font-medium">{{ request.question }}</h2>
        <div v-if="request.options.length" class="grid gap-2">
          <Button v-for="option in request.options" :key="typeof option === 'string' ? option : option.label" variant="outline" class="justify-start" @click="answer = typeof option === 'string' ? option : option.value || option.label">
            {{ typeof option === 'string' ? option : option.label }}
          </Button>
        </div>
        <input v-model="answer" class="h-9 w-full rounded-md border bg-background px-3 text-sm" placeholder="输入回答…" @keydown.enter.prevent="submit" />
        <div class="flex justify-end gap-2"><Button variant="ghost" @click="finish({ cancelled: true })">取消</Button><Button :disabled="!answer.trim()" @click="submit">确认</Button></div>
      </div>
    </DialogContent>
  </Dialog>
</template>
