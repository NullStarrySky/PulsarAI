<script setup lang="ts">
import { cn } from "../../../lib/utils";

defineProps<{
  bgClass?: string;
  loading?: boolean;
  isIconOnly?: boolean;
  isCompact?: boolean;
}>();

defineOptions({ name: "FluidButtonInternals" });
</script>

<template>
  <span
    aria-hidden="true"
    :class="
      cn(
        'absolute inset-px rounded-[inherit] transition-[box-shadow,background-color] [transition-duration:180ms,80ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1),ease] group-active:[transition-duration:80ms,80ms]',
        bgClass
      )
    "
  />
  <span
    :class="
      cn(
        'relative inline-flex items-center justify-center gap-[inherit] whitespace-nowrap',
        isIconOnly
          ? '[&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]'
          : '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]'
      )
    "
  >
    <template v-if="loading">
      <span class="inline-flex items-center justify-center gap-[inherit] opacity-0">
        <slot />
      </span>
      <span class="absolute inset-0 flex items-center justify-center">
        <svg
          :class="isCompact ? 'h-7 w-7' : 'h-9 w-9'"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z"
            stroke="currentColor"
            stroke-width="1.125"
            stroke-linecap="round"
            pathLength="100"
            style="stroke-dasharray: 15 85; animation: spinner-move 2s linear infinite, spinner-dash 4s ease-in-out infinite"
          />
        </svg>
      </span>
    </template>
    <template v-else>
      <slot />
    </template>
  </span>
</template>
