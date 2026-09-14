<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
	TabItem,
	Tabs,
	TabsList,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import JavaScriptCodeMirrorEditor from "@/features/Plugin/resources/types/javascript/JavaScriptCodeMirrorEditor.vue";
import { Minus, Plus, Trash2 } from "@/lib/phosphor-icons";
import {
	type ResourceConditionFunction,
	type ResourceConditionRow,
	resourceConditionDefinitions,
} from "./resource-condition";

const props = defineProps<{ modelValue: string; enabled: boolean }>();
const emit = defineEmits<{
	"update:modelValue": [value: string];
	"update:enabled": [value: boolean];
}>();
const logic = ref<"and" | "or">("and");
const depth = ref(4);
const rows = ref<ResourceConditionRow[]>([]);
const expressionPreview = computed(() => {
	const expressions = rows.value.flatMap((row) => {
		const value = row.value.trim();
		if (!value) return [];
		if (row.functionName === "custom") return [value];
		if (row.functionName === "probability")
			return [`概率 ${Number(value) || 0}%`];
		return [`${definition(row.functionName).label}「${value}」`];
	});
	return expressions.length
		? expressions.join(logic.value === "and" ? " · 且 · " : " · 或 · ")
		: "未设置条件，资源会始终导入";
});

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
			parsed.push({
				id: crypto.randomUUID(),
				functionName: "probability",
				value: probability[1] ?? "",
			});
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
		if (row.functionName === "probability")
			return [`probability(${Number(value) || 0})`];
		return [`${row.functionName}(${JSON.stringify(value)}, ${depth.value})`];
	});
	emit(
		"update:modelValue",
		expressions.join(logic.value === "and" ? "\n&&\n" : "\n||\n"),
	);
}

function addRow() {
	rows.value.push({
		id: crypto.randomUUID(),
		functionName: "include",
		value: "",
	});
}

function changeFunction(row: ResourceConditionRow, value: unknown) {
	row.functionName = String(value) as ResourceConditionFunction;
	row.value = "";
	persist();
}

function updateDepth(value: number | undefined) {
	depth.value =
		Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 4;
	persist();
}
function adjustDepth(delta: number) {
	updateDepth(depth.value + delta);
}
</script>

<template>
  <div class="overflow-hidden bg-popover">
    <div class="flex flex-wrap items-center gap-2 border-b bg-muted/25 px-3 py-2.5">
      <span class="text-xs font-medium text-muted-foreground">当消息满足</span>
      <Tabs
        :model-value="logic"
        size="compact"
        @update:model-value="logic = ($event as 'and' | 'or'); persist()"
      >
        <TabsList>
          <TabItem value="or" class="h-6 px-2.5 text-[11px]">任意</TabItem>
          <TabItem value="and" class="h-6 px-2.5 text-[11px]">全部</TabItem>
        </TabsList>
      </Tabs>
      <span class="text-xs font-medium text-muted-foreground">条件时</span>
      <label class="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">启用<Switch size="sm" :model-value="props.enabled" @update:model-value="emit('update:enabled', Boolean($event))" /></label>
    </div>
    <div class="relative grid gap-2 px-3 py-3">
      <div v-for="(row, index) in rows" :key="row.id" class="relative grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-start gap-2 pl-4 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-px before:bg-border first:before:top-1/2 last:before:bottom-1/2">
        <span class="absolute left-[-4px] top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-popover bg-muted-foreground" />
        <span v-if="index > 0" class="absolute -left-0.5 top-[-0.6rem] rounded bg-popover px-1 text-[9px] tracking-[0.08em] text-muted-foreground">{{ logic.toUpperCase() }}</span>
        <Select :model-value="row.functionName" @update:model-value="changeFunction(row, $event)"><SelectTrigger class="h-8 w-full text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="item in resourceConditionDefinitions" :key="item.id" :value="item.id">{{ item.label }}</SelectItem></SelectContent></Select>
        <div v-if="row.functionName === 'custom'" class="h-20 overflow-hidden rounded-lg border bg-background"><JavaScriptCodeMirrorEditor :model-value="row.value" language="javascript" frameless @update:model-value="row.value = $event; persist()" /></div>
        <Input v-else :model-value="row.value" class="h-8 min-w-0 bg-background text-xs shadow-none" :placeholder="definition(row.functionName).placeholder" @update:model-value="row.value = String($event ?? ''); persist()" />
        <Button size="icon" variant="ghost" class="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="删除条件" @click="rows = rows.filter((item) => item.id !== row.id); persist()"><Trash2 class="size-3.5" /></Button>
      </div>
      <p v-if="!rows.length" class="py-3 text-center text-xs text-muted-foreground">没有条件时始终导入资源。</p>
      <Button variant="ghost" class="h-9 justify-center border border-dashed px-2 text-xs text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/40 hover:text-foreground" @click="addRow"><Plus class="size-3.5" />添加条件</Button>
    </div>
    <div class="flex items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2.5"><div class="min-w-0"><p class="text-[10px] tracking-[0.1em] text-muted-foreground">表达式</p><p class="mt-1 break-all text-xs leading-5 text-primary">{{ expressionPreview }}</p></div><div class="flex shrink-0 items-center gap-1.5"><Button variant="outline" size="icon-sm" class="size-6 rounded-md bg-background" title="减小匹配深度" :disabled="depth <= 1" @click="adjustDepth(-1)"><Minus class="size-3" /></Button><span class="min-w-5 text-center text-xs tabular-nums">{{ depth }}</span><Button variant="outline" size="icon-sm" class="size-6 rounded-md bg-background" title="增加匹配深度" @click="adjustDepth(1)"><Plus class="size-3" /></Button></div></div>
  </div>
</template>
