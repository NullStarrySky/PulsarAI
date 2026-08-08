<script setup lang="ts">
import { computed, onMounted } from "vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import type { PluginManifestValue } from "../../domain/plugin-manifest";

const props = defineProps<{ modelValue: unknown; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: PluginManifestValue] }>();
const defaults = useDefaultConfigStore();
const options = [
  { value: "inherit", label: "继承全局" },
  { value: "none", label: "关闭" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "超高" },
];
const selected = computed(() =>
  typeof props.modelValue === "string" ? props.modelValue : "inherit"
);

onMounted(() => void defaults.load());

function update(value: unknown) {
  emit("update:modelValue", value === "inherit" ? null : String(value));
}
</script>

<template>
  <div class="flex items-center gap-2">
    <Select :model-value="selected" :disabled="disabled" @update:model-value="update">
      <SelectTrigger class="w-48"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}<template v-if="option.value === 'inherit'">（{{ defaults.reasoningEffort }}）</template>
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
