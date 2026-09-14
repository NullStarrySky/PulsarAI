<script setup lang="ts">
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/fluid";
import { Checkbox } from "@/components/ui/checkbox";
import { ArchiveRestore, Box, MessageSquareText } from "@/lib/phosphor-icons";
import { useBackupStore } from "./backup-store";

const open = defineModel<boolean>("open", { default: false });
const backup = useBackupStore();

async function restore() {
	if (await backup.restoreSelectedResources("update")) open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle><ArchiveRestore class="mr-2 inline size-5" />恢复本地 Plugin</DialogTitle>
        <DialogDescription>会话会随所属本地 Plugin 一起恢复。</DialogDescription>
      </DialogHeader>
      <div class="grid gap-2">
        <label v-for="item in backup.restorableResources" :key="item.key" class="flex items-center gap-3 rounded border p-3">
          <Checkbox :model-value="backup.selectedResourceKeys.includes(item.key)" @update:model-value="backup.toggleResource(item.key, Boolean($event))" />
          <Box v-if="item.type === 'local-plugin'" class="size-4" />
          <MessageSquareText v-else class="size-4" />
          <span>{{ item.name }}</span>
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">取消</Button>
        <Button :disabled="!backup.selectedResourceKeys.length" @click="restore">恢复</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
