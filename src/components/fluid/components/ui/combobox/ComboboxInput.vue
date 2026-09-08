<script setup lang="ts">
import { ComboboxInput as RekaComboboxInput } from "reka-ui";
import { cn } from "../../../lib/utils";
import { useSize } from "../../../lib/size-context";

const props = defineProps<{
  class?: any;
  placeholder?: string;
  autoFocus?: boolean;
}>();

defineOptions({ name: "ComboboxInput" });

const sizeClasses = useSize();
</script>

<template>
  <RekaComboboxInput
    :class="
      cn(
        'flex h-7 w-full items-center bg-transparent text-foreground outline-none placeholder:text-muted-foreground',
        sizeClasses.text,
        sizeClasses.px,
        'rounded-lg border border-border',
        props.class
      )
    "
    :placeholder="placeholder"
    :auto-focus="autoFocus"
  />
</template>
