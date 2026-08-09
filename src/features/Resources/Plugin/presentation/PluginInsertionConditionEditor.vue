<script setup lang="ts">
import { ref, watch } from "vue";
import { Plus, Trash2 } from "lucide-vue-next";
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
import {
  pluginConditionDefinitions,
  type PluginConditionFunction,
} from "@/features/Resources/Plugin/application/plugin-condition-environment";

interface ConditionRow {
  id: string;
  functionName: PluginConditionFunction;
  value: string;
}

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const logic = ref<"and" | "or">("and");
const depth = ref(4);
const rows = ref<ConditionRow[]>([]);

watch(
  () => props.modelValue,
  (value) => load(value),
  { immediate: true },
);

function load(source: string) {
  const parsed = parseCondition(source);
  logic.value = parsed.logic;
  depth.value = parsed.depth;
  rows.value = parsed.rows;
}

function definition(functionName: PluginConditionFunction) {
  return pluginConditionDefinitions.find((item) => item.id === functionName)!;
}

function addRow() {
  rows.value.push({ id: crypto.randomUUID(), functionName: "include", value: "" });
  persist();
}

function removeRow(id: string) {
  rows.value = rows.value.filter((row) => row.id !== id);
  persist();
}

function changeFunction(row: ConditionRow, value: unknown) {
  row.functionName = String(value) as PluginConditionFunction;
  row.value = "";
  persist();
}

function updateDepth(value: number | undefined) {
  const next = Number(value);
  depth.value = Number.isFinite(next) && next > 0 ? Math.floor(next) : 4;
  persist();
}

function updateLogic(value: unknown) {
  logic.value = value === "or" ? "or" : "and";
  persist();
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

function parseCondition(source: string) {
  const text = source.trim();
  if (!text) return { logic: "and" as const, depth: 4, rows: [] as ConditionRow[] };
  const separator = text.includes("\n||\n") ? "\n||\n" : "\n&&\n";
  const parsedRows: ConditionRow[] = [];
  let parsedDepth = 4;
  for (const expression of text.split(separator)) {
    const call = /^(include|exclude)\((.*),\s*(\d+)\)$/.exec(expression.trim());
    if (call) {
      let value = call[2] ?? "";
      try { value = String(JSON.parse(value)); } catch { /* 保留原值 */ }
      parsedDepth = Number(call[3]) || parsedDepth;
      parsedRows.push({
        id: crypto.randomUUID(),
        functionName: call[1] as "include" | "exclude",
        value,
      });
      continue;
    }
    const probability = /^probability\(([^)]*)\)$/.exec(expression.trim());
    if (probability) {
      parsedRows.push({ id: crypto.randomUUID(), functionName: "probability", value: probability[1] ?? "" });
      continue;
    }
    parsedRows.push({
      id: crypto.randomUUID(),
      functionName: "custom",
      value: expression.trim().replace(/^\((.*)\)$/s, "$1"),
    });
  }
  return {
    logic: separator === "\n||\n" ? "or" as const : "and" as const,
    depth: parsedDepth,
    rows: parsedRows,
  };
}
</script>

<template>
  <div class="grid gap-4">
    <div class="grid grid-cols-2 gap-3 mobile:grid-cols-1">
      <label class="grid gap-1.5">
        <span class="text-xs font-medium">条件逻辑</span>
        <Select :model-value="logic" @update:model-value="updateLogic">
          <SelectTrigger class="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="and">全部满足（AND）</SelectItem>
            <SelectItem value="or">任一满足（OR）</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label class="grid gap-1.5">
        <span class="text-xs font-medium">匹配深度</span>
        <NumberField
          :model-value="depth"
          :min="1"
          :step="1"
          @update:model-value="updateDepth"
        >
          <NumberFieldContent>
            <NumberFieldDecrement />
            <NumberFieldInput class="h-8 text-xs" />
            <NumberFieldIncrement />
          </NumberFieldContent>
        </NumberField>
      </label>
    </div>

    <div class="grid gap-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium">条件列表</span>
        <span class="text-[11px] text-muted-foreground">{{ rows.length }} 条</span>
      </div>
      <div v-for="row in rows" :key="row.id" class="grid grid-cols-[6rem_minmax(0,1fr)_2rem] gap-1.5">
        <Select :model-value="row.functionName" @update:model-value="changeFunction(row, $event)">
          <SelectTrigger class="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in pluginConditionDefinitions" :key="item.id" :value="item.id">
              {{ item.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-model="row.value"
          class="h-8 min-w-0 font-mono text-xs rounded-lg"
          :placeholder="definition(row.functionName).placeholder"
          @change="persist"
        />
        <Button size="icon" variant="ghost" class="size-8 text-muted-foreground hover:text-destructive shrink-0" title="删除条件" @click="removeRow(row.id)">
          <Trash2 class="size-3.5" />
        </Button>
      </div>
      <p v-if="!rows.length" class="py-2 text-xs text-muted-foreground">没有条件时始终加入容器。</p>
      <Button variant="ghost" class="h-8 justify-start border border-dashed px-2 text-xs text-muted-foreground" @click="addRow">
        <Plus class="size-3.5" />
        新增条件
      </Button>
    </div>
  </div>
</template>
