<script setup lang="ts">
import { Plus, Trash2 } from "lucide-vue-next";
import { ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	NumberField,
	NumberFieldContent,
	NumberFieldDecrement,
	NumberFieldIncrement,
	NumberFieldInput,
} from "@/components/ui/number-field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import JavaScriptCodeMirrorEditor from "@/features/Plugin/editors/javascript/JavaScriptCodeMirrorEditor.vue";
import {
	resourceConditionDefinitions,
	type ResourceConditionFunction,
	type ResourceConditionRow,
} from "./resource-condition";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const logic = ref<"and" | "or">("and");
const depth = ref(4);
const rows = ref<ResourceConditionRow[]>([]);

watch(
	() => props.modelValue,
	(value) => load(value),
	{ immediate: true },
);

function definition(functionName: ResourceConditionFunction) {
	return resourceConditionDefinitions.find((item) => item.id === functionName)!;
}

function load(source: string) {
	const text = source.trim();
	if (!text) {
		logic.value = "and";
		depth.value = 4;
		rows.value = [];
		return;
	}
	const separator = text.includes("\n||\n") ? "\n||\n" : "\n&&\n";
	logic.value = separator === "\n||\n" ? "or" : "and";
	const parsed: ResourceConditionRow[] = [];
	let parsedDepth = 4;
	for (const expression of text.split(separator)) {
		const call = /^(include|exclude)\((.*),\s*(\d+)\)$/.exec(expression.trim());
		if (call) {
			let value = call[2] ?? "";
			try {
				value = String(JSON.parse(value));
			} catch {}
			parsedDepth = Number(call[3]) || parsedDepth;
			parsed.push({
				id: crypto.randomUUID(),
				functionName: call[1] as "include" | "exclude",
				value,
			});
			continue;
		}
		const probability = /^probability\(([^)]*)\)$/.exec(expression.trim());
		if (probability) {
			parsed.push({ id: crypto.randomUUID(), functionName: "probability", value: probability[1] ?? "" });
			continue;
		}
		parsed.push({
			id: crypto.randomUUID(),
			functionName: "custom",
			value: expression.trim().replace(/^\((.*)\)$/s, "$1"),
		});
	}
	depth.value = parsedDepth;
	rows.value = parsed;
}

function persist() {
	const expressions = rows.value.flatMap((row) => {
		const value = row.value.trim();
		if (!value) return [];
		if (row.functionName === "custom") return [`(${value})`];
		if (row.functionName === "probability") return [`probability(${Number(value) || 0})`];
		return [`${row.functionName}(${JSON.stringify(value)}, ${depth.value})`];
	});
	emit("update:modelValue", expressions.join(logic.value === "and" ? "\n&&\n" : "\n||\n"));
}

function addRow() {
	rows.value.push({ id: crypto.randomUUID(), functionName: "include", value: "" });
}

function changeFunction(row: ResourceConditionRow, value: unknown) {
	row.functionName = String(value) as ResourceConditionFunction;
	row.value = "";
	persist();
}

function updateDepth(value: number | undefined) {
	depth.value = Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 4;
	persist();
}
</script>

<template>
  <div class="grid gap-3">
    <div class="grid grid-cols-2 gap-2">
      <label class="grid gap-1 text-xs font-medium">条件逻辑
        <Select :model-value="logic" @update:model-value="logic = $event === 'or' ? 'or' : 'and'; persist()"><SelectTrigger class="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="and">全部满足</SelectItem><SelectItem value="or">任一满足</SelectItem></SelectContent></Select>
      </label>
      <label class="grid gap-1 text-xs font-medium">匹配深度
        <NumberField :model-value="depth" :min="1" :step="1" @update:model-value="updateDepth"><NumberFieldContent><NumberFieldDecrement /><NumberFieldInput class="h-8 text-xs" /><NumberFieldIncrement /></NumberFieldContent></NumberField>
      </label>
    </div>
    <div class="grid gap-2">
      <div v-for="row in rows" :key="row.id" class="grid grid-cols-[6rem_minmax(0,1fr)_2rem] items-start gap-1.5">
        <Select :model-value="row.functionName" @update:model-value="changeFunction(row, $event)"><SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="item in resourceConditionDefinitions" :key="item.id" :value="item.id">{{ item.label }}</SelectItem></SelectContent></Select>
        <div v-if="row.functionName === 'custom'" class="h-20 overflow-hidden rounded-md border"><JavaScriptCodeMirrorEditor :model-value="row.value" language="javascript" frameless @update:model-value="row.value = $event; persist()" /></div>
        <Input v-else :model-value="row.value" class="h-8 min-w-0 font-mono text-xs" :placeholder="definition(row.functionName).placeholder" @update:model-value="row.value = String($event ?? ''); persist()" />
        <Button size="icon" variant="ghost" class="size-8 text-muted-foreground hover:text-destructive" title="删除条件" @click="rows = rows.filter((item) => item.id !== row.id); persist()"><Trash2 class="size-3.5" /></Button>
      </div>
      <p v-if="!rows.length" class="text-xs text-muted-foreground">没有条件时始终导入资源。</p>
      <Button variant="ghost" class="h-8 justify-start border border-dashed px-2 text-xs text-muted-foreground" @click="addRow"><Plus class="size-3.5" />新增条件</Button>
    </div>
  </div>
</template>
