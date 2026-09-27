<script setup lang="ts">
import { Notification, Notivue } from "notivue";
import { onBeforeUnmount, onMounted } from "vue";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Switch,
} from "@/components/fluid";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import {
	useEnvironmentHotkeys,
	useEnvironmentStore,
} from "@/features/Environment/store";
import { host } from "@/host";
import AppContainer from "./AppContainer.vue";
import { useWindowLifecycleStore } from "./window-lifecycle-store";

const environment = useEnvironmentStore();
const windowLifecycle = useWindowLifecycleStore();
const responsive = useResponsiveStore();
useEnvironmentHotkeys();
const stopCloseRequest = host.desktop?.window.onCloseRequest(() => {
	void windowLifecycle.handleCloseRequest();
});

onMounted(() => {
	void windowLifecycle.initialize();
	responsive.refreshPlatform();
});

onBeforeUnmount(() => {
	stopCloseRequest?.();
});
</script>

<template>
  <div
    class="flex h-[100dvh] min-w-0 flex-col overflow-hidden text-foreground"
    :class="[
      environment.glassEnabled ? 'glass-effect-frame' : environment.appearance.zenFrameEnabled ? 'bg-zen-frame-bg' : 'bg-background',
    ]"
    :style="environment.appearance.zenFrameEnabled ? { padding: `${environment.appearance.zenFrameWidth}px` } : undefined"
  >
    <div
      class="min-h-0 flex-1"
      :class="[
        environment.appearance.zenFrameEnabled && 'overflow-hidden rounded-xl border border-zen-frame-border/80 shadow-sm mobile:rounded-lg',
        !environment.glassEnabled && environment.appearance.zenFrameEnabled && 'bg-background',
      ]"
    >
      <AppContainer />
    </div>
    <Dialog v-model:open="windowLifecycle.closePromptOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>关闭 PulsarAI？</DialogTitle>
          <DialogDescription>你可以直接退出，或隐藏到系统托盘后继续运行。</DialogDescription>
        </DialogHeader>
        <Switch v-model="windowLifecycle.rememberCloseChoice" label="记住这次选择" />
        <DialogFooter>
          <Button variant="ghost" @click="windowLifecycle.dismissClosePrompt">取消</Button>
          <Button variant="outline" @click="windowLifecycle.chooseCloseBehavior('tray')">最小化到托盘</Button>
          <Button @click="windowLifecycle.chooseCloseBehavior('exit')">退出</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>
