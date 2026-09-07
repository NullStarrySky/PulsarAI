<script setup lang="ts">
import { computed, type VNode } from "vue";
import { cn } from "../../../lib/utils";
import { useShape } from "../../../lib/shape-context";

// ── 快捷键键帽 ───────────────────────────────────────────────────────────
// 展示动作的键盘快捷键，让 Back（←）、Skip（→）与 Continue（⌘↵ / ⌃↵）
// 读起来一致。tone="inverted" 用于深色主按钮；默认用于安静的 ghost 按钮。

const props = withDefaults(
  defineProps<{
    tone?: "muted" | "inverted";
  }>(),
  { tone: "muted" }
);

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "AskUserShortcutChip" });

const shape = useShape();
const chipClass = computed(() =>
  cn(
    "inline-flex items-center justify-center gap-0.5 px-1 min-w-[18px] h-[18px] text-[11px] leading-none font-sans tracking-wide",
    props.tone === "inverted"
      ? "bg-background/15 text-background"
      : "bg-foreground/10 text-muted-foreground",
    shape.value.bg
  )
);
</script>

<template>
  <kbd aria-hidden="true" :class="chipClass"><slot /></kbd>
</template>
