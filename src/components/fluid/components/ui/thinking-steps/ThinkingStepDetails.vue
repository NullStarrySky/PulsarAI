<script setup lang="ts">
import { computed, ref, type VNode } from "vue";
import { CollapsibleRoot } from "reka-ui";
import { cn } from "../../../lib/utils";
import { useSize } from "../../../lib/size-context";
import CollapseTriggerRow from "./CollapseTriggerRow.vue";
import CollapsePanel from "./CollapsePanel.vue";

// ─── ThinkingStepDetails（嵌套折叠）──────────────────────────────────────
// 步骤内的可折叠明细：summary 触发行 + 逐条明细行。

const props = withDefaults(
  defineProps<{
    summary: string;
    details?: string[];
    defaultOpen?: boolean;
    class?: string;
  }>(),
  { defaultOpen: false }
);

const slots = defineSlots<{ default?: () => VNode[] }>();

defineOptions({ name: "ThinkingStepDetails" });

const sizeClasses = useSize();
const compactStep = computed(() => sizeClasses.value.variant === "compact");
const open = ref(props.defaultOpen);
</script>

<template>
  <CollapsibleRoot :open="open" @update:open="open = $event" :class="cn('mt-1 -ml-3', props.class)">
    <CollapseTriggerRow :open="open" class="gap-1.5 px-3 py-1">
      {{ summary }}
    </CollapseTriggerRow>
    <CollapsePanel :open="open">
      <div class="flex flex-col gap-0.5 pt-0.5">
        <span
          v-for="(item, i) in details"
          :key="i"
          :class="
            cn(
              'leading-snug text-muted-foreground',
              compactStep ? 'text-[11px]' : 'text-[12px]'
            )
          "
        >
          {{ item }}
        </span>
        <slot />
      </div>
    </CollapsePanel>
  </CollapsibleRoot>
</template>
