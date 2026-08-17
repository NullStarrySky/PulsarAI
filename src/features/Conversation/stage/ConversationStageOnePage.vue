<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import type { Plugin, PluginFile } from "@/features/Plugin/tree/plugin-types";
import PluginAssetTreePanel from "@/features/Plugin/tree/PluginAssetTreePanel.vue";
import PluginFileEditorDialog from "@/features/Plugin/tree/PluginFileEditorDialog.vue";
import PluginManagerPanel from "@/features/Plugin/PluginManagerPanel.vue";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import ConversationStageHeader from "@/features/Conversation/header/ConversationStageHeader.vue";
import ConversationStageThread from "@/features/Conversation/stage/ConversationStageThread.vue";
import ConversationStageComposer from "@/features/Conversation/composer/ConversationStageComposer.vue";
import { pluginMediaSource, pluginMediaType } from "@/features/Plugin/editors/media/plugin-media";

import { useContainerStore } from "@/features/Plugin/tree/container-store";

interface SelectedPluginFile {
  plugin: Plugin;
  file: PluginFile;
  path: string;
}

const conversation = useConversationStore();
const plugin = usePluginStore();
const containerStore = useContainerStore();
const appearance = useAppearanceStore();
const assetPanelPluginId = ref<string | null>(null);
const assetPanelOpen = computed({
  get: () => assetPanelPluginId.value !== null,
  set: (open) => {
    if (!open) assetPanelPluginId.value = null;
  },
});
const pluginPanelOpen = ref(false);
const fileEditorOpen = computed({
  get: () => !!plugin.activeEditorState,
  set: (val) => {
    if (!val) plugin.closeFileEditor();
  },
});
const activeEditor = computed(() => plugin.activeEditorState);
const initializationError = ref("");
const backgroundReady = computed(() => conversation.loaded && plugin.loaded);
const activeBackground = computed(() => containerStore.activeBackgroundResource);
const activeBackgroundSource = computed(() => pluginMediaSource(activeBackground.value?.content));
const activeBackgroundType = computed(() => pluginMediaType(
  activeBackground.value?.content,
  activeBackgroundSource.value,
));

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
  plugin.openFileEditor(value.plugin, value.file, value.path);
}

function openLocalAssets() {
  const localPlugin = plugin.sortedPlugins.find((item) => item.packageId === conversation.activePackageId);
  if (!localPlugin) return;
  if (assetPanelPluginId.value === localPlugin.id) {
    assetPanelPluginId.value = null;
  } else {
    assetPanelPluginId.value = localPlugin.id;
  }
}

function openPluginAssets(target: Plugin) {
  pluginPanelOpen.value = false;
  if (assetPanelPluginId.value === target.id) {
    assetPanelPluginId.value = null;
  } else {
    assetPanelPluginId.value = target.id;
  }
}
</script>

<template>
  <section
    class="conversation-stage-one flex h-full min-w-0 flex-col overflow-hidden text-foreground transition-all duration-200"
    :class="appearance.zenFrameEnabled ? 'bg-zen-frame-bg p-1.5 gap-1.5' : 'bg-background p-0 gap-0'"
  >
    <ConversationStageHeader v-model:asset-open="assetPanelOpen" v-model:plugin-open="pluginPanelOpen" @open-local-assets="openLocalAssets" />

    <div
      class="relative min-h-0 flex-1 overflow-hidden transition-all duration-200"
      :class="appearance.zenFrameEnabled ? 'rounded-xl border border-zen-frame-border/80 bg-background shadow-sm' : 'rounded-none border-0 bg-background'"
    >
      <div class="relative flex h-full min-h-0 flex-1 overflow-hidden">
        <main class="relative h-full min-w-0 flex-1 overflow-hidden">
          <div v-if="backgroundReady && activeBackgroundSource" aria-hidden="true" class="pointer-events-none absolute inset-0">
            <video
              v-if="activeBackgroundType === 'video'"
              :src="activeBackgroundSource"
              autoplay
              muted
              loop
              playsinline
              class="size-full object-cover"
            />
            <img v-else :src="activeBackgroundSource" alt="" class="size-full object-cover" />
            <div class="absolute inset-0 bg-background/70" />
          </div>
          <template v-if="conversation.activeConversation">
            <ConversationStageThread :key="conversation.activeConversation.id" />
            <ConversationStageComposer />
          </template>

          <p v-if="initializationError" class="absolute inset-x-4 top-4 z-50 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {{ initializationError }}
          </p>

        </main>

        <Transition name="asset-panel">
          <PluginAssetTreePanel v-if="assetPanelPluginId" :plugin-id="assetPanelPluginId" @select="openPluginFile" @close="assetPanelOpen = false" />
        </Transition>
        <Transition name="asset-panel">
          <PluginManagerPanel v-if="pluginPanelOpen" @select="openPluginAssets" @close="pluginPanelOpen = false" />
        </Transition>
      </div>
    </div>

    <PluginFileEditorDialog
      :open="fileEditorOpen"
      :plugin="activeEditor?.plugin ?? null"
      :file="activeEditor?.file ?? null"
      :path="activeEditor?.path ?? ''"
      :initial-mode="activeEditor?.editorMode"
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
