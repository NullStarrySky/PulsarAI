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
      <SettingItem title="默认模型" description="未显式指定时的对话模型。">
        <ModelSelect
          :model-value="defaults.defaultChatModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setDefaultChatModel"
        />
      </SettingItem>
      <SettingItem title="快速模型" description="用于低延迟、低成本任务。">
        <ModelSelect
          :model-value="defaults.fastModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setFastModel"
        />
      </SettingItem>
      <SettingItem title="向量化模型" description="用于检索和语义索引。">
        <ModelSelect
          :model-value="defaults.embeddingModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setEmbeddingModel"
        />
      </SettingItem>
      <SettingItem title="图片生成模型" description="用于文生图或图像编辑。">
        <ModelSelect
          :model-value="defaults.imageModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setImageModel"
        />
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>
