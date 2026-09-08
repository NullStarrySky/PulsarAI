<script setup lang="ts">
import { ComboboxEmpty as RekaComboboxEmpty } from "reka-ui";
import { cn } from "../../../lib/utils";

const props = defineProps<{
  class?: any;
}>();

defineOptions({ name: "ComboboxEmpty" });
</script>

<template>
  <RekaComboboxEmpty :class="cn('px-2 py-4 text-center text-[12px] text-muted-foreground select-none', props.class)">
    <slot>无匹配项</slot>
  </RekaComboboxEmpty>
</template>
