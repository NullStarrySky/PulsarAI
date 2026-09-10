<script setup lang="ts">
import { Folder, Maximize2, Minus, Plus, Search, Settings, X, FlaskConical } from "lucide-vue-next";
import { computed, watch } from "vue";
import { Button } from "@/components/fluid";
import type { ConversationTab } from "../tabs/conversation-tabs";
import { useCommandStore } from "@/features/Hotkey/command-store";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import UpdateIndicator from "@/features/UI/components/UpdateIndicator.vue";
import { useLayoutStore } from "@/features/UI/layout-store";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import { host } from "@/host";
import PluginSlotComponents from "../panels/PluginSlotComponents.vue";

const props = defineProps<{ tabs: ConversationTab[]; activeChatId: string; devExperiment?: boolean }>();
const emit = defineEmits<{
	"select-tab": [chatId: string];
	"close-tab": [chatId: string];
	"rename-tab": [chatId: string];
	"open-picker": [];
	"toggle-assets": [];
	"toggle-dev-experiment": [];
}>();

const layout = useLayoutStore();
const responsive = useResponsiveStore();
const appearance = useAppearanceStore();
const command = useCommandStore();
const localPlugins = useLocalPluginStore();
const appWindow = host.desktop?.window;
const isDev = import.meta.env.DEV;
const topBarClass = computed(() => !appearance.zenFrameEnabled ? "bg-background text-foreground border-b border-border/80" : appearance.zenFrameIsDark ? "bg-zen-frame-bg text-white" : "bg-zen-frame-bg text-slate-900");
const buttonClass = computed(() => !appearance.zenFrameEnabled ? "text-muted-foreground/75 hover:bg-muted/60 hover:text-foreground" : appearance.zenFrameIsDark ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-slate-700 hover:bg-black/10 hover:text-slate-950");
const dividerClass = computed(() => !appearance.zenFrameEnabled ? "bg-border/60" : appearance.zenFrameIsDark ? "bg-white/20" : "bg-black/15");
const closeClass = computed(() => !appearance.zenFrameEnabled ? "text-muted-foreground/75 hover:bg-destructive hover:text-destructive-foreground" : appearance.zenFrameIsDark ? "text-white/80 hover:bg-red-600 hover:text-white" : "text-slate-700 hover:bg-red-600 hover:text-slate-950");

watch(() => props.activeChatId, (chatId) => { command.paletteChatId = chatId; }, { immediate: true });
function roleFor(tab: ConversationTab) { return localPlugins.localPlugins.find((role) => role.id === tab.localPluginId); }
function closeOnMiddleClick(tab: ConversationTab, event: MouseEvent) { if (event.button === 1) emit("close-tab", tab.chatId); }
</script>

<template>
  <header class="relative z-30 flex h-10 shrink-0 select-none items-center px-3 mobile:h-12 mobile:px-2" :class="[topBarClass, host.desktop && 'electron-window-drag-region']">
    <div class="flex min-w-0 items-center gap-1" data-window-drag-block>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="文件" @click="emit('toggle-assets')"><Folder class="size-4" /></Button>
      <PluginSlotComponents slot-id="topbar-left" direction="horizontal" class="hidden min-w-0 xl:flex" />
      <div class="flex min-w-0 max-w-[52vw] items-center gap-1 overflow-x-auto py-1 mobile:max-w-[calc(100vw-11rem)]">
        <button v-for="tab in props.tabs" :key="tab.chatId" type="button" class="group flex h-8 min-w-24 max-w-52 shrink-0 items-center gap-1.5 rounded-lg px-2 text-left text-xs transition-colors" :class="tab.chatId === props.activeChatId ? 'bg-muted text-foreground shadow-xs' : buttonClass" :title="tab.title" @click="emit('select-tab', tab.chatId)" @mousedown.middle.prevent @auxclick.prevent="closeOnMiddleClick(tab, $event)" @contextmenu.prevent="emit('rename-tab', tab.chatId)">
          <img v-if="roleFor(tab)?.avatarUrl || roleFor(tab)?.coverUrl" :src="roleFor(tab)?.avatarUrl || roleFor(tab)?.coverUrl" :alt="roleFor(tab)?.name" class="size-4 shrink-0 rounded-full object-cover" />
          <span v-else class="grid size-4 shrink-0 place-items-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">{{ roleFor(tab)?.name.slice(0, 1) ?? 'P' }}</span>
          <span class="min-w-0 flex-1 truncate">{{ tab.title }}</span>
          <span class="grid size-4 shrink-0 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 hover:bg-foreground/10" title="关闭会话" @click.stop="emit('close-tab', tab.chatId)"><X class="size-3" /></span>
        </button>
        <Button variant="ghost" size="icon-sm" class="size-8 shrink-0 rounded-lg" :class="buttonClass" title="打开角色或会话" @click="emit('open-picker')"><Plus class="size-4" /></Button>
      </div>
    </div>
    <div class="min-w-6 flex-1" :class="host.desktop && 'electron-window-drag-region'" />
    <div class="flex shrink-0 items-center gap-0.5" data-window-drag-block>
      <UpdateIndicator :button-class="buttonClass" />
      <PluginSlotComponents slot-id="topbar-right" direction="horizontal" class="hidden max-w-60 overflow-hidden xl:flex" />
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="设置" @click="layout.openSettings()"><Settings class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="搜索" @click="command.openPalette('', props.activeChatId)"><Search class="size-4" /></Button>
      <Button v-if="isDev" variant="ghost" size="icon-sm" class="rounded-full" :class="[buttonClass, props.devExperiment && 'bg-muted/75 text-foreground']" title="导入实验页" @click="emit('toggle-dev-experiment')"><FlaskConical class="size-4" /></Button>
    </div>
    <div v-if="host.desktop && !responsive.isMobileLayout" class="flex shrink-0 items-center gap-0.5" data-window-drag-block>
      <span class="mx-0.5 h-4 w-px shrink-0" :class="dividerClass" />
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最小化" @click="appWindow?.minimize()"><Minus class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最大化或还原" @click="appWindow?.toggleMaximize()"><Maximize2 class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="closeClass" title="关闭" @click="appWindow?.close()"><X class="size-4" /></Button>
    </div>
  </header>
</template>
