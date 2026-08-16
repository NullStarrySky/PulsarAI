<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PluginManifestValue } from "@/features/Plugin/editors/manifest/plugin-manifest";

interface SelectOption {
  label: string;
  value: PluginManifestValue;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  modelValue: unknown;
  options?: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}>(), { options: () => [] });
const emit = defineEmits<{ "update:modelValue": [value: PluginManifestValue] }>();

function encoded(value: unknown) {
  return JSON.stringify(value);
}

function update(value: unknown) {
  const option = props.options.find((item) => encoded(item.value) === value);
  if (option) emit("update:modelValue", structuredClone(option.value));
}
</script>

<template>
  <Select :model-value="encoded(modelValue)" :disabled="disabled" @update:model-value="update">
    <SelectTrigger class="w-full sm:w-72">
      <SelectValue :placeholder="placeholder ?? '请选择'" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem
          v-for="option in options"
          :key="encoded(option.value)"
          :value="encoded(option.value)"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>
