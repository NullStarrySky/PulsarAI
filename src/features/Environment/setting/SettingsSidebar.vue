<script setup lang="ts">
import {
	Button,
	DropdownSearch,
	FluidList,
	FluidListItem,
} from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft } from "@/lib/remix-icons";
import { useSettingsState } from "./use-settings-state";

const { settingsSearch, activePage, filteredPages, selectPage, closeSettings } =
	useSettingsState();

let wheelDelta = 0;
function handlePageWheel(event: WheelEvent) {
	if (event.ctrlKey || !event.deltaY || !filteredPages.value.length) return;
	event.preventDefault();
	wheelDelta +=
		event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
	if (Math.abs(wheelDelta) < 40) return;
	const direction = Math.sign(wheelDelta);
	wheelDelta = 0;
	const currentIndex = filteredPages.value.findIndex(
		(page) => page.meta.id === activePage.value?.meta.id,
	);
	const wrapsToTop = direction > 0 && currentIndex === filteredPages.value.length - 1;
	const wrapsToBottom = direction < 0 && currentIndex === 0;
	let nextIndex = currentIndex < 0 ? 0 : currentIndex + direction;
	if (wrapsToTop) nextIndex = 0;
	else if (wrapsToBottom) nextIndex = filteredPages.value.length - 1;
	else nextIndex = Math.max(0, Math.min(filteredPages.value.length - 1, nextIndex));
	const next = filteredPages.value[nextIndex];
	if (!next || next.meta.id === activePage.value?.meta.id) return;
	selectPage(next.meta.id);
	(event.currentTarget as HTMLElement)
		.querySelectorAll<HTMLElement>("[data-proximity-index]")[nextIndex]
		?.scrollIntoView({
			block: "nearest",
			behavior: wrapsToTop || wrapsToBottom ? "smooth" : "auto",
		});
}
</script>

<template>
  <aside class="flex h-full w-full flex-col select-none bg-transparent text-sidebar-foreground">
    <!-- Top Spacer to clear top-left fixed actions -->
    <div class="h-11 shrink-0" />

    <!-- Sidebar Search Header -->
    <div class="px-3 pb-2 pt-1">
      <DropdownSearch
        v-model="settingsSearch"
        placeholder="搜索设置项…"
        class="w-full"
      />
    </div>

    <!-- Setting Pages List using FluidList with gliding spring highlight -->
    <ScrollArea class="min-h-0 flex-1 px-2 py-1">
      <FluidList
        :model-value="activePage?.meta.id"
        active-class="bg-accent text-accent-foreground font-medium shadow-xs"
        class="w-full gap-0.5"
        @update:model-value="(val) => selectPage(String(val))"
        @wheel="handlePageWheel"
      >
        <FluidListItem
          v-for="(page, index) in filteredPages"
          :key="page.meta.id"
          :value="page.meta.id"
          :index="index"
          class="h-9 w-full rounded-md px-2.5 text-xs font-medium gap-2.5"
        >
          <component
            :is="page.meta.icon"
            v-if="page.meta.icon"
            class="size-4 shrink-0 transition-opacity"
            :class="activePage?.meta.id === page.meta.id ? 'opacity-100 text-foreground' : 'opacity-70 text-muted-foreground'"
          />
          <span class="truncate">{{ page.meta.title }}</span>
        </FluidListItem>

        <div v-if="filteredPages.length === 0" class="py-8 text-center text-xs text-muted-foreground">
          未找到匹配的设置
        </div>
      </FluidList>
    </ScrollArea>

    <!-- Bottom Return Button (Strictly matches Manager.vue bottom height and padding, no border-t) -->
    <div class="shrink-0 p-2">
      <Button
        variant="ghost"
        size="sm"
        class="h-9 w-full justify-start gap-2 px-3 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        title="返回会话"
        @click="closeSettings"
      >
        <ArrowLeft class="size-4" />
        <span>返回会话</span>
      </Button>
    </div>
  </aside>
</template>
