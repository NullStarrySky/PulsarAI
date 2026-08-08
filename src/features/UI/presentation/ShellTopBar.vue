<script setup lang="ts">
import { computed } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { storeToRefs } from "pinia";
import {
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
  CircleX,
  ExternalLink,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelLeft,
  PanelRight,
  TriangleAlert,
  X,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { popOutWorkspaceTab } from "@/features/SubWindow/application/sub-window-service";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "../application/layout-store";
import { startWindowDragFromBackground } from "../application/window-drag";

const layout = useLayoutStore();
const responsive = useResponsiveStore();
const { activeTabId, leftSidebarOpen, rightSidebarOpen, shellMode, tabs } = storeToRefs(layout);
const { isMobileLayout } = storeToRefs(responsive);
const compactTabs = computed(() => tabs.value.length > 8);
const appWindow = isTauri() ? getCurrentWindow() : null;

async function minimizeWindow() {
  await appWindow?.minimize();
}

async function toggleMaximize() {
  await appWindow?.toggleMaximize();
}

async function closeWindow() {
  await appWindow?.close();
}

function closeWithMiddleButton(event: MouseEvent, tabId: string) {
  if (event.button === 1) {
    event.preventDefault();
    layout.closeTab(tabId);
  }
}

async function popOutTab(tabId: string) {
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab) {
    return;
  }
  await popOutWorkspaceTab(tab);
}

function toggleLeftSidebar() {
  if (isMobileLayout.value && !leftSidebarOpen.value) {
    layout.rightSidebarOpen = false;
  }
  layout.toggleLeftSidebar();
}

function toggleRightSidebar() {
  if (isMobileLayout.value && !rightSidebarOpen.value) {
    layout.leftSidebarOpen = false;
  }
  layout.toggleRightSidebar();
}
</script>

<template>
  <header
    class="flex h-10 shrink-0 select-none items-center gap-1 border-b border-border/75 bg-background px-1.5 mobile:h-12 mobile:px-1"
    @mousedown="startWindowDragFromBackground"
  >
    <Button
      v-if="shellMode !== 'simplified'"
      class="relative z-10 mobile:size-10"
      variant="ghost"
      size="icon-sm"
      title="切换左侧栏"
      @click="toggleLeftSidebar"
    >
      <PanelLeft v-if="leftSidebarOpen" />
      <ChevronsRight v-else />
    </Button>

    <nav class="relative z-10 flex min-w-0 max-w-[58vw] items-center gap-0.5 overflow-hidden mobile:max-w-none mobile:flex-1 mobile:overflow-x-auto mobile:[scrollbar-width:none]">
      <ContextMenu
        v-for="tab in tabs"
        :key="tab.id"
      >
        <ContextMenuTrigger as-child>
          <div
            :class="
              cn(
                'group flex h-7 min-w-7 max-w-40 items-center gap-1 rounded-md px-2 text-[13px] transition-colors mobile:h-9 mobile:max-w-28 mobile:shrink-0',
                activeTabId === tab.id
                  ? 'bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )
            "
            role="button"
            tabindex="0"
            @click="layout.activateTab(tab.id)"
            @auxclick="closeWithMiddleButton($event, tab.id)"
            @keydown.enter.prevent="layout.activateTab(tab.id)"
          >
            <LoaderCircle
              v-if="tab.status?.kind === 'loading'"
              class="size-3.5 shrink-0 animate-spin"
              :aria-label="tab.status.label ?? '处理中'"
            />
            <CircleCheck
              v-else-if="tab.status?.kind === 'success'"
              class="size-3.5 shrink-0 text-emerald-500"
              :aria-label="tab.status.label ?? '已完成'"
            />
            <TriangleAlert
              v-else-if="tab.status?.kind === 'warning'"
              class="size-3.5 shrink-0 text-amber-500"
              :aria-label="tab.status.label ?? '警告'"
            />
            <CircleX
              v-else-if="tab.status?.kind === 'error'"
              class="size-3.5 shrink-0 text-destructive"
              :aria-label="tab.status.label ?? '错误'"
            />
            <span :class="cn('truncate', compactTabs && 'hidden xl:inline')">{{ tab.title }}</span>
            <button
              v-if="tab.closable !== false"
              class="inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] text-muted-foreground opacity-55 transition hover:bg-background hover:text-foreground hover:opacity-100 mobile:size-6"
              type="button"
              title="关闭标签页"
              @click.stop="layout.closeTab(tab.id)"
            >
              <X class="size-2.5" />
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-44">
          <ContextMenuItem @click="popOutTab(tab.id)">
            <ExternalLink class="mr-2 size-4" />
            弹出到子窗口
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem :disabled="tab.closable === false" @click="layout.closeTab(tab.id)">
            <X class="mr-2 size-4" />
            关闭标签页
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </nav>

    <div
      class="min-w-6 flex-1 self-stretch mobile:hidden"
    />

    <div class="relative z-10 flex items-center gap-0.5">
      <Button v-if="shellMode !== 'simplified'" class="mobile:size-10" variant="ghost" size="icon-sm" title="切换右侧栏" @click="toggleRightSidebar">
        <PanelRight v-if="rightSidebarOpen" />
        <ChevronsLeft v-else />
      </Button>
      <Button v-if="!isMobileLayout" variant="ghost" size="icon-sm" title="最小化" aria-label="最小化窗口" @click="minimizeWindow">
        <Minus />
      </Button>
      <Button v-if="!isMobileLayout" variant="ghost" size="icon-sm" title="最大化或还原" aria-label="最大化或还原窗口" @click="toggleMaximize">
        <Maximize2 />
      </Button>
      <Button v-if="!isMobileLayout" variant="ghost" size="icon-sm" class="hover:bg-destructive hover:text-destructive-foreground" title="关闭" aria-label="关闭窗口" @click="closeWindow">
        <X />
      </Button>
    </div>
  </header>
</template>
