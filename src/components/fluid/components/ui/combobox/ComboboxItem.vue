<script setup lang="ts">
import { ComboboxItem as RekaComboboxItem } from "reka-ui";
import { cn } from "../../../lib/utils";
import { useSize } from "../../../lib/size-context";

const props = defineProps<{
  value: string;
  disabled?: boolean;
  class?: any;
}>();

defineOptions({ name: "ComboboxItem" });
const sizeClasses = useSize();
</script>

<template>
  <RekaComboboxItem :value="value" :disabled="disabled" as-child>
    <div
      :class="
        cn(
          'relative z-10 flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 outline-none transition-colors duration-80 data-[highlighted]:bg-transparent',
          sizeClasses.text,
          props.class
        )
      "
    >
      <slot />
    </div>
  </RekaComboboxItem>
</template>
