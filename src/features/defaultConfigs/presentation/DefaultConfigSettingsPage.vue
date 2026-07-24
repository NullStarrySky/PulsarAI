<script setup lang="ts">
import { onMounted } from "vue";
import SettingGroup from "@/features/Setting/presentation/SettingGroup.vue";
import SettingItem from "@/features/Setting/presentation/SettingItem.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import { useDefaultConfigStore } from "../application/default-config-store";

const defaults = useDefaultConfigStore();

onMounted(async () => {
  await defaults.load();
});
</script>

<template>
  <SettingPage title="默认项" description="统一管理 Pulsar 的默认模型和后续默认行为。">
    <SettingGroup title="模型">
      <SettingItem title="默认对话模型" description="新对话会优先使用这个模型。">
        <ModelSelect
          :model-value="defaults.defaultChatModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setDefaultChatModel"
        />
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>
