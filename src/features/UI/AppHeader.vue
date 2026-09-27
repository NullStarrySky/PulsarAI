<script setup lang="ts">
import { computed } from "vue";
import { useResponsiveStore } from "@/features/Environment/responsive-store";
import { useEnvironmentStore } from "@/features/Environment/store";
import { host } from "@/host";
import { UserRound } from "@/lib/remix-icons";
import { useUIStore } from "./store";

const props = defineProps<{
	sidebarOpen: boolean;
	isBlank: boolean;
	conversationTitle?: string;
	characterName?: string;
	avatarUrl?: string;
	isSettingsOpen?: boolean;
}>();

const environment = useEnvironmentStore();
const ui = useUIStore();
const responsive = useResponsiveStore();

const topBarClass = computed(() => {
	if (
		environment.appearance.backgroundImage || environment.glassEnabled
	) {
		return "bg-transparent text-foreground";
	}
	return !environment.appearance.zenFrameEnabled
		? "bg-background text-foreground"
		: environment.zenFrameIsDark
			? "bg-zen-frame-bg text-white"
			: "bg-zen-frame-bg text-slate-900";
});

const actionsWidth = computed(() =>
	!props.isBlank && !props.isSettingsOpen ? 134 : 100,
);

const headerSpacerStyle = computed(() => ({
	width: props.sidebarOpen ? "12px" : `${actionsWidth.value}px`,
	transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
}));

const rightSpacerWidth = computed(() => {
	const desktopControls = host.desktop && !responsive.isMobileLayout;
	const fullWidth = desktopControls ? 134 : 40;
	return ui.rightSidebarOpen ? 12 : fullWidth;
});

const rightSpacerStyle = computed(() => ({
	width: `${rightSpacerWidth.value}px`,
	transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
}));

</script>

<template>
  <header
    class="relative z-20 flex h-11 w-full shrink-0 select-none items-center justify-between mobile:h-12"
    :class="topBarClass"
  >
    <!-- Left Spacer matching fixed actions -->
    <div
      class="header-spacer shrink-0 transition-[width] duration-300 pointer-events-none"
      :style="headerSpacerStyle"
    />

    <!-- Title Group (Hidden if blank conversation or settings open) -->
    <div
      v-if="!isBlank && !isSettingsOpen && conversationTitle"
      class="flex min-w-0 max-w-[min(36rem,calc(100vw-20rem))] items-center gap-2 truncate"
      data-window-drag-block
    >
      <!-- Avatar -->
      <div class="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full border border-border/60 bg-muted">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="characterName || conversationTitle"
          class="size-full object-cover"
        />
        <UserRound v-else class="size-3 text-muted-foreground" />
      </div>

      <!-- Title & Subtitle -->
      <span class="truncate text-xs font-semibold text-foreground">
        {{ conversationTitle }}
      </span>
      <span v-if="characterName" class="truncate text-[11px] text-muted-foreground/80">
        ~ @ {{ characterName }}
      </span>
    </div>

    <!-- Center Drag Region -->
    <div class="h-full min-w-0 flex-1 electron-window-drag-region" />

    <!-- Right Spacer matching fixed right actions -->
    <div
      class="header-spacer-right shrink-0 transition-[width] duration-300 pointer-events-none"
      :style="rightSpacerStyle"
    />
  </header>
</template>
