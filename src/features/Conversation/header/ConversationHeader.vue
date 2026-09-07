<script setup lang="ts">
import {
	Folder,
	Maximize2,
	Minus,
	MoreHorizontal,
	Pencil,
	Pin,
	PinOff,
	Search,
	Settings,
	Trash2,
	X,
	FlaskConical,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, toRef } from "vue";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/fluid";
// biome-ignore lint:style/useImportType
import ChatManager from "@/features/Conversation/chats/ChatManager.vue";
import { useConversation } from "@/features/Conversation/use-conversation";
import { useCommandStore } from "@/features/Hotkey/command-store";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
// biome-ignore lint:style/useImportType
import LocalPluginManager from "@/features/Plugin/LocalPluginManager.vue";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import { useLayoutStore } from "@/features/UI/layout-store";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import PluginSlotComponents from "../panels/PluginSlotComponents.vue";
import { host } from "@/host";

const props = defineProps<{
	localPluginId: string;
	chatId: string;
	assetOpen?: boolean;
	devExperiment?: boolean;
}>();
const emit = defineEmits<{
	"update:localPluginId": [value: string];
	"update:chatId": [value: string];
	"toggle-assets": [];
	"toggle-dev-experiment": [];
}>();
const layout = useLayoutStore();
const responsive = useResponsiveStore();
const appearance = useAppearanceStore();
const command = useCommandStore();
const localPlugins = useLocalPluginStore();
const conversation = useConversation(toRef(props, "chatId"));
const appWindow = host.desktop?.window;
const isDev = import.meta.env.DEV;
const hovered = ref(false);
const packageMenuOpen = ref(false);
const chatMenuOpen = ref(false);
const operationsOpen = ref(false);
const localPluginManager = ref<InstanceType<typeof LocalPluginManager> | null>(null);
const chatManager = ref<InstanceType<typeof ChatManager> | null>(null);
const topBarHoverBoundary = 56;
const selectedPackage = computed(
	() => localPlugins.localPlugins.find((item) => item.id === props.localPluginId) ?? null,
);
const selectedChat = computed(() => conversation.chat.value);


const topBarClass = computed(() =>
	!appearance.zenFrameEnabled
		? "bg-background text-foreground border-b border-border/80"
		: appearance.zenFrameIsDark
			? "bg-zen-frame-bg text-white"
			: "bg-zen-frame-bg text-slate-900",
);
const buttonClass = computed(() =>
	!appearance.zenFrameEnabled
		? "text-muted-foreground/75 hover:bg-muted/60 hover:text-foreground"
		: appearance.zenFrameIsDark
			? "text-white/80 hover:bg-white/15 hover:text-white"
			: "text-slate-700 hover:bg-black/10 hover:text-slate-950",
);
const dividerClass = computed(() =>
	!appearance.zenFrameEnabled
		? "bg-border/60"
		: appearance.zenFrameIsDark
			? "bg-white/20"
			: "bg-black/15",
);
const closeClass = computed(() =>
	!appearance.zenFrameEnabled
		? "text-muted-foreground/75 hover:bg-destructive hover:text-destructive-foreground"
		: appearance.zenFrameIsDark
			? "text-white/80 hover:bg-red-600 hover:text-white"
			: "text-slate-700 hover:bg-red-600 hover:text-slate-950",
);
const frameBorderClass = computed(() =>
	layout.topBarPinned
		? appearance.zenFrameEnabled
			? "border-b border-zen-frame-border/80"
			: "border-b border-border/80"
		: appearance.zenFrameEnabled
			? "border border-zen-frame-border/80"
			: "border border-border/80",
);
const visible = computed(
	() => layout.topBarPinned || hovered.value || operationsOpen.value,
);

function onMouseMove(event: MouseEvent) {
	if (!layout.topBarPinned)
		hovered.value = event.clientY <= topBarHoverBoundary;
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
	  <Button variant="ghost" size="icon-sm" class="rounded-full" :class="[buttonClass, props.assetOpen && 'bg-muted/75 text-foreground']" title="文件" @click="emit('toggle-assets')"><Folder class="size-4" /></Button>
      <PluginSlotComponents slot-id="topbar-left" direction="horizontal" class="hidden min-w-0 xl:flex" />
      <LocalPluginManager ref="localPluginManager" :local-plugin-id="props.localPluginId" :button-class="buttonClass" @open-change="packageMenuOpen = $event" @select="emit('update:localPluginId', $event)" />
      <span class="h-4 w-px shrink-0" :class="dividerClass" />
      <ChatManager ref="chatManager" :local-plugin-id="props.localPluginId" :chat-id="props.chatId" :button-class="buttonClass" @open-change="chatMenuOpen = $event" @select="emit('update:chatId', $event)" />
      <DropdownMenu v-model:open="operationsOpen">
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="角色与会话操作"><MoreHorizontal class="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-48" data-window-drag-block>
          <DropdownMenuLabel>角色</DropdownMenuLabel>
          <DropdownMenuItem :disabled="!selectedPackage" @click="localPluginManager?.togglePin()"><Pin data-icon="inline-start" />{{ localPlugins.preferences[props.localPluginId]?.pinned ? '取消置顶角色' : '置顶角色' }}</DropdownMenuItem>
          <DropdownMenuItem :disabled="!selectedPackage" @click="localPluginManager?.rename()"><Pencil data-icon="inline-start" />重命名角色</DropdownMenuItem>
          <DropdownMenuItem class="text-destructive focus:text-destructive" :disabled="!selectedPackage" @click="localPluginManager?.removeSelected()"><Trash2 data-icon="inline-start" />删除角色</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>会话</DropdownMenuLabel>
          <DropdownMenuItem :disabled="!selectedChat" @click="chatManager?.togglePin()"><Pin data-icon="inline-start" />{{ selectedChat?.pinned ? '取消置顶会话' : '置顶会话' }}</DropdownMenuItem>
          <DropdownMenuItem :disabled="!selectedChat" @click="chatManager?.rename()"><Pencil data-icon="inline-start" />重命名会话</DropdownMenuItem>
          <DropdownMenuItem class="text-destructive focus:text-destructive" :disabled="!selectedChat" @click="chatManager?.removeSelected()"><Trash2 data-icon="inline-start" />删除会话</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div class="flex shrink-0 items-center gap-0.5">
      <PluginSlotComponents slot-id="topbar-right" direction="horizontal" class="hidden max-w-60 overflow-hidden xl:flex" />
      <DropdownMenu>
        <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full xl:hidden" :class="buttonClass" title="更多顶栏组件"><MoreHorizontal class="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="max-h-72 max-w-72 overflow-auto p-2"><PluginSlotComponents slot-id="topbar-left" direction="vertical" /><PluginSlotComponents slot-id="topbar-right" direction="vertical" /></DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="设置" @click="layout.openSettings()"><Settings class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="搜索" @click="command.openPalette()"><Search class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="[buttonClass, !layout.topBarPinned && 'bg-muted/75 text-foreground']" :title="layout.topBarPinned ? '自动折叠顶栏' : '固定顶栏'" @click="layout.toggleTopBarPinned()"><Pin v-if="layout.topBarPinned" class="size-4" /><PinOff v-else class="size-4" /></Button>
      <Button v-if="isDev" variant="ghost" size="icon-sm" class="rounded-full" :class="[buttonClass, props.devExperiment && 'bg-muted/75 text-foreground']" title="导入实验页" @click="emit('toggle-dev-experiment')"><FlaskConical class="size-4" /></Button>
    </div>
    <div v-if="host.desktop && !responsive.isMobileLayout" class="flex shrink-0 items-center gap-0.5">
      <span class="mx-0.5 h-4 w-px shrink-0" :class="dividerClass" />
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最小化" @click="appWindow?.minimize()"><Minus class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="buttonClass" title="最大化或还原" @click="appWindow?.toggleMaximize()"><Maximize2 class="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" class="rounded-full" :class="closeClass" title="关闭" @click="appWindow?.close()"><X class="size-4" /></Button>
    </div>
  </header>
</template>
