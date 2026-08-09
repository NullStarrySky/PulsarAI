<script setup lang="ts">
import { Minimize2 } from "lucide-vue-next";
import { onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { useConversationStore } from "../application/conversation-store";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import type { Plugin, PluginFile } from "@/features/Resources/Plugin/domain/plugin-types";
import PluginAssetTreePanel from "@/features/Resources/Plugin/presentation/PluginAssetTreePanel.vue";
import PluginFileEditorDialog from "@/features/Resources/Plugin/presentation/PluginFileEditorDialog.vue";
import ConversationStageHeader from "./ConversationStageHeader.vue";
import ConversationStageThread from "./ConversationStageThread.vue";
import ConversationStageComposer from "./ConversationStageComposer.vue";
import { useLayoutStore } from "@/features/UI/application/layout-store";

interface SelectedPluginFile {
  plugin: Plugin;
  file: PluginFile;
  path: string;
}

const conversation = useConversationStore();
const plugin = usePluginStore();
const layout = useLayoutStore();
const assetPanelOpen = ref(true);
const fileEditorOpen = ref(false);
const selectedPluginFile = ref<SelectedPluginFile | null>(null);
const initializationError = ref("");

onMounted(async () => {
  try {
    await Promise.all([
      conversation.initialize(),
      plugin.initialize(),
    ]);
    if (!conversation.activePackageId && conversation.packages[0]) {
      await conversation.openPackage(conversation.packages[0].id);
    }
  } catch (error) {
    initializationError.value = error instanceof Error ? error.message : "资源数据库初始化失败";
  }
});

function openPluginFile(value: SelectedPluginFile) {
  selectedPluginFile.value = value;
  fileEditorOpen.value = true;
}
</script>

<template>
  <section class="conversation-stage-one flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
    <ConversationStageHeader v-if="!layout.immersiveConversation" v-model:asset-open="assetPanelOpen" />
    <Button
      v-else
      variant="secondary"
      size="icon"
      class="fixed right-4 top-4 z-50 size-11 rounded-full text-muted-foreground shadow-lg hover:bg-muted hover:text-foreground mobile:right-3 mobile:top-3"
      title="恢复顶栏"
      aria-label="恢复顶栏"
      @mousedown.stop.prevent="layout.setImmersiveConversation(false)"
      @click.stop="layout.setImmersiveConversation(false)"
    >
      <Minimize2 class="size-4" />
    </Button>

    <div class="relative min-h-0 flex-1 overflow-hidden">
      <main class="relative h-full min-w-0 overflow-hidden">
        <template v-if="conversation.activeConversation">
          <ConversationStageThread :key="conversation.activeConversation.id" />
          <ConversationStageComposer />
        </template>

        <p v-if="initializationError" class="absolute inset-x-4 top-4 z-50 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {{ initializationError }}
        </p>

      </main>

      <Transition name="asset-panel">
        <PluginAssetTreePanel v-if="assetPanelOpen" @select="openPluginFile" />
      </Transition>
    </div>

    <PluginFileEditorDialog
      :open="fileEditorOpen"
      :plugin="selectedPluginFile?.plugin ?? null"
      :file="selectedPluginFile?.file ?? null"
      :path="selectedPluginFile?.path ?? ''"
      :panel-open="assetPanelOpen"
      @update:open="fileEditorOpen = $event"
    />
  </section>
</template>

<style scoped>
.asset-panel-enter-active,
.asset-panel-leave-active {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease;
  will-change: transform, opacity;
}

.asset-panel-enter-from,
.asset-panel-leave-to {
  transform: translateX(calc(100% + 1rem));
  opacity: 0;
}
</style>
