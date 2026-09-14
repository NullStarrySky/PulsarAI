<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/fluid";
import { Pencil } from "@/lib/phosphor-icons";
import { useRequestStore } from "../request-store";
import type { ParamDefinition, ParamGroup } from "../types";
import ParamDefinitionEditor from "./ParamDefinitionEditor.vue";
import ParamDefinitionRenderer from "./ParamDefinitionRenderer.vue";

const props = defineProps<{
	providerId: string;
	group: ParamGroup;
	definition: ParamDefinition;
}>();
const store = useRequestStore();
const editing = ref(false);
async function update(value: ParamDefinition) {
	const provider = store.provider(props.providerId);
	const index = provider?.params[props.group].indexOf(props.definition) ?? -1;
	if (!provider || index < 0) return;
	provider.params[props.group][index] = value;
	await store.save(provider);
}
</script>
<template><div class="rounded-md border p-2"><div class="flex justify-end"><Button size="icon" variant="ghost" @click="editing = !editing"><Pencil class="size-4" /></Button></div><ParamDefinitionRenderer :definition="definition" @update:value="store.patchParam(providerId, group, definition.paramName, $event)" /><ParamDefinitionEditor v-if="editing" :definition="definition" class="mt-2" @update:definition="update" /></div></template>
