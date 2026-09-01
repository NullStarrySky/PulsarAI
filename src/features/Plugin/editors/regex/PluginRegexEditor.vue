<script setup lang="ts">
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-vue-next";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	createPluginRegexRule,
	type PluginRegexRule,
	parsePluginRegexRules,
} from "./plugin-regex";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const rules = computed(() => parsePluginRegexRules(props.modelValue));

function write(next: PluginRegexRule[]) {
	emit("update:modelValue", JSON.stringify(next, null, 2));
}

function update(index: number, patch: Partial<PluginRegexRule>) {
	const next = structuredClone(rules.value);
	next[index] = { ...next[index]!, ...patch };
	write(next);
}

function remove(index: number) {
	write(rules.value.filter((_, itemIndex) => itemIndex !== index));
}

function move(index: number, delta: number) {
	const target = index + delta;
	if (target < 0 || target >= rules.value.length) return;
	const next = structuredClone(rules.value);
	[next[index], next[target]] = [next[target]!, next[index]!];
	write(next);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <div class="flex items-center justify-between border-b bg-muted/10 px-5 py-4"><div><div class="text-sm font-semibold">正则规则</div><p class="mt-0.5 text-xs text-muted-foreground">按顺序应用；渲染替换只影响显示，不写回消息。</p></div><Button size="sm" variant="outline" class="h-8 rounded-lg" @click="write([...rules, createPluginRegexRule()])"><Plus class="mr-1 size-3.5" />添加规则</Button></div>
    <div class="min-h-0 flex-1 overflow-y-auto p-5"><div class="space-y-3"><div v-for="(rule, index) in rules" :key="index" class="rounded-xl border bg-card p-3.5 shadow-sm"><div class="mb-3 flex items-center gap-2"><span class="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">#{{ index + 1 }}</span><Select :model-value="rule.range" @update:model-value="update(index, { range: $event as PluginRegexRule['range'] })"><SelectTrigger class="h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部消息</SelectItem><SelectItem value="user_input">用户输入</SelectItem><SelectItem value="ai_output">助手输出</SelectItem></SelectContent></Select><div class="ml-auto flex items-center gap-0.5"><Button size="icon" variant="ghost" class="size-7" :disabled="index === 0" @click="move(index, -1)"><ArrowUp class="size-3.5" /></Button><Button size="icon" variant="ghost" class="size-7" :disabled="index === rules.length - 1" @click="move(index, 1)"><ArrowDown class="size-3.5" /></Button><Button size="icon" variant="ghost" class="size-7 text-destructive hover:bg-destructive/10" @click="remove(index)"><Trash2 class="size-3.5" /></Button></div></div><div class="grid gap-2 md:grid-cols-2"><Input :model-value="rule.find_regex" class="font-mono text-xs" placeholder="查找正则" @update:model-value="update(index, { find_regex: String($event ?? '') })" /><Input :model-value="rule.replace_regex" class="font-mono text-xs" placeholder="替换文本" @update:model-value="update(index, { replace_regex: String($event ?? '') })" /></div><div class="mt-3 flex items-center justify-between rounded-lg bg-muted/45 px-3 py-2"><span class="text-xs text-muted-foreground">仅在渲染时替换</span><Switch :model-value="rule.applyOnRendering" class="scale-75" @update:model-value="update(index, { applyOnRendering: Boolean($event) })" /></div></div><button v-if="!rules.length" type="button" class="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground" @click="write([createPluginRegexRule()])"><Plus class="mb-2 size-5" />添加第一条正则规则</button></div></div>
  </div>
</template>
