<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue";
import { cn } from "../../../lib/utils";
import { useSize } from "../../../lib/size-context";

const props = defineProps<{ class?: HTMLAttributes["class"] }>();

// 分组标签是类型阶梯的 caption 角色——见 /docs/sizes。
const sizeClasses = useSize();
const labelClass = computed(() =>
  cn(
    "shrink-0 px-2 py-1.5 text-muted-foreground",
    sizeClasses.value.variant === "compact" ? "text-[11px]" : "text-[12px]",
    props.class
  )
);
</script>

<template>
  <div :class="labelClass"><slot /></div>
</template>
