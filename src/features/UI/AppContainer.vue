<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Button } from "@/components/fluid";
import Manager from "@/features/Conversation/components/Manager.vue";
import Surface from "@/features/Conversation/components/Surface.vue";
import {
	toggleEditModeAction,
	toggleEditModeEvent,
} from "@/features/Conversation/dataflow/activePathComposable";
import {
	cleanupAppLifetimeConversations,
	initConversationVersions,
} from "@/features/Conversation/dataflow/conversations";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import SettingsContent from "@/features/Environment/setting/SettingsContent.vue";
import SettingsSidebar from "@/features/Environment/setting/SettingsSidebar.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import { useCharacterList } from "@/features/Plugin/dataflow/use-plugin-data";
import { resolveMediaUrl } from "@/features/Plugin/media/media-link";
import { host } from "@/host";
import {
	ChevronLeft,
	ChevronRight,
	Minus,
	PanelLeft,
	Plus,
	Square,
	X,
} from "@/lib/remix-icons";
import AppHeader from "./AppHeader.vue";
import TestBench from "./components/TestBench.vue";
import { useUIStore } from "./store";
import { useWindowLifecycleStore } from "./window-lifecycle-store";

const ui = useUIStore();
const sync = useSyncStore();
const characterList = useCharacterList();
const responsive = useResponsiveStore();
const environment = useEnvironmentStore();
const windowLifecycle = useWindowLifecycleStore();
const appWindow = host.desktop?.window;

const activeConversationId = computed(() =>
	ui.page.type === "conversation" ? ui.page.id : "",
);

const managerPluginId = ref("");
watch(
	() => [...characterList.characters.value],
	(list) => {
		if (!managerPluginId.value && list[0]) {
			managerPluginId.value = list[0].id;
		}
	},
	{ immediate: true },
);

const activeConversation = computed(() => {
	if (!activeConversationId.value) return null;
	for (const list of sync.conversationMeta.values()) {
		const conv = list.get(activeConversationId.value);
		if (conv) return conv;
	}
	return null;
});

const isBlank = computed(
	() => ui.page.type === "home" || !activeConversationId.value,
);
const sidebarTestOpen = ref(false);
watch(
	() => ui.settingsOpen,
	(open) => {
		if (open) sidebarTestOpen.value = false;
	},
);

const conversationTitle = computed(() => activeConversation.value?.title || "");

// Active character info & avatar
const activeCharacter = computed(() => {
	const pluginId =
		activeConversation.value?.localPluginId || managerPluginId.value;
	return [...characterList.characters.value].find((c) => c.id === pluginId);
});

const activeAvatar = ref("");
watch(
	() => activeCharacter.value?.avatarUrl,
	async (url) => {
		if (!url) {
			activeAvatar.value = "";
			return;
		}
		activeAvatar.value = await resolveMediaUrl(url);
	},
	{ immediate: true },
);

async function handleNewConversation() {
	await ui.switch({ type: "home" });
}

// Left Sidebar resizing state and logic
const isResizingLeftSidebar = ref(false);

function startLeftSidebarResize(e: MouseEvent) {
	if (e.button !== 0) return;
	e.preventDefault();
	isResizingLeftSidebar.value = true;
	document.body.style.cursor = "col-resize";
	document.body.style.userSelect = "none";

	const startX = e.clientX;
	const startWidth = ui.sidebarWidth;

	function onMouseMove(event: MouseEvent) {
		const delta = event.clientX - startX;
		ui.setSidebarWidth(startWidth + delta);
	}

	function onMouseUp() {
		isResizingLeftSidebar.value = false;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);
	}

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);
}

// Right Sidebar resizing state and logic
const isResizingRightSidebar = ref(false);

function startRightSidebarResize(e: MouseEvent) {
	if (e.button !== 0) return;
	e.preventDefault();
	isResizingRightSidebar.value = true;
	document.body.style.cursor = "col-resize";
	document.body.style.userSelect = "none";

	const startX = e.clientX;
	const startWidth = ui.rightSidebarWidth;

	function onMouseMove(event: MouseEvent) {
		const delta = startX - event.clientX;
		ui.setRightSidebarWidth(startWidth + delta);
	}

	function onMouseUp() {
		isResizingRightSidebar.value = false;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);
	}

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);
}

watch(
	activeConversationId,
	(id) => {
		if (!id) return;
		sidebarTestOpen.value = false;
		const conversation = [...sync.conversationMeta.values()]
			.map((list) => list.get(id))
			.find(Boolean);
		if (conversation) managerPluginId.value = conversation.localPluginId;
	},
	{ immediate: true },
);

watch(
	managerPluginId,
	async (id) => {
		if (id) await sync.load({ type: "conversationList", id });
	},
	{ immediate: true },
);

onMounted(async () => {
	await Promise.all([sync.init(), initConversationVersions()]);
	await cleanupAppLifetimeConversations();
});

function toggleEditMode() {
	if (activeConversationId.value) toggleEditModeAction();
}

onMounted(() => window.addEventListener(toggleEditModeEvent, toggleEditMode));
onBeforeUnmount(() =>
	window.removeEventListener(toggleEditModeEvent, toggleEditMode),
);

async function afterDelete(id: string) {
	if (activeConversationId.value === id) await ui.switch({ type: "home" });
}

async function handleToggleMaximize() {
	if (document.fullscreenElement) {
		await document.exitFullscreen().catch(() => {});
	}
	await appWindow?.toggleMaximize();
}
</script>

<template>
  <div class="relative h-full w-full overflow-hidden" :class="environment.glassEnabled ? 'glass-effect-surface' : 'bg-background'">
    <TestBench
      v-if="isBlank && !ui.settingsOpen && sidebarTestOpen"
      class="size-full"
      :sidebar-width="ui.sidebarWidth"
    />
    <div v-else class="relative flex h-full w-full select-none overflow-hidden" :class="environment.glassEnabled ? 'bg-transparent' : 'bg-background'">
    <!-- Background Wallpaper Layer -->
    <div
      v-if="environment.appearance.backgroundImage"
      class="pointer-events-none absolute inset-0 z-0 bg-cover bg-center transition-all duration-300"
      :style="{
        backgroundImage: `url('${environment.appearance.backgroundImage}')`,
        opacity: environment.appearance.backgroundOpacity ?? 0.85,
        filter: environment.appearance.backgroundBlur ? `blur(${environment.appearance.backgroundBlur}px)` : undefined,
      }"
    />

    <!-- 1. Top-Left Fixed Actions (Permanent, never scrolls, matches test.html) -->
    <div
      class="absolute left-0 top-0 z-50 flex h-11 items-center gap-1 px-2.5 electron-window-no-drag pointer-events-auto"
      data-window-drag-block
      style="-webkit-app-region: no-drag;"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        title="切换左侧栏"
        @click="ui.leftSidebarOpen = !ui.leftSidebarOpen"
      >
        <PanelLeft class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        :disabled="!ui.canGoBack"
        title="后退"
        @click="ui.goBack()"
      >
        <ChevronLeft class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        :disabled="!ui.canGoForward"
        title="前进"
        @click="ui.goForward()"
      >
        <ChevronRight class="size-4" />
      </Button>
      <!-- New conversation: Visible in all conversation states, hidden only in settings -->
      <Button
        v-if="!ui.settingsOpen"
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        title="新建会话"
        @click="handleNewConversation"
      >
        <Plus class="size-4" />
      </Button>
    </div>

    <!-- 1b. Top-Right Fixed Actions (Permanent, never pushed away by right sidebar) -->
    <div
      class="absolute right-0 top-0 z-50 flex h-11 items-center gap-0.5 px-2 electron-window-no-drag pointer-events-auto"
      data-window-drag-block
      style="-webkit-app-region: no-drag;"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        title="切换右侧栏"
        @click="ui.rightSidebarOpen = !ui.rightSidebarOpen"
      >
        <PanelLeft class="size-4 rotate-180" />
      </Button>

      <template v-if="host.desktop && !responsive.isMobileLayout">
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          title="最小化"
          @click="appWindow?.minimize()"
        >
          <Minus class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          title="全屏或还原"
          @click="handleToggleMaximize"
        >
          <Square class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="hover:bg-destructive hover:text-destructive-foreground text-muted-foreground"
          title="关闭"
          @click="windowLifecycle.handleCloseRequest"
        >
          <X class="size-4" />
        </Button>
      </template>
    </div>

    <!-- 2. Left Sidebar (Slides out from x=0 with bg-sidebar) -->
    <div
      class="relative z-10 h-full shrink-0 flex overflow-hidden text-sidebar-foreground"
      :class="[
        !isResizingLeftSidebar && 'transition-[width] duration-300',
        environment.glassEnabled ? 'bg-sidebar/35' : environment.appearance.backgroundImage ? 'bg-sidebar/65 backdrop-blur-md' : 'bg-sidebar',
      ]"
      :style="{
        width: ui.leftSidebarOpen ? `${ui.sidebarWidth}px` : '0px',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }"
    >
      <div class="h-full overflow-hidden" :style="{ width: `${ui.sidebarWidth}px` }">
        <!-- In-place Settings Sidebar covers Left Sidebar when settingsOpen is true -->
        <SettingsSidebar v-if="ui.settingsOpen" class="h-full" />
        <Manager
          v-else
          class="h-full border-r-0"
          :sidebar-width="ui.sidebarWidth"
          :local-plugin-id="managerPluginId"
          :conversation-id="activeConversationId"
          @select="id => ui.switch({ type: 'conversation', id })"
          @character-change="id => managerPluginId = id"
          @new-window="ui.openAtNewWindow"
          @close="afterDelete"
        />
      </div>

      <!-- Left Sidebar Resize Handle -->
      <div
        v-if="ui.leftSidebarOpen"
        class="absolute -right-1 top-0 bottom-0 z-30 w-2 cursor-col-resize select-none flex justify-center items-center group"
        title="拖拽调整左侧栏宽度"
        @mousedown="startLeftSidebarResize"
      >
        <div class="w-0.5 h-full transition-colors group-hover:bg-primary/50 group-active:bg-primary" />
      </div>
    </div>

    <!-- Mobile Backdrop -->
    <div
      v-if="ui.leftSidebarOpen"
      class="fixed inset-0 z-30 hidden bg-black/30 backdrop-blur-xs mobile:block"
      @click="ui.leftSidebarOpen = false"
    />

    <!-- 3. Main Wrapper (Pushed right by left sidebar, contains AppHeader and body) -->
    <div
      class="main-wrapper relative z-10 flex min-w-0 flex-1 flex-col h-full overflow-hidden"
      :class="environment.glassEnabled || environment.appearance.backgroundImage ? 'bg-transparent' : 'bg-background'"
    >
      <AppHeader
        :sidebar-open="ui.leftSidebarOpen"
        :is-blank="isBlank"
        :conversation-title="conversationTitle"
        :character-name="activeCharacter?.name"
        :avatar-url="activeAvatar"
        :is-settings-open="ui.settingsOpen"
      />

      <main class="relative flex min-w-0 flex-1 h-full overflow-hidden">
        <!-- In-place Settings Content covers Main Area when settingsOpen is true -->
        <SettingsContent v-if="ui.settingsOpen" class="size-full" />
        <!-- Main conversation surface (persisted across switches to allow smooth composer animations) -->
        <Surface
          v-else
          class="size-full"
          :conversation-id="activeConversationId"
          :default-plugin-id="managerPluginId"
        />
      </main>
    </div>

    <!-- 4. Right Sidebar (Resizable width, bg-sidebar, styled consistently with left sidebar) -->
    <div
      class="relative z-10 h-full shrink-0 flex overflow-hidden text-sidebar-foreground"
      :class="[
        !isResizingRightSidebar && 'transition-[width] duration-300',
        environment.glassEnabled ? 'bg-sidebar/35' : environment.appearance.backgroundImage ? 'bg-sidebar/65 backdrop-blur-md' : 'bg-sidebar',
      ]"
      :style="{
        width: ui.rightSidebarOpen ? `${ui.rightSidebarWidth}px` : '0px',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }"
    >
      <!-- Right Sidebar Resize Handle on its left edge -->
      <div
        v-if="ui.rightSidebarOpen"
        class="absolute -left-1 top-0 bottom-0 z-30 w-2 cursor-col-resize select-none flex justify-center items-center group"
        title="拖拽调整右侧栏宽度"
        @mousedown="startRightSidebarResize"
      >
        <div class="w-0.5 h-full transition-colors group-hover:bg-primary/50 group-active:bg-primary" />
      </div>

      <div class="h-full overflow-hidden" :style="{ width: `${ui.rightSidebarWidth}px` }">
        <aside class="flex h-full w-full flex-col bg-transparent select-none">
          <!-- Top spacer matching header height -->
          <div class="h-11 shrink-0" />
          <div class="flex h-10 shrink-0 items-center justify-between px-3">
            <span class="text-xs font-semibold text-muted-foreground">右侧栏</span>
          </div>
          <div class="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground/60">
            暂无内容
          </div>
        </aside>
      </div>
    </div>
    </div>
    <Button
      v-if="isBlank && !ui.settingsOpen"
      variant="default"
      size="icon"
      class="absolute bottom-5 right-5 z-[60] size-12 rounded-full shadow-lg"
      :title="sidebarTestOpen ? '返回空白页' : '打开测试台'"
      :aria-label="sidebarTestOpen ? '返回空白页' : '打开测试台'"
      @click="sidebarTestOpen = !sidebarTestOpen"
    >
      <PanelLeft class="size-5" />
    </Button>
  </div>
</template>
