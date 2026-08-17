<script setup lang="ts">
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minus, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCommandStore } from "@/features/Hotkey/command-store";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import { useLayoutStore } from "@/features/UI/layout-store";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import SchedulePage from "@/features/UI/schedule/SchedulePage.vue";
import { startWindowDragFromBackground } from "@/features/UI/window-drag";
import CharacterPackageMenu from "@/features/Conversation/header/CharacterPackageMenu.vue";
import ConversationMenu from "@/features/Conversation/header/ConversationMenu.vue";
import { createHeaderActions } from "@/features/Conversation/header/header-registry";

const assetOpen = defineModel<boolean>("assetOpen", { required: true });
const pluginOpen = defineModel<boolean>("pluginOpen", { required: true });
const emit = defineEmits<{ openLocalAssets: [] }>();
const command = useCommandStore();
const layout = useLayoutStore();
const responsive = useResponsiveStore();
const appearance = useAppearanceStore();
const appWindow = isTauri() ? getCurrentWindow() : null;

const topBarContainerClass = computed(() => {
  if (!appearance.zenFrameEnabled) {
    return "bg-background text-foreground border-b border-border/80";
  }
  return appearance.zenFrameIsDark
    ? "bg-zen-frame-bg text-white"
    : "bg-zen-frame-bg text-slate-900";
});

const headerBtnClass = computed(() => {
  if (!appearance.zenFrameEnabled) {
    return "text-muted-foreground/75 hover:bg-muted/60 hover:text-foreground";
  }
  return appearance.zenFrameIsDark
    ? "text-white/80 hover:bg-white/15 hover:text-white"
    : "text-slate-700 hover:bg-black/10 hover:text-slate-950";
});

const headerActiveBtnClass = computed(() => {
  if (!appearance.zenFrameEnabled) {
    return "bg-muted/75 text-foreground";
  }
  return appearance.zenFrameIsDark
    ? "bg-white/20 text-white"
    : "bg-black/15 text-slate-950";
});

const headerDividerClass = computed(() => {
  if (!appearance.zenFrameEnabled) {
    return "bg-border/60";
  }
  return appearance.zenFrameIsDark ? "bg-white/20" : "bg-black/15";
});

const windowCloseBtnClass = computed(() => {
  if (!appearance.zenFrameEnabled) {
    return "text-muted-foreground/75 hover:bg-destructive hover:text-destructive-foreground";
  }
  return appearance.zenFrameIsDark
    ? "text-white/80 hover:bg-red-600 hover:text-white"
    : "text-slate-700 hover:bg-red-600 hover:text-white";
});

const isHovered = ref(false);
const packageMenuActive = ref(false);
const conversationMenuActive = ref(false);
const scheduleOpen = ref(false);

function handleMouseMove(e: MouseEvent) {
  if (layout.topBarPinned) return;
  if (e.clientY <= 14) {
    isHovered.value = true;
  }
}

onMounted(() => {
  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", handleMouseMove);
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("mousemove", handleMouseMove);
  }
});

const isHeaderVisible = computed(() => {
  return (
    layout.topBarPinned ||
    isHovered.value ||
    packageMenuActive.value ||
    conversationMenuActive.value ||
    pluginOpen.value
  );
});

async function minimizeWindow() {
  await appWindow?.minimize();
}

async function toggleMaximize() {
  await appWindow?.toggleMaximize();
}

async function closeWindow() {
  await appWindow?.close();
}

function toggleLocalAssets() {
  if (assetOpen.value) {
    assetOpen.value = false;
    return;
  }
  pluginOpen.value = false;
  emit("openLocalAssets");
}

function togglePluginPanel() {
  pluginOpen.value = !pluginOpen.value;
  if (pluginOpen.value) assetOpen.value = false;
}

const headerActions = computed(() =>
  createHeaderActions({
    assetOpen: assetOpen.value,
    pluginOpen: pluginOpen.value,
    topBarPinned: layout.topBarPinned,
    openSettings: () => layout.openSettings(),
    openSchedule: () => {
      scheduleOpen.value = true;
    },
    openPalette: () => command.openPalette(),
    toggleLocalAssets,
    toggleTopBarPinned: () => layout.toggleTopBarPinned(),
  }),
);
</script>

<template>
  <div v-if="!layout.topBarPinned" class="fixed top-0 left-0 right-0 z-40 h-3" @mouseenter="isHovered = true" />

  <header
    class="select-none items-center px-3 transition-all duration-200 ease-out mobile:px-2"
    :class="[
      topBarContainerClass,
      layout.topBarPinned
        ? 'relative z-30 flex h-10 shrink-0 border-b border-zen-frame-border/80 mobile:h-12'
        : 'fixed top-1.5 left-1.5 right-1.5 z-50 flex h-10 rounded-xl border border-zen-frame-border/80 shadow-xl backdrop-blur-md mobile:h-12',
      !layout.topBarPinned && (isHeaderVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-[calc(100%+1rem)] opacity-0 pointer-events-none')
    ]"
    @mousedown="startWindowDragFromBackground"
    @mouseleave="isHovered = false"
  >
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <CharacterPackageMenu v-model:active="packageMenuActive" :button-class="headerBtnClass" />
      <span class="h-4 w-px shrink-0" :class="headerDividerClass" />
      <ConversationMenu v-model:active="conversationMenuActive" :button-class="headerBtnClass" />
    </div>

    <div class="flex shrink-0 items-center gap-0.5">
      <template v-for="action in headerActions" :key="action.id">
        <component
          :is="action.component"
          v-if="action.component"
          :active="pluginOpen"
          :button-class="headerBtnClass"
          :active-button-class="headerActiveBtnClass"
          @toggle="togglePluginPanel"
        />
        <Button
          v-else-if="action.icon"
          variant="ghost"
          size="icon-sm"
          class="rounded-full"
          :class="[headerBtnClass, action.active && headerActiveBtnClass]"
          :title="action.title"
          @click="action.onClick"
        >
          <component :is="action.icon" class="size-4" />
        </Button>
      </template>

      <span v-if="!responsive.isMobileLayout" class="mx-0.5 h-4 w-px shrink-0 border-l" :class="headerDividerClass" />

      <template v-if="!responsive.isMobileLayout">
        <Button variant="ghost" size="icon-sm" class="rounded-full" :class="headerBtnClass" title="最小化" aria-label="最小化窗口" @click="minimizeWindow"><Minus class="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" class="rounded-full" :class="headerBtnClass" title="最大化或还原" aria-label="最大化或还原窗口" @click="toggleMaximize"><Maximize2 class="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" class="rounded-full" :class="windowCloseBtnClass" title="关闭" aria-label="关闭窗口" @click="closeWindow"><X class="size-4" /></Button>
      </template>
    </div>
  </header>

  <Dialog v-model:open="scheduleOpen">
    <DialogContent class="h-[min(46rem,calc(100dvh-2rem))] max-w-5xl overflow-hidden p-0">
      <DialogHeader class="sr-only"><DialogTitle>定时任务</DialogTitle></DialogHeader>
      <SchedulePage />
    </DialogContent>
  </Dialog>
</template>
