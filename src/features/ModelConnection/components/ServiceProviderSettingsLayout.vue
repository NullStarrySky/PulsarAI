<script setup lang="ts">
import type { ServiceProviderView } from "../service-provider";
import SettingForm from "@/features/Setting/components/SettingForm.vue";
import SettingFormField from "@/features/Setting/components/SettingFormField.vue";
import ServiceProviderSelector from "./ServiceProviderSelector.vue";

defineProps<{
  providers: ServiceProviderView[];
  activeProviderId: string;
  search: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  "select-provider": [providerId: string];
  "toggle-provider": [providerId: string, enabled: boolean];
}>();

function forwardToggleProvider(providerId: string, enabled: boolean) {
  emit("toggle-provider", providerId, enabled);
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto p-6 mobile:p-4">
      <SettingForm>
        <SettingFormField title="提供商" description="选择当前功能使用的提供商，并管理启用状态。">
          <ServiceProviderSelector
            :providers="providers"
            :active-provider-id="activeProviderId"
            :search="search"
            @update:search="emit('update:search', $event)"
            @select-provider="emit('select-provider', $event)"
            @toggle-provider="forwardToggleProvider"
          >
            <template #actions>
              <slot name="selector-actions" />
            </template>
          </ServiceProviderSelector>
        </SettingFormField>
      </SettingForm>

      <div class="mt-6">
        <slot />
      </div>
    </div>
  </section>
</template>
