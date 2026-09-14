<script setup lang="ts">
import { computed } from "vue";
import {
	type ResourcePath,
	resourceType,
	useActivePluginData,
	usePluginData,
	useSlot,
} from "@/features/Plugin/dataflow";
import { readFile } from "@/features/Plugin/dataflow/pulse";
import PluginTypeRenderer from "@/features/Plugin/resources/PluginTypeRenderer.vue";
import type { ResourceFile } from "@/features/Plugin/resources/resource-types";
import ChatComposer from "../components/ChatComposer.vue";
import ChatThread from "../components/ChatThread.vue";
import { useActivePathComposable } from "../dataflow/activePathComposable";

const props = defineProps<{ chatId: string }>();
const conversation = useActivePathComposable(props.chatId);
const filetree = usePluginData(
	() => conversation.chat.value?.localPluginId ?? "",
	conversation.replayPulses,
	() => conversation.chat.value?.pluginVersionId ?? "",
);
const activeFiletree = useActivePluginData(filetree);
const slots = useSlot({
	filetree: activeFiletree,
	applyPulse: () => undefined,
});

function components(slotId: string) {
	return computed<ResourceFile[]>(() => {
		const data = filetree.value;
		if (!data) return [];
		return (slots.get(slotId)?.selectedResources ?? []).flatMap(
			({ meta, path }) => {
				if (resourceType(path) !== "component") return [];
				try {
					return [
						{
							...meta,
							path: path as ResourcePath,
							content: readFile(data, path),
						},
					];
				} catch {
					return [];
				}
			},
		);
	});
}

const topPanels = components("panel-top");
const leftPanels = components("panel-left");
const rightPanels = components("panel-right");
</script>

<template>
  <main class="relative h-full min-h-0 overflow-hidden bg-background">
    <ChatThread :chat-id="props.chatId" />
    <ChatComposer :chat-id="props.chatId" />
    <div class="pointer-events-none absolute inset-0 z-20">
      <div v-if="topPanels.length" class="pointer-events-auto absolute inset-x-4 top-4 mx-auto flex max-h-[30%] w-fit max-w-[min(34rem,calc(100%-2rem))] flex-col gap-2 overflow-auto mobile:inset-x-2">
        <PluginTypeRenderer v-for="panel in topPanels" :key="panel.path" :file="panel" :model-value="panel.content" />
      </div>
      <div v-if="leftPanels.length" class="pointer-events-auto absolute bottom-32 left-4 top-4 hidden w-64 flex-col gap-2 overflow-auto md:flex">
        <PluginTypeRenderer v-for="panel in leftPanels" :key="panel.path" :file="panel" :model-value="panel.content" />
      </div>
      <div v-if="rightPanels.length" class="pointer-events-auto absolute bottom-32 right-4 top-4 hidden w-64 flex-col gap-2 overflow-auto md:flex">
        <PluginTypeRenderer v-for="panel in rightPanels" :key="panel.path" :file="panel" :model-value="panel.content" />
      </div>
    </div>
  </main>
</template>
