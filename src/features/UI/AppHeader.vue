<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/fluid";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import { useEnvironmentStore } from "@/features/Environment/store";
import { host } from "@/host";
import {
	ExternalLink,
	History,
	Home,
	Maximize2,
	Minus,
	Settings,
	X,
} from "@/lib/phosphor-icons";
import { useUIStore } from "./store";
import { useWindowLifecycleStore } from "./window-lifecycle-store";

const props = defineProps<{
	title: string;
	hasConversation: boolean;
	managerOpen: boolean;
}>();
const emit = defineEmits<{
	"update:managerOpen": [open: boolean];
	home: [];
	newWindow: [];
}>();
const environment = useEnvironmentStore();
const ui = useUIStore();
const windowLifecycle = useWindowLifecycleStore();
const responsive = useResponsiveStore();
const appWindow = host.desktop?.window;
const topBarClass = computed(() =>
	!environment.appearance.zenFrameEnabled
		? "bg-background text-foreground border-b border-border/80"
		: environment.zenFrameIsDark
			? "bg-zen-frame-bg text-white"
			: "bg-zen-frame-bg text-slate-900",
);
const buttonClass = computed(() =>
	!environment.appearance.zenFrameEnabled
		? "text-muted-foreground hover:bg-muted hover:text-foreground"
		: environment.zenFrameIsDark
			? "text-white/80 hover:bg-white/15 hover:text-white"
			: "text-slate-700 hover:bg-black/10 hover:text-slate-950",
);
</script>

<template>
  <header class="relative z-30 flex h-10 shrink-0 select-none items-center gap-1 px-3 mobile:h-12 mobile:px-2" :class="[topBarClass, host.desktop && 'electron-window-drag-region']">
    <div class="flex min-w-0 flex-1 items-center gap-1" data-window-drag-block>
      <Button v-if="props.hasConversation" variant="ghost" size="icon-sm" :class="buttonClass" title="角色" @click="emit('home')"><Home class="size-4" /></Button>
      <span class="truncate px-1 text-sm font-medium">{{ props.title }}</span>
    </div>
    <div class="flex shrink-0 items-center gap-0.5" data-window-drag-block>
      <Button v-if="props.hasConversation && host.desktop" variant="ghost" size="icon-sm" :class="buttonClass" title="在新窗口打开" @click="emit('newWindow')"><ExternalLink class="size-4" /></Button>
      <Button v-if="props.hasConversation" variant="ghost" size="icon-sm" :class="buttonClass" title="会话列表" @click="emit('update:managerOpen', !props.managerOpen)"><History class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" :class="buttonClass" title="设置" @click="ui.settingsOpen = true"><Settings class="size-4" /></Button>
    </div>
    <div v-if="host.desktop && !responsive.isMobileLayout" class="ml-1 flex shrink-0 items-center gap-0.5 border-l pl-1" data-window-drag-block>
      <Button variant="ghost" size="icon-sm" :class="buttonClass" title="最小化" @click="appWindow?.minimize()"><Minus class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" :class="buttonClass" title="最大化或还原" @click="appWindow?.toggleMaximize()"><Maximize2 class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="hover:bg-destructive hover:text-destructive-foreground" title="关闭" @click="windowLifecycle.handleCloseRequest"><X class="size-4" /></Button>
    </div>
  </header>
</template>
