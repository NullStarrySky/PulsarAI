<script setup lang="ts">
import { Checkbox } from "@/components/ui/checkbox";
import { capabilityDefinitions } from "@/features/Capabilities/application/capability-registry";
import type { CapabilityGrants } from "@/features/Capabilities/domain/capability";

const props = defineProps<{
  modelValue: CapabilityGrants;
  compact?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: CapabilityGrants];
}>();

function explicitIds(featureId: string) {
  const definition = capabilityDefinitions.find((item) => item.id === featureId);
  const available = Object.keys(definition?.subCaps ?? {}).filter((id) => id !== "all");
  const selected = props.modelValue[featureId] ?? [];
  return selected.includes("all") ? available : selected;
}

function setFeatureAll(featureId: string, enabled: boolean) {
  emit("update:modelValue", {
    ...props.modelValue,
    [featureId]: enabled ? ["all"] : [],
  });
}

function setSubCap(featureId: string, subCapId: string, enabled: boolean) {
  const selected = new Set(explicitIds(featureId));
  if (enabled) {
    selected.add(subCapId);
  } else {
    selected.delete(subCapId);
  }
  emit("update:modelValue", {
    ...props.modelValue,
    [featureId]: [...selected],
  });
}
</script>

<template>
  <div :class="compact ? 'space-y-2' : 'grid gap-3 md:grid-cols-2'">
    <section
      v-for="definition in capabilityDefinitions"
      :key="definition.id"
      class="rounded-lg border bg-card/35 p-3"
    >
      <div class="flex items-start gap-2.5">
        <Checkbox
          :model-value="explicitIds(definition.id).length === Object.keys(definition.subCaps).length - 1"
          :aria-label="`允许 ${definition.title} 全部权限`"
          class="mt-0.5"
          @update:model-value="setFeatureAll(definition.id, Boolean($event))"
        />
        <div class="min-w-0">
          <div class="text-sm font-medium">{{ definition.title }}</div>
          <div class="mt-0.5 text-xs leading-5 text-muted-foreground">
            {{ definition.description }}
          </div>
        </div>
      </div>
      <div class="mt-2 space-y-1 pl-6">
        <label
          v-for="(description, subCapId) in definition.subCaps"
          v-show="subCapId !== 'all'"
          :key="subCapId"
          class="flex min-h-8 cursor-pointer items-center gap-2 rounded px-1 text-xs hover:bg-muted/45"
        >
          <Checkbox
            :model-value="explicitIds(definition.id).includes(String(subCapId))"
            @update:model-value="setSubCap(definition.id, String(subCapId), Boolean($event))"
          />
          <span>{{ description }}</span>
          <code class="ml-auto text-[10px] text-muted-foreground">{{ subCapId }}</code>
        </label>
      </div>
    </section>
  </div>
</template>
