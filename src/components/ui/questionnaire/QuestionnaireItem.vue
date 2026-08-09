<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { provide } from "vue";
import { cn } from "@/lib/utils";
import { questionnaireItemKey } from "./context";

const props = withDefaults(defineProps<{
  name: string;
  required?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  class?: HTMLAttributes["class"];
}>(), {
  required: false,
  multiple: false,
  disabled: false,
});

provide(questionnaireItemKey, {
  name: props.name,
  multiple: props.multiple,
  disabled: props.disabled,
});
</script>

<template>
  <fieldset :disabled="props.disabled" :class="cn('min-w-0 border-0 p-0', props.class)">
    <slot />
  </fieldset>
</template>
