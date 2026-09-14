<script setup lang="ts">
import { ref } from "vue";
import { Button, Switch } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "@/lib/phosphor-icons";
import { useRequestStore } from "../request-store";
import type { Provider, RequestKind } from "../types";

const props = defineProps<{ provider: Provider; kind: RequestKind }>();
const store = useRequestStore();
const id = ref("");
async function add() {
	const value = id.value.trim();
	if (!value) return;
	await store.addModel(props.provider.id, props.kind, {
		id: value,
		displayName: value,
		enabled: true,
	});
	id.value = "";
}
function toggle(modelId: string, enabled: boolean) {
	const model = props.provider.models[props.kind].find(
		(item) => item.id === modelId,
	);
	if (!model) return;
	model.enabled = enabled;
	void store.save(props.provider);
}
</script>
<template>
  <div class="space-y-2"><div v-for="model in provider.models[kind]" :key="model.id" class="flex items-center gap-2 rounded-md border px-3 py-2"><Switch :model-value="model.enabled" @update:model-value="toggle(model.id, Boolean($event))" /><span class="min-w-0 flex-1 truncate text-sm">{{ model.displayName }}</span><Button size="icon" variant="ghost" @click="store.removeModel(provider.id, kind, model.id)"><Trash2 class="size-4" /></Button></div><div class="flex gap-2"><Input v-model="id" placeholder="模型 ID" @keyup.enter="add" /><Button size="sm" @click="add"><Plus class="size-4" />添加</Button></div></div>
</template>
