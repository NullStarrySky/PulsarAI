<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import {
  ensureDefaultSettingPages,
  getSettingGroups,
  getSettingPage,
  getSettingPages,
} from "../application/setting-registry";

ensureDefaultSettingPages();

const layout = useLayoutStore();
const { settingsOpen } = storeToRefs(layout);
const activePageId = ref("");
const sidebarOpen = ref(true);
const settingsSearch = ref("");

const groups = computed(() => getSettingGroups());
const pages = computed(() => getSettingPages());
const activePage = computed(() => getSettingPage(activePageId.value) ?? pages.value[0]);

watchEffect(() => {
  if (!activePageId.value && pages.value[0]) {
    activePageId.value = pages.value[0].meta.id;
  }
});
</script>

<template>
  <Dialog :open="settingsOpen" @update:open="layout.setSettingsOpen">
    <DialogContent class="flex h-[min(820px,90vh)] w-[min(1320px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
      <div
        :class="
          cn(
            'grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200',
            sidebarOpen ? 'grid-cols-[12rem_minmax(0,1fr)]' : 'grid-cols-[0_minmax(0,1fr)]',
          )
        "
      >
        <aside class="min-h-0 overflow-hidden border-r">
          <nav class="flex h-full flex-col gap-5 overflow-y-auto p-3 pt-4">
            <div class="flex items-center gap-2">
              <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input v-model="settingsSearch" class="h-8 pl-8" placeholder="搜索设置" />
              </div>
              <Button size="icon" variant="ghost" class="size-8" title="折叠设置导航" @click="sidebarOpen = false">
                <PanelLeftClose class="size-4" />
              </Button>
            </div>
            <section v-for="group in groups" :key="group.id" class="flex flex-col gap-1">
              <h3 class="px-2 text-xs font-medium text-muted-foreground">{{ group.title }}</h3>
              <Button
                v-for="page in pages.filter((item) => item.meta.group === group.id)"
                :key="page.meta.id"
                :class="cn('h-9 justify-start px-2', activePage?.meta.id === page.meta.id && 'bg-accent text-accent-foreground')"
                variant="ghost"
                @click="activePageId = page.meta.id"
              >
                <component :is="page.meta.icon" data-icon="inline-start" />
                {{ page.meta.title }}
              </Button>
            </section>
          </nav>
        </aside>

        <main class="relative min-h-0 min-w-0 overflow-hidden">
          <Button
            v-if="!sidebarOpen"
            class="absolute left-3 top-3 z-20 size-8 shadow-sm"
            size="icon"
            variant="outline"
            title="展开设置导航"
            @click="sidebarOpen = true"
          >
            <PanelLeftOpen class="size-4" />
          </Button>
          <component :is="activePage?.component" v-if="activePage" />
        </main>
      </div>
    </DialogContent>
  </Dialog>
</template>
