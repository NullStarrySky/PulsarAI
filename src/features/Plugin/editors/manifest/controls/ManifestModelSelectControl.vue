<script setup lang="ts">
import { computed } from "vue";
import ModelSelect from "@/features/ModelConnection/components/ModelSelect.vue";
import type { ModelApiType } from "@/features/ModelConnection/model-provider";
import type { PluginManifestValue } from "@/features/Plugin/editors/manifest/plugin-manifest";

const props = withDefaults(defineProps<{
  modelValue: unknown;
  disabled?: boolean;
  apiType?: ModelApiType;
}>(), { apiType: "chat" });
const emit = defineEmits<{ "update:modelValue": [value: PluginManifestValue] }>();
const value = computed(() =>
  typeof props.modelValue === "string" && props.modelValue.trim()
    ? props.modelValue.trim()
    : ""
);

function updateModel(value: string) {
  emit("update:modelValue", value || null);
}
</script>

<template>
  <div
    class="flex w-full items-center justify-end gap-2 sm:w-96"
    :class="disabled && 'pointer-events-none opacity-50'"
  >
    <ModelSelect
      :model-value="value"
      :api-type="apiType"
      allow-empty
      empty-label="继承全局默认"
      button-class="min-w-0 flex-1 justify-between"
      @update:model-value="updateModel"
    />
  </div>
</template>
