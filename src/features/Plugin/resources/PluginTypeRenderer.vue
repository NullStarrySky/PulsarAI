<script setup lang="ts">
import { PhWarningCircle as WarningCircle } from "@phosphor-icons/vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import {
	type Component,
	computed,
	defineComponent,
	onErrorCaptured,
	ref,
	watch,
} from "vue";
import * as Vue from "vue";
import {
	useFile,
	useFileContent,
	useFolder,
	useSlot,
} from "../runtime/file-composables";
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
	() => [props.source, props.file.id, props.file.updateDate],
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
		const { descriptor, errors } = parse(props.source);
		if (errors.length > 0) {
			return {
				component: null,
				error: errors.map((e) => e.message).join("\n"),
			};
		}

		if (!descriptor.template) {
			return {
				component: null,
				error: "渲染器缺少 <template> 模块。",
			};
		}

		const renderFn = Vue.compile(descriptor.template.content);
		let compOptions: Record<string, any> = {};

		if (descriptor.scriptSetup || descriptor.script) {
			const compiled = compileScript(descriptor, { id: props.file.id });
			const cleanCode = compiled.content
				.replace(/import\s*\{([^}]+)\}\s*from\s*['"]vue['"];?/g, (_match, names: string) => `const { ${names.replace(/\s+as\s+/g, ": ")} } = Vue;`)
				.replace(/export\s+default\s+/, "return ");

			const evaluator = new Function(
				"Vue",
				"ref",
				"computed",
				"reactive",
				"watch",
				"onMounted",
				"onUnmounted",
				"useFile",
				"useFileContent",
				"useFolder",
				"useSlot",
				cleanCode,
			);

			compOptions =
				evaluator(
					Vue,
					Vue.ref,
					Vue.computed,
					Vue.reactive,
					Vue.watch,
					Vue.onMounted,
				Vue.onUnmounted,
				useFile,
				useFileContent,
				useFolder,
				useSlot,
				) ?? {};
		}

		const DynamicComponent = defineComponent({
			name: `TypeRenderer_${props.file.name.replace(/[^a-zA-Z0-9_]/g, "_")}`,
			...compOptions,
			props: ["file", "path", "modelValue"],
			emits: ["update:modelValue"],
			render: renderFn,
		});

		return { component: DynamicComponent, error: null };
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
