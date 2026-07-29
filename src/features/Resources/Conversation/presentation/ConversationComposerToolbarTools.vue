<script setup lang="ts">
import { Maximize2, Paperclip, PenTool } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import type { ComposerToolId } from "@/features/UI/domain/composer-toolbar";

defineProps<{
  toolIds: ComposerToolId[];
}>();

const emit = defineEmits<{
  attach: [];
  whiteboard: [];
  fullscreen: [];
}>();

const defaults = useDefaultConfigStore();
</script>

<template>
  <template v-for="toolId in toolIds" :key="toolId">
    <ModelSelect
      v-if="toolId === 'model'"
      :model-value="defaults.defaultChatModel"
      icon-only
      button-class="size-8 p-0 mobile:size-10"
      @update:model-value="defaults.setDefaultChatModel"
    />
    <Button
      v-else-if="toolId === 'attachment'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10"
      title="附加文件"
      @click="emit('attach')"
    >
      <Paperclip class="size-4" />
    </Button>
    <Button
      v-else-if="toolId === 'whiteboard'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10"
      title="白板"
      @click="emit('whiteboard')"
    >
      <PenTool class="size-4" />
    </Button>
    <Button
      v-else-if="toolId === 'fullscreen'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10"
      title="全屏输入"
      @click="emit('fullscreen')"
    >
      <Maximize2 class="size-4" />
    </Button>
  </template>
</template>
