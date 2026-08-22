<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowUp, Check, X } from "lucide-vue-next";
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
function optionValue(option: AskUserInput["options"][number]) {
  return typeof option === "string" ? option : option.value || option.label;
}
function submit() { finish({ answer: answer.value.trim(), cancelled: false }); }
</script>

<template>
  <Dialog :open="open" @update:open="value => !value && finish({ cancelled: true })">
    <DialogContent :show-close-button="false" class="w-auto max-w-[calc(100vw-32px)] gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-none">
      <div v-if="request" class="flex min-h-[200px] w-full max-w-md flex-col items-stretch">
        <div class="w-full overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          <div class="p-4 animate-in fade-in-50 duration-200">
            <div class="flex items-start justify-between gap-3">
              <span class="text-sm font-semibold leading-snug text-foreground">{{ request.question }}</span>
              <Button type="button" variant="ghost" size="icon" class="size-6 shrink-0 text-muted-foreground hover:text-foreground" title="关闭" @click="finish({ cancelled: true })"><X class="size-3.5" /></Button>
            </div>
            <div v-if="request.options.length" class="mt-3 flex flex-col gap-1">
              <button v-for="option in request.options" :key="typeof option === 'string' ? option : option.label" type="button" class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground" :class="answer === optionValue(option) ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'" @click="answer = optionValue(option)">
                <span class="flex size-4 shrink-0 items-center justify-center rounded-full" :class="answer === optionValue(option) ? 'bg-primary text-primary-foreground' : 'border border-input text-transparent'">
                  <Check class="size-3 stroke-[3]" />
                </span>
                <span class="flex-1">{{ typeof option === 'string' ? option : option.label }}</span>
              </button>
            </div>
            <div class="mt-3 flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5 transition-colors focus-within:border-ring">
              <input v-model="answer" class="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none" placeholder="输入自由回答…" @keydown.enter.prevent="submit" />
            </div>
          </div>
          <div class="flex items-center justify-end border-t border-border bg-muted/30 px-4 py-2.5">
            <Button type="button" size="icon" class="size-7 rounded-lg transition-transform active:scale-95 disabled:opacity-40" :disabled="!answer.trim()" title="提交回答" @click="submit"><ArrowUp class="size-4 stroke-[2.5]" /></Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
