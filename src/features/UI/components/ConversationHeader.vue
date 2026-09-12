<script setup lang="ts">
import {
	History,
	Maximize2,
	Minus,
	Search,
	Settings,
	X,
} from "lucide-vue-next";
import { computed } from "vue";
import { Button } from "@/components/fluid";
import { useCommandStore } from "@/features/Hotkey/command-store";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import type { TabView } from "@/features/Tabs/store";
import TabBar from "@/features/Tabs/TabBar.vue";
import { useLayoutStore } from "@/features/UI/layout-store";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import { host } from "@/host";

const props = defineProps<{
	tabs: TabView[];
	activeId: string | null;
	managerOpen: boolean;
}>();
const emit = defineEmits<{
	"update:managerOpen": [open: boolean];
	activate: [id: string];
	close: [id: string];
	reorder: [fromIndex: number, toIndex: number];
}>();
const appearance = useAppearanceStore();
const responsive = useResponsiveStore();
const command = useCommandStore();
const layout = useLayoutStore();
const appWindow = host.desktop?.window;
const topBarClass = computed(() =>
	!appearance.zenFrameEnabled
		? "bg-background text-foreground border-b border-border/80"
		: appearance.zenFrameIsDark
			? "bg-zen-frame-bg text-white"
			: "bg-zen-frame-bg text-slate-900",
);
const buttonClass = computed(() =>
	!appearance.zenFrameEnabled
		? "text-muted-foreground hover:bg-muted hover:text-foreground"
		: appearance.zenFrameIsDark
			? "text-white/80 hover:bg-white/15 hover:text-white"
			: "text-slate-700 hover:bg-black/10 hover:text-slate-950",
);
function reorder(fromIndex: number, toIndex: number) {
	emit("reorder", fromIndex, toIndex);
}
</script>

<template>
  <header class="relative z-30 flex h-10 shrink-0 select-none items-center px-3 mobile:h-12 mobile:px-2" :class="[topBarClass, host.desktop && 'electron-window-drag-region']">
    <div class="min-w-0 flex-1" :class="host.desktop && 'electron-window-drag-region'"><TabBar class="max-w-[min(52vw,44rem)]" data-window-drag-block :tabs="props.tabs" :active-id="props.activeId" :inactive-class="buttonClass" @activate="emit('activate', $event)" @close="emit('close', $event)" @reorder="reorder" /></div>
    <div class="flex shrink-0 items-center gap-0.5" data-window-drag-block>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="会话列表" @click="emit('update:managerOpen', !props.managerOpen)"><History class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="设置" @click="layout.openSettings()"><Settings class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="搜索" @click="command.openPalette()"><Search class="size-4" /></Button>
    </div>
    <div v-if="host.desktop && !responsive.isMobileLayout" class="ml-1 flex shrink-0 items-center gap-0.5 border-l pl-1" data-window-drag-block><Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最小化" @click="appWindow?.minimize()"><Minus class="size-4" /></Button><Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最大化或还原" @click="appWindow?.toggleMaximize()"><Maximize2 class="size-4" /></Button><Button variant="ghost" size="icon-sm" class="rounded-full hover:bg-destructive hover:text-destructive-foreground" title="关闭" @click="appWindow?.close()"><X class="size-4" /></Button></div>
  </header>
</template>
