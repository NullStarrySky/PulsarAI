<script setup lang="ts">
import { onMounted, watch } from "vue";
import { provideShape } from "@/components/fluid";
import { useEnvironmentStore } from "@/features/Environment/store";
import AppShell from "@/features/UI/AppShell.vue";
import SubWindowContainer from "@/features/UI/subWindow/SubWindowContainer.vue";
import SubWindowSurface from "@/features/UI/subWindow/SubWindowSurface.vue";
import { readSubWindowParamsFromLocation } from "@/features/UI/subWindow/sub-window-protocol";

const environment = useEnvironmentStore();
const shape = provideShape(environment.appearance.shapeVariant ?? "rounded");
const subWindowParams = readSubWindowParamsFromLocation();

watch(
	() => environment.appearance.shapeVariant,
	(value) => value && shape.setShape(value),
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
