<script setup lang="ts">
import { computed, ref, toValue } from "vue";
import { Button } from "@/components/fluid";
import { useFloatingSurface } from "@/features/Environment/floating-surface";
import type { FileMeta, ResourcePath } from "../dataflow/types";
import type { FileApiOptions } from "../dataflow/use-file-api";
import PluginResourceConditionEditor from "./PluginResourceConditionEditor.vue";
import PluginResourceRenderer from "./PluginResourceRenderer.vue";

const props = defineProps<FileApiOptions & { path: ResourcePath | null }>();
const emit = defineEmits<{ close: [] }>();
const element = ref<HTMLElement | null>(null);
const open = computed(() => props.path !== null);
const fileMeta = computed(() => {
	const tree = toValue(props.filetree);
	const meta = props.path && tree ? tree.meta[props.path] : undefined;
	return meta && "resourceSelected" in meta ? (meta as FileMeta) : undefined;
});

const floating = useFloatingSurface({
	surfaceId: "plugin-file-editor",
	open,
	element,
	initialSize: { width: 760, height: 560 },
	minSize: { width: 360, height: 320 },
	persistGeometry: true,
});

function updateCondition(condition: string) {
	if (!props.path) return;
	props.applyPulse({
		kind: "file.meta.patch",
		path: props.path,
		patch: { condition },
	});
}
function updateConditionEnabled(conditionEnabled: boolean) {
	if (!props.path) return;
	props.applyPulse({
		kind: "file.meta.patch",
		path: props.path,
		patch: { conditionEnabled },
	});
}
</script>

<template>
	<Teleport to="body">
		<section
			v-if="open && path"
			ref="element"
			:style="floating.style.value"
			class="fixed flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
		>
			<header data-floating-drag-handle class="flex h-11 shrink-0 items-center gap-2 border-b px-3">
				<strong class="min-w-0 flex-1 truncate text-sm">{{ path.split('/').at(-1) }}</strong>
				<Button size="sm" variant="ghost" @click="emit('close')">关闭</Button>
			</header>
			<PluginResourceConditionEditor
				v-if="fileMeta && path"
				:model-value="fileMeta.condition ?? ''"
				:enabled="fileMeta.conditionEnabled !== false"
				@update:model-value="updateCondition"
				@update:enabled="updateConditionEnabled"
			/>
			<PluginResourceRenderer
				v-if="fileMeta"
				:path="path"
				:filetree="filetree"
				:apply-pulse="applyPulse"
				:preview="true"
				class="min-h-0 flex-1"
			/>
		</section>
	</Teleport>
</template>
