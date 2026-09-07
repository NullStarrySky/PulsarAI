<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";

// ─── ThinkingStepImage ───────────────────────────────────────────────────
// 步骤内插图：模糊入场 + 可选 caption（caption 角色对齐类型阶梯）。

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    caption?: string;
    delay?: number;
    class?: string;
  }>(),
  { alt: "", delay: 0 }
);

defineOptions({ name: "ThinkingStepImage" });

const shape = useShape();
const compact = computed(() => useSize().value.variant === "compact");
</script>

<template>
  <motion.div
    :class="cn('mt-1.5', props.class)"
    :initial="{ opacity: 0, filter: 'blur(4px)' }"
    :animate="{ opacity: 1, filter: 'blur(0px)' }"
    :transition="{
      opacity: { duration: 0.2, delay: props.delay, ease: 'easeOut' },
      filter: { duration: 0.15, delay: props.delay },
    }"
  >
    <img
      :src="src"
      :alt="alt"
      :class="cn('w-full max-w-[200px] object-cover', shape.container)"
    />
    <span
      v-if="caption"
      :class="
        cn(
          compact ? 'text-[11px]' : 'text-[12px]',
          'mt-1 block text-muted-foreground'
        )
      "
    >
      {{ caption }}
    </span>
  </motion.div>
</template>
