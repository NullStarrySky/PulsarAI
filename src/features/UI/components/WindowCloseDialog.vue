<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWindowLifecycleStore } from "../window-lifecycle-store";

const lifecycle = useWindowLifecycleStore();
const { closePromptOpen, rememberCloseChoice } = storeToRefs(lifecycle);
</script>

<template>
  <AlertDialog
    :open="closePromptOpen"
    @update:open="!$event && lifecycle.dismissClosePrompt()"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>关闭 Pulsar</AlertDialogTitle>
        <AlertDialogDescription>
          直接退出会结束后台运行；最小化到托盘后，可以左键点击托盘图标重新显示主窗口。
        </AlertDialogDescription>
      </AlertDialogHeader>

      <label class="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
        <Checkbox
          :model-value="rememberCloseChoice"
          @update:model-value="rememberCloseChoice = Boolean($event)"
        />
        <span>记住我的选择，不再询问</span>
      </label>

      <AlertDialogFooter class="sm:justify-between">
        <Button
          variant="outline"
          @click="lifecycle.chooseCloseBehavior('tray')"
        >
          最小化到托盘
        </Button>
        <Button
          variant="destructive"
          @click="lifecycle.chooseCloseBehavior('exit')"
        >
          直接退出
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
