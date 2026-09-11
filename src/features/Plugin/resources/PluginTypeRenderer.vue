<script setup lang="ts">
import { PhWarningCircle as WarningCircle } from "@phosphor-icons/vue";
import { type Component, computed, onErrorCaptured, ref, watch } from "vue";
import type { ResourceFile } from "./resource-types";
import { compilePluginVueFile } from "./types/vue/plugin-vue-runtime";

const props = defineProps<{ file: ResourceFile; modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const runtimeError = ref<string | null>(null);
onErrorCaptured((error) => {
	runtimeError.value = error instanceof Error ? error.message : String(error);
	return false;
});
watch(
	() => [props.file.path, props.modelValue],
	() => {
		runtimeError.value = null;
	},
);
const compilation = computed<{
	component: Component | null;
	error: string | null;
}>(() => {
	try {
		return compilePluginVueFile({ ...props.file, content: props.modelValue });
	} catch (error) {
		return {
			component: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
});
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-auto">
    <div v-if="runtimeError || compilation.error" class="flex h-full min-h-0 items-center justify-center p-6"><div class="max-w-md rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive"><div class="mb-1.5 flex items-center gap-1.5 font-semibold"><WarningCircle class="size-4 shrink-0" />{{ runtimeError ? '渲染器运行时错误' : '渲染器无法编译' }}</div><pre class="overflow-x-auto whitespace-pre-wrap font-mono leading-5">{{ runtimeError || compilation.error }}</pre></div></div>
    <component :is="compilation.component" v-else-if="compilation.component" :file="file" :path="file.path" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>
