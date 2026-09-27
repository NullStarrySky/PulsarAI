<script setup lang="ts">
import { ref } from "vue";
import { Button, Switch } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw, Trash2 } from "@/lib/remix-icons";
import { invokeRequestFunction } from "../provider";
import ProviderAvatar from "../provider/shared/components/ProviderAvatar.vue";
import type { ModelDefinition, Provider, RequestKind } from "../types";

const props = defineProps<{ provider: Provider; kind: RequestKind }>();
const id = ref("");
const refreshing = ref(false);
const refreshError = ref("");
let refreshGeneration = 0;

function add() {
	const value = id.value.trim();
	if (!value || props.provider.models[props.kind].some((model) => model.id === value))
		return;
	props.provider.models[props.kind].push({
		id: value,
		displayName: value,
		enabled: true,
	});
	id.value = "";
}

function merge(provider: Provider, kind: RequestKind, models: ModelDefinition[]) {
	const current = new Map(
		provider.models[kind].map((model) => [model.id, model]),
	);
	for (const model of models) {
		const existing = current.get(model.id);
		current.set(model.id, {
			...model,
			enabled: existing?.enabled ?? model.enabled,
		});
	}
	provider.models[kind] = [...current.values()];
}

async function refresh() {
	const provider = props.provider;
	const modelGetter = provider.modelGetter;
	if (!modelGetter) return;
	const requestKind = props.kind;
	const generation = ++refreshGeneration;
	refreshing.value = true;
	refreshError.value = "";
	try {
		const result = await invokeRequestFunction<
			Partial<Record<RequestKind, ModelDefinition[]>> | ModelDefinition[]
		>(modelGetter, { provider });
		if (Array.isArray(result)) merge(provider, requestKind, result);
		else {
			for (const resultKind of [
				"text",
				"image",
				"video",
				"speech",
				"transcribe",
			] as const) {
				if (resultKind === requestKind && result[resultKind])
					merge(provider, resultKind, result[resultKind]);
			}
		}
	} catch (error) {
		if (generation === refreshGeneration)
			refreshError.value = error instanceof Error ? error.message : String(error);
	} finally {
		if (generation === refreshGeneration) refreshing.value = false;
	}
}

</script>

<template>
  <div class="space-y-2">
    <div v-for="model in provider.models[kind]" :key="model.id" class="flex items-center gap-2 rounded-md border px-3 py-2">
      <Switch :model-value="model.enabled" @update:model-value="model.enabled = Boolean($event)" />
      <ProviderAvatar :name="model.displayName" :src="model.icon" :provider-id="provider.id" :icon-id="provider.icon" />
      <span class="min-w-0 flex-1 truncate text-sm">{{ model.displayName }}</span>
      <Button size="icon" variant="ghost" @click="provider.models[kind] = provider.models[kind].filter((item) => item.id !== model.id)"><Trash2 class="size-4" /></Button>
    </div>
    <p v-if="refreshError" class="text-xs text-destructive">{{ refreshError }}</p>
    <div class="flex gap-2"><Input v-model="id" placeholder="模型 ID" @keyup.enter="add" /><Button v-if="provider.modelGetter" size="icon" variant="outline" :disabled="refreshing" title="获取模型" @click="refresh"><RefreshCw class="size-4" /></Button><Button size="sm" @click="add"><Plus class="size-4" />添加</Button></div>
  </div>
</template>
