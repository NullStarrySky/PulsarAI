<script setup lang="ts">
import { computed } from "vue";
import { DropdownMenuTrigger as DropdownMenuTriggerPrimitive } from "reka-ui";
import { useDropdownMenuContext } from "./dropdown-context";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const { disabled: rootDisabled } = useDropdownMenuContext();
const isDisabled = computed(() => props.disabled || rootDisabled);
</script>

<template>
  <!-- 任何元素都可以是触发器（reka 的 asChild 组合）：
      <DropdownMenuTrigger><Button>打开</Button></DropdownMenuTrigger> -->
  <DropdownMenuTriggerPrimitive as-child :disabled="isDisabled">
    <slot />
  </DropdownMenuTriggerPrimitive>
</template>
