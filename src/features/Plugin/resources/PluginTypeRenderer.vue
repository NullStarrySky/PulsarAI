<script setup lang="ts">
import { PhWarningCircle as WarningCircle } from "@phosphor-icons/vue";
import {
	type Component,
	computed,
	onErrorCaptured,
	ref,
	watch,
} from "vue";
import { compilePluginVueFile } from "../editors/vue/plugin-vue-runtime";
import type { WorldFileNode } from "../tree/world-types";

const props = defineProps<{
	source: string;
	file: WorldFileNode;
	path?: string;
	modelValue: string;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const runtimeError = ref<string | null>(null);

onErrorCaptured((err) => {
	runtimeError.value = err instanceof Error ? err.message : String(err);
	return false;
});

watch(
	() => [props.source, props.file.id],
	() => {
		runtimeError.value = null;
	},
);

const compilation = computed<{
	component: Component | null;
	error: string | null;
}>(() => {
	if (!props.source.trim()) {
		return { component: null, error: "渲染器源码为空。" };
	}

	try {
		const result = compilePluginVueFile({
			...props.file,
			content: props.source,
		});
		return {
			component: result.component,
			error: result.diagnostics.length && !result.component ? result.diagnostics.join("\n") : null,
		};
	} catch (err) {
		return {
			component: null,
			error: err instanceof Error ? err.message : String(err),
		};
	}
});
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-auto">
    <div v-if="runtimeError || compilation.error" class="flex h-full min-h-0 items-center justify-center p-6">
      <div class="max-w-md rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive">
        <div class="mb-1.5 flex items-center gap-1.5 font-semibold">
          <WarningCircle class="size-4 shrink-0" />
          {{ runtimeError ? '渲染器运行时错误' : '渲染器无法编译' }}
        </div>
        <pre class="overflow-x-auto whitespace-pre-wrap font-mono leading-5">{{ runtimeError || compilation.error }}</pre>
      </div>
    </div>
    <component
      :is="compilation.component"
      v-else-if="compilation.component"
      :file="file"
      :path="path"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
