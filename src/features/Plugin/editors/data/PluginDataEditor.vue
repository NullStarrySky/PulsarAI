<script setup lang="ts">
import { computed } from "vue";
import { Braces, Code2 } from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parsePluginDataDefinition, type PluginDataDefinition, type PluginDataValue } from "./plugin-data";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const definition = computed(() => parsePluginDataDefinition(props.modelValue));

function write(patch: Partial<PluginDataDefinition>) {
  emit("update:modelValue", JSON.stringify({ ...definition.value, ...patch }, null, 2));
}

function updateInitialValue(value: string) {
  try {
    write({ initialValue: JSON.parse(value) as PluginDataValue });
  } catch {
    // Keep the last valid definition while the user finishes an incomplete JSON edit.
  }
}
</script>

<template>
  <div class="h-full min-h-0 bg-background/5">
    <div class="flex items-start justify-between gap-4 border-b bg-muted/10 px-5 py-4">
      <div>
        <div class="text-sm font-semibold">数据定义</div>
        <p class="mt-0.5 text-xs leading-5 text-muted-foreground">声明数据的隔离范围、初始值和可选 facade；值在运行时按定义导入。</p>
      </div>
      <Braces class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>

    <div class="grid gap-5 overflow-y-auto p-5 md:grid-cols-2">
      <label class="grid gap-2 text-sm font-medium">
        说明
        <Input :model-value="definition.description" placeholder="此数据提供什么？" @update:model-value="write({ description: String($event ?? '') })" />
      </label>
      <label class="grid gap-2 text-sm font-medium">
        隔离范围
        <Select :model-value="definition.isolation" @update:model-value="write({ isolation: $event as PluginDataDefinition['isolation'] })">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="resource">资源共享</SelectItem><SelectItem value="conversation">按会话隔离</SelectItem></SelectContent>
        </Select>
      </label>
      <label class="grid gap-2 text-sm font-medium">
        变量名（可选）
        <Input :model-value="definition.varName ?? ''" placeholder="例如 state" @update:model-value="write({ varName: String($event ?? '').trim() || undefined })" />
      </label>
      <div class="flex items-center justify-between rounded-xl border bg-card px-3.5 py-3">
        <div><div class="text-sm font-medium">启用 updater</div><p class="mt-0.5 text-xs text-muted-foreground">允许运行时包装器替换当前值。</p></div>
        <Switch :model-value="definition.enableUpdater" @update:model-value="write({ enableUpdater: Boolean($event) })" />
      </div>
      <label class="grid gap-2 md:col-span-2">
        <span class="flex items-center gap-2 text-sm font-medium"><Braces class="size-3.5" />初始 JSON 值</span>
        <Textarea class="min-h-36 font-mono text-xs leading-5" :model-value="JSON.stringify(definition.initialValue, null, 2)" @update:model-value="updateInitialValue(String($event ?? ''))" />
      </label>
      <label class="grid gap-2 md:col-span-2">
        <span class="flex items-center gap-2 text-sm font-medium"><Code2 class="size-3.5" />Facade wrapper（可选）</span>
        <Textarea class="min-h-44 font-mono text-xs leading-5" :model-value="definition.wrapperSource" placeholder="return value" @update:model-value="write({ wrapperSource: String($event ?? '') })" />
      </label>
    </div>
  </div>
</template>
