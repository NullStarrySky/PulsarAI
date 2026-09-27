<script setup lang="ts">
import { ref, watch } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import JavaScriptCodeMirrorEditor from "@/features/Plugin/resources/types/javascript/JavaScriptCodeMirrorEditor.vue";
import { Plus, Trash2 } from "@/lib/remix-icons";
import type { ResourceCondition } from "../dataflow/types";
import {
	createResourceCondition,
	type ResourceConditionFunction,
	resourceConditionDefinitions,
} from "./resource-condition";

const props = defineProps<{ modelValue: ResourceCondition[] }>();
const emit = defineEmits<{
	"update:modelValue": [value: ResourceCondition[]];
}>();
const conditions = ref<ResourceCondition[]>([]);

watch(
	() => props.modelValue,
	(value) => {
		conditions.value = value.map(({ type, param, link }, index) => ({
			type,
			param: { ...param },
			link: index === value.length - 1 ? null : (link ?? "and"),
		}));
	},
	{ immediate: true, deep: true },
);

function persist() {
	emit(
		"update:modelValue",
		conditions.value.map(({ type, param, link }, index) => ({
			type,
			param: { ...param },
			link: index === conditions.value.length - 1 ? null : (link ?? "and"),
		})),
	);
}

function changeType(condition: ResourceCondition, type: unknown) {
	Object.assign(
		condition,
		createResourceCondition(String(type) as ResourceConditionFunction),
	);
	persist();
}

function updateParam(
	condition: ResourceCondition,
	key: string,
	value: unknown,
) {
	condition.param = { ...condition.param, [key]: value };
	persist();
}

function updateLink(condition: ResourceCondition, value: unknown) {
	condition.link = value as ResourceCondition["link"];
	persist();
}

function addCondition() {
	const previous = conditions.value.at(-1);
	if (previous) previous.link = "and";
	conditions.value.push(createResourceCondition());
	persist();
}

function removeCondition(condition: ResourceCondition) {
	conditions.value = conditions.value.filter((item) => item !== condition);
	const previous = conditions.value.at(-1);
	if (previous) previous.link = null;
	persist();
}
</script>

<template>
  <div class="overflow-hidden bg-popover">
    <div class="border-b bg-muted/25 px-3 py-2.5 text-xs font-medium text-muted-foreground">全部条件满足时导入</div>
    <div class="grid gap-2 px-3 py-3">
      <div v-for="(condition, index) in conditions" :key="index" class="grid grid-cols-[6.5rem_minmax(0,1fr)_4rem_2rem] items-start gap-2">
        <Select :model-value="condition.type" @update:model-value="changeType(condition, $event)"><SelectTrigger class="h-8 w-full text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="item in resourceConditionDefinitions" :key="item.id" :value="item.id">{{ item.label }}</SelectItem></SelectContent></Select>
        <JavaScriptCodeMirrorEditor v-if="condition.type === 'custom'" :model-value="String(condition.param.code ?? '')" language="javascript" frameless class="h-20 overflow-hidden rounded-lg border bg-background" @update:model-value="updateParam(condition, 'code', $event)" />
        <div v-else class="flex min-w-0 gap-2">
          <Input v-if="condition.type !== 'probability'" :model-value="String(condition.param.keyword ?? '')" class="h-8 min-w-0 flex-1 bg-background text-xs shadow-none" placeholder="关键词或 /正则/" @update:model-value="updateParam(condition, 'keyword', String($event ?? ''))" />
          <Input v-else :model-value="String(condition.param.percentage ?? 100)" type="number" min="0" max="100" class="h-8 min-w-0 flex-1 bg-background text-xs shadow-none" placeholder="百分比" @update:model-value="updateParam(condition, 'percentage', Number($event ?? 0))" />
          <Input v-if="condition.type === 'include' || condition.type === 'exclude'" :model-value="String(condition.param.depth ?? 4)" type="number" min="1" class="h-8 w-16 bg-background text-xs shadow-none" title="检索消息数" @update:model-value="updateParam(condition, 'depth', Math.max(1, Number($event ?? 1)))" />
        </div>
        <Select v-if="index < conditions.length - 1" :model-value="condition.link ?? 'and'" @update:model-value="updateLink(condition, $event)"><SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="and">AND</SelectItem><SelectItem value="or">OR</SelectItem><SelectItem value="xor">XOR</SelectItem></SelectContent></Select>
        <span v-else class="grid h-8 place-items-center text-xs text-muted-foreground">NULL</span>
        <Button size="icon" variant="ghost" class="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="删除条件" @click="removeCondition(condition)"><Trash2 class="size-3.5" /></Button>
      </div>
      <p v-if="!conditions.length" class="py-3 text-center text-xs text-muted-foreground">没有条件时始终导入资源。</p>
      <Button variant="ghost" class="h-9 justify-center border border-dashed px-2 text-xs text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/40 hover:text-foreground" @click="addCondition"><Plus class="size-3.5" />添加条件</Button>
    </div>
  </div>
</template>
