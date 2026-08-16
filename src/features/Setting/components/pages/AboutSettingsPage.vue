<script setup lang="ts">
import { ref, watch } from "vue";
import { Info, RefreshCcw } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import SettingPage from "@/features/Setting/components/SettingPage.vue";
import AppIcon from "@/features/UI/components/AppIcon.vue";
import { useLayoutStore } from "@/features/UI/layout-store";

const version = "0.1.0";
const autoCheckUpdates = ref(localStorage.getItem("pulsarai:auto-check-updates") !== "false");
const checking = ref(false);
const updateStatus = ref("");
const changelogOpen = ref(false);
const layout = useLayoutStore();

watch(autoCheckUpdates, (enabled) => {
  localStorage.setItem("pulsarai:auto-check-updates", String(enabled));
});

async function checkForUpdates() {
  checking.value = true;
  updateStatus.value = "";
  await Promise.resolve();
  updateStatus.value = "暂未配置更新源";
  checking.value = false;
}
</script>

<template>
  <SettingPage title="关于" description="PulsarAI 版本与更新信息。">
    <div class="mx-auto flex min-h-full w-full max-w-xl flex-col py-4 mobile:py-0">
      <section class="flex flex-col items-center py-3 text-center">
        <AppIcon class="size-20" />
        <h2 class="mt-3 text-3xl font-semibold tracking-tight">PulsarAI</h2>
        <p class="mt-1 text-sm text-muted-foreground">版本 v{{ version }}</p>
      </section>

      <section class="mt-8 flex flex-col gap-6">
        <div class="flex items-center justify-between gap-6 px-4">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold">自动检查更新</h3>
            <p class="mt-1 text-xs text-muted-foreground">启动时自动检查新版本</p>
          </div>
          <Switch v-model="autoCheckUpdates" aria-label="自动检查更新" />
        </div>

        <Button
          variant="outline"
          class="h-10 w-full rounded-full"
          :disabled="checking"
          @click="checkForUpdates"
        >
          <RefreshCcw data-icon="inline-start" :class="checking && 'animate-spin'" />
          {{ checking ? "检查中" : "检查更新" }}
        </Button>

        <p v-if="updateStatus" class="text-center text-xs text-muted-foreground">{{ updateStatus }}</p>

        <Button variant="ghost" class="mx-auto" @click="changelogOpen = !changelogOpen">
          <Info data-icon="inline-start" />
          查看更新日志
        </Button>

        <div v-if="changelogOpen" class="rounded-xl bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
          当前开发版本暂无公开更新记录。
        </div>
      </section>

      <div class="mt-auto flex justify-end pt-10">
        <Button class="rounded-full px-7" @click="layout.closeSettings()">完成</Button>
      </div>
    </div>
  </SettingPage>
</template>
