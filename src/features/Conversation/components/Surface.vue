<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import {
	useActivePluginData,
	usePluginData,
} from "@/features/Plugin/dataflow/use-plugin-data";
import { useSlotContent } from "@/features/Plugin/dataflow/use-slot-content";
import PluginResourceRenderer from "@/features/Plugin/resources/PluginResourceRenderer.vue";
import AskUserComponent from "@/features/Plugin/runtime/AskUserComponent.vue";
import { useActivePathComposable } from "../dataflow/activePathComposable";
import Composer from "./Composer.vue";
import Timeline from "./Timeline.vue";

const props = withDefaults(
	defineProps<{
		conversationId?: string;
		defaultPluginId?: string;
	}>(),
	{
		conversationId: "",
		defaultPluginId: "",
	},
);

const conversation = shallowRef<ReturnType<
	typeof useActivePathComposable
> | null>(null);
const composerHeight = ref(0);

watch(
	() => props.conversationId,
	(id) => {
		conversation.value = id ? useActivePathComposable(id) : null;
	},
	{ immediate: true },
);

const filetree = usePluginData(
	() => conversation.value?.conversation.value?.localPluginId ?? "",
	computed(() => conversation.value?.replayPulses.value ?? []),
	() => conversation.value?.conversation.value?.pluginVersionId ?? "",
);
const activeFiletree = useActivePluginData(filetree);
const slotOptions = {
	filetree: activeFiletree,
	applyPulse: () => undefined,
};

const topPanels = useSlotContent("/panel/panel-top", slotOptions);
const leftPanels = useSlotContent("/panel/panel-left", slotOptions);
const rightPanels = useSlotContent("/panel/panel-right", slotOptions);
</script>

<template>
  <main class="relative h-full min-h-0 overflow-hidden bg-transparent">
    <AskUserComponent />
    <Timeline
      v-if="props.conversationId"
      :key="props.conversationId"
      :conversation-id="props.conversationId"
      :bottom-inset="composerHeight + 32"
    />
    <Composer
      :conversation-id="props.conversationId"
      :default-plugin-id="props.defaultPluginId"
      @height-change="composerHeight = $event"
    />
    <div class="pointer-events-none absolute inset-0 z-20">
      <div v-if="topPanels.length" class="pointer-events-auto absolute inset-x-4 top-4 mx-auto flex max-h-[30%] w-fit max-w-[min(34rem,calc(100%-2rem))] flex-col gap-2 overflow-auto mobile:inset-x-2">
        <PluginResourceRenderer v-for="panel in topPanels" :key="panel.path" :path="panel.path" :filetree="activeFiletree" :apply-pulse="slotOptions.applyPulse" :preview="true" :imported="panel.content" />
      </div>
      <div v-if="leftPanels.length" class="pointer-events-auto absolute bottom-32 left-4 top-4 hidden w-64 flex-col gap-2 overflow-auto md:flex">
        <PluginResourceRenderer v-for="panel in leftPanels" :key="panel.path" :path="panel.path" :filetree="activeFiletree" :apply-pulse="slotOptions.applyPulse" :preview="true" :imported="panel.content" />
      </div>
      <div v-if="rightPanels.length" class="pointer-events-auto absolute bottom-32 right-4 top-4 hidden w-64 flex-col gap-2 overflow-auto md:flex">
        <PluginResourceRenderer v-for="panel in rightPanels" :key="panel.path" :path="panel.path" :filetree="activeFiletree" :apply-pulse="slotOptions.applyPulse" :preview="true" :imported="panel.content" />
      </div>
    </div>
  </main>
</template>
