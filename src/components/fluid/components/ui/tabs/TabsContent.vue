<script setup lang="ts">
import { TabsContent as TabsContentPrimitive } from "reka-ui";
import { cn } from "../../../lib/utils";

const props = defineProps<{
  /** 必须与某个 TabsTrigger / TabItem 的 value 匹配。 */
  value: string;
  asChild?: boolean;
  class?: string;
}>();
</script>

<template>
  <TabsContentPrimitive
    :value="value"
    :as-child="asChild"
    :class="cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', props.class)"
  >
    <slot />
  </TabsContentPrimitive>
</template>
