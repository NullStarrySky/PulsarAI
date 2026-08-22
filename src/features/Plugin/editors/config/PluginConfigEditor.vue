<script setup lang="ts">
import { computed } from "vue";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ModelSelect from "@/features/ModelConnection/components/ModelSelect.vue";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingItem from "@/features/Setting/components/SettingItem.vue";
import type { PluginConfig, PluginConfigEntry, PluginConfigValue } from "./plugin-config";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const parsed = computed(() => {
  try {
    const value = JSON.parse(props.modelValue) as PluginConfig;
    return value && typeof value === "object" && !Array.isArray(value)
      ? { value, error: "" }
      : { value: {} as PluginConfig, error: "config.json 根节点必须是对象。" };
  } catch (error) {
    return { value: {} as PluginConfig, error: error instanceof Error ? error.message : "JSON 语法错误。" };
  }
});
const entries = computed(() => Object.entries(parsed.value.value));
function update(key: string, value: PluginConfigValue) {
  const next = structuredClone(parsed.value.value);
  if (!next[key]) return;
  next[key].value = value;
  emit("update:modelValue", JSON.stringify(next, null, 2));
}
function title(key: string, entry: PluginConfigEntry) { return entry.renderer.title || key; }
function numberValue(value: PluginConfigValue, fallback = 0) { return typeof value === "number" ? value : fallback; }
function selectOptions(entry: PluginConfigEntry) {
  return entry.renderer.name === "Select" ? entry.renderer.options : [];
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-background">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-12 pt-4 mobile:px-3">
      <div v-if="parsed.error" class="rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive">{{ parsed.error }}；请切换到源码修复。</div>
      <SettingGroup v-else>
        <SettingItem v-for="([key, entry]) in entries" :key="key" :title="title(key, entry)" :description="entry.renderer.description">
          <Switch v-if="entry.renderer.name === 'Switch' || entry.renderer.name === 'Checkbox'" :model-value="Boolean(entry.value)" @update:model-value="update(key, Boolean($event))" />
          <ModelSelect v-else-if="entry.renderer.name === 'ModelSelect'" class="w-96 max-w-full" :model-value="typeof entry.value === 'string' ? entry.value : ''" :api-type="entry.renderer.apiType ?? 'chat'" allow-empty empty-label="继承全局默认" @update:model-value="update(key, $event || null)" />
          <div v-else-if="entry.renderer.name === 'Slider'" class="flex w-full max-w-sm items-center gap-3"><Slider class="flex-1" :model-value="[numberValue(entry.value, entry.renderer.min ?? 0)]" :min="entry.renderer.min ?? 0" :max="entry.renderer.max ?? 100" :step="entry.renderer.step ?? 1" @update:model-value="update(key, Number($event?.[0] ?? 0))" /><span class="w-14 text-right text-xs text-muted-foreground">{{ numberValue(entry.value) }}{{ entry.renderer.suffix }}</span></div>
          <Select v-else-if="entry.renderer.name === 'Select'" :model-value="JSON.stringify(entry.value)" @update:model-value="value => { const option = selectOptions(entry).find((item) => JSON.stringify(item.value) === value); if (option) update(key, option.value); }"><SelectTrigger class="w-full sm:w-72"><SelectValue :placeholder="entry.renderer.placeholder ?? '请选择'" /></SelectTrigger><SelectContent><SelectItem v-for="option in selectOptions(entry)" :key="JSON.stringify(option.value)" :value="JSON.stringify(option.value)">{{ option.label }}</SelectItem></SelectContent></Select>
          <Textarea v-else-if="entry.renderer.name === 'Textarea'" class="w-full sm:w-96" :model-value="typeof entry.value === 'string' ? entry.value : ''" :placeholder="entry.renderer.placeholder" @update:model-value="update(key, String($event))" />
          <Input v-else :type="entry.renderer.name === 'Input' ? entry.renderer.type ?? 'text' : 'text'" class="w-full sm:w-72" :min="entry.renderer.name === 'Input' ? entry.renderer.min : undefined" :max="entry.renderer.name === 'Input' ? entry.renderer.max : undefined" :step="entry.renderer.name === 'Input' ? entry.renderer.step : undefined" :placeholder="entry.renderer.name === 'Input' ? entry.renderer.placeholder : undefined" :model-value="typeof entry.value === 'string' || typeof entry.value === 'number' ? entry.value : ''" @update:model-value="update(key, entry.renderer.name === 'Input' && entry.renderer.type === 'number' ? Number($event) : String($event))" />
        </SettingItem>
      </SettingGroup>
      <p v-if="!parsed.error && !entries.length" class="py-12 text-center text-sm text-muted-foreground">config.json 还没有配置项。</p>
    </div>
  </div>
</template>
