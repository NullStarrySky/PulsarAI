<script setup lang="ts">
import { computed } from "vue";
import { Switch } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { builtInComponents } from "../provider";
import type { ParamDefinition } from "../types";

const props = defineProps<{ definition: ParamDefinition }>();
const emit = defineEmits<{ "update:value": [value: unknown] }>();

const isBoolean = computed(() => typeof props.definition.value === "boolean");
const inputType = computed(() =>
	typeof props.definition.value === "number" ? "number" : "text",
);

function update(value: string | number) {
	emit("update:value", inputType.value === "number" ? Number(value) : value);
}

const customComponent = computed(() =>
	props.definition.customBlockComponent
		? builtInComponents.get(props.definition.customBlockComponent)
		: undefined,
);
</script>

<template>
  <component
    v-if="customComponent"
    :is="customComponent"
    v-bind="definition.customBlockComponent === 'PiperModelDownload' ? { type: 'piper' } : definition.customBlockComponent === 'WhisperModelDownload' ? { type: 'whisper' } : { name: (definition.paramComponent.componentParam as { name?: string }).name || '', title: definition.title }"
  />
  <div v-else class="flex min-h-11 items-center gap-3">
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium">{{ definition.title || definition.paramName }}</p>
      <p v-if="definition.description" class="text-xs text-muted-foreground">{{ definition.description }}</p>
    </div>
    <Switch
      v-if="isBoolean"
      :model-value="Boolean(definition.value)"
      @update:model-value="emit('update:value', $event)"
    />
    <Input
      v-else
      class="max-w-64"
      :model-value="String(definition.value ?? '')"
      :type="inputType"
      @update:model-value="update($event)"
    />
  </div>
</template>
