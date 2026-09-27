<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { TabItem, Tabs, TabsList } from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsState } from "./use-settings-state";

const {
	activePageId,
	activeTabId,
	activePage,
	activeTabs,
	activeComponent,
	closeSettings,
} = useSettingsState();

const scrollContent = ref<HTMLElement | null>(null);
watch([activePageId, activeTabId], () => {
	const viewport = scrollContent.value?.parentElement;
	if (viewport?.dataset.slot === "scroll-area-viewport") viewport.scrollTop = 0;
});

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Escape") {
		closeSettings();
	}
}

onMounted(() => {
	window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
    <!-- Header of Settings Content Area -->
    <header class="flex shrink-0 items-center px-7 py-3 mobile:px-4">
      <div class="flex min-w-0 flex-col gap-1">
        <div class="flex items-center gap-2.5">
          <component :is="activePage?.meta.icon" v-if="activePage?.meta.icon" class="size-5 shrink-0 text-primary" />
          <h2 class="text-base font-semibold text-foreground truncate">
            {{ activePage?.meta.title ?? "设置" }}
          </h2>
        </div>

        <!-- Optional Tabs for pages with multiple tabs -->
        <Tabs
          v-if="activeTabs.length > 1"
          v-model="activeTabId"
          class="mt-2"
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
      </div>

    </header>

    <!-- Scrollable Setting Body -->
    <ScrollArea class="min-h-0 flex-1">
      <div ref="scrollContent" class="min-h-full px-8 pb-12 pt-4 mobile:px-4 mobile:pb-6">
        <KeepAlive>
          <component :is="activeComponent" :key="`${activePageId}:${activeTabId}`" />
        </KeepAlive>
      </div>
    </ScrollArea>
  </div>
</template>
