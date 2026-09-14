<script setup lang="ts">
import { computed, ref, toValue, watch } from "vue";
import { Image } from "@/components/ui/image";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import StPresetRenderer from "@/features/Migrations/SillyTavern/renderers/StPresetRenderer.vue";
import StWorldbookRenderer from "@/features/Migrations/SillyTavern/renderers/StWorldbookRenderer.vue";
import { resolveMediaUrl } from "@/features/Plugin/media/media-link";
import { type ResourcePath, resourceType } from "../dataflow/types";
import type { FileApiOptions } from "../dataflow/use-file-api";
import { useFileApi } from "../dataflow/use-file-api";
import PluginTypeRenderer from "./PluginTypeRenderer.vue";
import type { ResourceFile } from "./resource-types";
import PluginCharacterEditor from "./types/character/PluginCharacterEditor.vue";
import PluginChatEditor from "./types/chat/PluginChatEditor.vue";
import PluginConfigEditor from "./types/config/PluginConfigEditor.vue";
import JavaScriptCodeMirrorEditor from "./types/javascript/JavaScriptCodeMirrorEditor.vue";
import { pluginMediaSource, pluginMediaType } from "./types/media/plugin-media";
import PluginRegexEditor from "./types/regex/PluginRegexEditor.vue";

const props = defineProps<
	FileApiOptions & { path: ResourcePath; preview: boolean }
>();
const files = useFileApi(props);
const content = files.useFileContent(() => props.path);
const file = computed<ResourceFile>(
	() =>
		({
			...(toValue(props.filetree)?.meta[props.path] ?? {}),
			path: props.path,
			content: content.value,
		}) as ResourceFile,
);
const type = computed(() => resourceType(props.path));
const mediaSource = computed(() => pluginMediaSource(content.value));
const resolvedMediaSource = ref("");
watch(
	mediaSource,
	async (source) => {
		resolvedMediaSource.value = source ? await resolveMediaUrl(source) : "";
	},
	{ immediate: true },
);
const mediaKind = computed(() =>
	pluginMediaType(content.value, mediaSource.value),
);
const codeLanguage = computed<
	"javascript" | "json" | "markdown" | "vue" | "text"
>(() => {
	if (type.value === "javascript") return "javascript";
	if (type.value === "markdown") return "markdown";
	if (type.value === "component") return "vue";
	return props.path.endsWith(".json") ? "json" : "text";
});
const parsedJson = computed(() => {
	try {
		return props.path.endsWith(".json") ? JSON.parse(content.value) : null;
	} catch {
		return null;
	}
});
const isWorldbook = computed(() =>
	Boolean(
		parsedJson.value &&
			typeof parsedJson.value === "object" &&
			"entries" in parsedJson.value,
	),
);
const isPreset = computed(() =>
	Boolean(
		parsedJson.value &&
			typeof parsedJson.value === "object" &&
			("prompts" in parsedJson.value || "prompt_order" in parsedJson.value),
	),
);
</script>

<template>
  <div class="h-full min-h-0 overflow-hidden">
    <ConversationComposerEditor v-if="type === 'markdown' && preview" v-model="content" placeholder="输入 Markdown 内容" :enable-ai="false" :submit-on-enter="false" full-height class="h-full" />
    <StWorldbookRenderer v-else-if="isWorldbook && preview" v-model="content" />
    <StPresetRenderer v-else-if="isPreset && preview" v-model="content" />
    <PluginCharacterEditor v-else-if="path === '/definition.package.json' && preview" :path="path" :filetree="filetree" :apply-pulse="applyPulse" />
    <PluginConfigEditor v-else-if="path.endsWith('/config.json') && preview" :path="path" :filetree="filetree" :apply-pulse="applyPulse" />
    <PluginTypeRenderer v-else-if="type === 'component' && preview" :file="file" v-model="content" />
    <PluginRegexEditor v-else-if="(path.endsWith('/regex.json') || path.endsWith('.regex.json')) && preview" :path="path" :filetree="filetree" :apply-pulse="applyPulse" />
    <PluginChatEditor v-else-if="type === 'chat' && preview" :path="path" :filetree="filetree" :apply-pulse="applyPulse" />
    <div v-else-if="type === 'media'" class="flex h-full items-center justify-center bg-muted/20 p-4"><video v-if="mediaKind === 'video'" :src="resolvedMediaSource" controls class="max-h-full max-w-full rounded-lg" /><audio v-else-if="mediaKind === 'audio'" :src="resolvedMediaSource" controls /><Image v-else :src="resolvedMediaSource" :alt="path" :preview="false" object-fit="contain" class="max-h-full max-w-full" /></div>
    <JavaScriptCodeMirrorEditor v-else v-model="content" :language="codeLanguage" frameless />
  </div>
</template>
