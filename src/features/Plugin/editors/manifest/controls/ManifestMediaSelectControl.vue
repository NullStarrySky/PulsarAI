<script setup lang="ts">
import { computed } from "vue";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  flattenPluginFiles,
  pluginFileType,
  pluginNodePath,
  type Plugin,
} from "@/features/Plugin/tree/plugin-types";

const emptyValue = "__pulsar_empty_media__";
const props = withDefaults(defineProps<{
  modelValue: unknown;
  plugins?: Plugin[];
  allowEmpty?: boolean;
  disabled?: boolean;
}>(), { plugins: () => [], allowEmpty: false });
const emit = defineEmits<{
  "update:modelValue": [value: null | { pluginId: string; path: string }];
}>();

const groups = computed(() => props.plugins.flatMap((plugin) => {
  const options = flattenPluginFiles(plugin.root).flatMap((file) =>
    pluginFileType(file.name) === "media"
      ? [{
          label: pluginNodePath(plugin.root, file.id).join("/"),
          value: JSON.stringify({
            pluginId: plugin.id,
            path: pluginNodePath(plugin.root, file.id).join("/"),
          }),
        }]
      : []
  );
  return options.length ? [{ plugin, options }] : [];
}));

const selected = computed(() => {
  if (!props.modelValue || typeof props.modelValue !== "object") return emptyValue;
  const value = props.modelValue as { pluginId?: unknown; path?: unknown };
  return typeof value.pluginId === "string" && typeof value.path === "string"
    ? JSON.stringify({ pluginId: value.pluginId, path: value.path })
    : emptyValue;
});

function update(value: unknown) {
  if (value === emptyValue) {
    emit("update:modelValue", null);
    return;
  }
  try {
    const parsed = JSON.parse(String(value)) as { pluginId?: unknown; path?: unknown };
    if (typeof parsed.pluginId === "string" && typeof parsed.path === "string") {
      emit("update:modelValue", { pluginId: parsed.pluginId, path: parsed.path });
    }
  } catch {
    // Select values are produced by this component only.
  }
}
</script>

<template>
  <Select :model-value="selected" :disabled="disabled" @update:model-value="update">
    <SelectTrigger class="w-full sm:w-80">
      <SelectValue placeholder="选择媒体资源" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup v-if="allowEmpty">
        <SelectItem :value="emptyValue">不使用背景</SelectItem>
      </SelectGroup>
      <SelectGroup v-for="group in groups" :key="group.plugin.id">
        <SelectLabel>{{ group.plugin.name }}</SelectLabel>
        <SelectItem v-for="option in group.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>
