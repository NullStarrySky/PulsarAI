<script setup lang="ts">
import { computed } from "vue";
import { Switch } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import type { ParamDefinition } from "../types";

const props = defineProps<{ definition: ParamDefinition }>();
const emit = defineEmits<{ "update:definition": [value: ParamDefinition] }>();
const definition = computed({
	get: () => props.definition,
	set: (value) => emit("update:definition", value),
});
function patch(key: keyof ParamDefinition, value: unknown) {
	definition.value = { ...definition.value, [key]: value };
}
</script>
<template>
  <div class="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-2"><Input :model-value="definition.paramName" placeholder="访问链；空字符串表示仅组件" @update:model-value="patch('paramName', String($event))" /><Input :model-value="definition.title || ''" placeholder="标题" @update:model-value="patch('title', String($event))" /><Input class="sm:col-span-2" :model-value="definition.description || ''" placeholder="说明" @update:model-value="patch('description', String($event))" /><label class="flex items-center gap-2 text-sm"><Switch :model-value="definition.enableInDefault" @update:model-value="patch('enableInDefault', Boolean($event))" />在默认选择器显示</label><Input :model-value="definition.customBlockComponent || ''" placeholder="自定义区块组件" @update:model-value="patch('customBlockComponent', String($event) || undefined)" /></div>
</template>
