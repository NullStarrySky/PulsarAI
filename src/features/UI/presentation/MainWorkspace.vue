<script setup lang="ts">
import { push } from "notivue";
import { Bell, FolderPlus } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLayoutStore } from "../application/layout-store";

const layout = useLayoutStore();

function notify() {
  push.success({
    title: "Notivue 已接入",
    message: "这条通知用于验证 Phase 1 的反馈通道。",
  });
}
</script>

<template>
  <main class="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
    <Card class="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>Pulsar 基本 UI 测试区</CardTitle>
        <CardDescription>主界面暂时为空，只保留布局、标签页和通知测试入口。</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-2">
        <Button variant="outline" @click="notify">
          <Bell data-icon="inline-start" />
          测试通知
        </Button>
        <Button
          variant="secondary"
          @click="layout.openTab({ id: `scratch-${Date.now()}`, title: '临时标签页' })"
        >
          <FolderPlus data-icon="inline-start" />
          打开测试标签
        </Button>
      </CardContent>
    </Card>
  </main>
</template>
