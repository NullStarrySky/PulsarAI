<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../../../lib/utils";
import { useSelectContext } from "./select-context";

const props = defineProps<{
  placeholder?: string;
  class?: string;
}>();

const selectCtx = useSelectContext();
const selectedLabel = computed(() =>
  selectCtx ? selectCtx.labelFor(selectCtx.value.value) : null
);
</script>

<template>
  <span
    :class="
      cn(
        'min-w-0 flex-1 truncate py-1 -my-1 text-left [text-box:trim-both_cap_alphabetic]',
        selectedLabel ? 'text-foreground' : 'text-muted-foreground',
        props.class
      )
    "
  >
    <slot>{{ selectedLabel ?? placeholder }}</slot>
  </span>
</template>
