<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Settings } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "../application/layout-store";

const layout = useLayoutStore();
const { leftSidebarOpen } = storeToRefs(layout);
</script>

<template>
  <aside
    :class="
      cn(
        'flex shrink-0 flex-col overflow-hidden border-r bg-card transition-[width,opacity] duration-300 ease-out',
        leftSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0',
      )
    "
  >
    <div class="min-w-64 flex-1" />
    <div class="min-w-64 border-t p-3">
      <Button class="w-full justify-start" variant="ghost" @click="layout.openSettings">
        <Settings data-icon="inline-start" />
        设置
      </Button>
    </div>
  </aside>
</template>
