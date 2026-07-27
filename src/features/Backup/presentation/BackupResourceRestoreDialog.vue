<script setup lang="ts">
import { computed } from "vue";
import { ArchiveRestore, Box, MessageSquareText, PlugZap } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useBackupStore, type RestorableResource } from "../application/backup-store";

const open = defineModel<boolean>("open", { default: false });
const backup = useBackupStore();
const conversation = useConversationStore();

const packages = computed(() =>
  (backup.backupResources?.packages ?? []).map((item) => ({
    ...item,
    conversations: backup.restorableResources.filter(
      (resource) => resource.type === "conversation" && resource.packageId === item.id,
    ),
    plugins: backup.restorableResources.filter(
      (resource) => resource.type === "plugin" && resource.packageId === item.id,
    ),
  })),
);

const globalPlugins = computed(() =>
  backup.restorableResources.filter(
    (resource) => resource.type === "plugin" && resource.packageId === null,
  ),
);

function isSelected(key: string) {
  return backup.selectedResourceKeys.includes(key);
}

function packageAvailable(packageId: string) {
  return (
    conversation.packages.some((item) => item.id === packageId)
    || isSelected(`package:${packageId}`)
  );
}

function toggle(resource: RestorableResource, value: boolean) {
  backup.toggleResource(resource.key, value);
}

async function restore() {
  try {
    if (await backup.restoreSelectedResources()) {
      open.value = false;
    }
  } catch (error) {
    backup.status = `恢复失败：${String(error)}`;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogScrollContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ArchiveRestore class="size-5" />
          从历史备份恢复资源
        </DialogTitle>
        <DialogDescription>
          选择角色包、会话或插件。恢复会新增资源，不会覆盖当前内容。
        </DialogDescription>
      </DialogHeader>

      <div v-if="backup.loadingResources" class="grid gap-3 py-4">
        <div v-for="index in 3" :key="index" class="h-16 animate-pulse rounded-lg bg-muted" />
      </div>

      <div v-else-if="!backup.backupResources" class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        无法读取这个备份中的资源。
      </div>

      <div v-else class="grid gap-4">
        <section
          v-for="item in packages"
          :key="item.id"
          class="overflow-hidden rounded-lg border"
        >
          <label class="flex cursor-pointer items-start gap-3 bg-muted/35 px-4 py-3">
            <Checkbox
              :model-value="isSelected(`package:${item.id}`)"
              @update:model-value="backup.toggleResource(`package:${item.id}`, Boolean($event))"
            />
            <Box class="mt-0.5 size-4 text-muted-foreground" />
            <span class="min-w-0">
              <span class="block font-medium">{{ item.name }}</span>
              <span class="block text-xs text-muted-foreground">
                恢复角色包时会一并恢复其中的会话与本地插件
              </span>
            </span>
          </label>

          <div
            v-if="item.conversations.length || item.plugins.length"
            class="grid gap-1 px-3 py-2"
          >
            <label
              v-for="resource in item.conversations"
              :key="resource.key"
              class="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
              :class="{ 'cursor-not-allowed opacity-50': !packageAvailable(item.id) }"
            >
              <Checkbox
                :disabled="!packageAvailable(item.id)"
                :model-value="isSelected(resource.key)"
                @update:model-value="toggle(resource, Boolean($event))"
              />
              <MessageSquareText class="size-4 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{{ resource.name }}</span>
              <span v-if="!packageAvailable(item.id)" class="text-xs text-muted-foreground">
                需同时恢复角色包
              </span>
            </label>
            <label
              v-for="resource in item.plugins"
              :key="resource.key"
              class="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
              :class="{ 'cursor-not-allowed opacity-50': !packageAvailable(item.id) }"
            >
              <Checkbox
                :disabled="!packageAvailable(item.id)"
                :model-value="isSelected(resource.key)"
                @update:model-value="toggle(resource, Boolean($event))"
              />
              <PlugZap class="size-4 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{{ resource.name }}</span>
              <span v-if="!packageAvailable(item.id)" class="text-xs text-muted-foreground">
                需同时恢复角色包
              </span>
            </label>
          </div>
        </section>

        <section v-if="globalPlugins.length" class="overflow-hidden rounded-lg border">
          <header class="bg-muted/35 px-4 py-3">
            <h3 class="font-medium">全局插件</h3>
            <p class="mt-1 text-xs text-muted-foreground">全局插件不依赖角色包，可以单独恢复。</p>
          </header>
          <div class="grid gap-1 px-3 py-2">
            <label
              v-for="resource in globalPlugins"
              :key="resource.key"
              class="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
            >
              <Checkbox
                :model-value="isSelected(resource.key)"
                @update:model-value="toggle(resource, Boolean($event))"
              />
              <PlugZap class="size-4 text-muted-foreground" />
              <span class="truncate">{{ resource.name }}</span>
            </label>
          </div>
        </section>

        <div
          v-if="packages.length === 0 && globalPlugins.length === 0"
          class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
        >
          这个备份中没有可恢复的角色包、会话或插件。
        </div>
      </div>

      <p v-if="backup.status" class="text-sm text-muted-foreground">{{ backup.status }}</p>

      <DialogFooter>
        <Button variant="outline" @click="open = false">取消</Button>
        <Button
          :disabled="backup.selectedResourceKeys.length === 0"
          @click="restore"
        >
          恢复所选资源
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
