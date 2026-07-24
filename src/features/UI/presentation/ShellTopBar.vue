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
import { useLayoutStore } from "../application/layout-store";

const layout = useLayoutStore();
const { activeTabId, leftSidebarOpen, rightSidebarOpen, tabs } = storeToRefs(layout);
const compactTabs = computed(() => tabs.value.length > 4);
const appWindow = getCurrentWindow();
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2">
    <Button variant="ghost" size="icon-sm" title="切换左侧栏" @click="layout.toggleLeftSidebar">
      <PanelLeft v-if="leftSidebarOpen" />
      <ChevronsRight v-else />
    </Button>

    <nav class="flex min-w-0 flex-1 items-center gap-1">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="
          cn(
            'group flex h-8 min-w-8 max-w-40 items-center gap-1 rounded-md border px-2 text-sm transition-colors',
            activeTabId === tab.id ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground hover:bg-muted',
          )
        "
        type="button"
        @click="layout.activateTab(tab.id)"
      >
        <span :class="cn('truncate', compactTabs && 'hidden xl:inline')">{{ tab.title }}</span>
        <span
          v-if="tab.closable !== false"
          class="rounded-sm text-muted-foreground hover:text-foreground"
          role="button"
          tabindex="0"
          title="关闭标签页"
          @click.stop="layout.closeTab(tab.id)"
        >
          <X />
        </span>
      </button>
    </nav>

    <div class="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" title="切换右侧栏" @click="layout.toggleRightSidebar">
        <PanelRight v-if="rightSidebarOpen" />
        <ChevronsLeft v-else />
      </Button>
      <Button variant="ghost" size="icon-sm" title="最小化" @click="appWindow.minimize">
        <Minus />
      </Button>
      <Button variant="ghost" size="icon-sm" title="全屏" @click="appWindow.maximize">
        <Maximize2 />
      </Button>
      <Button variant="ghost" size="icon-sm" title="关闭" @click="appWindow.close">
        <X />
      </Button>
    </div>
  </header>
</template>
