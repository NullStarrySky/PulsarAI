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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownSearch,
	TabItem,
	Tabs,
	TabsList,
} from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFloatingSurface } from "@/features/Environment/floating-surface";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import { useUIStore } from "@/features/UI/store";
import { ChevronDown, X } from "@/lib/remix-icons";

const layout = useUIStore();
const responsive = useResponsiveStore();
const { settingsOpen } = storeToRefs(layout);
const { isMobileLayout } = storeToRefs(responsive);
const {
	settingsPageId: activePageId,
	settingsTabId: activeTabId,
	settingsSearch,
} = storeToRefs(layout);
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

function selectPage(pageId: string) {
	activePageId.value = pageId;
	const page = layout.settingPages.find((item) => item.meta.id === pageId);
	activeTabId.value = page?.tabs?.[0]?.id ?? "";
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

      <main class="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background/30">
          <header data-floating-drag-handle class="relative shrink-0 cursor-grab px-7 pb-3 pt-5 active:cursor-grabbing mobile:pl-16 mobile:pr-4">
            <div data-floating-drag-handle class="absolute inset-x-0 top-0 h-14 cursor-grab active:cursor-grabbing" />
            <div class="flex min-h-9 items-center justify-between gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline" class="max-w-[min(20rem,calc(100vw-9rem))] justify-between gap-3" aria-label="选择设置页面">
                    <span class="flex min-w-0 items-center gap-2"><component :is="activePage?.meta.icon" class="size-4 shrink-0" /><span class="truncate text-base">{{ activePage?.meta.title ?? "设置" }}</span></span>
                    <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent :checked-index="activePageIndex" class="w-64">
                  <DropdownSearch v-model="settingsSearch" placeholder="搜索设置" />
                  <DropdownMenuItem
                    v-for="(page, index) in filteredPages"
                    :key="page.meta.id"
                    :index="index"
                    :icon="page.meta.icon"
                    :label="page.meta.title"
                    :checked="activePage?.meta.id === page.meta.id"
                    @select="selectPage(page.meta.id)"
                  />
                  <p v-if="filteredPages.length === 0" class="px-3 py-6 text-center text-xs text-muted-foreground">没有匹配的设置</p>
                </DropdownMenuContent>
              </DropdownMenu>
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

          <ScrollArea class="min-h-0 flex-1">
            <div class="min-h-full px-7 pb-8 pt-2 mobile:px-4 mobile:pb-5">
              <component :is="activeComponent" v-if="activeComponent" :key="`${activePage?.meta.id}:${activeTabId}`" />
            </div>
          </ScrollArea>

          <div
            v-if="!isMobileLayout"
            data-floating-drag-handle
            class="absolute inset-x-0 bottom-0 z-10 h-4 cursor-grab active:cursor-grabbing"
            aria-hidden="true"
          />
      </main>
    </DialogContent>
  </Dialog>
</template>
