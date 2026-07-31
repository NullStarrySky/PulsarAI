<script setup lang="ts">
import { ref, watch } from "vue";
import { ArrowDown, ArrowUp, Plus, Regex, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  createEmptyPluginRegexRule,
  parsePluginRegexRules,
  serializePluginRegexRules,
  type PluginRegexDepth,
  type PluginRegexRange,
  type PluginRegexRule,
} from "@/features/Resources/Plugin/domain/plugin-regex";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const rules = ref<PluginRegexRule[]>([]);
const error = ref("");
let applyingExternalValue = false;

watch(
  () => props.modelValue,
  (value) => {
    const serialized = serializePluginRegexRules(rules.value);
    if (value.trim() === serialized.trim()) return;
    try {
      const parsed = JSON.parse(value || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error("根内容必须是数组");
      }
      applyingExternalValue = true;
      rules.value = parsePluginRegexRules(parsed);
      error.value = "";
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "JSON 语法无效";
    } finally {
      applyingExternalValue = false;
    }
  },
  { immediate: true },
);

function persist() {
  if (applyingExternalValue) return;
  error.value = "";
  emit("update:modelValue", serializePluginRegexRules(rules.value));
}

function addRule() {
  rules.value.push(createEmptyPluginRegexRule());
  persist();
}

function removeRule(index: number) {
  rules.value.splice(index, 1);
  persist();
}

function moveRule(index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= rules.value.length) return;
  const [rule] = rules.value.splice(index, 1);
  if (!rule) return;
  rules.value.splice(target, 0, rule);
  persist();
}

function updateRange(rule: PluginRegexRule, value: unknown) {
  if (value === "user_input" || value === "ai_output" || value === "all") {
    rule.range = value as PluginRegexRange;
    persist();
  }
}

function displayDepth(value: PluginRegexDepth) {
  return value === "INF" ? "INF" : String(value);
}

function updateDepth(
  rule: PluginRegexRule,
  field: "depth_min" | "depth_max",
  value: string | number,
) {
  const normalized = String(value).trim().toUpperCase();
  rule[field] = normalized === "INF" || !normalized
    ? "INF"
    : Math.max(1, Math.round(Number(normalized) || 1));
  persist();
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <header class="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2 mobile:items-start mobile:px-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 text-sm font-medium">
          <Regex class="size-4 text-muted-foreground" />
          正则后处理
        </div>
        <p class="mt-0.5 truncate text-xs text-muted-foreground mobile:whitespace-normal">
          从末尾按 1 开始计算深度；INF 表示这一侧不设边界。文件优先级高的插件规则先执行。
        </p>
      </div>
      <Button size="sm" class="h-8 shrink-0" @click="addRule">
        <Plus class="mr-1 size-3.5" />
        添加
      </Button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto bg-muted/15 p-3 mobile:p-2">
      <div
        v-if="error"
        class="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        {{ error }}
      </div>

      <div
        v-if="rules.length === 0"
        class="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed bg-background/60 text-center"
      >
        <Regex class="mb-2 size-6 text-muted-foreground" />
        <p class="text-sm font-medium">还没有正则规则</p>
        <p class="mt-1 text-xs text-muted-foreground">添加后会写入根级 regex.json。</p>
      </div>

      <div v-else class="mx-auto grid max-w-5xl gap-2.5">
        <article
          v-for="(rule, index) in rules"
          :key="index"
          class="rounded-lg border bg-card p-3 shadow-sm"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-muted-foreground">规则 {{ index + 1 }}</span>
            <div class="flex items-center">
              <Button
                size="icon"
                variant="ghost"
                class="size-7"
                title="上移"
                :disabled="index === 0"
                @click="moveRule(index, -1)"
              >
                <ArrowUp class="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-7"
                title="下移"
                :disabled="index === rules.length - 1"
                @click="moveRule(index, 1)"
              >
                <ArrowDown class="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-7 text-destructive hover:text-destructive"
                title="删除"
                @click="removeRule(index)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5 mobile:grid-cols-1">
            <label class="grid gap-1">
              <span class="text-xs text-muted-foreground">查找正则</span>
              <Input
                :model-value="rule.find_regex"
                class="font-mono text-xs"
                placeholder="/pattern/gi 或 pattern"
                @update:model-value="rule.find_regex = String($event); persist()"
              />
            </label>
            <label class="grid gap-1">
              <span class="text-xs text-muted-foreground">替换内容</span>
              <Input
                :model-value="rule.replace_regex"
                class="font-mono text-xs"
                placeholder="默认为空，可使用 $1"
                @update:model-value="rule.replace_regex = String($event); persist()"
              />
            </label>
          </div>

          <div class="mt-2.5 grid grid-cols-[minmax(8rem,1fr)_minmax(6rem,.7fr)_minmax(6rem,.7fr)_auto] items-end gap-2.5 mobile:grid-cols-2">
            <label class="grid gap-1">
              <span class="text-xs text-muted-foreground">消息范围</span>
              <NativeSelect
                :model-value="rule.range"
                class="w-full"
                @update:model-value="updateRange(rule, $event)"
              >
                <NativeSelectOption value="all">全部</NativeSelectOption>
                <NativeSelectOption value="user_input">用户输入</NativeSelectOption>
                <NativeSelectOption value="ai_output">AI 输出</NativeSelectOption>
              </NativeSelect>
            </label>
            <label class="grid gap-1">
              <span class="text-xs text-muted-foreground">最小深度</span>
              <Input
                :model-value="displayDepth(rule.depth_min)"
                class="font-mono text-xs"
                inputmode="numeric"
                @change="updateDepth(rule, 'depth_min', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="grid gap-1">
              <span class="text-xs text-muted-foreground">最大深度</span>
              <Input
                :model-value="displayDepth(rule.depth_max)"
                class="font-mono text-xs"
                inputmode="numeric"
                @change="updateDepth(rule, 'depth_max', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="flex h-8 min-w-36 items-center justify-between gap-3 rounded-md border px-2.5 mobile:col-span-2">
              <span class="text-xs">应用到界面渲染</span>
              <Switch
                :model-value="rule.applyOnRending"
                size="sm"
                @update:model-value="rule.applyOnRending = Boolean($event); persist()"
              />
            </label>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
