<script setup lang="ts">
import { TooltipProvider } from "reka-ui";

/**
 * 应用级（或区块级）包装一次：给后代 Tooltips 分组，让一个 tooltip 打开后
 * 移动到相邻触发器时立即显示，而不是重新等待完整延迟。
 */
withDefaults(
  defineProps<{
    /** tooltip 打开前的悬停延迟（ms）。 */
    delayDuration?: number;
    /** tooltip 关闭后，此窗口内打开的相邻 tooltip 跳过悬停延迟（ms）。 */
    skipDelayDuration?: number;
  }>(),
  { delayDuration: 200, skipDelayDuration: 300 }
);
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration" :skip-delay-duration="skipDelayDuration">
    <slot />
  </TooltipProvider>
</template>
