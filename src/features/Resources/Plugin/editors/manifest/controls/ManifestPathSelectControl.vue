<script setup lang="ts">
import { computed } from "vue";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listPluginPathSelectionOptions } from "@/features/Resources/Plugin/tree/plugin-path-selection";
import type { Plugin } from "@/features/Resources/Plugin/tree/plugin-types";

const emptyValue = "__pulsar_empty_path__";
const props = withDefaults(defineProps<{
  modelValue: unknown;
  plugin: Plugin;
  plugins?: Plugin[];
  pathRegex?: string;
  containerId?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
}>(), {
  plugins: () => [],
  pathRegex: ".*",
  containerId: undefined,
  allowEmpty: false,
  disabled: false,
});
const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

const availablePlugins = computed(() => [
  ...props.plugins,
  ...(props.plugins.some((plugin) => plugin.id === props.plugin.id) ? [] : [props.plugin]),
]);
const options = computed(() => listPluginPathSelectionOptions(availablePlugins.value, {
  pathRegex: props.pathRegex,
  containerId: props.containerId,
}));
const selected = computed(() => typeof props.modelValue === "string" && props.modelValue
  ? props.modelValue
  : emptyValue);

function update(value: unknown) {
  emit("update:modelValue", value === emptyValue ? null : String(value));
}
</script>

<template>
  <Select :model-value="selected" :disabled="disabled" @update:model-value="update">
    <SelectTrigger class="w-full sm:w-80">
      <SelectValue placeholder="选择文件路径" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup v-if="allowEmpty">
        <SelectItem :value="emptyValue">不选择文件</SelectItem>
      </SelectGroup>
      <SelectGroup>
        <SelectItem
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :text-value="option.label"
        >
          <span class="flex min-w-0 flex-col gap-0.5">
            <span class="truncate text-xs">{{ option.label }}</span>
            <span class="truncate text-[10px] text-muted-foreground">{{ option.pluginName }}</span>
          </span>
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>
