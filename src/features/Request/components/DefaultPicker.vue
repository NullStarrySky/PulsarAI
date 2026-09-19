<script setup lang="ts">
import { computed, onMounted } from "vue";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/fluid";
import { Check, ChevronDown } from "@/lib/remix-icons";
import { useRequestStore } from "../request-store";
import type { ModelSelection, RequestKind } from "../types";
import ParamDefinitionRenderer from "./ParamDefinitionRenderer.vue";
import ProviderAvatar from "../provider/shared/components/ProviderAvatar.vue";

const props = withDefaults(
	defineProps<{
		modelValue: ModelSelection | null;
		kind: RequestKind;
		allowEmpty?: boolean;
		emptyLabel?: string;
	}>(),
	{ allowEmpty: false, emptyLabel: "未设置" },
);
const emit = defineEmits<{
	"update:modelValue": [value: ModelSelection | null];
}>();
const store = useRequestStore();
const provider = computed(() =>
	props.modelValue
		? store.providers.get(props.modelValue.providerId)
		: undefined,
);
const model = computed(() =>
	provider.value?.models[props.kind].find(
		(item) => item.id === props.modelValue?.modelId,
	),
);
const providers = computed(() =>
	[...store.providers.values()].filter(
		(item) =>
			item.enabled && item.models[props.kind].some((model) => model.enabled),
	),
);
const defaultParams = computed(() =>
	provider.value
		? [
				...provider.value.params.basic,
				...provider.value.params[props.kind],
				...provider.value.params.provider,
			].filter((item) => item.enableInDefault)
		: [],
);
function select(providerId: string, modelId: string) {
	emit("update:modelValue", { providerId, modelId, kind: props.kind });
}
function updateParam(paramName: string, value: unknown) {
	if (!provider.value) return;
	const group = (
		Object.keys(provider.value.params) as Array<
			keyof typeof provider.value.params
		>
	).find((key) =>
		provider.value!.params[key].some((item) => item.paramName === paramName),
	);
	if (group) {
		const definition = provider.value.params[group].find(
			(item) => item.paramName === paramName,
		);
		if (definition) definition.value = value;
	}
}
onMounted(() => void store.init());
</script>

<template>
  <div class="space-y-2">
    <DropdownMenu>
      <DropdownMenuTrigger as-child><Button variant="outline" class="w-full justify-between sm:w-80"><span class="truncate">{{ model?.displayName || emptyLabel }}</span><ChevronDown class="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent class="w-72" align="start"><DropdownMenuGroup>
        <DropdownMenuItem v-if="allowEmpty" @select="emit('update:modelValue', null)"><Check :class="modelValue ? 'opacity-0' : 'opacity-100'" />{{ emptyLabel }}</DropdownMenuItem>
        <DropdownMenuSub v-for="item in providers" :key="item.id"><DropdownMenuSubTrigger class="gap-2"><ProviderAvatar :name="item.name" :src="item.iconUrl" :provider-id="item.id" :icon-id="item.icon" />{{ item.name }}</DropdownMenuSubTrigger><DropdownMenuSubContent class="w-64"><DropdownMenuItem v-for="candidate in item.models[kind].filter((value) => value.enabled)" :key="candidate.id" @select="select(item.id, candidate.id)"><Check :class="modelValue?.providerId === item.id && modelValue?.modelId === candidate.id ? 'opacity-100' : 'opacity-0'" /><ProviderAvatar :name="candidate.displayName" :src="candidate.icon" :provider-id="item.id" :icon-id="item.icon" />{{ candidate.displayName }}</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub>
      </DropdownMenuGroup></DropdownMenuContent>
    </DropdownMenu>
    <div v-if="defaultParams.length" class="space-y-1 rounded-md border p-2"><ParamDefinitionRenderer v-for="definition in defaultParams" :key="definition.paramName" :definition="definition" @update:value="updateParam(definition.paramName, $event)" /></div>
  </div>
</template>
