<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watchEffect } from "vue";
import {
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	Dropdown,
	MenuItem,
	TabItem,
	Tabs,
	TabsList,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFloatingSurface } from "@/features/Environment/floating-surface";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import { useEnvironmentStore } from "@/features/Environment/store";
import { Menu, Search, X } from "@/lib/phosphor-icons";
import { cn } from "@/lib/utils";

const layout = useEnvironmentStore();
const responsive = useResponsiveStore();
const { settingsOpen } = storeToRefs(layout);
const { isMobileLayout } = storeToRefs(responsive);
const activePageId = ref("");
const activeTabId = ref("");
const sidebarOpen = ref(true);
const settingsSearch = ref("");
const dialog = ref<HTMLElement | { $el?: unknown } | null>(null);
const floating = useFloatingSurface({
	surfaceId: "settings",
	open: settingsOpen,
	element: dialog,
	initialSize: { width: 1040, height: 680 },
	minSize: { width: 620, height: 440 },
});
const floatingStyle = computed(() => floating.style.value);

const pages = computed(() => layout.settingPages);
const activePage = computed(
	() =>
		layout.settingPages.find((page) => page.meta.id === activePageId.value) ??
		pages.value[0],
);
const activeTabs = computed(() => activePage.value?.tabs ?? []);
const activeComponent = computed(() => {
	const page = activePage.value;
	if (!page) return null;
	if (!page.tabs?.length) return page.component ?? null;
	return (
		page.tabs.find((tab) => tab.id === activeTabId.value)?.component ??
		page.tabs[0]?.component ??
		null
	);
});
const filteredPages = computed(() => {
	const keyword = settingsSearch.value.trim().toLocaleLowerCase();
	return pages.value.filter(
		(page) =>
			!keyword ||
			page.meta.title.toLocaleLowerCase().includes(keyword) ||
			page.tabs?.some((tab) => tab.title.toLocaleLowerCase().includes(keyword)),
	);
});
const activePageIndex = computed(() =>
	filteredPages.value.findIndex((p) => p.meta.id === activePage.value?.meta.id),
);

watchEffect(() => {
	if (!activePageId.value && pages.value[0])
		activePageId.value = pages.value[0].meta.id;
	const tabs = activePage.value?.tabs ?? [];
	if (tabs.length && !tabs.some((tab) => tab.id === activeTabId.value)) {
		activeTabId.value = tabs[0]?.id;
	}
});

watchEffect(() => {
	if (settingsOpen.value && isMobileLayout.value) sidebarOpen.value = false;
});

function selectPage(pageId: string) {
	activePageId.value = pageId;
	const page = layout.settingPages.find((item) => item.meta.id === pageId);
	activeTabId.value = page?.tabs?.[0]?.id ?? "";
	if (isMobileLayout.value) sidebarOpen.value = false;
}
</script>

<template>
  <Dialog :open="settingsOpen" @update:open="layout.settingsOpen = $event">
    <DialogContent
      ref="dialog"
      data-settings-dialog
      custom-position
      :show-close-button="false"
      :style="floatingStyle"
      class="flex max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-popover p-0 shadow-2xl sm:max-w-none mobile:rounded-none mobile:border-0"
      @open-auto-focus.prevent
    >
      <div class="sr-only">
        <DialogTitle>设置</DialogTitle>
        <DialogDescription>管理 Pulsar 的应用设置。</DialogDescription>
      </div>

      <div class="relative grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)] overflow-hidden mobile:grid-cols-1">
        <button
          v-if="isMobileLayout && sidebarOpen"
          type="button"
          class="absolute inset-0 z-20 bg-foreground/20"
          aria-label="关闭设置导航"
          @click="sidebarOpen = false"
        />

        <aside
          :class="cn(
            'min-h-0 overflow-hidden border-r border-border/60 bg-muted/45',
            isMobileLayout && [
              'absolute inset-y-0 left-0 z-30 w-[min(19rem,88vw)] shadow-xl transition-transform',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            ],
          )"
        >
          <nav class="flex h-full min-h-0 flex-col">
            <div class="relative shrink-0 px-4 pb-3 pt-4">
              <div data-floating-drag-handle class="absolute inset-x-0 top-0 h-14 cursor-grab active:cursor-grabbing" />
              <div data-floating-drag-handle class="mb-3 flex h-7 cursor-grab items-center gap-2 px-1 active:cursor-grabbing">
                <h2 class="text-base font-semibold">设置</h2>
                <kbd class="rounded-md bg-background/65 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Ctrl+,</kbd>
              </div>
              <div class="relative">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input v-model="settingsSearch" class="h-10 rounded-xl border-0 bg-background/55 pl-9 shadow-none" placeholder="搜索" />
              </div>
            </div>

            <ScrollArea class="min-h-0 flex-1">
              <div class="px-2 pb-4">
                <Dropdown
                  v-if="filteredPages.length > 0"
                  :checked-index="activePageIndex"
                  :shadow-level="0"
                  class="w-full bg-transparent border-0 shadow-none gap-0.5"
                >
                  <MenuItem
                    v-for="(page, idx) in filteredPages"
                    :key="page.meta.id"
                    :index="idx"
                    :icon="page.meta.icon"
                    :label="page.meta.title"
                    :checked="activePage?.meta.id === page.meta.id"
                    @select="selectPage(page.meta.id)"
                  />
                </Dropdown>
                <p v-else class="px-3 py-10 text-center text-xs text-muted-foreground">没有匹配的设置</p>
              </div>
            </ScrollArea>
          </nav>
        </aside>

        <main class="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-background/30">
          <header data-floating-drag-handle class="relative shrink-0 cursor-grab px-7 pb-3 pt-5 active:cursor-grabbing mobile:pl-16 mobile:pr-4">
            <div data-floating-drag-handle class="absolute inset-x-0 top-0 h-14 cursor-grab active:cursor-grabbing" />
            <div class="flex min-h-9 items-center justify-between gap-4">
              <h1 data-floating-drag-handle class="truncate text-xl font-semibold tracking-tight cursor-grab active:cursor-grabbing">{{ activePage?.meta.title ?? "设置" }}</h1>
              <DialogClose as-child>
                <Button variant="ghost" size="icon" class="size-9 rounded-full text-muted-foreground" title="关闭设置">
                  <X />
                </Button>
              </DialogClose>
            </div>

            <Tabs
              v-if="activeTabs.length > 1"
              v-model="activeTabId"
              class="mt-4"
            >
              <TabsList>
                <TabItem
                  v-for="tab in activeTabs"
                  :key="tab.id"
                  :value="tab.id"
                  :label="tab.title"
                />
              </TabsList>
            </Tabs>
          </header>

          <Button
            v-if="isMobileLayout && !sidebarOpen"
            class="absolute left-4 top-5 z-20 size-9 rounded-full"
            size="icon"
            variant="ghost"
            title="打开设置导航"
            @click="sidebarOpen = true"
          >
            <Menu />
          </Button>

          <div class="min-h-0 flex-1 overflow-hidden">
            <component :is="activeComponent" v-if="activeComponent" :key="`${activePage?.meta.id}:${activeTabId}`" />
          </div>

          <div
            v-if="!isMobileLayout"
            data-floating-drag-handle
            class="absolute inset-x-0 bottom-0 z-10 h-4 cursor-grab active:cursor-grabbing"
            aria-hidden="true"
          />
        </main>
      </div>
    </DialogContent>
  </Dialog>
</template>
