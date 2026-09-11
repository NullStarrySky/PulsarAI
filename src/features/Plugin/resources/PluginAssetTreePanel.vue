<script setup lang="ts">
import { Box, Folder, Globe, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { FileTree } from "@/components/common/file-tree";
import { Button, TabItem, Tabs, TabsList } from "@/components/fluid";
import {
	type Pulse,
	type ReplayGroups,
	useFileTreeUI,
	usePluginData,
} from "../dataflow";

const props = withDefaults(
	defineProps<{
		localPluginId: string;
		replayGroups?: ReplayGroups;
		applyPulse: (pulse: Pulse) => void;
	}>(),
	{ replayGroups: () => [] },
);
const emit = defineEmits<{ open: [path: string]; close: [] }>();
const tab = ref<"local" | "global" | "slots">("local");
const selected = ref("");
const expanded = ref<string[]>([]);
const filetree = usePluginData(
	() => props.localPluginId,
	() => props.replayGroups,
);
const ui = useFileTreeUI({ filetree, applyPulse: props.applyPulse });
const active = computed(() => ui.tabs[tab.value]);
</script>

<template>
  <aside class="flex h-full min-h-0 w-[min(20rem,calc(100%-2rem))] min-w-[16rem] flex-col overflow-hidden border-r bg-card shadow-xl mobile:w-full mobile:min-w-0">
    <header class="flex shrink-0 items-center gap-1.5 border-b px-1.5 py-1.5"><Tabs v-model="tab" size="compact"><TabsList><TabItem value="local" title="本地" class="size-7 p-0"><Folder class="size-4" /></TabItem><TabItem value="global" title="全局" class="size-7 p-0"><Globe class="size-4" /></TabItem><TabItem value="slots" title="插槽" class="size-7 p-0"><Box class="size-4" /></TabItem></TabsList></Tabs><Button variant="ghost" size="icon" class="ml-auto size-8" aria-label="关闭" @click="emit('close')"><X class="size-4" /></Button></header>
    <FileTree v-model="selected" v-model:expanded="expanded" :nodes="active.tree.value" :min-width="260" class="min-h-0 flex-1" @open="emit('open', $event.data.path)" @toggle-resource="ui.toggleResource" @action="ui.runAction" />
  </aside>
</template>
