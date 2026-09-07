<script setup lang="ts">
import { computed, type VNode } from "vue";
import { cn } from "../../../lib/utils";

// ─── TabsSubtlePanel ──────────────────────────────────────────────────────
// 在 <TabsSubtle> 之外（每个调用点）渲染，无法使用 reka 的 TabsContent
// （它要求 Root 上下文）。保持一个普通 tabpanel，通过共享的 idPrefix 与
// 对应 tab 关联。

const props = withDefaults(
  defineProps<{
    index: number;
    selectedIndex: number;
    idPrefix: string;
    class?: string;
  }>(),
  {}
);

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "TabsSubtlePanel" });

const isSelected = computed(() => props.selectedIndex === props.index);
</script>

<template>
  <div
    :id="`${idPrefix}-panel-${index}`"
    role="tabpanel"
    :aria-labelledby="`${idPrefix}-tab-${index}`"
    :hidden="!isSelected"
    tabindex="-1"
    :class="cn('outline-none', props.class)"
  >
    <template v-if="isSelected">
      <slot />
    </template>
  </div>
</template>
