<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import { onMounted, ref, watch } from "vue";
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

watch(
  () => [
    conversation.activeConversation?.id,
    conversation.activeConversation?.title,
    conversation.activePackage?.id,
    conversation.activePackage?.name,
  ] as const,
  () => {
    const item = conversation.activeConversation;
    layout.openTab({
      id: "conversation-stage:active",
      title: item?.title ?? conversation.activePackage?.name ?? "会话",
      resourceType: "conversation-stage",
      resourceId: item?.id ?? (conversation.activePackageId || "empty"),
      closable: false,
    });
  },
  { immediate: true },
);

async function createPackage() {
  await conversation.createPackage();
}

async function createConversation() {
  if (!conversation.activePackageId) return;
  await conversation.createConversation(conversation.activePackageId);
}

function openPluginFile(value: SelectedPluginFile) {
  selectedPluginFile.value = value;
  fileEditorOpen.value = true;
}
</script>

<template>
  <section class="conversation-stage-one flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
    <ConversationStageHeader v-model:asset-open="assetPanelOpen" />

    <div class="relative min-h-0 flex-1 overflow-hidden">
      <main class="relative h-full min-w-0 overflow-hidden">
        <template v-if="conversation.activeConversation">
          <ConversationStageThread :key="conversation.activeConversation.id" />
          <ConversationStageComposer />
        </template>

        <div v-else class="flex h-full min-h-0 items-center justify-center px-6 text-center">
          <div class="max-w-sm">
            <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-lg font-semibold text-muted-foreground">
              {{ conversation.activePackage?.name?.slice(0, 1) ?? "P" }}
            </div>
            <h1 class="mt-4 text-lg font-medium">
              {{ conversation.activePackage ? `和 ${conversation.activePackage.name} 开始新的会话` : "创建第一个角色包" }}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ conversation.activePackage?.description || (conversation.activePackage ? "会话会与当前角色包及其插件资源关联。" : "角色包会显式创建自己的本地插件，不会自动修复或补建关系。") }}
            </p>
            <p v-if="initializationError" class="mt-3 text-xs text-destructive">{{ initializationError }}</p>
            <Button class="mt-5" @click="conversation.activePackage ? createConversation() : createPackage()">
              <Plus class="size-4" />
              {{ conversation.activePackage ? "新建会话" : "新建角色包" }}
            </Button>
          </div>
        </div>

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
