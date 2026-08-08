<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Button } from "@/components/ui/button";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import type { ModelApiType } from "@/features/ModelConnection/domain/model-provider";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import type { PluginManifestValue } from "../../domain/plugin-manifest";

const props = withDefaults(defineProps<{
  modelValue: unknown;
  disabled?: boolean;
  apiType?: ModelApiType;
}>(), { apiType: "chat" });
const emit = defineEmits<{ "update:modelValue": [value: PluginManifestValue] }>();
const defaults = useDefaultConfigStore();
const value = computed(() =>
  typeof props.modelValue === "string" && props.modelValue.trim()
    ? props.modelValue.trim()
    : defaults.defaultChatModel
);

onMounted(() => void defaults.load());
</script>

<template>
  <div
    class="flex w-full items-center justify-end gap-2 sm:w-96"
    :class="disabled && 'pointer-events-none opacity-50'"
  >
    <ModelSelect
      :model-value="value"
      :api-type="apiType"
      button-class="min-w-0 flex-1 justify-between"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <Button
      v-if="modelValue !== null"
      size="sm"
      variant="ghost"
      :disabled="disabled"
      @click="emit('update:modelValue', null)"
    >
      继承全局
    </Button>
  </div>
</template>
