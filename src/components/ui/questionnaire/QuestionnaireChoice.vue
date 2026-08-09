<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { inject } from "vue";
import { cn } from "@/lib/utils";
import { questionnaireItemKey } from "./context";

const props = withDefaults(defineProps<{
  value: string;
  disabled?: boolean;
  class?: HTMLAttributes["class"];
}>(), { disabled: false });
const emit = defineEmits<{ change: [event: Event] }>();
const item = inject(questionnaireItemKey);
</script>

<template>
  <label :class="cn('group flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/60 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 mobile:min-h-14', props.class)">
    <input
      :type="item?.multiple ? 'checkbox' : 'radio'"
      :name="item?.name"
      :value="props.value"
      :disabled="props.disabled || item?.disabled"
      class="size-4 shrink-0 accent-primary"
      @change="emit('change', $event)"
    />
    <span class="min-w-0 flex-1"><slot /></span>
  </label>
</template>
