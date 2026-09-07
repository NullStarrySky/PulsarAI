<script setup lang="ts">
import { computed } from "vue";
import PluginTypeRenderer from "@/features/Plugin/resources/PluginTypeRenderer.vue";
import { usePluginWorld } from "@/features/Plugin/runtime/file-composables";

const props = defineProps<{ slotId: "panel-top" | "panel-left" | "panel-right" | "topbar-left" | "topbar-right"; direction?: "vertical" | "horizontal" }>();
const world = usePluginWorld();
const aliases: Record<typeof props.slotId, string[]> = {
	"panel-top": ["panel-top", "PANELTOP"],
	"panel-left": ["panel-left", "LEFTPANEL"],
	"panel-right": ["panel-right", "RIGHTPANEL"],
	"topbar-left": ["topbar-left", "TOPBARLEFT"],
	"topbar-right": ["topbar-right", "TOPBARRIGHT"],
};
const resources = computed(() => {
	const slot = world.slots.value.find((item) => aliases[props.slotId].includes(item.id));
	return (slot?.resources ?? []).filter((item) => world.worldFileType(item.file.name) === "component");
});
</script>

<template>
  <div
    v-if="resources.length"
    class="plugin-slot-components flex min-w-0 gap-2"
    :class="direction === 'horizontal' ? 'flex-row flex-wrap items-center' : 'flex-col'"
    :data-plugin-slot="slotId"
  >
    <PluginTypeRenderer
      v-for="resource in resources"
      :key="`${resource.scope}:${resource.file.id}`"
      :file="resource.file"
      :path="resource.path"
      :source="typeof resource.file.content === 'string' ? resource.file.content : ''"
      model-value=""
      class="min-w-0"
    />
  </div>
</template>
