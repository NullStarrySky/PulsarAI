<script setup lang="ts">
import { computed, ref } from "vue";
import { DropdownMenuSub } from "reka-ui";
import { usePropPassed } from "../../../lib/prop-passed";

const props = withDefaults(
  defineProps<{
    open?: boolean;
    defaultOpen?: boolean;
  }>(),
  { defaultOpen: false }
);

const emit = defineEmits<{
  (e: "update:open", open: boolean): void;
}>();

const openPassed = usePropPassed("open");
const internalOpen = ref(props.defaultOpen);
const open = computed(() => (openPassed ? !!props.open : internalOpen.value));

function handleOpenChange(next: boolean) {
  if (!openPassed) internalOpen.value = next;
  emit("update:open", next);
}
</script>

<template>
  <DropdownMenuSub :open="open" @update:open="handleOpenChange">
    <slot />
  </DropdownMenuSub>
</template>
