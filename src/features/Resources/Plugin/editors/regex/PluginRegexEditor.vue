<script setup lang="ts">
import { ref, watch } from "vue";
import { ArrowDown, ArrowUp, Plus, Regex, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  createEmptyPluginRegexRule,
  parsePluginRegexRules,
  serializePluginRegexRules,
  type PluginRegexRange,
  type PluginRegexRule,
} from "@/features/Resources/Plugin/editors/regex/plugin-regex";

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


function getSliderValue(rule: PluginRegexRule): [number, number] {
  const min = rule.depth_min === "INF" ? 0 : Number(rule.depth_min) || 0;
  const max = rule.depth_max === "INF" ? 20 : Number(rule.depth_max) || 20;
  return [min, max];
}

function handleSliderChange(rule: PluginRegexRule, val: number[]) {
  const [min, max] = val;
  rule.depth_min = min === 0 ? "INF" : min;
  rule.depth_max = max >= 20 ? "INF" : max;
  persist();
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-background/5">
    <header class="flex min-h-12 items-center justify-between gap-3 border-b px-5 py-4 bg-muted/10 mobile:items-start mobile:px-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground/90">
          <Regex class="size-4 text-muted-foreground shrink-0" />
          正则后处理
        </div>
        <p class="mt-0.5 truncate text-xs text-muted-foreground mobile:whitespace-normal">
          从末尾按 1 开始计算深度；INF 表示这一侧不设边界。文件优先级高的插件规则先执行。
        </p>
      </div>
      <Button size="sm" class="h-8 shrink-0 rounded-lg shadow-sm hover:bg-muted" @click="addRule">
        <Plus class="mr-1 size-3.5" />
        添加规则
      </Button>
    </header>

    <div v-if="error" class="m-5 rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive">
      {{ error }}
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="p-5 space-y-4">
        <div
          v-if="rules.length === 0"
          class="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 text-center p-6"
        >
          <Regex class="mb-2.5 size-7 text-muted-foreground/80" />
          <p class="text-sm font-semibold text-foreground/80">还没有正则规则</p>
          <p class="mt-1 text-xs text-muted-foreground">添加后会写入根级 regex.json。</p>
        </div>

        <div v-else class="mx-auto grid max-w-5xl gap-4">
          <article
            v-for="(rule, index) in rules"
            :key="index"
            class="rounded-xl border border-border/60 bg-card p-4 shadow-sm hover:border-border/85 transition-all duration-200"
          >
            <div class="mb-3 flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-0.5 bg-muted/40 rounded">规则 {{ index + 1 }}</span>
              <div class="flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  class="size-7 rounded-lg"
                  title="上移"
                  :disabled="index === 0"
                  @click="moveRule(index, -1)"
                >
                  <ArrowUp class="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  class="size-7 rounded-lg"
                  title="下移"
                  :disabled="index === rules.length - 1"
                  @click="moveRule(index, 1)"
                >
                  <ArrowDown class="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  class="size-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="删除"
                  @click="removeRule(index)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 mobile:grid-cols-1">
              <label class="grid gap-1.5">
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">查找正则</span>
                <Input
                  :model-value="rule.find_regex"
                  class="font-mono text-xs rounded-lg"
                  placeholder="/pattern/gi 或 pattern"
                  @update:model-value="rule.find_regex = String($event); persist()"
                />
              </label>
              <label class="grid gap-1.5">
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">替换内容</span>
                <Input
                  :model-value="rule.replace_regex"
                  class="font-mono text-xs rounded-lg"
                  placeholder="默认为空，可使用 $1"
                  @update:model-value="rule.replace_regex = String($event); persist()"
                />
              </label>
            </div>

            <div class="mt-3 grid grid-cols-[1.2fr_2fr_auto] items-center gap-4 mobile:grid-cols-1">
              <label class="grid gap-1.5 shrink-0 w-36">
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">消息范围</span>
                <NativeSelect
                  :model-value="rule.range"
                  class="w-full h-8 text-xs rounded-lg border-input bg-background"
                  @update:model-value="updateRange(rule, $event)"
                >
                  <NativeSelectOption value="all">全部</NativeSelectOption>
                  <NativeSelectOption value="user_input">用户输入</NativeSelectOption>
                  <NativeSelectOption value="ai_output">AI 输出</NativeSelectOption>
                </NativeSelect>
              </label>

              <div class="flex flex-col gap-1.5 flex-1 min-w-0">
                <div class="flex justify-between items-center px-1">
                  <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">生效深度区间</span>
                  <span class="text-[11px] font-mono font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded">
                    {{ rule.depth_min === "INF" ? "0" : rule.depth_min }} - {{ rule.depth_max === "INF" ? "∞ (无限)" : rule.depth_max }}
                  </span>
                </div>
                <div class="flex items-center px-1 py-1.5">
                  <Slider
                    :model-value="getSliderValue(rule)"
                    :min="0"
                    :max="20"
                    :step="1"
                    class="cursor-pointer"
                    @update:model-value="handleSliderChange(rule, $event ?? [])"
                  />
                </div>
              </div>

              <label class="flex h-8 min-w-[9.5rem] items-center justify-between gap-3 rounded-lg border px-3 bg-muted/5 hover:bg-muted/10 transition-colors select-none shrink-0 self-end mb-[2px]">
                <span class="text-[11px] font-medium text-foreground/80">应用到界面渲染</span>
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
    </ScrollArea>
  </section>
</template>
