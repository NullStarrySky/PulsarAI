<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Button } from "@/components/common/Button";
import { Tabs } from "@/components/common/Tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore } from "@/features/UI/store";
import { Pin, PinFilled, X } from "@/lib/remix-icons";
import { useSettingsState } from "./use-settings-state";

const ui = useUIStore();
const {
	activePageId,
	activeTabId,
	activePage,
	activeTabs,
	activeComponent,
	closeSettings,
} = useSettingsState();

const scrollContent = ref<HTMLElement | null>(null);

// Reset scroll on page or tab change
watch([activePageId, activeTabId], () => {
	const viewport = scrollContent.value?.parentElement;
	if (viewport?.dataset.slot === "scroll-area-viewport") {
		viewport.scrollTop = 0;
	}
});

function togglePin() {
	ui.settingsPinned = !ui.settingsPinned;
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Escape") {
		closeSettings();
	}
}

function handlePointerDownOutside(e: PointerEvent) {
	if (ui.settingsPinned || !ui.settingsOpen) return;
	const target = e.target as HTMLElement | null;
	if (!target) return;

	// Ignore clicks inside the settings card or the collapsible button group entry
	if (
		target.closest(".settings-card-surface") ||
		target.closest(".settings-entry-collapsible") ||
		target.closest(".glide-collapsible-button-group") ||
		target.closest("[data-settings-trigger]")
	) {
		return;
	}

	closeSettings();
}

onMounted(() => {
	window.addEventListener("keydown", handleKeydown);
	window.addEventListener("pointerdown", handlePointerDownOutside, true);
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeydown);
	window.removeEventListener("pointerdown", handlePointerDownOutside, true);
});

const formattedTabs = computed(() =>
	activeTabs.value.map((tab) => ({
		value: tab.id,
		label: tab.title,
	})),
);
</script>

<template>
  <Transition name="settings-card-slide">
    <aside
      v-if="ui.settingsOpen"
      class="settings-card-surface fixed top-13 right-3 bottom-3 z-40 flex flex-col w-[660px] max-w-[calc(100vw-24px)] rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden select-none"
      :class="ui.settingsPinned ? 'ring-2 ring-primary/30 shadow-primary/5' : ''"
    >
      <!-- Card Header -->
      <header class="flex shrink-0 items-center justify-between px-5 py-3 border-b border-border/60 bg-muted/20 gap-3">
        <!-- Page Title & Icon -->
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <component :is="activePage?.meta.icon" v-if="activePage?.meta.icon" class="size-4.5" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-foreground truncate">
              {{ activePage?.meta.title ?? "设置" }}
            </h2>
          </div>
        </div>

        <!-- Subtabs using Tabs when page has multiple tabs -->
        <div v-if="formattedTabs.length > 1" class="flex-1 flex justify-center max-w-sm px-2">
          <Tabs
            v-model="activeTabId"
            :items="formattedTabs"
            size="sm"
            class="w-full"
          />
        </div>

        <!-- Top Right Actions: Pin & Close -->
        <div class="flex items-center gap-1 shrink-0 ml-auto">
          <!-- Pin Toggle Button -->
          <Button
            variant="ghost"
            size="icon-sm"
            class="transition-colors"
            :class="
              ui.settingsPinned
                ? 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 shadow-xs'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            "
            :title="ui.settingsPinned ? '已固定卡片 (点击取消自动收回)' : '固定卡片 (避免点击外部自动收回)'"
            @click="togglePin"
          >
            <PinFilled v-if="ui.settingsPinned" class="size-4" />
            <Pin v-else class="size-4" />
          </Button>

          <!-- Close / Retract Button -->
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            title="收起设置"
            @click="closeSettings"
          >
            <X class="size-4" />
          </Button>
        </div>
      </header>

      <!-- Card Content Scrollable Body -->
      <ScrollArea class="min-h-0 flex-1">
        <div ref="scrollContent" class="min-h-full px-6 py-5 max-w-3xl mx-auto">
          <KeepAlive>
            <component
              :is="activeComponent"
              :key="`${activePageId}:${activeTabId}`"
            />
          </KeepAlive>
        </div>
      </ScrollArea>
    </aside>
  </Transition>
</template>

<style scoped>
.settings-card-slide-enter-active,
.settings-card-slide-leave-active {
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
}

.settings-card-slide-enter-from,
.settings-card-slide-leave-to {
  transform: translateX(48px) scale(0.97);
  opacity: 0;
}
</style>
