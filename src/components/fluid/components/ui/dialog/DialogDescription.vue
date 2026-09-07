<script setup lang="ts">
import { computed } from "vue";
import { DialogDescription } from "reka-ui";
import { cn } from "../../../lib/utils";
import { useSizeVariant } from "../../../lib/size-context";

const props = defineProps<{ class?: string }>();

const compact = computed(() => useSizeVariant().value === "compact");
</script>

<template>
  <DialogDescription
    :class="
      cn(
        compact ? 'text-[12px]' : 'text-[13px]',
        'text-muted-foreground',
        props.class
      )
    "
  >
    <slot />
  </DialogDescription>
</template>
