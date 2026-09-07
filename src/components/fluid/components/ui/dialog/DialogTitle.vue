<script setup lang="ts">
import { computed } from "vue";
import { DialogTitle } from "reka-ui";
import { cn } from "../../../lib/utils";
import { useSizeVariant } from "../../../lib/size-context";

const props = defineProps<{ class?: string }>();

// 类型阶梯的 title 角色——见 /docs/sizes。
const compact = computed(() => useSizeVariant().value === "compact");
const titleStyle = { fontVariationSettings: "'wght' 700" };
</script>

<template>
  <DialogTitle
    :class="
      cn(
        compact ? 'text-[15px]' : 'text-[16px]',
        'leading-tight text-foreground',
        props.class
      )
    "
    :style="titleStyle"
  >
    <slot />
  </DialogTitle>
</template>
