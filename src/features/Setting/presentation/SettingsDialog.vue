<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <DialogContent class="flex h-[min(720px,86vh)] w-[min(980px,92vw)] max-w-none flex-col p-0">
      <DialogHeader class="border-b px-5 py-4">
        <DialogTitle>设置</DialogTitle>
        <DialogDescription>管理 Pulsar 的基础行为、模型连接和后续扩展入口。</DialogDescription>
      </DialogHeader>

      <div class="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)]">
        <ScrollArea class="border-r">
          <nav class="flex flex-col gap-5 p-3">
            <section v-for="group in groups" :key="group.id" class="flex flex-col gap-1">
              <h3 class="px-2 text-xs font-medium text-muted-foreground">{{ group.title }}</h3>
              <Button
                v-for="page in pages.filter((item) => item.meta.group === group.id)"
                :key="page.meta.id"
                :class="cn('justify-start', activePage?.meta.id === page.meta.id && 'bg-accent text-accent-foreground')"
                variant="ghost"
                @click="activePageId = page.meta.id"
              >
                <component :is="page.meta.icon" data-icon="inline-start" />
                {{ page.meta.title }}
              </Button>
            </section>
          </nav>
        </ScrollArea>

        <ScrollArea class="min-w-0">
          <component :is="activePage?.component" v-if="activePage" />
        </ScrollArea>
      </div>
    </DialogContent>
  </Dialog>
</template>
