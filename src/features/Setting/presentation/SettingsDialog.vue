<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import {
  ensureDefaultSettingPages,
  getSettingGroups,
  getSettingPage,
  getSettingPages,
} from "../application/setting-registry";

ensureDefaultSettingPages();

const layout = useLayoutStore();
const responsive = useResponsiveStore();
const { settingsOpen } = storeToRefs(layout);
const { isMobileLayout } = storeToRefs(responsive);
const activePageId = ref("");
const sidebarOpen = ref(true);
const settingsSearch = ref("");

const groups = computed(() => getSettingGroups());
const pages = computed(() => getSettingPages());
const activePage = computed(() => getSettingPage(activePageId.value) ?? pages.value[0]);
const filteredPages = computed(() => {
  const keyword = settingsSearch.value.trim().toLocaleLowerCase();
  return pages.value.filter(
    (page) => !keyword || page.meta.title.toLocaleLowerCase().includes(keyword),
  );
});

watchEffect(() => {
  if (!activePageId.value && pages.value[0]) {
    activePageId.value = pages.value[0].meta.id;
  }
});

watchEffect(() => {
  if (settingsOpen.value && isMobileLayout.value) {
    sidebarOpen.value = false;
  }
});

function selectPage(pageId: string) {
  activePageId.value = pageId;
  if (isMobileLayout.value) {
    sidebarOpen.value = false;
  }
}

function pagesInGroup(groupId: string) {
  return filteredPages.value.filter((page) => page.meta.group === groupId);
}
</script>

<template>
  <Dialog :open="settingsOpen" @update:open="layout.setSettingsOpen">
    <DialogContent
      :show-close-button="false"
      class="flex h-[min(820px,90vh)] w-[min(1320px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none mobile:h-[100dvh] mobile:w-screen mobile:rounded-none mobile:border-0"
      @open-auto-focus.prevent
    >
      <div class="sr-only">
        <DialogTitle>设置</DialogTitle>
        <DialogDescription>管理 Pulsar 的应用设置。</DialogDescription>
      </div>
      <div
        :class="
          cn(
            'relative grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200',
            isMobileLayout
              ? 'grid-cols-1'
              : sidebarOpen ? 'grid-cols-[12rem_minmax(0,1fr)]' : 'grid-cols-[0_minmax(0,1fr)]',
          )
        "
      >
        <button
          v-if="isMobileLayout && sidebarOpen"
          type="button"
          class="absolute inset-0 z-20 bg-foreground/20"
          aria-label="关闭设置导航"
          @click="sidebarOpen = false"
        />
        <aside
          :class="
            cn(
              'min-h-0 overflow-hidden border-r bg-background transition-transform duration-200',
              isMobileLayout && [
                'absolute inset-y-0 left-0 z-30 w-[min(20rem,88vw)] shadow-xl',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full',
              ],
            )
          "
        >
          <nav class="flex h-full min-h-0 flex-col">
            <div class="flex shrink-0 items-center gap-2 px-3 pb-2 pt-4">
              <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input v-model="settingsSearch" class="h-8 pl-8" placeholder="搜索设置" />
              </div>
              <Button size="icon" variant="ghost" class="size-8" title="折叠设置导航" @click="sidebarOpen = false">
                <PanelLeftClose class="size-4" />
              </Button>
            </div>
            <ScrollArea class="min-h-0 flex-1">
              <div class="px-3 pb-3">
                <section
                v-for="group in groups"
                v-show="pagesInGroup(group.id).length"
                :key="group.id"
                class="mb-5 flex flex-col gap-1 last:mb-0"
              >
                <h3 class="px-2 text-xs font-medium text-muted-foreground">{{ group.title }}</h3>
                <Button
                  v-for="page in pagesInGroup(group.id)"
                  :key="page.meta.id"
                  :class="cn(
                    'h-9 justify-start px-2',
                    activePage?.meta.id === page.meta.id
                      ? 'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground'
                      : 'hover:bg-accent/50',
                  )"
                  :variant="activePage?.meta.id === page.meta.id ? 'secondary' : 'ghost'"
                  @click="selectPage(page.meta.id)"
                >
                  <component :is="page.meta.icon" data-icon="inline-start" />
                  {{ page.meta.title }}
                </Button>
                </section>
              </div>
            </ScrollArea>
          </nav>
        </aside>

        <main class="relative min-h-0 min-w-0 overflow-hidden">
          <Button
            v-if="!sidebarOpen"
            class="absolute left-3 top-3 z-20 size-8 shadow-sm mobile:size-10"
            size="icon"
            variant="outline"
            title="展开设置导航"
            @click="sidebarOpen = true"
          >
            <PanelLeftOpen class="size-4" />
          </Button>
          <DialogClose as-child>
            <Button
              variant="ghost"
              class="absolute right-6 top-6 z-20 size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 mobile:right-4 mobile:top-4"
              size="icon"
              title="关闭设置"
            >
              <X class="size-4" />
            </Button>
          </DialogClose>
          <component :is="activePage?.component" v-if="activePage" />
        </main>
      </div>
    </DialogContent>
  </Dialog>
</template>
