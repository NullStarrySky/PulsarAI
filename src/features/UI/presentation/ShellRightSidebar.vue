<script setup lang="ts">
import { storeToRefs } from "pinia";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "../application/layout-store";

const layout = useLayoutStore();
const { rightSidebarOpen } = storeToRefs(layout);
</script>

<template>
  <aside
    :class="
      cn(
        'shrink-0 overflow-hidden border-l bg-card transition-[width,opacity] duration-300 ease-out',
        rightSidebarOpen ? 'w-72 opacity-100' : 'w-0 opacity-0',
      )
    "
  >
    <div class="min-w-72" />
  </aside>
</template>
