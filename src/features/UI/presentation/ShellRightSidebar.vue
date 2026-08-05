<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { cn } from "@/lib/utils";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { getShellSidebarComponent } from "@/features/UI/application/sidebar-registry";
import { useLayoutStore } from "@/features/UI/application/layout-store";

const layout = useLayoutStore();
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);
const sidebarComponent = computed(() => getShellSidebarComponent("right"));
let stopResize: (() => void) | undefined;

function startResize(event: PointerEvent) {
  if (isMobileLayout.value) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = layout.rightSidebarWidth;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = "none";
  const move = (moveEvent: PointerEvent) => {
    layout.setSidebarWidth("right", startWidth + startX - moveEvent.clientX);
  };
  const finish = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    document.body.style.userSelect = previousUserSelect;
    stopResize = undefined;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
  stopResize = finish;
}

onBeforeUnmount(() => stopResize?.());
</script>

<template>
  <div
    :class="cn(
      'relative z-20 shrink-0 overflow-hidden bg-background transition-[width,opacity,transform] duration-300 ease-out',
      isMobileLayout
        ? [
            'fixed bottom-0 right-0 top-12 z-40 w-[min(20rem,88vw)] shadow-xl',
            layout.rightSidebarOpen ? 'translate-x-0 opacity-100' : 'translate-x-full pointer-events-none opacity-100',
          ]
        : layout.rightSidebarOpen ? 'opacity-100' : 'w-0 opacity-0',
    )"
    :style="!isMobileLayout && layout.rightSidebarOpen ? { width: `${layout.rightSidebarWidth}px` } : undefined"
    data-mobile-sidebar
  >
    <component :is="sidebarComponent" v-if="sidebarComponent" />
    <button
      v-if="!isMobileLayout && layout.rightSidebarOpen"
      type="button"
      class="absolute inset-y-0 left-0 w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-border focus-visible:bg-ring focus-visible:outline-none"
      role="separator"
      aria-label="调整右侧栏宽度"
      aria-orientation="vertical"
      @pointerdown="startResize"
    />
  </div>
</template>
