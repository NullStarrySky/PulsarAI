<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
	Button,
	Switch,
	Tabs,
	TabsList,
	TabsTrigger,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, RefreshCw, Trash2 } from "@/lib/phosphor-icons";
import { useRequestStore } from "../request-store";
import type {
	ParamDefinition,
	ParamGroup,
	Provider,
	RequestOverride,
} from "../types";
import { defaultParam } from "../utils/params";
import ModelList from "./ModelList.vue";
import ParamDefinitionContainer from "./ParamDefinitionContainer.vue";
import PopableJSEditor from "./PopableJSEditor.vue";

const store = useRequestStore();
const activeProviderId = ref("");
const activeKind = ref<ParamGroup>("text");
const draft = reactive({ id: "", name: "" });
const groups: Array<{ id: ParamGroup; label: string }> = [
	{ id: "basic", label: "基础" },
	{ id: "text", label: "文本" },
	{ id: "image", label: "图片" },
	{ id: "video", label: "视频" },
	{ id: "speech", label: "语音" },
	{ id: "transcribe", label: "转写" },
	{ id: "provider", label: "Provider" },
];
const activeProvider = computed(() => store.provider(activeProviderId.value));
const visibleGroups = computed(() =>
	groups.filter(
		(group) =>
			group.id === "basic" ||
			group.id === "provider" ||
			activeProvider.value?.models[group.id as keyof Provider["models"]].length,
	),
);
const modelKind = computed(() =>
	activeKind.value === "basic" || activeKind.value === "provider"
		? undefined
		: activeKind.value,
);
const operations: Array<keyof RequestOverride> = [
	"generateText",
	"streamText",
	"generateImage",
	"generateVideo",
	"generateSpeech",
	"transcribe",
	"ToolLoopAgent",
];
function blankParam(): ParamDefinition {
	return {
		paramName: "",
		enableInDefault: false,
		title: "新参数",
		paramComponent: { component: "input", componentParam: {} },
		defaultValue: "",
		value: "",
	};
}
async function addParam() {
	const provider = activeProvider.value;
	if (!provider) return;
	provider.params[activeKind.value].push(defaultParam(blankParam()));
	await store.save(provider);
}
async function addProvider() {
	const id = draft.id.trim();
	if (!id) return;
	await store.addProvider({
		id,
		name: draft.name.trim() || id,
		enabled: false,
		params: {
			basic: [],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: { text: [], image: [], video: [], speech: [], transcribe: [] },
		requestOverride: {},
	});
	activeProviderId.value = id;
	draft.id = "";
	draft.name = "";
}
async function deleteProvider() {
	if (!activeProvider.value) return;
	const id = activeProvider.value.id;
	await store.deleteProvider(id);
	activeProviderId.value = store.providers[0]?.id ?? "";
}
async function setOverride(operation: keyof RequestOverride, source: string) {
	const provider = activeProvider.value;
	if (!provider) return;
	if (source.trim()) provider.requestOverride[operation] = source;
	else delete provider.requestOverride[operation];
	await store.save(provider);
}
async function setModelGetter(source: string) {
	const provider = activeProvider.value;
	if (!provider) return;
	provider.modelGetter = source.trim() || undefined;
	await store.save(provider);
}
onMounted(async () => {
	await store.initialize();
	activeProviderId.value = store.providers[0]?.id ?? "";
});
</script>

<template>
  <div class="flex min-h-0 gap-4 max-md:flex-col">
    <ScrollArea class="w-52 shrink-0 max-md:w-full"><div class="space-y-2 p-1"><Button v-for="provider in store.providers" :key="provider.id" size="sm" :variant="provider.id === activeProviderId ? 'secondary' : 'ghost'" class="w-full justify-start" @click="activeProviderId = provider.id">{{ provider.name }}</Button><div class="grid gap-2 border-t pt-2"><Input v-model="draft.id" placeholder="提供商 ID" /><Input v-model="draft.name" placeholder="显示名称" /><Button size="sm" @click="addProvider"><Plus class="size-4" />添加提供商</Button></div></div></ScrollArea>
    <section v-if="activeProvider" class="min-w-0 flex-1 space-y-4"><header class="flex flex-wrap items-center gap-3"><div class="min-w-0 flex-1"><h2 class="text-base font-semibold">{{ activeProvider.name }}</h2><p v-if="activeProvider.description" class="text-sm text-muted-foreground">{{ activeProvider.description }}</p></div><label class="flex items-center gap-2 text-sm"><Switch :model-value="activeProvider.enabled" @update:model-value="activeProvider.enabled = Boolean($event); store.save(activeProvider)" />启用</label><Button v-if="activeProvider.modelGetter" size="sm" variant="outline" @click="store.refreshModels(activeProvider.id)"><RefreshCw class="size-4" />获取模型</Button><Button size="icon" variant="ghost" title="删除提供商" @click="deleteProvider"><Trash2 class="size-4" /></Button></header>
      <Tabs :model-value="activeKind" @update:model-value="activeKind = $event as ParamGroup"><TabsList><TabsTrigger v-for="group in visibleGroups" :key="group.id" :value="group.id">{{ group.label }}</TabsTrigger></TabsList></Tabs>
      <div v-if="modelKind" class="space-y-2 rounded-md border p-3"><p class="text-sm font-medium">{{ groups.find((item) => item.id === modelKind)?.label }}模型</p><ModelList :provider="activeProvider" :kind="modelKind" /></div>
      <div class="space-y-2"><ParamDefinitionContainer v-for="(definition, index) in activeProvider.params[activeKind]" :key="`${definition.paramName}:${index}`" :provider-id="activeProvider.id" :group="activeKind" :definition="definition" /><Button size="sm" variant="outline" @click="addParam"><Plus class="size-4" />添加参数</Button></div>
      <details class="rounded-md border p-3"><summary class="cursor-pointer text-sm font-medium">高级函数</summary><div class="mt-3 flex flex-wrap gap-2"><PopableJSEditor title="modelGetter" :model-value="activeProvider.modelGetter || ''" @update:model-value="setModelGetter" /><PopableJSEditor v-for="operation in operations" :key="operation" :title="operation" :model-value="activeProvider.requestOverride[operation] || ''" @update:model-value="setOverride(operation, $event)" /></div></details>
    </section>
  </div>
</template>
