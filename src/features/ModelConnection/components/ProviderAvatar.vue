<script setup lang="ts">
import { computed } from "vue";
import {
	providerIconUrl,
	useProviderIconVariant,
} from "../services/provider-icons";

const props = defineProps<{
	name: string;
	src?: string;
	providerId?: string;
	iconId?: string;
}>();

const variant = useProviderIconVariant();

const iconSrc = computed(() => {
	const fallback = providerIconUrl(
		props.providerId || props.name,
		props.src,
		variant.value,
	);
	return providerIconUrl(props.iconId, fallback, variant.value);
});
</script>

<template>
  <span class="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
    <img v-if="iconSrc" class="size-4.5 object-contain" :src="iconSrc" :alt="name" />
    <span v-else class="text-xs font-medium">{{ name.slice(0, 1).toUpperCase() }}</span>
  </span>
</template>
