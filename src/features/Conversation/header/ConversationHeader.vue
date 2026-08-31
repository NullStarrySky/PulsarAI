<script setup lang="ts">
import { CalendarClock, FolderTree, Maximize2, Minus, MoreHorizontal, Pencil, Pin, PinOff, Search, Settings, Trash2, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ChatManager from "@/features/Conversation/chats/ChatManager.vue";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import PackageManager from "@/features/Package/PackageManager.vue";
import { usePackageStore } from "@/features/Package/package-store";
import { useLayoutStore } from "@/features/UI/layout-store";
import { host } from "@/host";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import { useCommandStore } from "@/features/Hotkey/command-store";
import SchedulePage from "@/features/UI/schedule/SchedulePage.vue";

const props = defineProps<{ packageId: string; chatId: string; assetOpen?: boolean }>();
const emit = defineEmits<{ "update:packageId": [value: string]; "update:chatId": [value: string]; "toggle-assets": [] }>();
const layout = useLayoutStore();
const responsive = useResponsiveStore();
const appearance = useAppearanceStore();
const command = useCommandStore();
const packages = usePackageStore();
const chats = useChatStore();
const appWindow = host.desktop?.window;
const hovered = ref(false);
const packageMenuOpen = ref(false);
const chatMenuOpen = ref(false);
const operationsOpen = ref(false);
const scheduleOpen = ref(false);
const packageManager = ref<InstanceType<typeof PackageManager> | null>(null);
const chatManager = ref<InstanceType<typeof ChatManager> | null>(null);
const topBarHoverBoundary = 56;
const selectedPackage = computed(() => packages.packages.find((item) => item.id === props.packageId) ?? null);
const selectedChat = computed(() => chats.chatsForPackage(props.packageId).find((item) => item.id === props.chatId) ?? null);

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
const frameBorderClass = computed(() => layout.topBarPinned
  ? appearance.zenFrameEnabled ? "border-b border-zen-frame-border/80" : "border-b border-border/80"
  : appearance.zenFrameEnabled ? "border border-zen-frame-border/80" : "border border-border/80");
const visible = computed(() => layout.topBarPinned || hovered.value || operationsOpen.value);

function onMouseMove(event: MouseEvent) {
  if (!layout.topBarPinned) hovered.value = event.clientY <= topBarHoverBoundary;
}
onMounted(() => window.addEventListener("mousemove", onMouseMove));
onUnmounted(() => window.removeEventListener("mousemove", onMouseMove));
</script>

<template>
  <div v-if="!layout.topBarPinned" class="fixed inset-x-0 top-0 z-40 h-6" />
  <header
    class="select-none items-center px-3 transition-all duration-200 ease-out mobile:px-2"
    :class="[
      topBarClass,
      host.desktop && 'electron-window-drag-region',
      layout.topBarPinned
        ? 'relative z-30 flex h-10 shrink-0 mobile:h-12'
        : 'fixed left-1.5 right-1.5 z-50 flex h-10 rounded-xl shadow-xl backdrop-blur-md mobile:h-12',
      frameBorderClass,
      !layout.topBarPinned && (visible ? 'top-1.5 opacity-100 pointer-events-auto' : '-top-14 opacity-0 pointer-events-none'),
    ]"
  >
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <PackageManager ref="packageManager" :package-id="props.packageId" :button-class="buttonClass" @open-change="packageMenuOpen = $event" @select="emit('update:packageId', $event)" />
      <span class="h-4 w-px shrink-0" :class="dividerClass" />
      <ChatManager ref="chatManager" :package-id="props.packageId" :chat-id="props.chatId" :button-class="buttonClass" @open-change="chatMenuOpen = $event" @select="emit('update:chatId', $event)" />
      <DropdownMenu v-model:open="operationsOpen">
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="角色与会话操作"><MoreHorizontal class="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-48" data-window-drag-block>
          <DropdownMenuLabel>角色</DropdownMenuLabel>
          <DropdownMenuItem :disabled="!selectedPackage" @click="packageManager?.togglePin()"><Pin data-icon="inline-start" />{{ selectedPackage?.pinned ? '取消置顶角色' : '置顶角色' }}</DropdownMenuItem>
          <DropdownMenuItem :disabled="!selectedPackage" @click="packageManager?.rename()"><Pencil data-icon="inline-start" />重命名角色</DropdownMenuItem>
          <DropdownMenuItem class="text-destructive focus:text-destructive" :disabled="!selectedPackage" @click="packageManager?.removeSelected()"><Trash2 data-icon="inline-start" />删除角色</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>会话</DropdownMenuLabel>
          <DropdownMenuItem :disabled="!selectedChat" @click="chatManager?.togglePin()"><Pin data-icon="inline-start" />{{ selectedChat?.pinned ? '取消置顶会话' : '置顶会话' }}</DropdownMenuItem>
          <DropdownMenuItem :disabled="!selectedChat" @click="chatManager?.rename()"><Pencil data-icon="inline-start" />重命名会话</DropdownMenuItem>
          <DropdownMenuItem class="text-destructive focus:text-destructive" :disabled="!selectedChat" @click="chatManager?.removeSelected()"><Trash2 data-icon="inline-start" />删除会话</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div class="flex shrink-0 items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="设置" @click="layout.openSettings()"><Settings class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="定时任务" @click="scheduleOpen = true"><CalendarClock class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="搜索" @click="command.openPalette()"><Search class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="[buttonClass, props.assetOpen && 'bg-muted/75 text-foreground']" title="资产" @click="emit('toggle-assets')"><FolderTree class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="[buttonClass, !layout.topBarPinned && 'bg-muted/75 text-foreground']" :title="layout.topBarPinned ? '自动折叠顶栏' : '固定顶栏'" @click="layout.toggleTopBarPinned()"><Pin v-if="layout.topBarPinned" class="size-4" /><PinOff v-else class="size-4" /></Button>
    </div>
    <div v-if="host.desktop && !responsive.isMobileLayout" class="flex shrink-0 items-center gap-0.5">
      <span class="mx-0.5 h-4 w-px shrink-0" :class="dividerClass" />
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最小化" @click="appWindow?.minimize()"><Minus class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最大化或还原" @click="appWindow?.toggleMaximize()"><Maximize2 class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="closeClass" title="关闭" @click="appWindow?.close()"><X class="size-4" /></Button>
    </div>
  </header>
  <Dialog v-model:open="scheduleOpen"><DialogContent class="h-[min(46rem,calc(100dvh-2rem))] max-w-5xl overflow-hidden p-0"><DialogHeader class="sr-only"><DialogTitle>定时任务</DialogTitle></DialogHeader><SchedulePage /></DialogContent></Dialog>
</template>
