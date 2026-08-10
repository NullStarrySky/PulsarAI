<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useConversationStore } from "../application/conversation-store";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import type { Plugin, PluginFile } from "@/features/Resources/Plugin/domain/plugin-types";
import PluginAssetTreePanel from "@/features/Resources/Plugin/presentation/PluginAssetTreePanel.vue";
import PluginFileEditorDialog from "@/features/Resources/Plugin/presentation/PluginFileEditorDialog.vue";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import ConversationStageHeader from "./ConversationStageHeader.vue";
import ConversationStageThread from "./ConversationStageThread.vue";
import ConversationStageComposer from "./ConversationStageComposer.vue";
import { pluginMediaSource, pluginMediaType } from "@/features/Resources/Plugin/domain/plugin-media";

interface SelectedPluginFile {
  plugin: Plugin;
  file: PluginFile;
  path: string;
}

const conversation = useConversationStore();
const plugin = usePluginStore();
const appearance = useAppearanceStore();
const assetPanelOpen = ref(true);
const fileEditorOpen = ref(false);
const selectedPluginFile = ref<SelectedPluginFile | null>(null);
const initializationError = ref("");
const activeBackground = computed(() => plugin.activeBackgroundResourceForPackage(
  conversation.activePackageId,
  conversation.activePackage?.enabledGlobalPluginIds,
  conversation.activePackage?.mainPluginId,
));
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
  selectedPluginFile.value = value;
  fileEditorOpen.value = true;
}
</script>

<template>
  <section
    class="conversation-stage-one flex h-full min-w-0 flex-col overflow-hidden text-foreground transition-all duration-200"
    :class="appearance.zenFrameEnabled ? 'bg-zen-frame-bg p-1.5 gap-1.5' : 'bg-background p-0 gap-0'"
  >
    <ConversationStageHeader v-model:asset-open="assetPanelOpen" />

    <div
      class="relative min-h-0 flex-1 overflow-hidden transition-all duration-200"
      :class="appearance.zenFrameEnabled ? 'rounded-xl border border-zen-frame-border/80 bg-background shadow-sm' : 'rounded-none border-0 bg-background'"
    >
      <div class="relative flex h-full min-h-0 flex-1 overflow-hidden">
        <main class="relative h-full min-w-0 flex-1 overflow-hidden">
          <div v-if="activeBackgroundSource" aria-hidden="true" class="pointer-events-none absolute inset-0">
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
          <PluginAssetTreePanel v-if="assetPanelOpen" @select="openPluginFile" @close="assetPanelOpen = false" />
        </Transition>
      </div>
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
