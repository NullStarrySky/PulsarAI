<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import PluginResourceRenderer from "@/features/Plugin/resources/PluginResourceRenderer.vue";
import { useWorld } from "./world-store";
import type { WorldFileNode } from "./world-types";

const props = defineProps<{
	open: boolean;
	file: WorldFileNode | null;
	path: string;
	packageId: string;
	conversationId?: string;
}>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const world = useWorld(
	computed(() => ({
		packageId: props.packageId,
		conversationId: props.conversationId,
		applyReplay: true,
	})),
);
const draft = ref("");

watch(
	() => [props.file, props.open] as const,
	() => {
		if (!props.file) return;
		draft.value =
			typeof props.file.content === "string"
				? props.file.content
				: JSON.stringify(props.file.content ?? null, null, 2);
	},
	{ immediate: true },
);

async function save(value: string) {
	if (!props.file) return;
	draft.value = value;
	const type = world.worldFileType(props.file.name);
	let content: unknown = value;
	if (["json", "chat", "data"].includes(type)) {
		try {
			content = JSON.parse(value);
		} catch {
			content = value;
		}
	}
	await world.updateFile(props.path, { content });
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex h-[min(48rem,calc(100vh-2rem))] max-w-4xl flex-col overflow-hidden p-0">
      <DialogHeader class="border-b px-5 py-4"><DialogTitle>{{ file?.name }}</DialogTitle></DialogHeader>
      <PluginResourceRenderer v-if="file" :file="file" :path="path" :model-value="draft" :preview="true" class="min-h-0 flex-1" @update:model-value="save" />
    </DialogContent>
  </Dialog>
</template>
