<script setup lang="ts">
import { watch } from "vue";
import { provideShape } from "@/components/fluid";
import AppShell from "@/features/Environment/components/AppShell.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import AskUserComponent from "@/features/Plugin/agent/components/AskUserComponent.vue";

const environment = useEnvironmentStore();
const shapeCtx = provideShape(environment.appearance.shapeVariant ?? "rounded");

watch(
	() => environment.appearance.shapeVariant,
	(val) => {
		if (val) shapeCtx.setShape(val);
	},
);
</script>

<template>
  <AppShell />
  <AskUserComponent />
</template>
