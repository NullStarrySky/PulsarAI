<script setup lang="ts">
import { computed, ref } from "vue";
import { DialogRoot } from "reka-ui";
import { provideDialogOpen } from "./dialog-context";
import { usePropPassed } from "../../../lib/prop-passed";

const props = defineProps<{
  /** 受控打开状态。 */
  open?: boolean;
  /** 初始打开状态（非受控）。 */
  defaultOpen?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", open: boolean): void;
}>();

// Vue 会把声明为 Boolean 的可选 prop 在未传时 cast 成 false（而不是
// undefined），所以受控判断必须检查调用方是否真的传了这个键。
const openPassed = usePropPassed("open");

// 内部状态始终追踪变化，同时把消费方的 onOpenChange 一并通知——
// 监听器不能替代状态处理，否则带 onOpenChange 的非受控对话框永远打不开。
const uncontrolledOpen = ref(props.defaultOpen ?? false);
const open = computed(() => (openPassed ? !!props.open : uncontrolledOpen.value));

function handleOpenChange(next: boolean) {
  if (!openPassed) uncontrolledOpen.value = next;
  emit("update:open", next);
}

provideDialogOpen(open);
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <slot />
  </DialogRoot>
</template>
