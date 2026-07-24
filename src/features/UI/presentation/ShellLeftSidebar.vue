<script setup lang="ts">
import { computed } from "vue";
import { getShellSidebarComponent } from "@/features/UI/application/sidebar-registry";

const sidebarComponent = computed(() => getShellSidebarComponent("left"));
</script>

<template>
  <component :is="sidebarComponent" v-if="sidebarComponent" />
</template>
