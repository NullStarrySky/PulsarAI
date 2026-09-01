<script setup lang="ts">
import interact from "interactjs";
import { Menu, Search, X } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import {
	computed,
	nextTick,
	onBeforeUnmount,
	ref,
	watch,
	watchEffect,
} from "vue";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Segmented } from "@/components/common/segmented";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import { useLayoutStore } from "@/features/UI/layout-store";
import { cn } from "@/lib/utils";
import {
	ensureDefaultSettingPages,
	getSettingPage,
	getSettingPages,
} from "../setting-registry";

ensureDefaultSettingPages();

const layout = useLayoutStore();
const responsive = useResponsiveStore();
const { settingsOpen } = storeToRefs(layout);
const { isMobileLayout } = storeToRefs(responsive);
const activePageId = ref("");
const activeTabId = ref("");
const sidebarOpen = ref(true);
const settingsSearch = ref("");
const dialogOffset = ref({ x: 0, y: 0 });
let dialogInteractable: ReturnType<typeof interact> | null = null;

const pages = computed(() => getSettingPages());
const activePage = computed(
	() => getSettingPage(activePageId.value) ?? pages.value[0],
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
const dialogStyle = computed(() => ({
	top: "50%",
	left: "50%",
	translate: "none",
	width: isMobileLayout.value ? "100vw" : "min(1160px, calc(100vw - 28px))",
	height: isMobileLayout.value ? "100dvh" : "min(780px, 90vh)",
	transform: `translate(calc(-50% + ${dialogOffset.value.x}px), calc(-50% + ${dialogOffset.value.y}px))`,
}));

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

watch(
	[settingsOpen, isMobileLayout],
	async ([open, mobile]) => {
		teardownDrag();
		dialogOffset.value = { x: 0, y: 0 };
		if (!open || mobile) return;
		await nextTick();
		const element = document.querySelector<HTMLElement>(
			"[data-settings-dialog]",
		);
		if (!element) return;
		dialogInteractable = interact(element).draggable({
			allowFrom: ".settings-dialog-drag-handle",
			ignoreFrom:
				"button, input, textarea, select, [role='tab'], [role='combobox']",
			listeners: {
				move(event) {
					dialogOffset.value = {
						x: dialogOffset.value.x + event.dx,
						y: dialogOffset.value.y + event.dy,
					};
				},
			},
		});
	},
	{ immediate: true },
);

function teardownDrag() {
	dialogInteractable?.unset();
	dialogInteractable = null;
}

function selectPage(pageId: string) {
	activePageId.value = pageId;
	const page = getSettingPage(pageId);
	activeTabId.value = page?.tabs?.[0]?.id ?? "";
	if (isMobileLayout.value) sidebarOpen.value = false;
}

onBeforeUnmount(teardownDrag);
</script>

<template>
  <Dialog :open="settingsOpen" @update:open="layout.setSettingsOpen">
    <DialogContent
      data-settings-dialog
      :show-close-button="false"
      :style="dialogStyle"
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
            <div class="settings-dialog-drag-handle shrink-0 cursor-grab px-4 pb-3 pt-4 active:cursor-grabbing">
              <div class="mb-3 flex h-7 items-center gap-2 px-1">
                <h2 class="text-base font-semibold">设置</h2>
                <kbd class="rounded-md bg-background/65 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Ctrl+,</kbd>
              </div>
              <div class="relative">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input v-model="settingsSearch" class="h-10 rounded-xl border-0 bg-background/55 pl-9 shadow-none" placeholder="搜索" />
              </div>
            </div>

            <ScrollArea class="min-h-0 flex-1">
              <div class="flex flex-col gap-1 px-3 pb-4">
                <Button
                  v-for="page in filteredPages"
                  :key="page.meta.id"
                  :class="cn(
                    'h-10 justify-start rounded-xl px-3 text-sm',
                    activePage?.meta.id === page.meta.id && 'bg-background text-foreground shadow-sm hover:bg-background',
                  )"
                  :variant="activePage?.meta.id === page.meta.id ? 'secondary' : 'ghost'"
                  @click="selectPage(page.meta.id)"
                >
                  <component :is="page.meta.icon" data-icon="inline-start" />
                  {{ page.meta.title }}
                </Button>
                <p v-if="filteredPages.length === 0" class="px-3 py-10 text-center text-xs text-muted-foreground">没有匹配的设置</p>
              </div>
            </ScrollArea>
          </nav>
        </aside>

        <main class="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-background/30">
          <header class="settings-dialog-drag-handle shrink-0 cursor-grab px-7 pb-3 pt-5 active:cursor-grabbing mobile:pl-16 mobile:pr-4">
            <div class="flex min-h-9 items-center justify-between gap-4">
              <h1 class="truncate text-xl font-semibold tracking-tight">{{ activePage?.meta.title ?? "设置" }}</h1>
              <DialogClose as-child>
                <Button variant="ghost" size="icon" class="size-9 rounded-full text-muted-foreground" title="关闭设置">
                  <X />
                </Button>
              </DialogClose>
            </div>

            <Segmented
              v-if="activeTabs.length > 1"
              v-model="activeTabId"
              class="mt-4"
              :options="activeTabs.map((tab) => ({ value: tab.id, label: tab.title }))"
            />
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
            class="settings-dialog-drag-handle absolute inset-x-0 bottom-0 z-10 h-4 cursor-grab active:cursor-grabbing"
            aria-hidden="true"
          />
        </main>
      </div>
    </DialogContent>
  </Dialog>
</template>
