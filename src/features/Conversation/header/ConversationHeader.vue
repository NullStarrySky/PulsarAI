<script setup lang="ts">
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CalendarClock, FolderTree, Maximize2, Minus, Pin, PinOff, Search, Settings, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ChatManager from "@/features/Conversation/chats/ChatManager.vue";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import PackageManager from "@/features/Package/PackageManager.vue";
import PluginHeaderButton from "@/features/Plugin/PluginHeaderButton.vue";
import { useLayoutStore } from "@/features/UI/layout-store";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import { startWindowDragFromBackground } from "@/features/UI/window-drag";
import { useCommandStore } from "@/features/Hotkey/command-store";
import SchedulePage from "@/features/UI/schedule/SchedulePage.vue";

const props = defineProps<{ packageId: string; chatId: string; assetOpen?: boolean; pluginOpen?: boolean }>();
const emit = defineEmits<{ "update:packageId": [value: string]; "update:chatId": [value: string]; "toggle-assets": []; "toggle-plugin": [] }>();
const layout = useLayoutStore();
const responsive = useResponsiveStore();
const appearance = useAppearanceStore();
const command = useCommandStore();
const appWindow = isTauri() ? getCurrentWindow() : null;
const hovered = ref(false);
const menuOpen = ref(false);
const scheduleOpen = ref(false);

const topBarClass = computed(() => !appearance.zenFrameEnabled
  ? "bg-background text-foreground border-b border-border/80"
  : appearance.zenFrameIsDark ? "bg-zen-frame-bg text-white" : "bg-zen-frame-bg text-slate-900");
const buttonClass = computed(() => !appearance.zenFrameEnabled
  ? "text-muted-foreground/75 hover:bg-muted/60 hover:text-foreground"
  : appearance.zenFrameIsDark ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-slate-700 hover:bg-black/10 hover:text-slate-950");
const dividerClass = computed(() => !appearance.zenFrameEnabled
  ? "bg-border/60"
  : appearance.zenFrameIsDark ? "bg-white/20" : "bg-black/15");
const closeClass = computed(() => !appearance.zenFrameEnabled
  ? "text-muted-foreground/75 hover:bg-destructive hover:text-destructive-foreground"
  : appearance.zenFrameIsDark ? "text-white/80 hover:bg-red-600 hover:text-white" : "text-slate-700 hover:bg-red-600 hover:text-slate-950");
const visible = computed(() => layout.topBarPinned || hovered.value || menuOpen.value || props.pluginOpen || props.assetOpen);

function onMouseMove(event: MouseEvent) {
  if (!layout.topBarPinned && event.clientY <= 14) hovered.value = true;
}
onMounted(() => window.addEventListener("mousemove", onMouseMove));
onUnmounted(() => window.removeEventListener("mousemove", onMouseMove));
</script>

<template>
  <div v-if="!layout.topBarPinned" class="fixed inset-x-0 top-0 z-40 h-3" @mouseenter="hovered = true" />
  <header
    class="select-none items-center px-3 transition-all duration-200 ease-out mobile:px-2"
    :class="[
      topBarClass,
      layout.topBarPinned
        ? 'relative z-30 flex h-10 shrink-0 border-b border-zen-frame-border/80 mobile:h-12'
        : 'fixed left-1.5 right-1.5 top-1.5 z-50 flex h-10 rounded-xl border border-zen-frame-border/80 shadow-xl backdrop-blur-md mobile:h-12',
      !layout.topBarPinned && (visible ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-[calc(100%+1rem)] opacity-0 pointer-events-none'),
    ]"
    @mousedown="startWindowDragFromBackground"
    @mouseleave="hovered = false"
  >
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <PackageManager :package-id="props.packageId" :button-class="buttonClass" @open-change="menuOpen = $event" @select="emit('update:packageId', $event)" />
      <span class="h-4 w-px shrink-0" :class="dividerClass" />
      <ChatManager :package-id="props.packageId" :chat-id="props.chatId" :button-class="buttonClass" @open-change="menuOpen = $event" @select="emit('update:chatId', $event)" />
    </div>
    <div class="flex shrink-0 items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="设置" @click="layout.openSettings()"><Settings class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="定时任务" @click="scheduleOpen = true"><CalendarClock class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="搜索" @click="command.openPalette()"><Search class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="[buttonClass, props.assetOpen && 'bg-muted/75 text-foreground']" title="资产" @click="emit('toggle-assets')"><FolderTree class="size-4" /></Button>
      <PluginHeaderButton :active="props.pluginOpen" :button-class="buttonClass" active-button-class="bg-muted/75 text-foreground" @toggle="emit('toggle-plugin')" />
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="[buttonClass, !layout.topBarPinned && 'bg-muted/75 text-foreground']" :title="layout.topBarPinned ? '自动折叠顶栏' : '固定顶栏'" @click="layout.toggleTopBarPinned()"><Pin v-if="layout.topBarPinned" class="size-4" /><PinOff v-else class="size-4" /></Button>
    </div>
    <div v-if="!responsive.isMobileLayout" class="flex shrink-0 items-center gap-0.5">
      <span class="mx-0.5 h-4 w-px shrink-0" :class="dividerClass" />
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最小化" @click="appWindow?.minimize()"><Minus class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最大化或还原" @click="appWindow?.toggleMaximize()"><Maximize2 class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="closeClass" title="关闭" @click="appWindow?.close()"><X class="size-4" /></Button>
    </div>
  </header>
  <Dialog v-model:open="scheduleOpen"><DialogContent class="h-[min(46rem,calc(100dvh-2rem))] max-w-5xl overflow-hidden p-0"><DialogHeader class="sr-only"><DialogTitle>定时任务</DialogTitle></DialogHeader><SchedulePage /></DialogContent></Dialog>
</template>
