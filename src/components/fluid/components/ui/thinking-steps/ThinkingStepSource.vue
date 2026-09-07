<script setup lang="ts">
import { motion } from "motion-v";
import { spring } from "../../../lib/springs";
import Badge from "../badge/Badge.vue";
import type { BadgeColor } from "../badge/badge-variants";

// ─── ThinkingStepSource ──────────────────────────────────────────────────
// 单个来源徽章：模糊 + 缩放弹簧入场。

const props = withDefaults(
  defineProps<{
    color?: BadgeColor;
    delay?: number;
  }>(),
  { color: "gray", delay: 0 }
);

defineOptions({ name: "ThinkingStepSource", inheritAttrs: false });
</script>

<template>
  <motion.span
    :initial="{ opacity: 0, scale: 0.85, filter: 'blur(4px)' }"
    :animate="{ opacity: 1, scale: 1, filter: 'blur(0px)' }"
    :transition="{
      ...spring.moderate,
      delay: props.delay,
      filter: { duration: 0.12, delay: props.delay },
    }"
  >
    <Badge variant="solid" size="sm" :color="props.color">
      <slot />
    </Badge>
  </motion.span>
</template>
