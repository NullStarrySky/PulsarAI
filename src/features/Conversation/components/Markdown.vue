<script setup lang="ts">
import { MarkdownRender } from "markstream-vue";
import { computed, ref, watch } from "vue";
import {
	mediaLinks,
	resolveMediaUrl,
} from "@/features/Plugin/media/media-link";
import "markstream-vue/index.css";
import "katex/dist/katex.min.css";

const props = withDefaults(
	defineProps<{ content: string; final?: boolean }>(),
	{ final: true },
);
const dark = computed(
	() =>
		typeof document === "undefined" ||
		document.documentElement.classList.contains("dark"),
);
const content = ref(props.content);

watch(
	() => props.content,
	async (value) => {
		const links = [...new Set(mediaLinks(value))];
		const urls = await Promise.all(links.map(resolveMediaUrl));
		content.value = links.reduce(
			(result, link, index) => result.replaceAll(link, urls[index]!),
			value,
		);
	},
	{ immediate: true },
);
</script>

<template>
  <MarkdownRender
    :content="content"
    mode="chat"
    :final="props.final"
    :is-dark="dark"
    :code-block-props="{ theme: { light: 'vitesse-dark', dark: 'vitesse-dark' } }"
    class="conversation-markstream w-full min-w-0"
  />
</template>

<style>
.conversation-markstream { --ms-text-body: var(--editor-font-size, 14px) !important; --ms-leading-body: var(--editor-line-height, 1.5) !important; --ms-font-sans: var(--font-sans, sans-serif); --ms-font-mono: var(--font-mono, monospace); color: var(--foreground); }
.conversation-markstream pre, .conversation-markstream .code-block-container, .conversation-markstream .table-node-wrapper { max-width: 100%; overflow-x: auto; }
.conversation-markstream img { max-width: 100%; height: auto; border-radius: var(--radius); }
</style>
