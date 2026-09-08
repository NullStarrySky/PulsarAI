<script setup lang="ts">
import { cn } from "../../../lib/utils";
import { useSize } from "../../../lib/size-context";

const props = defineProps<{
  class?: any;
}>();

defineOptions({ name: "DropdownEmpty" });

const sizeClasses = useSize();
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    :class="
      cn(
        'px-2 py-6 text-center text-muted-foreground select-none',
        sizeClasses.text,
        props.class
      )
    "
  >
    <slot>无匹配项</slot>
  </div>
</template>
