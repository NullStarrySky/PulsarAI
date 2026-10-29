<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import AppShell from "@/features/UI/AppShell.vue";
import SubWindowContainer from "@/features/UI/subWindow/SubWindowContainer.vue";
import SubWindowSurface from "@/features/UI/subWindow/SubWindowSurface.vue";
import { readSubWindowParamsFromLocation } from "@/features/UI/subWindow/sub-window-protocol";

const environment = useEnvironmentStore();
const subWindowParams = readSubWindowParamsFromLocation();

const updateRadiusFromShape = (variant?: string) => {
  const root = document.documentElement;
  if (variant === "pill") {
    root.style.setProperty("--radius", "1.25rem");
  } else if (variant === "square") {
    root.style.setProperty("--radius", "0px");
  } else {
    root.style.setProperty("--radius", "0.5rem");
  }
};

watch(
  () => environment.appearance.shapeVariant,
  (value) => updateRadiusFromShape(value),
  { immediate: true }
);

onMounted(() => void environment.initialize());
</script>

<template>
  <SubWindowContainer
    v-if="subWindowParams"
    :component="SubWindowSurface"
    :window-params="subWindowParams"
  />
  <AppShell v-else />
</template>
