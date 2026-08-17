<script setup lang="ts">
import { Package } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

/**
 * Plugin-owned entry button for the conversation stage header. The header
 * composes it through its right-side action registry; toggling opens the
 * PluginManagerPanel rendered by the stage.
 */
defineProps<{
  active?: boolean;
  buttonClass?: string;
  activeButtonClass?: string;
}>();

const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <Button
    variant="ghost"
    size="icon-sm"
    class="rounded-full"
    :class="[buttonClass, active && activeButtonClass]"
    title="插件"
    @click="emit('toggle')"
  >
    <Package class="size-4" />
  </Button>
</template>
