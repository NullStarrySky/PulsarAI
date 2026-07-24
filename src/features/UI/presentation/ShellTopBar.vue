<script setup lang="ts">
import { computed } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { storeToRefs } from "pinia";
import {
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minus,
  PanelLeft,
  PanelRight,
  X,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useLayoutStore } from "../application/layout-store";

const layout = useLayoutStore();
const conversation = useConversationStore();
const { activeTabId, leftSidebarOpen, rightSidebarOpen, tabs } = storeToRefs(layout);
const compactTabs = computed(() => tabs.value.length > 8);
const appWindow = getCurrentWindow();

async function minimizeWindow() {
  await appWindow.minimize();
}

async function toggleMaximize() {
  await appWindow.toggleMaximize();
}

async function closeWindow() {
  await appWindow.close();
}

function activateTab(tab: typeof tabs.value[number]) {
  layout.activateTab(tab.id);
  if (tab.conversationId) {
    conversation.openConversation(tab.conversationId);
  }
}

function closeWithMiddleButton(event: MouseEvent, tabId: string) {
  if (event.button === 1) {
    event.preventDefault();
    layout.closeTab(tabId);
  }
}
</script>

<template>
  <header
    class="flex h-10 shrink-0 select-none items-center gap-1.5 border-b bg-background px-2"
  >
    <Button
      class="relative z-10"
      variant="ghost"
      size="icon-sm"
      title="切换左侧栏"
      @click="layout.toggleLeftSidebar"
    >
      <PanelLeft v-if="leftSidebarOpen" />
      <ChevronsRight v-else />
    </Button>

    <nav class="relative z-10 flex min-w-0 max-w-[58vw] items-center gap-0.5 overflow-hidden">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="
          cn(
            'group flex h-7 min-w-7 max-w-36 items-center gap-1 rounded-md px-2 text-sm transition-colors',
            activeTabId === tab.id
              ? 'bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]'
              : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
          )
        "
        type="button"
        @click="activateTab(tab)"
        @auxclick="closeWithMiddleButton($event, tab.id)"
      >
        <span :class="cn('truncate', compactTabs && 'hidden xl:inline')">{{ tab.title }}</span>
        <button
          v-if="tab.closable !== false"
          class="inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] text-muted-foreground opacity-55 transition hover:bg-background hover:text-foreground hover:opacity-100"
          type="button"
          title="关闭标签页"
          @click.stop="layout.closeTab(tab.id)"
        >
          <X class="size-2.5" />
        </button>
      </button>
    </nav>

    <div
      class="min-w-6 flex-1 self-stretch"
      data-tauri-drag-region
    />

    <div class="relative z-10 flex items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" title="切换右侧栏" @click="layout.toggleRightSidebar">
        <PanelRight v-if="rightSidebarOpen" />
        <ChevronsLeft v-else />
      </Button>
      <Button variant="ghost" size="icon-sm" title="最小化" @click="minimizeWindow">
        <Minus />
      </Button>
      <Button variant="ghost" size="icon-sm" title="全屏" @click="toggleMaximize">
        <Maximize2 />
      </Button>
      <Button variant="ghost" size="icon-sm" title="关闭" @click="closeWindow">
        <X />
      </Button>
    </div>
  </header>
</template>
