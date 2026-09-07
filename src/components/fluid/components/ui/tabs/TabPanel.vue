<script setup lang="ts">
import { TabsContent } from "reka-ui";
import { cn } from "../../../lib/utils";

const props = defineProps<{
  /** 必须与某个 TabItem 的 value 匹配。 */
  value: string;
  class?: string;
}>();
</script>

<template>
  <TabsContent :value="value" :class="cn('outline-none', props.class)">
    <slot />
  </TabsContent>
</template>
