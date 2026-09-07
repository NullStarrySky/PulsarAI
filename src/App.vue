<script setup lang="ts">
import { watch } from "vue";
import { provideShape } from "@/components/fluid";
import AppShell from "@/features/UI/components/AppShell.vue";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";

const appearance = useAppearanceStore();
const shapeCtx = provideShape(appearance.shapeVariant ?? "rounded");

watch(
	() => appearance.shapeVariant,
	(val) => {
		if (val) shapeCtx.setShape(val);
	},
);
</script>

<template>
  <AppShell />
</template>
